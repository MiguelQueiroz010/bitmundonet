/**
 * rpt_builder.js
 * Criação de patches RPT v2 no navegador: compara a árvore de arquivos da ISO ORIGINAL com a MODIFICADA
 * (ISO extraída ou pasta) e grava só o que mudou:
 *   - arquivo novo                       → replace
 *   - mesmo tamanho, poucos bytes mudaram → inject  [offset, old, new]
 *   - demais modificados                  → delta VCDIFF (xdelta-compatível), verificado por round-trip
 *   - delta não compensa                  → replace
 *   - arquivo idêntico                    → NADA (nunca vai para o patch)
 * Tudo roda localmente; nada é enviado a servidor.
 */

import { Sha256, sha256Blob } from './rpt_sha256.js';
import { encodeVcdiff } from './rpt_vcdiff_encoder.js';
import { applyVcdiff } from './rpt_vcdiff.js';
import { LIMITS, RPT_PAYLOAD_PREFIX } from './rpt_ops.js';

const MAX_INJECT_RUNS = 2000;
const MAX_INJECT_CHANGED = 4 * 1024;      // inject só para ajustes pequenos (os bytes "old" vão no patch)
const MERGE_GAP = 8;
const DELTA_WORTH = 0.85;                     // delta só vale se < 85% do arquivo novo
const COMPRESS_LIMIT = 64 * 1024 * 1024;      // acima disso, replace vai sem compressão (vídeo já é comprimido)

export const normKey = (parts) => parts.map(p => p.replace(/;\d+$/, '').toUpperCase()).join('/');
const cleanName = (n) => n.replace(/;\d+$/, '');

/** Lista recursivamente os arquivos de uma pasta. */
export async function listFiles(dir, prefix = [], out = []) {
    for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') await listFiles(h, [...prefix, name], out);
        else out.push({ parts: [...prefix, name], handle: h });
    }
    return out;
}

async function scanDiff(a, b, onChunk) {
    // Compara dois Blobs de MESMO tamanho em blocos; devolve {identical, runs|null, changed}
    const CH = 4 * 1024 * 1024;
    const runs = []; let overflow = false, changed = 0;
    for (let off = 0; off < a.size; off += CH) {
        const x = new Uint8Array(await a.slice(off, off + CH).arrayBuffer());
        const y = new Uint8Array(await b.slice(off, off + CH).arrayBuffer());
        for (let i = 0; i < x.length; i++) {
            if (x[i] === y[i]) continue;
            changed++;
            if (overflow) continue;
            const p = off + i, last = runs[runs.length - 1];
            if (last && p - last[1] < MERGE_GAP) last[1] = p + 1;
            else if (runs.length >= MAX_INJECT_RUNS) overflow = true;
            else runs.push([p, p + 1]);
        }
        if (onChunk) onChunk(Math.min(1, (off + CH) / a.size));
    }
    return { identical: changed === 0, runs: overflow ? null : runs, changed };
}

const fmtMB = (n) => n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const hex = (u8) => [...u8].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

async function writePayload(payloadDir, name, blob, codec) {
    const fh = await payloadDir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try {
        let s = blob.stream();
        if (codec !== 'none') s = s.pipeThrough(new CompressionStream(codec));
        const r = s.getReader();
        for (;;) { const { value, done } = await r.read(); if (done) break; await w.write(value); }
        await w.close();
    } catch (e) { try { await w.abort(); } catch (_) {} throw e; }
    return (await fh.getFile()).size;
}

/**
 * @param {object} o
 * @param {FileSystemDirectoryHandle} o.origDir   arquivos da ISO original
 * @param {Array<{parts:string[],handle}>} o.modFiles  arquivos da versão modificada
 * @param {Array<{parts:string[],handle}>} o.origFiles arquivos da ISO original
 * @param {FileSystemDirectoryHandle} o.payloadDir  onde gravar os conteúdos (delta/replace)
 * @param {(frac:number,msg:string)=>void} [o.onProgress]
 * @returns {Promise<{ops:Array, stats:object}>}
 */
