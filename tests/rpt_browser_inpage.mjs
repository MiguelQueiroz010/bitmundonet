// Roda DENTRO do Chromium (OPFS = FileSystemDirectoryHandle real). Importado por rpt_browser_test.mjs.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async (u8) => hex(await crypto.subtle.digest('SHA-256', u8));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
const varint = (n) => { const o = [n & 0x7f]; n = Math.floor(n / 128); while (n > 0) { o.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); } return o; };
const deflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
const eq = (a, b, m) => { const x = [...a].join(), y = [...b].join(); if (x !== y) throw new Error(m || 'conteúdo difere'); };
const throwsAsync = async (fn, re, label) => { try { await fn(); } catch (e) { if (!re.test(e.message)) throw new Error(`${label}: mensagem inesperada: ${e.message}`); return; } throw new Error(`${label}: deveria ter lançado erro`); };

function vcdiffCopyAdd(srcLen, from, len, add) {
    const data = [...add], inst = [19, ...varint(len), 1, ...varint(add.length)], addr = varint(from);
    const body = [...varint(len + add.length), 0, ...varint(data.length), ...varint(inst.length), ...varint(addr.length), ...data, ...inst, ...addr];
    return new Uint8Array([0xD6, 0xC3, 0xC4, 0x00, 0x00, 1, ...varint(srcLen), 0, ...varint(body.length), ...body]);
}
function buildRpt(xml, entries) {          // formato descriptografado: RPTP + 2 + XML + NUL + [u64 tamanho][nome\0][bytes]...
    const parts = [enc.encode('RPTP'), new Uint8Array(2), enc.encode(xml), new Uint8Array(1)];
    for (const [name, bytes] of entries) parts.push(u64(bytes.length), enc.encode(name), new Uint8Array(1), bytes);
    return cat(...parts);
}
async function newDir(root) { const n = 't' + Math.random().toString(36).slice(2); return root.getDirectoryHandle(n, { create: true }); }
async function put(dir, path, bytes) { const p = path.split('/'); let d = dir; for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true }); const fh = await d.getFileHandle(p.at(-1), { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); return fh; }
async function read(dir, path) { const p = path.split('/'); let d = dir; for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x); return new Uint8Array(await (await (await d.getFileHandle(p.at(-1))).getFile()).arrayBuffer()); }
async function exists(dir, path) { try { await read(dir, path); return true; } catch { return false; } }
async function listAll(dir, pre = '') { const o = []; for await (const [n, h] of dir.entries()) { if (h.kind === 'directory') o.push(...await listAll(h, pre + n + '/')); else o.push(pre + n); } return o.sort(); }

