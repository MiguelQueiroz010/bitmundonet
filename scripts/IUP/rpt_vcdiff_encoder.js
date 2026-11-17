/**
 * rpt_vcdiff_encoder.js
 * Encoder VCDIFF (RFC 3284) simples, em JS puro, janela a janela — compatível com o decoder do
 * rpt_vcdiff.js e com xdelta3 (-S none). Usa apenas ADD e COPY (modo SELF) com checksum Adler-32.
 *
 * Estratégia: para cada janela do ARQUIVO NOVO (4 MB), procura trechos iguais no ORIGINAL (a janela ± 8 MB).
 *   1. Primeiro tenta a "diagonal": o mesmo deslocamento do último acerto (ou o mesmo offset, no início). Arquivos
 *      editados "no lugar" (texto traduzido, fonte, vídeo com legenda) casam quase tudo por aqui, e o trecho igual é
 *      percorrido de 4 em 4 bytes — sem hash e sem tabela.
 *   2. Só depois de algumas dezenas de bytes sem acerto (dado movido/inserido) indexa blocos de 16 bytes do original
 *      numa tabela de hash e varre o novo com hash rolante: primeiro só a vizinhança (±128 KB) do ponto atual
 *      (barato), e o segmento inteiro apenas se 16 KB seguidos não casarem em lugar nenhum. Cada acerto é estendido
 *      para frente e para trás (recupera o que veio antes da detecção).
 * O segmento de origem gravado em cada janela cobre só o intervalo realmente referenciado pelos COPY (o decoder lê
 * menos do disco ao aplicar). Se o delta ficar grande demais o chamador pode desistir (maxBytes) e usar substituição.
 */

const B = 16;                              // tamanho do bloco de indexação
const M = 0x01000193;                      // multiplicador do hash polinomial
let MB = 1; for (let i = 0; i < B; i++) MB = Math.imul(MB, M);

const DEFAULT_WINDOW = 4 * 1024 * 1024;
const DEFAULT_REACH = 8 * 1024 * 1024;
const LOCAL_AFTER = 32;                    // bytes sem acerto na diagonal antes de consultar um índice local
const LOCAL_REACH = 128 * 1024;            // o índice local cobre o ponto atual ± 128 KB (inserção/remoção próximas)
const FULL_AFTER = 16 * 1024;              // bytes sem NENHUM acerto antes de indexar o segmento inteiro

class ByteBuf {
    constructor(n = 1024) { this.a = new Uint8Array(n); this.n = 0; }
    ensure(k) {
        if (this.n + k <= this.a.length) return;
        let m = this.a.length * 2; while (m < this.n + k) m *= 2;
        const b = new Uint8Array(m); b.set(this.a.subarray(0, this.n)); this.a = b;
    }
    byte(x) { this.ensure(1); this.a[this.n++] = x; }
    varint(v) {
        const d = [v % 128]; v = Math.floor(v / 128);
        while (v > 0) { d.unshift((v % 128) | 0x80); v = Math.floor(v / 128); }
        this.ensure(d.length); for (const x of d) this.a[this.n++] = x;
    }
    bytes(u8, s = 0, e = u8.length) { this.ensure(e - s); this.a.set(u8.subarray(s, e), this.n); this.n += e - s; }
    view() { return this.a.subarray(0, this.n); }
}