export async function analyzeTrees({ origFiles, modFiles, payloadDir, onProgress }) {
    const origMap = new Map(origFiles.map(f => [normKey(f.parts), f]));
    const ops = []; const stats = { same: 0, replace: 0, delta: 0, inject: 0, fallback: 0, payloadBytes: 0 };
    let counter = 0;
    const nextName = () => `p${String(++counter).padStart(6, '0')}.bin`;

    for (let i = 0; i < modFiles.length; i++) {
        const mf = modFiles[i];
        const path = mf.parts.map(cleanName).join('/');
        const prog = (f, msg) => onProgress && onProgress((i + f) / modFiles.length, msg || path);
        prog(0, `Comparando: ${path}`);
        const mod = await mf.handle.getFile();
        const of = origMap.get(normKey(mf.parts));

        const doReplace = async (reason) => {
            const sha256 = await sha256Blob(mod);
            const codec = mod.size <= COMPRESS_LIMIT ? 'deflate-raw' : 'none';
            const name = nextName();
            const bytes = await writePayload(payloadDir, name, mod, codec);
            ops.push({ type: 'replace', path, payloadName: name, codec, sha256, size: mod.size, bytes, reason });
            stats.replace++; stats.payloadBytes += bytes;
        };

        if (!of) { await doReplace('arquivo novo (não existe na ISO original)'); continue; }
        const orig = await of.handle.getFile();

        if (orig.size === mod.size) {
            const d = await scanDiff(orig, mod, (f) => prog(f * 0.5, `Comparando: ${path}`));
            if (d.identical) { stats.same++; continue; }
            if (d.runs && d.runs.reduce((n, r) => n + (r[1] - r[0]), 0) <= MAX_INJECT_CHANGED && orig.size <= LIMITS.maxInjectFileBytes) {
                const patches = [];
                for (const [s, e] of d.runs) {
                    patches.push({
                        offset: s,
                        old: hex(new Uint8Array(await orig.slice(s, e).arrayBuffer())),
                        new: hex(new Uint8Array(await mod.slice(s, e).arrayBuffer())),
                    });
                }
                ops.push({ type: 'inject', path, srcSha256: await sha256Blob(orig), sha256: await sha256Blob(mod), patches,
                           bytes: patches.reduce((n, p) => n + p.old.length + p.new.length, 0) / 2, reason: `${d.changed} byte(s) alterado(s)` });
                stats.inject++; continue;
            }
        }

        // delta — gravado em disco (sem teto de RAM); arquivos grandes usam janelas e alcance maiores
        const big = orig.size > 256 * 1024 * 1024;
        const windowSize = big ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
        const reach = big ? 32 * 1024 * 1024 : 8 * 1024 * 1024;
        const maxBytes = Math.floor(mod.size * DELTA_WORTH);
        const tmpName = `${nextName()}.delta`;
        const tmpHandle = await payloadDir.getFileHandle(tmpName, { create: true });
        const tw = await tmpHandle.createWritable();
        const enc = {}; let deltaOk = false;
        try {
            await encodeVcdiff({ source: orig, target: mod, maxBytes, stats: enc,
                sink: { write: (u) => tw.write(u) },
                windowSize, reach,
                onProgress: (f) => prog(0.5 + f * 0.3, `Gerando delta: ${path}`) });
            await tw.close(); deltaOk = true;
        } catch (e) {
            try { await tw.abort(); } catch (_) {}
            if (e.code !== 'DELTA_TOO_LARGE') { await payloadDir.removeEntry(tmpName).catch(() => {}); throw e; }
        }

        if (!deltaOk) {
            await payloadDir.removeEntry(tmpName).catch(() => {});
            const seen = enc.copied || 0, tot = (enc.copied || 0) + (enc.added || 0);
            const pct = tot ? (100 * seen / tot) : 0;
            stats.fallback++;
            await doReplace(`delta não compensa: só ~${pct.toFixed(0)}% do trecho analisado coincide com o original (busca de ±${reach / 1048576} MB; ` +
                `se o arquivo foi reempacotado/comprimido de novo, o conteúdo muda de lugar ou de forma)`);
            continue;
        }

        // Verificação: aplica o delta ao ORIGINAL e confere o hash do resultado esperado (garante que o patch funciona).
        const deltaBlob = await tmpHandle.getFile();
        const srcSha256 = await sha256Blob(orig), sha256 = await sha256Blob(mod);
        const h = new Sha256();
        await applyVcdiff({ delta: deltaBlob, source: orig, sink: { write: async (u) => { h.update(u); } } });
        if (h.digestHex() !== sha256) { await payloadDir.removeEntry(tmpName).catch(() => {}); throw new Error(`Falha interna ao verificar o delta de "${path}". Nada foi gravado.`); }

        const name = nextName();
        const bytes = await writePayload(payloadDir, name, deltaBlob, 'deflate-raw');
        await payloadDir.removeEntry(tmpName).catch(() => {});
        const tot = (enc.copied || 0) + (enc.added || 0);
        ops.push({ type: 'delta', path, payloadName: name, codec: 'deflate-raw', srcSha256, sha256, size: mod.size, bytes,
                   reason: `delta ${fmtMB(bytes)} de ${fmtMB(mod.size)} (${tot ? (100 * (enc.copied || 0) / tot).toFixed(1) : 0}% igual ao original)` });
        stats.delta++; stats.payloadBytes += bytes;
        prog(1);
    }
    return { ops, stats };
}

