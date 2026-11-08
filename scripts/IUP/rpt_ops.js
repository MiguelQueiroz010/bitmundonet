/**
 * rpt_ops.js
 * Motor de operações do formato RPT v2 ("file-tree diff").
 *
 * Em vez de carregar arquivos inteiros da publisher, o patch descreve OPERAÇÕES por arquivo
 * da ISO; o conteúdo original sempre vem da ISO que o próprio usuário selecionou.
 *
 *   replace  → grava um arquivo criado pelo autor do patch (tradução, fonte, etc.)
 *   delta    → aplica um delta xdelta/VCDIFF sobre o arquivo ORIGINAL da ISO do usuário
 *   inject   → troca bytes em offsets fixos [offset, old, new] (ex.: ELF/SLUS)
 *
 * Garantias de segurança aplicadas aqui:
 *   - Todo caminho vindo do patch é validado (sem "..", sem separadores estranhos, sem caracteres de controle).
 *   - delta/inject só rodam se o SHA-256 do arquivo original da ISO do usuário bater com o esperado
 *     (assim o patch nunca é aplicado sobre o arquivo errado e nunca "inventa" conteúdo original).
 *   - O resultado é verificado por SHA-256 ANTES de ser confirmado em disco (createWritable é atômico:
 *     abort() descarta tudo e o arquivo original permanece intacto).
 *   - Limites de tamanho/quantidade contra patches corrompidos ou maliciosos.
 */

import { Sha256, sha256Blob } from './rpt_sha256.js';
import { applyVcdiff } from './rpt_vcdiff.js';

export const RPT_PAYLOAD_PREFIX = '__rpt/';

export const LIMITS = Object.freeze({
    maxOps: 5000,
    maxInjectPatches: 20000,
    maxInjectFileBytes: 256 * 1024 * 1024,   // inject é feito em RAM
    maxFileBytes: 4 * 1024 * 1024 * 1024 - 1, // limite do ISO9660 (4 GiB - 1)
    maxPathChars: 1024,
    maxPathDepth: 32,
    maxPartChars: 255,
});

const HEX64 = /^[0-9a-f]{64}$/i;
const CODECS = new Set(['none', 'deflate-raw', 'gzip']);

// ── Validação ────────────────────────────────────────────────────────────────

