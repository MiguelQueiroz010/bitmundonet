/**
 * rpt_md5.js
 * MD5 (RFC 1321) incremental em JS puro, otimizado para ISOs de vários GB.
 *
 * Diferenças para a versão antiga (md5_worker.js):
 *  - lê as palavras direto do buffer do chunk (Int32Array), sem copiar o chunk nem alocar um Array por bloco de 64 B;
 *  - só aritmética int32 (`| 0`), sem `& 0xFFFFFFFF` em doubles;
 *  - tabelas K/S pré-computadas e 4 laços de 16 passos sem desvio interno.
 * Assume CPU little-endian (todos os navegadores/dispositivos relevantes).
 */

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
const S = new Uint8Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);

/** Processa 1 bloco de 64 bytes = 16 palavras de `m` a partir de `o`. */
function block(st, m, o) {
    let a = st[0], b = st[1], c = st[2], d = st[3], f = 0, t = 0, s = 0, i = 0;
    for (; i < 16; i++) {
        f = (b & c) | (~b & d);
        t = (a + f + K[i] + m[o + i]) | 0; s = S[i];
        a = d; d = c; c = b; b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    for (; i < 32; i++) {
        f = (d & b) | (~d & c);
        t = (a + f + K[i] + m[o + ((5 * i + 1) & 15)]) | 0; s = S[i];
        a = d; d = c; c = b; b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    for (; i < 48; i++) {
        f = b ^ c ^ d;
        t = (a + f + K[i] + m[o + ((3 * i + 5) & 15)]) | 0; s = S[i];
        a = d; d = c; c = b; b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    for (; i < 64; i++) {
        f = c ^ (b | ~d);
        t = (a + f + K[i] + m[o + ((7 * i) & 15)]) | 0; s = S[i];
        a = d; d = c; c = b; b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    st[0] = (st[0] + a) | 0; st[1] = (st[1] + b) | 0; st[2] = (st[2] + c) | 0; st[3] = (st[3] + d) | 0;
}

export class Md5 {
    constructor() {
        this.st = new Int32Array([1732584193, -271733879, -1732584194, 271733878]);
        this.buf = new Uint8Array(64);
        this.buf32 = new Int32Array(this.buf.buffer);
        this.bufLen = 0;
        this.total = 0;
    }

    update(u8) {
        const n = u8.length;
        this.total += n;
        let i = 0;
        if (this.bufLen) {                                    // completa o bloco pendente
            const take = Math.min(64 - this.bufLen, n);
            this.buf.set(u8.subarray(0, take), this.bufLen);
            this.bufLen += take; i = take;
            if (this.bufLen < 64) return this;
            block(this.st, this.buf32, 0); this.bufLen = 0;
        }
        const blocks = (n - i) >>> 6;
        if (blocks) {
            if (((u8.byteOffset + i) & 3) === 0) {            // caminho rápido: lê direto do buffer do chunk
                const m = new Int32Array(u8.buffer, u8.byteOffset + i, blocks * 16);
                for (let k = 0; k < blocks; k++) block(this.st, m, k * 16);
            } else {                                          // desalinhado: copia cada bloco para o buffer interno
                for (let k = 0; k < blocks; k++) {
                    this.buf.set(u8.subarray(i + k * 64, i + k * 64 + 64), 0);
                    block(this.st, this.buf32, 0);
                }
            }
            i += blocks * 64;
        }
        if (i < n) { this.buf.set(u8.subarray(i), 0); this.bufLen = n - i; }
        return this;
    }

    digestHex() {
        const padLen = (this.bufLen < 56 ? 56 : 120) - this.bufLen;
        const pad = new Uint8Array(padLen + 8);
        pad[0] = 0x80;
        const dv = new DataView(pad.buffer);
        const bits = this.total * 8;
        dv.setUint32(padLen, bits >>> 0, true);
        dv.setUint32(padLen + 4, Math.floor(bits / 4294967296) >>> 0, true);
        const saved = this.total;
        this.update(pad);
        this.total = saved;
        let out = '';
        for (let w = 0; w < 4; w++) {
            const x = this.st[w];
            for (let j = 0; j < 4; j++) out += ((x >>> (j * 8)) & 0xff).toString(16).padStart(2, '0');
        }
        return out;
    }
}
