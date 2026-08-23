/**
 * md5_worker.js
 * Web Worker para cálculo de MD5 em background.
 * Recebe: { file: File }  via postMessage
 * Envia de volta: { type: 'progress', value: 0..1 }
 *                 { type: 'result',   md5: string }
 *                 { type: 'error',    message: string }
 *
 * Implementação MD5 pura (RFC 1321) — sem dependências.
 */

// ── MD5 Core ──────────────────────────────────────────────────────────────────
// Based on the public-domain implementation by Joseph Myers
// http://www.myersdaily.org/joseph/javascript/md5-text.html

function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0],  7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17,  606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4],  7, -176418897);
    d = ff(d, a, b, c, k[5], 12,  1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8],  7,  1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10],17, -42063);
    b = ff(b, c, d, a, k[11],22, -1990404162);
    a = ff(a, b, c, d, k[12], 7,  1804603682);
    d = ff(d, a, b, c, k[13],12, -40341101);
    c = ff(c, d, a, b, k[14],17, -1502002290);
    b = ff(b, c, d, a, k[15],22,  1236535329);

    a = gg(a, b, c, d, k[1],  5, -165796510);
    d = gg(d, a, b, c, k[6],  9, -1069501632);
    c = gg(c, d, a, b, k[11],14,  643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5],  5, -701558691);
    d = gg(d, a, b, c, k[10], 9,  38016083);
    c = gg(c, d, a, b, k[15],14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9],  5,  568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20,  1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2],  9, -51403784);
    c = gg(c, d, a, b, k[7], 14,  1735328473);
    b = gg(b, c, d, a, k[12],20, -1926607734);

    a = hh(a, b, c, d, k[5],  4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11],16,  1839030562);
    b = hh(b, c, d, a, k[14],23, -35309556);
    a = hh(a, b, c, d, k[1],  4, -1530992060);
    d = hh(d, a, b, c, k[4], 11,  1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10],23, -1094730640);
    a = hh(a, b, c, d, k[13], 4,  681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23,  76029189);
    a = hh(a, b, c, d, k[9],  4, -640364487);
    d = hh(d, a, b, c, k[12],11, -421815835);
    c = hh(c, d, a, b, k[15],16,  530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0],  6, -198630844);
    d = ii(d, a, b, c, k[7], 10,  1126891415);
    c = ii(c, d, a, b, k[14],15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6,  1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10],15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8],  6,  1873313359);
    d = ii(d, a, b, c, k[15],10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13],21,  1309151649);
    a = ii(a, b, c, d, k[4],  6, -145523070);
    d = ii(d, a, b, c, k[11],10, -1120210379);
    c = ii(c, d, a, b, k[2], 15,  718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
}

function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
}
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

function add32(a, b) { return (a + b) & 0xFFFFFFFF; }

function md5blk(s) {
    const md5blks = new Array(16);
    for (let i = 0; i < 64; i += 4) {
        md5blks[i >> 2] = s[i] | (s[i + 1] << 8) | (s[i + 2] << 16) | (s[i + 3] << 24);
    }
    return md5blks;
}

function rhex(n) {
    let s = '', j = 0;
    for (; j < 4; j++) s += ('0' + ((n >>> (j * 8)) & 0xFF).toString(16)).slice(-2);
    return s;
}

function hex(x) { return x.map(rhex).join(''); }

// ── MD5 Streaming State ────────────────────────────────────────────────────────

class MD5Stream {
    constructor() {
        this.state = [1732584193, -271733879, -1732584194, 271733878];
        this.tail = new Uint8Array(0);
        this.totalBytes = 0;
    }

    update(chunk) {
        // Combine any leftover tail with the new chunk
        const combined = new Uint8Array(this.tail.length + chunk.length);
        combined.set(this.tail);
        combined.set(chunk, this.tail.length);
        this.totalBytes += chunk.length;

        // Process all complete 64-byte blocks
        const numBlocks = Math.floor(combined.length / 64);
        for (let i = 0; i < numBlocks; i++) {
            md5cycle(this.state, md5blk(combined.subarray(i * 64, i * 64 + 64)));
        }
        // Save the remaining bytes as tail
        this.tail = combined.slice(numBlocks * 64);
    }

    finalize() {
        // Apply MD5 padding
        const tail = this.tail;
        const tailLen = tail.length;
        const totalBits = this.totalBytes * 8;

        // Padding: 0x80, then zeros, then 8-byte length
        const padLen = tailLen < 56 ? 56 - tailLen : 120 - tailLen;
        const padded = new Uint8Array(tailLen + padLen + 8);
        padded.set(tail);
        padded[tailLen] = 0x80;

        // Little-endian 64-bit length
        const lo = totalBits >>> 0;
        const hi = Math.floor(totalBits / 0x100000000) >>> 0;
        padded[padded.length - 8] = lo & 0xFF;
        padded[padded.length - 7] = (lo >>> 8) & 0xFF;
        padded[padded.length - 6] = (lo >>> 16) & 0xFF;
        padded[padded.length - 5] = (lo >>> 24) & 0xFF;
        padded[padded.length - 4] = hi & 0xFF;
        padded[padded.length - 3] = (hi >>> 8) & 0xFF;
        padded[padded.length - 2] = (hi >>> 16) & 0xFF;
        padded[padded.length - 1] = (hi >>> 24) & 0xFF;

        for (let i = 0; i < padded.length; i += 64) {
            md5cycle(this.state, md5blk(padded.subarray(i, i + 64)));
        }

        return hex(this.state);
    }
}

// ── Worker Message Handler ─────────────────────────────────────────────────────

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB por chunk

self.onmessage = async function(e) {
    const { file } = e.data;
    if (!file) {
        self.postMessage({ type: 'error', message: 'Nenhum arquivo recebido.' });
        return;
    }

    try {
        const md5 = new MD5Stream();
        const fileSize = file.size;
        let offset = 0;

        while (offset < fileSize) {
            const end = Math.min(offset + CHUNK_SIZE, fileSize);
            const slice = file.slice(offset, end);
            const buffer = await slice.arrayBuffer();
            md5.update(new Uint8Array(buffer));
            offset = end;

            self.postMessage({ type: 'progress', value: offset / fileSize });
            // Yield to avoid blocking the worker event loop
            await new Promise(r => setTimeout(r, 0));
        }

        const result = md5.finalize();
        self.postMessage({ type: 'result', md5: result });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};