export async function runAll(snippetUrl, opsUrl, sha256Url) {
    const results = [];
    const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e && e.stack || e) }); } };
    const S = await import(snippetUrl);                       // código extraído do raiden_patcher.js
    const O = await import(opsUrl);
    const H = await import(sha256Url);
    const root = await navigator.storage.getDirectory();

    await test('SHA-256 próprio == crypto.subtle (vários tamanhos, 5 MB em pedaços)', async () => {
        for (const n of [0, 1, 55, 56, 64, 65, 1000, 70000]) { const b = crypto.getRandomValues(new Uint8Array(Math.min(n, 65536))); const full = n > 65536 ? cat(b, b.slice(0, n - 65536)) : b; if (await sha(full) !== new H.Sha256().update(full).digestHex()) throw new Error('len ' + n); }
        const big = new Uint8Array(5_000_000); for (let i = 0; i < big.length; i += 65536) crypto.getRandomValues(big.subarray(i, Math.min(i + 65536, big.length)));
        if (await H.sha256Blob(new Blob([big]), null, 999_983) !== await sha(big)) throw new Error('5MB');
    });

    await test('parseManifestXml: v1 sem <Ops>, v2 com <Ops>, XML v2 malformado recusado, XML v1 malformado tolerado', async () => {
        const v1 = S.parseManifestXml('<RPT><GameName>Jogo</GameName><Version>2</Version><Author>eu</Author><TargetMD5>aa</TargetMD5><Resumo>linha1\nlinha2</Resumo></RPT>');
        if (v1.meta.gameName !== 'Jogo' || v1.meta.targetMd5 !== 'aa' || v1.ops.length) throw new Error('v1 mal lido');
        const H1 = 'a'.repeat(64);
        const v2 = S.parseManifestXml(`<RPT><GameName>X</GameName><Ops>
            <Op type="delta" path="MOVIE/M1.PSS" payload="__rpt/m1.vcdiff" codec="deflate-raw" srcSha256="${H1}" sha256="${H1}"/>
            <Op type="inject" path="SLUS_213.73" srcSha256="${H1}"><Patch offset="0x10" old="AABB" new="CCDD"/><Patch offset="32" old="00" new="01"/></Op>
            <Op type="replace" path="DATA/US.DAT" payload="__rpt/us.bin"/></Ops></RPT>`);
        const c = S.countOps(v2.ops); if (c.delta !== 1 || c.inject !== 1 || c.replace !== 1) throw new Error('contagem ' + JSON.stringify(c));
        if (v2.ops[1].patches.length !== 2 || v2.ops[1].patches[0].offset !== 16) throw new Error('patches inject');
        await throwsAsync(async () => S.parseManifestXml('<RPT><Ops><Op type="delta"></RPT>'), /malformado/, 'v2 malformado');
        S.parseManifestXml('<RPT><GameName>Sem fechar</RPT>');                 // v1: não pode lançar
        await throwsAsync(async () => S.parseManifestXml('<RPT><Ops><Op type="delta" path="../x" payload="__rpt/a" srcSha256="' + H1 + '" sha256="' + H1 + '"/></Ops></RPT>'), /proibido/, 'path traversal no XML');
    });

    await test('extractPatchPayload: separa patch_files/ e patch_ops/, normaliza barras, ignora entrada sem nome', async () => {
        const d = await newDir(root);
        const payload = buildRpt('<RPT/>', [['DATA\\TEXT\\US.DAT', enc.encode('traduzido')], ['/SYS//X.BIN', enc.encode('x')], ['__rpt/m1.vcdiff', enc.encode('delta')], ['', enc.encode('lixo')], ['__rpt/sub/a.bin', enc.encode('a')]]);
        const fh = await put(d, 'dec.bin', payload);
        const { xml, entries } = await S.extractPatchPayload(fh, d);
        if (xml !== '<RPT/>') throw new Error('xml');
        const files = await listAll(d);
        const want = ['dec.bin', 'patch_files/DATA/TEXT/US.DAT', 'patch_files/SYS/X.BIN', 'patch_ops/m1.vcdiff', 'patch_ops/sub/a.bin'];
        if (files.join() !== want.join()) throw new Error('arquivos: ' + files.join());
        eq(await read(d, 'patch_files/DATA/TEXT/US.DAT'), enc.encode('traduzido'));
        if (entries.length !== 4) throw new Error('entries ' + entries.length);
    });

    await test('extractPatchPayload: recusa assinatura errada, "..", caracteres de controle, truncamento, nome sem NUL, tamanho absurdo', async () => {
        const run = async (bytes) => { const d = await newDir(root); return S.extractPatchPayload(await put(d, 'dec.bin', bytes), d); };
        await throwsAsync(() => run(cat(enc.encode('XXXX'), new Uint8Array(40))), /Assinatura/, 'magic');
        await throwsAsync(() => run(buildRpt('<RPT/>', [['../evil.bin', enc.encode('x')]])), /proibido/, '..');
        await throwsAsync(() => run(buildRpt('<RPT/>', [['a/../../evil.bin', enc.encode('x')]])), /proibido/, 'a/../..');
        await throwsAsync(() => run(buildRpt('<RPT/>', [['A:B.bin', enc.encode('x')]])), /proibidos/, 'dois pontos');
        await throwsAsync(() => run(buildRpt('<RPT/>', [['__rpt/../x', enc.encode('x')]])), /proibido/, '__rpt/..');
        const ok = buildRpt('<RPT/>', [['A.BIN', enc.encode('0123456789')]]);
        await throwsAsync(() => run(ok.slice(0, ok.length - 4)), /truncado/, 'truncado');
        await throwsAsync(() => run(cat(enc.encode('RPTP'), new Uint8Array(2), enc.encode('<RPT/>'), new Uint8Array(1), u64(5), enc.encode('x'.repeat(2000)))), /longo demais/, 'nome gigante');
        await throwsAsync(() => run(cat(enc.encode('RPTP'), new Uint8Array(2), enc.encode('<RPT/>'), new Uint8Array(1), u64(2 ** 40), enc.encode('A.BIN'), new Uint8Array(1))), /4 GiB/, 'tamanho absurdo');
        const d = await newDir(root);                                      // sobra de <8 bytes no fim é tolerada (v1)
        await S.extractPatchPayload(await put(d, 'dec.bin', cat(ok, new Uint8Array(3))), d);
    });

    await test('FIM-A-FIM: extrair + parse + applyOps (delta deflate, inject, replace) sobre "arquivos da ISO" em OPFS real', async () => {
        const d = await newDir(root);
        const origMovie = crypto.getRandomValues(new Uint8Array(6000)), add = enc.encode('LEGENDA PT-BR');
        const wantMovie = cat(origMovie.slice(500, 4500), add);
        const delta = vcdiffCopyAdd(origMovie.length, 500, 4000, add);
        const elf = crypto.getRandomValues(new Uint8Array(2048)); const wantElf = elf.slice(); wantElf.set([0xDE, 0xAD, 0xBE, 0xEF], 0x40);
        const textoNovo = enc.encode('Olá, mundo traduzido!');
        const xml = `<RPT><GameName>Teste</GameName><Ops>
          <Op type="delta" path="movie/m1.pss" payload="__rpt/m1.vcdiff" codec="deflate-raw" srcSha256="${await sha(origMovie)}" sha256="${await sha(wantMovie)}"/>
          <Op type="inject" path="SLUS_213.73" srcSha256="${await sha(elf)}" sha256="${await sha(wantElf)}"><Patch offset="0x40" old="${hex(elf.slice(0x40, 0x44))}" new="DEADBEEF"/></Op>
          <Op type="replace" path="DATA/US.DAT" payload="__rpt/us.bin" sha256="${await sha(textoNovo)}"/></Ops></RPT>`;
        const rpt = buildRpt(xml, [['__rpt/m1.vcdiff', await deflate(delta)], ['__rpt/us.bin', textoNovo], ['SYS/EXTRA.TXT', enc.encode('entrada legada v1')]]);
        const decFh = await put(d, 'patch_dec.bin', rpt);
        const { xml: x2 } = await S.extractPatchPayload(decFh, d);
        const { ops } = S.parseManifestXml(x2);
        const filesDir = await d.getDirectoryHandle('patch_files'), payloadRoot = await d.getDirectoryHandle('patch_ops');
        await put(filesDir, 'MOVIE/M1.PSS;1', origMovie);                  // o que ExtrairNaPasta faria com a ISO do usuário
        await put(filesDir, 'SLUS_213.73;1', elf);
        await put(filesDir, 'DATA/US.DAT', enc.encode('original'));
        const r = await O.applyOps({ ops, filesRoot: filesDir, payloadRoot });
        if (r.applied !== 3) throw new Error('applied ' + r.applied);
        eq(await read(filesDir, 'MOVIE/M1.PSS;1'), wantMovie, 'delta');
        eq(await read(filesDir, 'SLUS_213.73;1'), wantElf, 'inject');
        eq(await read(filesDir, 'DATA/US.DAT'), textoNovo, 'replace');
        eq(await read(filesDir, 'SYS/EXTRA.TXT'), enc.encode('entrada legada v1'), 'legado v1');
        await O.cleanupWorkDir(root, [d.name]);
        if (await exists(root, d.name + '/x')) throw new Error('cleanup falhou');
        let still = false; for await (const [n] of root.entries()) if (n === d.name) still = true;
        if (still) throw new Error('pasta temporária ainda existe');
    });

    await test('ATOMICIDADE real: hash do resultado errado → abort() e arquivo original continua byte a byte igual (delta, inject, replace)', async () => {
        const d = await newDir(root); const filesDir = await d.getDirectoryHandle('patch_files', { create: true }), pay = await d.getDirectoryHandle('patch_ops', { create: true });
        const orig = crypto.getRandomValues(new Uint8Array(3000)), add = enc.encode('X'), wrong = 'f'.repeat(64);
        await put(filesDir, 'A.BIN', orig); await put(filesDir, 'B.BIN', orig); await put(filesDir, 'C.BIN', orig);
        await put(pay, 'd.vcdiff', vcdiffCopyAdd(orig.length, 0, 100, add)); await put(pay, 'r.bin', enc.encode('novo'));
        const sh = await sha(orig);
        const run = (o) => O.applyOps({ ops: O.normalizeOps([o]), filesRoot: filesDir, payloadRoot: pay });
        await throwsAsync(() => run({ type: 'delta', path: 'A.BIN', payload: '__rpt/d.vcdiff', srcSha256: sh, sha256: wrong }), /Verificação falhou/, 'delta');
        await throwsAsync(() => run({ type: 'inject', path: 'B.BIN', srcSha256: sh, sha256: wrong, patches: [{ offset: '0', old: hex(orig.slice(0, 2)), new: '0000' }] }), /Verificação falhou/, 'inject');
        await throwsAsync(() => run({ type: 'replace', path: 'C.BIN', payload: '__rpt/r.bin', sha256: wrong }), /Verificação falhou/, 'replace');
        for (const n of ['A.BIN', 'B.BIN', 'C.BIN']) eq(await read(filesDir, n), orig, n + ' foi alterado!');
        await O.cleanupWorkDir(root, [d.name]);
    });

    await test('ISO "de outra versão": hash da origem diferente → recusa antes de gravar qualquer byte', async () => {
        const d = await newDir(root); const filesDir = await d.getDirectoryHandle('patch_files', { create: true }), pay = await d.getDirectoryHandle('patch_ops', { create: true });
        const esperado = crypto.getRandomValues(new Uint8Array(3000)), outra = crypto.getRandomValues(new Uint8Array(3000));
        await put(filesDir, 'M.PSS', outra); await put(pay, 'd.vcdiff', vcdiffCopyAdd(3000, 0, 10, enc.encode('x')));
        const shEsp = await sha(esperado);
        await throwsAsync(() => O.applyOps({ ops: O.normalizeOps([{ type: 'delta', path: 'M.PSS', payload: '__rpt/d.vcdiff', srcSha256: shEsp, sha256: 'a'.repeat(64) }]), filesRoot: filesDir, payloadRoot: pay }), /não é o esperado/, 'origem');
        eq(await read(filesDir, 'M.PSS'), outra);
        await O.cleanupWorkDir(root, [d.name]);
    });

    await test('desempenho: delta de 40 MB (janelas de 8 MB) + SHA-256 em < 20 s, sem estourar memória', async () => {
        const d = await newDir(root); const filesDir = await d.getDirectoryHandle('patch_files', { create: true }), pay = await d.getDirectoryHandle('patch_ops', { create: true });
        const SIZE = 40 * 1024 * 1024, big = new Uint8Array(SIZE); for (let i = 0; i < SIZE; i += 65536) crypto.getRandomValues(big.subarray(i, Math.min(i + 65536, SIZE)));
        const W = 8 * 1024 * 1024, wins = [], expectedParts = [];
        for (let i = 0; i < SIZE / W; i++) {            // 5 janelas: cada uma COPY(da própria posição, W-8) + ADD(8 bytes)
            const add = enc.encode('ABCDEFGH'), segPos = i * W, len = W - 8;
            const data = [...add], inst = [19, ...varint(len), 1, ...varint(8)], addr = varint(0);
            const body = [...varint(len + 8), 0, ...varint(data.length), ...varint(inst.length), ...varint(addr.length), ...data, ...inst, ...addr];
            wins.push(1, ...varint(W), ...varint(segPos), ...varint(body.length), ...body);
            expectedParts.push(big.subarray(segPos, segPos + len), add);
        }
        const delta = new Uint8Array([0xD6, 0xC3, 0xC4, 0, 0, ...wins]), want = cat(...expectedParts);
        await put(filesDir, 'BIG.PSS', big); await put(pay, 'd.vcdiff', delta);
        const t0 = performance.now();
        await O.applyOps({ ops: O.normalizeOps([{ type: 'delta', path: 'BIG.PSS', payload: '__rpt/d.vcdiff', srcSha256: await sha(big), sha256: await sha(want) }]), filesRoot: filesDir, payloadRoot: pay });
        const dt = (performance.now() - t0) / 1000;
        if (dt > 20) throw new Error('lento: ' + dt.toFixed(1) + 's');
        const got = await read(filesDir, 'BIG.PSS'); if (got.length !== want.length || await sha(got) !== await sha(want)) throw new Error('resultado incorreto');
        results.push({ name: `   (info) 40 MB em ${dt.toFixed(2)} s`, ok: true });
        await O.cleanupWorkDir(root, [d.name]);
    });

    return results;
}
