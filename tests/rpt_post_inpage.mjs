// Roda DENTRO do Chromium (OPFS real). Importado por rpt_browser_test.mjs.
// Cobre o pós-processamento do .rpt (<IsoMeta>, <Credits>, <Media>) sobre ISOs reais geradas pelo BuildISO do projeto:
// manifesto (builder) → parsePostSections → applyPostProcess → leitura da ISO resultante.

const enc = new TextEncoder();
const S = 2048;
const hex = async (u8) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u8))].map((b) => b.toString(16).padStart(2, '0')).join('');
const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function runPost(u) {
    const results = [];
    const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String((e && e.stack) || e) }); } };
    const must = (cond, msg) => { if (!cond) throw new Error(msg); };
    const throwsAsync = async (fn, re, label) => { try { await fn(); } catch (e) { must(re.test(e.message), `${label}: mensagem inesperada: ${e.message}`); return; } throw new Error(`${label}: deveria ter lançado erro`); };
    const throwsSync = (fn, re, label) => { try { fn(); } catch (e) { must(re.test(e.message), `${label}: mensagem inesperada: ${e.message}`); return; } throw new Error(`${label}: deveria ter lançado erro`); };

    const { parsePostSections, applyPostProcess } = await import(u.post);
    const { buildManifestXml } = await import(u.builder);
    const M = await import(u.isometa);
    const { ISO9660 } = await import(u.iso);
    const root = await navigator.storage.getDirectory();

    const rnd = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(i + 65536, n))); return b; };
    const put = async (dir, path, bytes) => { const p = path.split('/'); let d = dir; for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true }); const fh = await d.getFileHandle(p.at(-1), { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); };
    const bytesOf = async (h) => new Uint8Array(await (await h.getFile()).arrayBuffer());
    const elf = rnd(8000); elf.set([0x7f, 0x45, 0x4c, 0x46]);
    const dataBin = rnd(30000);
    let n = 0;
    const mkIso = async () => {
        const name = 'pp' + (++n) + '_' + Math.random().toString(36).slice(2, 6);
        const dir = await root.getDirectoryHandle(name + '_src', { create: true });
        await put(dir, 'SYSTEM.CNF', enc.encode('BOOT2 = cdrom0:\\SLUS_213.73;1\r\nVER = 1.00\r\n'));
        await put(dir, 'SLUS_213.73', elf); await put(dir, 'DATA/A.BIN', dataBin);
        const h = await root.getFileHandle(name + '.iso', { create: true });
        const w = await h.createWritable(); await ISO9660.BuildISO(dir, w, {});
        return h;
    };
    const extractFile = async (h, name) => {
        const d = await root.getDirectoryHandle('ex_' + Math.random().toString(36).slice(2, 8), { create: true });
        await ISO9660.ExtrairNaPasta(await h.getFile(), d, {});
        const walk = async (dir) => { for await (const [k, v] of dir.entries()) { if (v.kind === 'directory') { const r = await walk(v); if (r) return r; } else if (k.toUpperCase().replace(/;\d+$/, '') === name) return bytesOf(v); } return null; };
        const r = await walk(d);
        if (!r) throw new Error('arquivo não encontrado na extração: ' + name);
        return r;
    };
    const mkTmp = async (mediaBytes) => {
        const tmp = await root.getDirectoryHandle('tmp_' + Math.random().toString(36).slice(2, 8), { create: true });
        const ops = await tmp.getDirectoryHandle('patch_ops', { create: true });
        if (mediaBytes) await put(ops, 'media.bin', mediaBytes);
        return tmp;
    };
    const img = new Uint8Array(64 * 32 * 4); for (let i = 0; i < img.length; i++) img[i] = (i * 7 + 3) & 255;
    const imgMedia = async (over = {}) => ({ type: 'image', payloadName: 'media.bin', size: img.length, sha256: await hex(img), width: 64, height: 32, durationSec: 5, ...over });

    await test('manifesto: builder → parsePostSections devolve exatamente o que foi escrito', async () => {
        const xml = buildManifestXml({
            gameName: 'T', credits: 'Traduzido por BitMundo — <teste> & "aspas"',
            isoMeta: { volumeId: 'RAIDEN_MOD', publisherId: 'BitMundo', numbers: { volumeSetSize: 2 }, dates: { modified: 'now' } },
            media: await imgMedia(),
        }, []);
        const p = parsePostSections(xml);
        must(p.isoMeta.volumeId === 'RAIDEN_MOD' && p.isoMeta.publisherId === 'BitMundo', 'campos de texto');
        must(p.isoMeta.numbers.volumeSetSize === 2 && p.isoMeta.dates.modified === 'now', 'número/data');
        must(p.credits === 'Traduzido por BitMundo — <teste> & "aspas"', 'créditos com caracteres especiais: ' + p.credits);
        must(p.media.type === 'image' && p.media.width === 64 && p.media.height === 32 && p.media.durationSec === 5 && p.media.payloadName === 'media.bin', 'mídia');
        const v1 = parsePostSections(buildManifestXml({ gameName: 'T' }, []));
        must(v1.isoMeta === null && v1.credits === null && v1.media === null, 'patch sem seções novas continua igual (compatível)');
    });

    await test('pós-processamento: metadados gravados na ISO real e o resto da ISO continua íntegro', async () => {
        const h = await mkIso();
        const before = await bytesOf(h);
        const xml = buildManifestXml({ gameName: 'T', isoMeta: { volumeId: 'RAIDEN_MOD', publisherId: 'BitMundo', applicationId: 'Raiden Patcher', numbers: { volumeSetSize: 2 }, dates: { modified: 'now' } } }, []);
        const notes = await applyPostProcess({ saveHandle: h, post: parsePostSections(xml), tmpDir: await mkTmp() });
        must(notes.length === 0, 'sem avisos esperados: ' + notes);
        const after = await bytesOf(h);
        must(after.length === before.length, 'tamanho da ISO não pode mudar só com metadados');
        const info = await M.readIsoInfo(M.bufferReader(after));
        must(info.fields.volumeId === 'RAIDEN_MOD' && info.fields.publisherId === 'BitMundo' && info.fields.applicationId === 'Raiden Patcher', 'campos: ' + JSON.stringify(info.fields));
        must(info.numbers.volumeSetSize === 2, 'volumeSetSize');
        must(info.dates.modified && /^\d{4}-/.test(info.dates.modified), 'data de modificação');
        must(info.info.volumeSpaceSize === (await M.readIsoInfo(M.bufferReader(before))).info.volumeSpaceSize, 'volume space size intocado');
        must(same(await extractFile(h, 'SLUS_213.73'), elf), 'ELF extraído da ISO modificada difere do original');
        must(same(await extractFile(h, 'A.BIN'), dataBin), 'arquivo de dados difere');
    });

    await test('pós-processamento: créditos + imagem → boot redirecionado ao wrapper, ELF original e mídia no LBA gravado', async () => {
        const h = await mkIso();
        const before = await bytesOf(h);
        const xml = buildManifestXml({ gameName: 'T', credits: 'Abertura — BitMundo.net', media: await imgMedia() }, []);
        const notes = await applyPostProcess({ saveHandle: h, post: parsePostSections(xml), tmpDir: await mkTmp(img) });
        must(notes.length === 0, 'sem avisos esperados: ' + notes);
        const after = await bytesOf(h);
        must(after.length > before.length && after.length % S === 0, `ISO deveria crescer em setores inteiros (${before.length} → ${after.length})`);
        const wrapper = await extractFile(h, 'SLUS_213.73');
        const marks = M.readWrapperMarkers(wrapper);
        must(marks.credits === 'Abertura — BitMundo.net', 'créditos no wrapper: ' + marks.credits);
        must(marks.boot.size === elf.length, 'tamanho do ELF original no marcador');
        must(toHex(marks.boot.sha256) === await hex(elf), 'SHA-256 do ELF original no marcador');
        must(same(after.subarray(marks.boot.lba * S, marks.boot.lba * S + elf.length), elf), 'ELF original deve continuar intacto no LBA antigo');
        must(marks.media.type === 'image' && marks.media.width === 64 && marks.media.height === 32 && marks.media.durationSec === 5, 'marcador de mídia');
        must(same(after.subarray(marks.media.lba * S, marks.media.lba * S + img.length), img), 'bytes da imagem no LBA do marcador');
        must(same(await extractFile(h, 'A.BIN'), dataBin), 'demais arquivos da ISO continuam extraíveis');
    });

    await test('mídia corrompida no patch (SHA-256) → erro e a ISO NÃO é tocada, nem os metadados', async () => {
        const h = await mkIso();
        const before = await hex(await bytesOf(h));
        const bad = new Uint8Array(img); bad[10] ^= 1;
        const xml = buildManifestXml({ gameName: 'T', isoMeta: { volumeId: 'NAO_DEVE_GRAVAR' }, credits: 'x', media: await imgMedia() }, []);
        const tmpBad = await mkTmp(bad), tmpShort = await mkTmp(img.slice(0, 100));
        await throwsAsync(() => applyPostProcess({ saveHandle: h, post: parsePostSections(xml), tmpDir: tmpBad }), /corrompida/, 'sha');
        must(before === await hex(await bytesOf(h)), 'a ISO foi alterada apesar do erro');
        await throwsAsync(() => applyPostProcess({ saveHandle: h, post: parsePostSections(xml), tmpDir: tmpShort }), /incompleta/, 'tamanho');
        must(before === await hex(await bytesOf(h)), 'a ISO foi alterada apesar do erro (tamanho)');
    });

    await test('manifesto malicioso/inválido é recusado ANTES de gravar qualquer coisa', async () => {
        const base = (inner) => `<RPT><GameName>x</GameName>${inner}<Ops></Ops></RPT>`;
        const m = await imgMedia();
        const media = (o) => { const a = { ...m, ...o }; return `<Media type="${a.type}" payload="${a.payload ?? '__rpt/' + a.payloadName}" size="${a.size}" sha256="${a.sha256}" width="${a.width}" height="${a.height}" durationSec="${a.durationSec}"/>`; };
        throwsSync(() => parsePostSections(base(`<Credits>${'a'.repeat(256)}</Credits>`)), /255 bytes/, 'créditos longos');
        throwsSync(() => parsePostSections(base(`<Credits>${'é'.repeat(128)}</Credits>`)), /255 bytes/, 'créditos longos em UTF-8 (bytes, não caracteres)');
        throwsSync(() => parsePostSections(base('<IsoMeta volumeId="ação"/>')), /ASCII/, 'não-ASCII');
        throwsSync(() => parsePostSections(base(`<IsoMeta volumeId="${'X'.repeat(33)}"/>`)), /máximo de 32/, 'campo longo');
        throwsSync(() => parsePostSections(base('<IsoMeta volumeSetSize="abc"/>')), /número/, 'número inválido');
        throwsSync(() => parsePostSections(base('<IsoMeta volumeSetSize="70000"/>')), /entre 0 e 65535/, 'número fora da faixa');
        throwsSync(() => parsePostSections(base('<IsoMeta created="ontem"/>')), /Data inválida/, 'data inválida');
        throwsSync(() => parsePostSections(base(media({ type: 'mp4' }))), /image.*movie/, 'tipo');
        throwsSync(() => parsePostSections(base(media({ payload: 'media.bin' }))), /fora de __rpt/, 'payload fora de __rpt');
        throwsSync(() => parsePostSections(base(media({ payload: '__rpt/../../evil' }))), /proibido|inválido/, 'path traversal');
        throwsSync(() => parsePostSections(base(media({ payload: '__rpt/sub/media.bin' }))), /raiz de __rpt/, 'subpasta');
        throwsSync(() => parsePostSections(base(media({ size: 100 }))), /largura/, 'tamanho x resolução');
        throwsSync(() => parsePostSections(base(media({ sha256: 'zz' }))), /sha256/i, 'hash');
        throwsSync(() => parsePostSections(base(media({ type: 'movie', size: 65 * 1048576 }))), /limite/, 'vídeo > 64 MB');
        throwsSync(() => parsePostSections(base(media({ width: 5000, height: 5000 }))), /resolução/, 'resolução absurda');
        throwsSync(() => parsePostSections(base(media({ durationSec: 99999 }))), /duração/, 'duração');
        throwsSync(() => parsePostSections('<RPT><IsoMeta volumeId="X"></RPT>'), /malformado/, 'XML malformado');
    });

    await test('vídeo .PSS: anexado inteiro e referenciado (sem width/height)', async () => {
        const pss = rnd(9000);
        const h = await mkIso();
        const xml = buildManifestXml({ gameName: 'T', media: { type: 'movie', payloadName: 'media.bin', size: pss.length, sha256: await hex(pss), width: 0, height: 0, durationSec: 0 } }, []);
        await applyPostProcess({ saveHandle: h, post: parsePostSections(xml), tmpDir: await mkTmp(pss) });
        const after = await bytesOf(h);
        const marks = M.readWrapperMarkers(await extractFile(h, 'SLUS_213.73'));
        must(marks.media.type === 'movie' && marks.media.size === pss.length, 'marcador de vídeo');
        must(same(after.subarray(marks.media.lba * S, marks.media.lba * S + pss.length), pss), 'bytes do vídeo');
    });

    return results;
}