/** Valida um caminho relativo vindo do patch e devolve as partes. Lança erro se for suspeito. */
export function parseRelPath(p, label = 'caminho') {
    if (typeof p !== 'string' || !p.length) throw new Error(`Patch inválido: ${label} vazio.`);
    if (p.length > LIMITS.maxPathChars) throw new Error(`Patch inválido: ${label} longo demais.`);
    const parts = p.replace(/\\/g, '/').split('/');
    if (parts[0] === '') throw new Error(`Patch inválido: ${label} não pode ser absoluto ("${p}").`);
    if (parts.length > LIMITS.maxPathDepth) throw new Error(`Patch inválido: ${label} com profundidade excessiva.`);
    for (const part of parts) {
        if (!part || part === '.' || part === '..')
            throw new Error(`Patch inválido: ${label} contém segmento proibido ("${p}").`);
        if (part.length > LIMITS.maxPartChars)
            throw new Error(`Patch inválido: nome longo demais em ${label}.`);
        if (/[\u0000-\u001f<>:"|?*]/.test(part))
            throw new Error(`Patch inválido: ${label} contém caracteres proibidos ("${p}").`);
    }
    return parts;
}

function hexToBytes(s, label) {
    const h = String(s ?? '').replace(/\s+/g, '');
    if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new Error(`Patch inválido: hex malformado em ${label}.`);
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
}

function parseOffset(s, label) {
    const t = String(s ?? '').trim();
    const n = /^0x[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : /^\d+$/.test(t) ? parseInt(t, 10) : NaN;
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Patch inválido: offset inválido em ${label} ("${t}").`);
    return n;
}

function needHash(v, label, required) {
    if (v == null || v === '') {
        if (required) throw new Error(`Patch inválido: ${label} é obrigatório.`);
        return null;
    }
    if (!HEX64.test(String(v).trim())) throw new Error(`Patch inválido: ${label} deve ser SHA-256 (64 hex).`);
    return String(v).trim().toLowerCase();
}

/**
 * Converte a lista "crua" (extraída do XML) em operações validadas.
 * @param {Array<object>} raw
 */
export function normalizeOps(raw) {
    if (!Array.isArray(raw)) return [];
    if (raw.length > LIMITS.maxOps) throw new Error('Patch inválido: operações demais.');
    const seen = new Set();
    let totalPatches = 0;

    return raw.map((r, i) => {
        const tag = `operação #${i + 1}`;
        const type = String(r.type || '').toLowerCase();
        if (!['replace', 'delta', 'inject'].includes(type))
            throw new Error(`Patch inválido: tipo desconhecido em ${tag} ("${r.type}").`);

        const parts = parseRelPath(r.path, `${tag} path`);
        const key = parts.map(x => x.toUpperCase()).join('/');
        if (seen.has(key)) throw new Error(`Patch inválido: mais de uma operação para "${r.path}".`);
        seen.add(key);

        const op = { type, path: parts.join('/'), parts, size: null };
        if (r.size != null && r.size !== '') {
            const n = Number(r.size);
            if (!Number.isSafeInteger(n) || n < 0 || n > LIMITS.maxFileBytes)
                throw new Error(`Patch inválido: size fora do limite em ${tag}.`);
            op.size = n;
        }

        if (type === 'replace' || type === 'delta') {
            const pp = String(r.payload || '').replace(/\\/g, '/');
            if (!pp.startsWith(RPT_PAYLOAD_PREFIX))
                throw new Error(`Patch inválido: payload de ${tag} deve ficar em "${RPT_PAYLOAD_PREFIX}".`);
            op.payloadParts = parseRelPath(pp.slice(RPT_PAYLOAD_PREFIX.length), `${tag} payload`);
            op.payload = pp;
            op.codec = String(r.codec || 'none').toLowerCase();
            if (!CODECS.has(op.codec)) throw new Error(`Patch inválido: codec "${r.codec}" não suportado (use none, deflate-raw ou gzip).`);
            op.sha256 = needHash(r.sha256, `${tag} sha256`, type === 'delta');
            op.srcSha256 = type === 'delta' ? needHash(r.srcSha256, `${tag} srcSha256`, true) : null;
        } else {
            op.srcSha256 = needHash(r.srcSha256, `${tag} srcSha256`, true);
            op.sha256 = needHash(r.sha256, `${tag} sha256`, false);
            const list = Array.isArray(r.patches) ? r.patches : [];
            if (!list.length) throw new Error(`Patch inválido: ${tag} (inject) sem alterações.`);
            totalPatches += list.length;
            if (totalPatches > LIMITS.maxInjectPatches) throw new Error('Patch inválido: alterações inject demais.');
            op.patches = list.map((p, k) => {
                const oldB = hexToBytes(p.old, `${tag} patch ${k + 1} old`);
                const newB = hexToBytes(p.new, `${tag} patch ${k + 1} new`);
                if (!oldB.length || oldB.length !== newB.length)
                    throw new Error(`Patch inválido: ${tag} patch ${k + 1} precisa de old/new com o mesmo tamanho (>0).`);
                return { offset: parseOffset(p.offset, `${tag} patch ${k + 1}`), old: oldB, new: newB };
            });
            const sorted = [...op.patches].sort((a, b) => a.offset - b.offset);
            for (let k = 1; k < sorted.length; k++)
                if (sorted[k].offset < sorted[k - 1].offset + sorted[k - 1].old.length)
                    throw new Error(`Patch inválido: alterações sobrepostas em "${op.path}".`);
        }
        return op;
    });
}

// ── Acesso ao sistema de arquivos (File System Access API) ───────────────────

// Nomes ISO9660 podem vir em maiúsculas e/ou com ";1"; compara de forma tolerante.
const normName = (n) => n.replace(/;\d+$/, '').toUpperCase();

async function findChild(dir, name, kind) {
    const want = normName(name);
    for await (const [n, h] of dir.entries()) {
        if (h.kind === kind && normName(n) === want) return h;
    }
    return null;
}

async function resolveFile(root, parts, { create }) {
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
        let next = await findChild(dir, parts[i], 'directory');
        if (!next) {
            if (!create) throw new Error(`Pasta não encontrada na ISO: ${parts.slice(0, i + 1).join('/')}`);
            next = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        dir = next;
    }
    const last = parts[parts.length - 1];
    let fh = await findChild(dir, last, 'file');
    if (!fh) {
        if (!create) throw new Error(`Arquivo não encontrado na ISO: ${parts.join('/')}`);
        fh = await dir.getFileHandle(last, { create: true });
    }
    return fh;
}

/** Grava o arquivo-payload de uma entrada do patch na pasta de payloads (usado pelo scanner). */
export async function createPayloadFile(payloadRoot, relParts) {
    let dir = payloadRoot;
    for (let i = 0; i < relParts.length - 1; i++) dir = await dir.getDirectoryHandle(relParts[i], { create: true });
    return dir.getFileHandle(relParts[relParts.length - 1], { create: true });
}

// ── Escrita verificada (atômica) ─────────────────────────────────────────────

async function writeVerified(fileHandle, produce, expectedSha, label) {
    const w = await fileHandle.createWritable();
    const hasher = new Sha256();
    let total = 0;
    const sink = {
        write: async (u8) => {
            total += u8.length;
            if (total > LIMITS.maxFileBytes) throw new Error(`Resultado de "${label}" excede o limite de 4 GiB.`);
            hasher.update(u8);
            await w.write(u8);
        },
    };
    try {
        await produce(sink);
        const got = hasher.digestHex();
        if (expectedSha && got !== expectedSha)
            throw new Error(`Verificação falhou em "${label}": o resultado não bate com o esperado pelo patch (patch corrompido ou ISO diferente).`);
        await w.close();
        return { bytes: total, sha256: got };
    } catch (e) {
        try { await w.abort(); } catch (_) { /* já fechado */ }
        throw e;
    }
}

async function streamBlob(blob, codec, sink, declaredSize, label) {
    let stream = blob.stream();
    if (codec !== 'none') stream = stream.pipeThrough(new DecompressionStream(codec));
    const reader = stream.getReader();
    let total = 0;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (declaredSize != null && total > declaredSize)
            throw new Error(`Conteúdo de "${label}" maior que o declarado no patch (corrompido ou malicioso).`);
        if (total > LIMITS.maxFileBytes) throw new Error(`Conteúdo de "${label}" excede o limite de 4 GiB.`);
        await sink.write(value);
    }
    if (declaredSize != null && total !== declaredSize)
        throw new Error(`Conteúdo de "${label}" menor que o declarado no patch.`);
}