export function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length;) {
        const end = Math.min(i + 5552, buf.length);
        for (; i < end; i++) { a += buf[i]; b += a; }
        a %= 65521; b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function hashAt(a, p) {
    let h = 0;
    for (let k = 0; k < B; k++) h = (Math.imul(h, M) + a[p + k]) | 0;
    return h;
}

const eq16 = (t, ti, s, si) => {
    for (let k = 0; k < B; k++) if (t[ti + k] !== s[si + k]) return false;
    return true;
};

/** Quantos bytes seguidos são iguais a partir de t[ti] / s[si] (no máximo `max`). Compara de 4 em 4 quando alinhado. */
function matchLen(t, ti, s, si, max, tw, sw) {
    let k = 0;
    if (tw && sw && ((ti ^ si) & 3) === 0) {
        while (k < max && ((ti + k) & 3) !== 0) { if (t[ti + k] !== s[si + k]) return k; k++; }
        let tq = (ti + k) >>> 2, sq = (si + k) >>> 2;
        const lim = k + (((max - k) >>> 2) << 2);
        while (k < lim && tw[tq] === sw[sq]) { tq++; sq++; k += 4; }
    }
    while (k < max && t[ti + k] === s[si + k]) k++;
    return k;
}

/**
 * Codifica uma janela. `diag0` = deslocamento inicial entre o novo e o segmento (índice no seg = índice no novo + diag).
 * Devolve { data, inst, copyAddr[], copyLen[], copied, added }; os endereços ainda são relativos ao INÍCIO do seg
 * (o chamador reduz o segmento e reescreve a seção de endereços).
 */
function encodeWindow(seg, tgt, diag0) {
    const data = new ByteBuf(1024), inst = new ByteBuf(256);
    const copyAddr = [], copyLen = [];
    const n = tgt.length, segLen = seg.length;
    let copied = 0, added = 0;
    const addRange = (s, e) => { if (e > s) { inst.byte(1); inst.varint(e - s); data.bytes(tgt, s, e); added += e - s; } };

    if (segLen < B || n < B) { addRange(0, n); return { data, inst, copyAddr, copyLen, copied, added }; }

    // visões de 32 bits (só quando os buffers começam alinhados)
    const tw = (tgt.byteOffset & 3) === 0 ? new Uint32Array(tgt.buffer, tgt.byteOffset, tgt.length >>> 2) : null;
    const sw = (seg.byteOffset & 3) === 0 ? new Uint32Array(seg.buffer, seg.byteOffset, seg.length >>> 2) : null;

    // Índice de hash de blocos de 16 bytes do seg em [lo, hi): { lo, hi, tbl, sh }
    const buildIndex = (lo, hi) => {
        const bits = Math.min(22, Math.max(8, Math.ceil(Math.log2(((hi - lo) / B) * 2))));
        const tbl = new Int32Array(1 << bits).fill(-1);
        const sh = 32 - bits;
        for (let p = lo; p + B <= hi; p += B) {
            const idx = Math.imul(hashAt(seg, p), 0x9E3779B1) >>> sh;
            if (tbl[idx] < 0) tbl[idx] = p;
        }
        return { lo, hi, tbl, sh };
    };
    const find = (ix, hv, ti) => {
        const c = ix.tbl[Math.imul(hv, 0x9E3779B1) >>> ix.sh];
        return c >= 0 && eq16(tgt, ti, seg, c) ? c : -1;
    };
    let loc = null, full = null;

    let i = 0, addStart = 0, h = hashAt(tgt, 0), diag = diag0, misses = 0;
    while (i + B <= n) {
        let cand = -1;
        const dc = i + diag;
        if (dc >= 0 && dc + B <= segLen && tgt[i] === seg[dc] && eq16(tgt, i, seg, dc)) cand = dc;
        else if (misses >= LOCAL_AFTER) {
            if (full) {                            // (inline: é o laço mais quente quando nada casa)
                const c0 = full.tbl[Math.imul(h, 0x9E3779B1) >>> full.sh];
                if (c0 >= 0 && eq16(tgt, i, seg, c0)) cand = c0;
            }
            else {
                // 1) vizinhança da diagonal atual (barato: ~16 mil blocos); 2) segmento inteiro só se nada casar por muito tempo
                const mid = dc < 0 ? 0 : dc > segLen ? segLen : dc;
                if (!loc || mid < loc.lo + (LOCAL_REACH >> 2) && loc.lo > 0 || mid > loc.hi - (LOCAL_REACH >> 2) && loc.hi < segLen) {
                    const lo = Math.max(0, (mid - LOCAL_REACH) & ~15), hi = Math.min(segLen, mid + LOCAL_REACH);
                    loc = buildIndex(lo, hi);
                }
                cand = find(loc, h, i);
                if (cand < 0 && misses >= FULL_AFTER) { full = buildIndex(0, segLen); cand = find(full, h, i); }
            }
        }

        if (cand >= 0) {
            let s = i, c = cand;
            let len = matchLen(tgt, s, seg, c, Math.min(n - s, segLen - c), tw, sw);
            while (s > addStart && c > 0 && tgt[s - 1] === seg[c - 1]) { s--; c--; len++; }
            addRange(addStart, s);
            inst.byte(19); inst.varint(len);       // COPY, tamanho explícito, modo SELF
            copyAddr.push(c); copyLen.push(len); copied += len;
            i = s + len; addStart = i;
            diag = c - s; misses = 0;              // segue a nova diagonal (inserção/remoção deslocou o conteúdo)
            if (i + B <= n) h = hashAt(tgt, i);
        } else {
            if (i + B < n) h = (Math.imul(h, M) - Math.imul(tgt[i], MB) + tgt[i + B]) | 0;
            i++; misses++;
        }
    }
    addRange(addStart, n);
    return { data, inst, copyAddr, copyLen, copied, added };
}

/**
 * @param {object} o
 * @param {Blob} o.source  arquivo original (pode ser null/vazio)
 * @param {Blob} o.target  arquivo novo
 * @param {{write:Function}} o.sink
 * @param {number} [o.maxBytes]  se o delta passar disso, lança erro com code 'DELTA_TOO_LARGE'
 * @param {{copied?:number,added?:number}} [o.stats]  acumula bytes do alvo cobertos por COPY (iguais ao original) e por ADD (novos)
 * @returns {Promise<number>} bytes de delta gerados
 */
export async function encodeVcdiff({ source, target, sink, maxBytes = Infinity, onProgress, stats,
                                     windowSize = DEFAULT_WINDOW, reach = DEFAULT_REACH }) {
    let total = 0;
    const emit = async (u8) => {
        total += u8.length;
        if (total > maxBytes) throw Object.assign(new Error('Delta maior que o limite permitido.'), { code: 'DELTA_TOO_LARGE' });
        await sink.write(u8);
    };
    await emit(new Uint8Array([0xD6, 0xC3, 0xC4, 0x00, 0x00]));

    const srcSize = source ? source.size : 0;

    // O segmento da janela k+1 se sobrepõe quase todo ao da janela k: reaproveita o que já está em memória
    // e lê do disco só o trecho novo (antes cada janela relia ±8 MB do original).
    let prev = null;                                   // { pos, buf }
    const loadSeg = async (segPos, segEnd) => {
        const len = segEnd - segPos;
        if (len <= 0) { prev = null; return new Uint8Array(0); }
        const out = new Uint8Array(len);
        const rd = async (a, b) => new Uint8Array(await source.slice(a, b).arrayBuffer());
        if (prev) {
            const o0 = Math.max(segPos, prev.pos), o1 = Math.min(segEnd, prev.pos + prev.buf.length);
            if (o1 > o0) {
                out.set(prev.buf.subarray(o0 - prev.pos, o1 - prev.pos), o0 - segPos);
                if (o0 > segPos) out.set(await rd(segPos, o0), 0);
                if (o1 < segEnd) out.set(await rd(o1, segEnd), o1 - segPos);
                prev = { pos: segPos, buf: out };
                return out;
            }
        }
        out.set(await rd(segPos, segEnd), 0);
        prev = { pos: segPos, buf: out };
        return out;
    };
    const loadWindow = async (pos) => {
        const end = Math.min(pos + windowSize, target.size);
        const tgt = new Uint8Array(await target.slice(pos, end).arrayBuffer());
        const segPos = Math.max(0, pos - reach), segEnd = Math.min(srcSize, end + reach);
        const seg = segEnd > segPos ? await loadSeg(segPos, segEnd) : new Uint8Array(0);
        return { pos, end, tgt, seg, segPos };
    };

    let cur = target.size ? await loadWindow(0) : null;
    while (cur) {
        const { pos, end, tgt, seg, segPos } = cur;
        // lê a próxima janela do disco enquanto esta é codificada
        const nextP = end < target.size ? loadWindow(end) : null;
        if (nextP) nextP.catch(() => {});

        const { data, inst, copyAddr, copyLen, copied, added } = encodeWindow(seg, tgt, pos - segPos);
        if (stats) { stats.copied = (stats.copied || 0) + copied; stats.added = (stats.added || 0) + added; }

        // segmento de origem mínimo: só o intervalo referenciado pelos COPY; endereços reescritos relativos a ele
        let lo = 0, hi = 0;
        const addr = new ByteBuf(256);
        if (copyAddr.length) {
            lo = Infinity; hi = 0;
            for (let k = 0; k < copyAddr.length; k++) {
                if (copyAddr[k] < lo) lo = copyAddr[k];
                const e = copyAddr[k] + copyLen[k]; if (e > hi) hi = e;
            }
            for (let k = 0; k < copyAddr.length; k++) addr.varint(copyAddr[k] - lo);
        }

        const ad = adler32(tgt);
        const head = new ByteBuf(64);
        head.varint(tgt.length); head.byte(0);
        head.varint(data.n); head.varint(inst.n); head.varint(addr.n);
        head.bytes(new Uint8Array([(ad >>> 24) & 255, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255]));
        const bodyLen = head.n + data.n + inst.n + addr.n;

        const win = new ByteBuf(bodyLen + 32);
        if (copyAddr.length) { win.byte(1 | 4); win.varint(hi - lo); win.varint(segPos + lo); }
        else win.byte(4);
        win.varint(bodyLen);
        win.bytes(head.view()); win.bytes(data.view()); win.bytes(inst.view()); win.bytes(addr.view());
        await emit(win.view().slice());
        if (onProgress) onProgress(end / target.size);

        cur = nextP ? await nextP : null;
    }
    return total;
}
