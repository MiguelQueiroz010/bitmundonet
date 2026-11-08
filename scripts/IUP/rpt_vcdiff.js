/**
 * rpt_vcdiff.js
 * Decoder VCDIFF (RFC 3284 — o formato usado pelo xdelta3), janela a janela.
 *
 * - O arquivo ORIGINAL (da ISO do usuário) é lido por fatias (Blob.slice), nunca inteiro.
 * - O delta é lido sequencialmente de um Blob.
 * - A saída vai para um WritableStream/FileSystemWritableFileStream, janela por janela.
 * Uso de RAM ≈ 1 janela de origem + 1 janela de destino (xdelta3 padrão: até ~64 MB + 8 MB).
 *
 * Como gerar deltas compatíveis (SEM compressão secundária, que este decoder não suporta):
 *     xdelta3 -e -9 -S none -f -s ORIGINAL NOVO SAIDA.vcdiff
 *
 * Não suportado (erro explícito): compressão secundária (-S djw/fgk/lzma),
 * code table customizada e janelas VCD_TARGET.
 */

const MAX_WINDOW = 256 * 1024 * 1024;   // teto de segurança por janela
const NEAR_SIZE = 4;
const SAME_SIZE = 3;

// ── Code table padrão (RFC 3284 §5.6) ───────────────────────────────────────
const NOOP = 0, ADD = 1, RUN = 2, COPY = 3;
const CODE = (() => {
    const t1 = new Uint8Array(256), s1 = new Uint8Array(256), m1 = new Uint8Array(256);
    const t2 = new Uint8Array(256), s2 = new Uint8Array(256), m2 = new Uint8Array(256);
    let i = 0;
    t1[i++] = RUN;                                           // 0
    t1[i] = ADD; s1[i++] = 0;                                // 1
    for (let sz = 1; sz <= 17; sz++) { t1[i] = ADD; s1[i++] = sz; }          // 2..18
    for (let mode = 0; mode <= 8; mode++) {                  // 19..162
        t1[i] = COPY; s1[i] = 0; m1[i++] = mode;
        for (let sz = 4; sz <= 18; sz++) { t1[i] = COPY; s1[i] = sz; m1[i++] = mode; }
    }
    for (let mode = 0; mode <= 5; mode++)                    // 163..234
        for (let a = 1; a <= 4; a++)
            for (let c = 4; c <= 6; c++) {
                t1[i] = ADD; s1[i] = a; t2[i] = COPY; s2[i] = c; m2[i++] = mode;
            }
    for (let mode = 6; mode <= 8; mode++)                    // 235..246
        for (let a = 1; a <= 4; a++) {
            t1[i] = ADD; s1[i] = a; t2[i] = COPY; s2[i] = 4; m2[i++] = mode;
        }
    for (let mode = 0; mode <= 8; mode++) {                  // 247..255
        t1[i] = COPY; s1[i] = 4; m1[i] = mode; t2[i] = ADD; s2[i++] = 1;
    }
    if (i !== 256) throw new Error('VCDIFF: tabela de códigos interna inconsistente.');
    return { t1, s1, m1, t2, s2, m2 };
})();

// ── Leitura sequencial de um Blob ───────────────────────────────────────────
class BlobCursor {
    constructor(blob, bufSize = 1 << 20) {
        this.blob = blob; this.pos = 0; this.buf = new Uint8Array(0);
        this.bufStart = 0; this.bufSize = bufSize;
    }
    get eof() { return this.pos >= this.blob.size; }
    async _fill(n) {
        const have = this.bufStart + this.buf.length - this.pos;
        if (this.pos >= this.bufStart && have >= n) return;
        const len = Math.min(Math.max(n, this.bufSize), this.blob.size - this.pos);
        this.buf = new Uint8Array(await this.blob.slice(this.pos, this.pos + len).arrayBuffer());
        this.bufStart = this.pos;
    }
    async u8() {
        await this._fill(1);
        if (this.pos >= this.blob.size) throw new Error('VCDIFF: delta truncado.');
        return this.buf[this.pos++ - this.bufStart];
    }
    async varint() {
        let v = 0;
        for (let i = 0; i < 9; i++) {
            const b = await this.u8();
            v = v * 128 + (b & 0x7f);
            if (!(b & 0x80)) return v;
        }
        throw new Error('VCDIFF: inteiro variável inválido.');
    }
    async bytes(n) {
        if (n < 0 || this.pos + n > this.blob.size) throw new Error('VCDIFF: delta truncado.');
        const out = new Uint8Array(await this.blob.slice(this.pos, this.pos + n).arrayBuffer());
        this.pos += n;
        return out;
    }
}