// ── Execução ─────────────────────────────────────────────────────────────────

async function getPayload(payloadRoot, op) {
    const fh = await resolveFile(payloadRoot, op.payloadParts, { create: false })
        .catch(() => { throw new Error(`Patch incompleto: conteúdo "${op.payload}" não está no arquivo .rpt.`); });
    return { handle: fh, file: await fh.getFile() };
}

async function runReplace(op, ctx) {
    const { file } = await getPayload(ctx.payloadRoot, op);
    const target = await resolveFile(ctx.filesRoot, op.parts, { create: true });
    return writeVerified(target, (sink) => streamBlob(file, op.codec, sink, op.size, op.path), op.sha256, op.path);
}

async function runDelta(op, ctx, progress) {
    const target = await resolveFile(ctx.filesRoot, op.parts, { create: false });
    const srcFile = await target.getFile();

    const have = await sha256Blob(srcFile, (f) => progress(f * 0.4, `Verificando original: ${op.path}`));
    if (have !== op.srcSha256)
        throw new Error(`O arquivo "${op.path}" da sua ISO não é o esperado por este patch (hash diferente). ` +
            `Provavelmente é outra versão/região do jogo ou um dump alterado. Nada foi modificado.`);

    const { handle, file } = await getPayload(ctx.payloadRoot, op);
    let deltaBlob = file;
    if (op.codec !== 'none') {                   // VCDIFF precisa de leitura sequencial por fatias: descompacta p/ temporário
        const tmp = await createPayloadFile(ctx.payloadRoot, [...op.payloadParts.slice(0, -1), op.payloadParts.at(-1) + '.dec']);
        await writeVerified(tmp, (sink) => streamBlob(file, op.codec, sink, null, op.payload), null, op.payload);
        deltaBlob = await tmp.getFile();
    }
    return writeVerified(
        target,
        (sink) => applyVcdiff({
            delta: deltaBlob, source: srcFile, sink,
            onProgress: (f) => progress(0.4 + f * 0.6, `Aplicando delta: ${op.path}`),
        }),
        op.sha256, op.path);
}

