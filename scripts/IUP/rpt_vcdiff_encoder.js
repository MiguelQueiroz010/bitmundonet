/**
 * rpt_vcdiff_encoder.js
 * Encoder VCDIFF (RFC 3284) simples, em JS puro, janela a janela — compatível com o decoder do
 * rpt_vcdiff.js e com xdelta3 (-S none). Usa apenas ADD e COPY (modo SELF) com checksum Adler-32.
 *
 * Estratégia: para cada janela do ARQUIVO NOVO (4 MB), indexa blocos de 16 bytes de um trecho do ORIGINAL
 * (a janela ± 8 MB) e varre o novo com hash rolante, estendendo cada acerto para frente e para trás.
 * Ótimo para arquivos editados "no lugar" (texto traduzido, fonte, vídeo com legenda); se o resultado ficar
 * grande demais o chamador pode desistir (maxBytes) e usar substituição direta.
 */

const B = 16;                              // tamanho do bloco de indexação
const M = 0x01000193;                      // multiplicador do hash polinomial
let MB = 1; for (let i = 0; i < B; i++) MB = Math.imul(MB, M);

const DEFAULT_WINDOW = 4 * 1024 * 1024;
const DEFAULT_REACH = 8 * 1024 * 1024;

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

function varintArr(v) {
    const d = [v % 128]; v = Math.floor(v / 128);
    while (v > 0) { d.unshift((v % 128) | 0x80); v = Math.floor(v / 128); }
    return d;
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

/** Codifica uma janela: devolve { data, inst, addr } (seções do VCDIFF). */
function encodeWindow(seg, tgt) {
    const data = new ByteBuf(1024), inst = new ByteBuf(256), addr = new ByteBuf(256);
    const n = tgt.length;
    const addRange = (s, e) => { if (e > s) { inst.byte(1); inst.varint(e - s); data.bytes(tgt, s, e); } };

    let table = null, bits = 0;
    if (seg.length >= B && n >= B) {
        bits = Math.min(22, Math.max(12, Math.ceil(Math.log2((seg.length / B) * 2))));
        table = new Int32Array(1 << bits).fill(-1);
        const sh = 32 - bits;
        for (let p = 0; p + B <= seg.length; p += B) {
            const idx = Math.imul(hashAt(seg, p), 0x9E3779B1) >>> sh;
            if (table[idx] < 0) table[idx] = p;
        }
    }
    if (!table) { addRange(0, n); return { data, inst, addr }; }

    const sh = 32 - bits;
    let i = 0, addStart = 0, h = hashAt(tgt, 0), valid = true;
    while (i + B <= n) {
        const cand = table[Math.imul(h, 0x9E3779B1) >>> sh];
        let hit = false;
        if (cand >= 0) {
            hit = true;
            for (let k = 0; k < B; k++) if (tgt[i + k] !== seg[cand + k]) { hit = false; break; }
        }
        if (hit) {
            let s = i, c = cand, len = B;
            while (s + len < n && c + len < seg.length && tgt[s + len] === seg[c + len]) len++;
            while (s > addStart && c > 0 && tgt[s - 1] === seg[c - 1]) { s--; c--; len++; }
            addRange(addStart, s);
            inst.byte(19); inst.varint(len);       // COPY, tamanho explícito, modo SELF
            addr.varint(c);
            i = s + len; addStart = i;
            if (i + B <= n) h = hashAt(tgt, i);
        } else {
            if (i + B < n) h = (Math.imul(h, M) - Math.imul(tgt[i], MB) + tgt[i + B]) | 0;
            i++;
        }
    }
    addRange(addStart, n);
    return { data, inst, addr };
}

/**
 * @param {object} o
 * @param {Blob} o.source  arquivo original (pode ser null/vazio)
 * @param {Blob} o.target  arquivo novo
 * @param {{write:Function}} o.sink
 * @param {number} [o.maxBytes]  se o delta passar disso, lança erro com code 'DELTA_TOO_LARGE'
 * @returns {Promise<number>} bytes de delta gerados
 */
export async function encodeVcdiff({ source, target, sink, maxBytes = Infinity, onProgress,
                                     windowSize = DEFAULT_WINDOW, reach = DEFAULT_REACH }) {
    let total = 0;
    const emit = async (u8) => {
        total += u8.length;
        if (total > maxBytes) throw Object.assign(new Error('Delta maior que o limite permitido.'), { code: 'DELTA_TOO_LARGE' });
        await sink.write(u8);
    };
    await emit(new Uint8Array([0xD6, 0xC3, 0xC4, 0x00, 0x00]));

    const srcSize = source ? source.size : 0;
    for (let pos = 0; pos < target.size; pos += windowSize) {
        const end = Math.min(pos + windowSize, target.size);
        const tgt = new Uint8Array(await target.slice(pos, end).arrayBuffer());
        const segPos = Math.max(0, pos - reach), segEnd = Math.min(srcSize, end + reach);
        const seg = segEnd > segPos ? new Uint8Array(await source.slice(segPos, segEnd).arrayBuffer()) : new Uint8Array(0);

        const { data, inst, addr } = encodeWindow(seg, tgt);
        const ad = adler32(tgt);
        const head = new ByteBuf(64);
        head.varint(tgt.length); head.byte(0);
        head.varint(data.n); head.varint(inst.n); head.varint(addr.n);
        head.bytes(new Uint8Array([(ad >>> 24) & 255, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255]));
        const bodyLen = head.n + data.n + inst.n + addr.n;

        const win = new ByteBuf(bodyLen + 32);
        if (seg.length) { win.byte(1 | 4); win.varint(seg.length); win.varint(segPos); }
        else win.byte(4);
        win.varint(bodyLen);
        win.bytes(head.view()); win.bytes(data.view()); win.bytes(inst.view()); win.bytes(addr.view());
        await emit(win.view().slice());
        if (onProgress) onProgress(end / target.size);
    }
    return total;
}