class MemReader {
    constructor(u8) { this.b = u8; this.p = 0; }
    u8() {
        if (this.p >= this.b.length) throw new Error('VCDIFF: seção truncada.');
        return this.b[this.p++];
    }
    varint() {
        let v = 0;
        for (let i = 0; i < 9; i++) {
            const c = this.u8();
            v = v * 128 + (c & 0x7f);
            if (!(c & 0x80)) return v;
        }
        throw new Error('VCDIFF: inteiro variável inválido.');
    }
    take(n) {
        if (n < 0 || this.p + n > this.b.length) throw new Error('VCDIFF: seção truncada.');
        const s = this.b.subarray(this.p, this.p + n);
        this.p += n;
        return s;
    }
}

// ── Cache de endereços (RFC 3284 §5.3) ──────────────────────────────────────
class AddrCache {
    constructor() {
        this.near = new Array(NEAR_SIZE).fill(0);
        this.same = new Array(SAME_SIZE * 256).fill(0);
        this.next = 0;
    }
    update(addr) {
        this.near[this.next] = addr;
        this.next = (this.next + 1) % NEAR_SIZE;
        this.same[addr % (SAME_SIZE * 256)] = addr;
    }
    decode(mode, here, addrSec) {
        let addr;
        if (mode === 0) addr = addrSec.varint();                          // SELF
        else if (mode === 1) addr = here - addrSec.varint();              // HERE
        else if (mode < 2 + NEAR_SIZE) addr = this.near[mode - 2] + addrSec.varint();
        else addr = this.same[(mode - 2 - NEAR_SIZE) * 256 + addrSec.u8()];
        this.update(addr);
        return addr;
    }
}

function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length;) {
        const end = Math.min(i + 5552, buf.length);
        for (; i < end; i++) { a += buf[i]; b += a; }
        a %= 65521; b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}

/**
 * Aplica um delta VCDIFF.
 * @param {object} o
 * @param {Blob}   o.delta     arquivo .vcdiff
 * @param {Blob}   o.source    arquivo original (pode ser null se o delta não usa origem)
 * @param {{write:Function}} o.sink  recebe cada janela de saída (Uint8Array)
 * @param {Function} [o.onProgress]  (fração 0..1 do delta consumido)
 * @returns {Promise<number>} total de bytes escritos
 */