async function runInject(op, ctx) {
    const target = await resolveFile(ctx.filesRoot, op.parts, { create: false });
    const file = await target.getFile();
    if (file.size > LIMITS.maxInjectFileBytes)
        throw new Error(`"${op.path}" é grande demais para inject (${file.size} bytes). Use delta.`);
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (new Sha256().update(bytes).digestHex() !== op.srcSha256)
        throw new Error(`O arquivo "${op.path}" da sua ISO não é o esperado por este patch (hash diferente). Nada foi modificado.`);

    for (const p of op.patches) {                // verifica TODOS antes de alterar qualquer byte
        if (p.offset + p.old.length > bytes.length)
            throw new Error(`Offset 0x${p.offset.toString(16)} fora do arquivo "${op.path}".`);
        for (let i = 0; i < p.old.length; i++)
            if (bytes[p.offset + i] !== p.old[i])
                throw new Error(`Bytes originais não conferem em "${op.path}" +0x${p.offset.toString(16)}.`);
    }
    for (const p of op.patches) bytes.set(p.new, p.offset);
    return writeVerified(target, (sink) => sink.write(bytes), op.sha256, op.path);
}

/**
 * Executa todas as operações, em ordem, sobre a pasta já preenchida com os arquivos originais da ISO.
 * @param {{ops:object[], filesRoot:FileSystemDirectoryHandle, payloadRoot:FileSystemDirectoryHandle,
 *          onProgress?:(frac:number,msg:string)=>void}} o
 * @returns {Promise<{applied:number, report:Array}>}
 */
export async function applyOps({ ops, filesRoot, payloadRoot, onProgress }) {
    const ctx = { filesRoot, payloadRoot };
    const report = [];
    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const progress = (f, msg) => onProgress && onProgress((i + f) / ops.length, msg);
        progress(0, `${op.type.toUpperCase()}: ${op.path}`);
        const run = op.type === 'replace' ? runReplace(op, ctx)
                  : op.type === 'delta'   ? runDelta(op, ctx, progress)
                  :                         runInject(op, ctx);
        const res = await run;
        report.push({ type: op.type, path: op.path, bytes: res.bytes, sha256: res.sha256 });
        progress(1, `OK: ${op.path}`);
    }
    return { applied: ops.length, report };
}

/** Remove (se existirem) pastas/arquivos temporários da pasta de trabalho. Nunca lança erro. */
export async function cleanupWorkDir(workDirHandle, names) {
    for (const n of names) {
        try { await workDirHandle.removeEntry(n, { recursive: true }); } catch (_) { /* não existe ou em uso */ }
    }
}