// Rodado separadamente (precisa que o teste responda 404 ao wrapper): sem o .elf os créditos são ignorados com aviso.
export async function runPostNoWrapper(u) {
    const { parsePostSections, applyPostProcess } = await import(u.post);
    const { buildManifestXml } = await import(u.builder);
    const { ISO9660 } = await import(u.iso);
    const root = await navigator.storage.getDirectory();
    const put = async (dir, path, bytes) => { const fh = await dir.getFileHandle(path, { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); };
    const dir = await root.getDirectoryHandle('nw_src_' + Math.random().toString(36).slice(2, 6), { create: true });
    const elf = new Uint8Array(4000); elf.set([0x7f, 0x45, 0x4c, 0x46]);
    await put(dir, 'SYSTEM.CNF', enc.encode('BOOT2 = cdrom0:\\SLUS_213.73;1\r\n')); await put(dir, 'SLUS_213.73', elf);
    const h = await root.getFileHandle('nw_' + Math.random().toString(36).slice(2, 6) + '.iso', { create: true });
    const w = await h.createWritable(); await ISO9660.BuildISO(dir, w, {});
    const before = await hex(new Uint8Array(await (await h.getFile()).arrayBuffer()));
    const xml = buildManifestXml({ gameName: 'T', credits: 'x' }, []);
    const tmp = await root.getDirectoryHandle('nw_tmp_' + Math.random().toString(36).slice(2, 6), { create: true });
    const notes = await applyPostProcess({ saveHandle: h, post: parsePostSections(xml), tmpDir: tmp });
    const after = await hex(new Uint8Array(await (await h.getFile()).arrayBuffer()));
    const status = await fetch(u.wrapperUrl, { cache: 'no-cache' }).then((r) => r.status).catch((e) => 'erro:' + e.message);
    return { notes, unchanged: before === after, status };
}

// ISO real com ELF para o teste de travar/destravar pela UI; expõe window.__lockIso / __sha / __sha0 e stub do seletor de arquivos.
export async function setupLockIso(u) {
    const { ISO9660 } = await import(u.iso);
    const root = await navigator.storage.getDirectory();
    const put = async (dir, path, bytes) => { const fh = await dir.getFileHandle(path, { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); };
    const dir = await root.getDirectoryHandle('lockui_src', { create: true });
    const elf = new Uint8Array(6000); for (let i = 0; i < elf.length; i++) elf[i] = (i * 31) & 255; elf.set([0x7f, 0x45, 0x4c, 0x46]);
    await put(dir, 'SYSTEM.CNF', enc.encode('BOOT2 = cdrom0:\\SLUS_213.73;1\r\n')); await put(dir, 'SLUS_213.73', elf);
    const h = await root.getFileHandle('lockui.iso', { create: true });
    const w = await h.createWritable(); await ISO9660.BuildISO(dir, w, {});
    window.__lockIso = h;
    window.__sha = async () => hex(new Uint8Array(await (await h.getFile()).arrayBuffer()));
    window.__sha0 = await window.__sha();
    window.showOpenFilePicker = async () => [h];
}