export async function applyVcdiff({ delta, source, sink, onProgress }) {
    const cur = new BlobCursor(delta);

    // Cabeçalho: D6 C3 C4 00
    const magic = await cur.bytes(4);
    if (magic[0] !== 0xD6 || magic[1] !== 0xC3 || magic[2] !== 0xC4)
        throw new Error('Delta inválido: assinatura VCDIFF ausente.');
    if (magic[3] !== 0x00)
        throw new Error('Delta usa extensão de versão não suportada (gere com xdelta3 padrão).');

    const hdr = await cur.u8();
    if (hdr & 0x01) throw new Error('Delta usa compressão secundária. Gere com: xdelta3 -S none');
    if (hdr & 0x02) throw new Error('Delta usa code table customizada (não suportado).');
    if (hdr & 0x04) {                       // application header (xdelta3 grava nomes dos arquivos)
        const n = await cur.varint();
        if (n > 65536) throw new Error('Delta inválido: cabeçalho de aplicação grande demais.');
        await cur.bytes(n);
    }

    let written = 0;
    while (!cur.eof) {
        const winInd = await cur.u8();
        if (winInd & 0x02) throw new Error('Janela VCD_TARGET não suportada.');
        if (winInd & ~0x07) throw new Error('Delta inválido: Win_Indicator desconhecido.');

        let srcSeg = new Uint8Array(0);
        if (winInd & 0x01) {                // VCD_SOURCE
            const segLen = await cur.varint();
            const segPos = await cur.varint();
            if (segLen > MAX_WINDOW) throw new Error('Janela de origem grande demais.');
            if (!source) throw new Error('O delta exige o arquivo original, mas ele não foi fornecido.');
            if (segPos + segLen > source.size)
                throw new Error('O arquivo original é menor do que o delta espera (versão/ISO errada?).');
            srcSeg = new Uint8Array(await source.slice(segPos, segPos + segLen).arrayBuffer());
        }

        const deltaLen = await cur.varint();
        if (deltaLen > MAX_WINDOW) throw new Error('Janela de delta grande demais.');
        const body = new MemReader(await cur.bytes(deltaLen));

        const tgtLen = body.varint();
        if (tgtLen > MAX_WINDOW) throw new Error('Janela de destino grande demais.');
        const deltaInd = body.u8();
        if (deltaInd !== 0) throw new Error('Seções comprimidas no delta (não suportado). Use xdelta3 -S none.');
        const dataLen = body.varint();
        const instLen = body.varint();
        const addrLen = body.varint();
        let expectAdler = null;
        if (winInd & 0x04) expectAdler = new DataView(body.take(4).slice().buffer).getUint32(0);

        const dataSec = new MemReader(body.take(dataLen));
        const instSec = new MemReader(body.take(instLen));
        const addrSec = new MemReader(body.take(addrLen));

        const tgt = new Uint8Array(tgtLen);
        const srcLen = srcSeg.length;
        const cache = new AddrCache();
        let tpos = 0;

        const doAdd = (n) => {
            if (tpos + n > tgtLen) throw new Error('VCDIFF: ADD excede a janela.');
            tgt.set(dataSec.take(n), tpos); tpos += n;
        };
        const doRun = (n) => {
            if (tpos + n > tgtLen) throw new Error('VCDIFF: RUN excede a janela.');
            tgt.fill(dataSec.u8(), tpos, tpos + n); tpos += n;
        };
        const doCopy = (n, mode) => {
            if (tpos + n > tgtLen) throw new Error('VCDIFF: COPY excede a janela.');
            const here = srcLen + tpos;
            const addr = cache.decode(mode, here, addrSec);
            if (addr < 0 || addr >= here) throw new Error('VCDIFF: endereço de COPY inválido.');
            if (addr + n <= srcLen) {
                tgt.set(srcSeg.subarray(addr, addr + n), tpos);
            } else if (addr >= srcLen && addr - srcLen + n <= tpos) {
                tgt.copyWithin(tpos, addr - srcLen, addr - srcLen + n);
            } else {                        // cruza origem/destino ou se sobrepõe: byte a byte
                for (let k = 0; k < n; k++) {
                    const a = addr + k;
                    tgt[tpos + k] = a < srcLen ? srcSeg[a] : tgt[a - srcLen];
                }
            }
            tpos += n;
        };
        const run = (type, size, mode) => {
            if (type === NOOP) return;
            if (size === 0) size = instSec.varint();
            if (type === ADD) doAdd(size);
            else if (type === RUN) doRun(size);
            else doCopy(size, mode);
        };

        while (instSec.p < instSec.b.length) {
            const op = instSec.u8();
            run(CODE.t1[op], CODE.s1[op], CODE.m1[op]);
            run(CODE.t2[op], CODE.s2[op], CODE.m2[op]);
        }
        if (tpos !== tgtLen) throw new Error('VCDIFF: janela de saída incompleta (delta corrompido).');
        if (expectAdler !== null && adler32(tgt) !== expectAdler)
            throw new Error('VCDIFF: checksum Adler-32 não confere (delta ou arquivo original incorreto).');

        await sink.write(tgt);
        written += tgtLen;
        if (onProgress) onProgress(cur.pos / delta.size);
    }
    return written;
}