// ── Montagem do arquivo ──────────────────────────────────────────────────────

const xmlEsc = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildManifestXml(meta, ops) {
    const t = (tag, v) => (v ? `  <${tag}>${xmlEsc(v)}</${tag}>\n` : '');
    let x = '<RPT>\n' + t('GameName', meta.gameName) + t('Version', meta.version) + t('Author', meta.author)
          + t('TargetMD5', meta.targetMd5) + t('Resumo', meta.desc) + '  <Ops>\n';
    for (const o of ops) {
        const a = (n, v) => (v != null && v !== '' ? ` ${n}="${xmlEsc(v)}"` : '');
        if (o.type === 'inject') {
            x += `    <Op type="inject" path="${xmlEsc(o.path)}"${a('srcSha256', o.srcSha256)}${a('sha256', o.sha256)}>\n`;
            for (const p of o.patches) x += `      <Patch offset="0x${p.offset.toString(16).toUpperCase()}" old="${p.old}" new="${p.new}"/>\n`;
            x += '    </Op>\n';
        } else {
            x += `    <Op type="${o.type}" path="${xmlEsc(o.path)}" payload="${RPT_PAYLOAD_PREFIX}${o.payloadName}" codec="${o.codec}"`
               + `${a('srcSha256', o.srcSha256)}${a('sha256', o.sha256)}${a('size', o.size)}/>\n`;
        }
    }
    return x + '  </Ops>\n</RPT>';
}

/** Grava o patch SEM criptografia (RPTP + XML + entradas) em plainHandle. */
export async function assemblePlainRpt({ ops, meta, payloadDir, plainHandle, onProgress }) {
    const enc = new TextEncoder();
    const w = await plainHandle.createWritable();
    try {
        await w.write(new Uint8Array([0x52, 0x50, 0x54, 0x50, 0, 0]));          // "RPTP" + 2 reservados
        await w.write(enc.encode(buildManifestXml(meta, ops)));
        await w.write(new Uint8Array([0]));
        const withPayload = ops.filter(o => o.payloadName);
        for (let i = 0; i < withPayload.length; i++) {
            const o = withPayload[i];
            const file = await (await payloadDir.getFileHandle(o.payloadName)).getFile();
            const size = new Uint8Array(8); new DataView(size.buffer).setBigUint64(0, BigInt(file.size), true);
            await w.write(size);
            await w.write(enc.encode(RPT_PAYLOAD_PREFIX + o.payloadName));
            await w.write(new Uint8Array([0]));
            const r = file.stream().getReader();
            for (;;) { const { value, done } = await r.read(); if (done) break; await w.write(value); }
            if (onProgress) onProgress((i + 1) / withPayload.length);
        }
        await w.close();
    } catch (e) { try { await w.abort(); } catch (_) {} throw e; }
}
