/**
 * rpt_sha256.js
 * SHA-256 incremental (streaming) em JS puro.
 *
 * Por que existe: crypto.subtle.digest() exige o buffer inteiro na RAM, o que é
 * inviável para arquivos de centenas de MB (vídeos .PSS) dentro de uma ISO de PS2.
 * Aqui o hash é alimentado em blocos, então o uso de memória é constante.
 */

// Constantes derivadas (parte fracionária das raízes dos primeiros 64 primos),
// calculadas em vez de digitadas para eliminar risco de typo.
const PRIMES = (() => {
    const p = [];
    for (let n = 2; p.length < 64; n++) {
        if (p.every(q => n % q !== 0)) p.push(n);
    }
    return p;
})();
const frac32 = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
const K  = new Uint32Array(PRIMES.map(p => frac32(Math.cbrt(p))));
const H0 = new Uint32Array(PRIMES.slice(0, 8).map(p => frac32(Math.sqrt(p))));

export class Sha256 {
    constructor() {
        this.h = new Uint32Array(H0);
        this.buf = new Uint8Array(64);
        this.bufLen = 0;
        this.total = 0;
        this.w = new Int32Array(64);
        this.done = false;
    }

    _block(p, off) {
        const w = this.w, h = this.h;
        for (let t = 0; t < 16; t++) {
            const j = off + t * 4;
            w[t] = (p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3];
        }
        for (let t = 16; t < 64; t++) {
            const a = w[t - 15], b = w[t - 2];
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }
        let a = h[0] | 0, b = h[1] | 0, c = h[2] | 0, d = h[3] | 0;
        let e = h[4] | 0, f = h[5] | 0, g = h[6] | 0, hh = h[7] | 0, t1 = 0;
        // 64 rodadas em 8 grupos de 8 com os nomes das variáveis rotacionados (evita as 8 atribuições
        // a=b; b=c;... por rodada — ~1,5x mais rápido que a forma direta).
        for (let t = 0; t < 64; t += 8) {
            t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[t + 0] + w[t + 0]) | 0;
            d = (d + t1) | 0;
            hh = (t1 + (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            t1 = (g + (((d >>> 6) | (d << 26)) ^ ((d >>> 11) | (d << 21)) ^ ((d >>> 25) | (d << 7))) + ((d & e) ^ (~d & f)) + K[t + 1] + w[t + 1]) | 0;
            c = (c + t1) | 0;
            g = (t1 + (((hh >>> 2) | (hh << 30)) ^ ((hh >>> 13) | (hh << 19)) ^ ((hh >>> 22) | (hh << 10))) + ((hh & a) ^ (hh & b) ^ (a & b))) | 0;
            t1 = (f + (((c >>> 6) | (c << 26)) ^ ((c >>> 11) | (c << 21)) ^ ((c >>> 25) | (c << 7))) + ((c & d) ^ (~c & e)) + K[t + 2] + w[t + 2]) | 0;
            b = (b + t1) | 0;
            f = (t1 + (((g >>> 2) | (g << 30)) ^ ((g >>> 13) | (g << 19)) ^ ((g >>> 22) | (g << 10))) + ((g & hh) ^ (g & a) ^ (hh & a))) | 0;
            t1 = (e + (((b >>> 6) | (b << 26)) ^ ((b >>> 11) | (b << 21)) ^ ((b >>> 25) | (b << 7))) + ((b & c) ^ (~b & d)) + K[t + 3] + w[t + 3]) | 0;
            a = (a + t1) | 0;
            e = (t1 + (((f >>> 2) | (f << 30)) ^ ((f >>> 13) | (f << 19)) ^ ((f >>> 22) | (f << 10))) + ((f & g) ^ (f & hh) ^ (g & hh))) | 0;
            t1 = (d + (((a >>> 6) | (a << 26)) ^ ((a >>> 11) | (a << 21)) ^ ((a >>> 25) | (a << 7))) + ((a & b) ^ (~a & c)) + K[t + 4] + w[t + 4]) | 0;
            hh = (hh + t1) | 0;
            d = (t1 + (((e >>> 2) | (e << 30)) ^ ((e >>> 13) | (e << 19)) ^ ((e >>> 22) | (e << 10))) + ((e & f) ^ (e & g) ^ (f & g))) | 0;
            t1 = (c + (((hh >>> 6) | (hh << 26)) ^ ((hh >>> 11) | (hh << 21)) ^ ((hh >>> 25) | (hh << 7))) + ((hh & a) ^ (~hh & b)) + K[t + 5] + w[t + 5]) | 0;
            g = (g + t1) | 0;
            c = (t1 + (((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10))) + ((d & e) ^ (d & f) ^ (e & f))) | 0;
            t1 = (b + (((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7))) + ((g & hh) ^ (~g & a)) + K[t + 6] + w[t + 6]) | 0;
            f = (f + t1) | 0;
            b = (t1 + (((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10))) + ((c & d) ^ (c & e) ^ (d & e))) | 0;
            t1 = (a + (((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7))) + ((f & g) ^ (~f & hh)) + K[t + 7] + w[t + 7]) | 0;
            e = (e + t1) | 0;
            a = (t1 + (((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10))) + ((b & c) ^ (b & d) ^ (c & d))) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }

    update(data) {
        if (this.done) throw new Error('Sha256: já finalizado.');
        this.total += data.length;
        let i = 0;
        if (this.bufLen) {
            const take = Math.min(64 - this.bufLen, data.length);
            this.buf.set(data.subarray(0, take), this.bufLen);
            this.bufLen += take;
            i = take;
            if (this.bufLen === 64) { this._block(this.buf, 0); this.bufLen = 0; }
        }
        for (; i + 64 <= data.length; i += 64) this._block(data, i);
        if (i < data.length) {
            this.buf.set(data.subarray(i), 0);
            this.bufLen = data.length - i;
        }
        return this;
    }

    digestHex() {
        if (!this.done) {
            const bits = this.total * 8;
            const hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
            const padLen = (this.bufLen < 56 ? 56 : 120) - this.bufLen;
            const pad = new Uint8Array(padLen + 8);
            pad[0] = 0x80;
            const dv = new DataView(pad.buffer);
            dv.setUint32(padLen, hi);
            dv.setUint32(padLen + 4, lo);
            const saved = this.total;
            this.update(pad);
            this.total = saved;
            this.done = true;
        }
        let out = '';
        for (let i = 0; i < 8; i++) out += (this.h[i] >>> 0).toString(16).padStart(8, '0');
        return out;
    }
}

const toHex = (u8) => { let o = ''; for (let i = 0; i < u8.length; i++) o += u8[i].toString(16).padStart(2, '0'); return o; };

// Até este tamanho o digest NATIVO do WebCrypto (várias vezes mais rápido que o JS) lê o arquivo inteiro de uma vez.
// Acima disso (vídeos, AFS enormes) o hash é feito em blocos em JS, com RAM constante.
const NATIVE_MAX = 192 * 1024 * 1024;

/** SHA-256 de um Blob/File (nativo quando cabe na RAM; senão em blocos, lendo o próximo bloco enquanto hasheia o atual). */
export async function sha256Blob(blob, onProgress, chunkSize = 8 * 1024 * 1024) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (subtle && blob.size <= NATIVE_MAX) {
        try {
            const d = await subtle.digest('SHA-256', await blob.arrayBuffer());
            if (onProgress) onProgress(1);
            return toHex(new Uint8Array(d));
        } catch (_) { /* sem WebCrypto utilizável (contexto inseguro, sem memória): cai no modo em blocos */ }
    }
    const hasher = new Sha256();
    const read = (off) => blob.slice(off, Math.min(off + chunkSize, blob.size)).arrayBuffer();
    let next = blob.size ? read(0) : null;
    for (let off = 0; off < blob.size; off += chunkSize) {
        const buf = await next;
        const nextOff = off + chunkSize;
        next = nextOff < blob.size ? read(nextOff) : null;
        hasher.update(new Uint8Array(buf));
        if (onProgress) onProgress(Math.min(nextOff, blob.size) / blob.size);
    }
    return hasher.digestHex();
}
