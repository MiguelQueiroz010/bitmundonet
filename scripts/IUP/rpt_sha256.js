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
        let e = h[4] | 0, f = h[5] | 0, g = h[6] | 0, hh = h[7] | 0;
        for (let t = 0; t < 64; t++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
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

/** SHA-256 de um Blob/File lendo em blocos (RAM constante). */
export async function sha256Blob(blob, onProgress, chunkSize = 8 * 1024 * 1024) {
    const hasher = new Sha256();
    for (let off = 0; off < blob.size; off += chunkSize) {
        const end = Math.min(off + chunkSize, blob.size);
        hasher.update(new Uint8Array(await blob.slice(off, end).arrayBuffer()));
        if (onProgress) onProgress(end / blob.size);
    }
    return hasher.digestHex();
}
