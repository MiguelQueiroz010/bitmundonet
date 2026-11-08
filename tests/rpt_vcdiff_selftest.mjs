// Testes do decoder VCDIFF e do SHA-256. Rodar: node tests/rpt_vcdiff_selftest.mjs
// Os opcodes abaixo vêm das faixas de índice da RFC 3284 §5.6, não da tabela interna do decoder.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { applyVcdiff } from '../scripts/IUP/rpt_vcdiff.js';
import { Sha256, sha256Blob } from '../scripts/IUP/rpt_sha256.js';

let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

// ── helpers ──
const varint = (n) => { const o = [n & 0x7f]; n = Math.floor(n / 128); while (n > 0) { o.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); } return o; };
const adler = (b) => { let a = 1, s = 0; for (const x of b) { a = (a + x) % 65521; s = (s + a) % 65521; } return ((s << 16) | a) >>> 0; };
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const HEADER = [0xD6, 0xC3, 0xC4, 0x00, 0x00];
function win({ src = null, tgtLen, data = [], inst = [], addr = [], adlerOf = null }) {
    const body = [...varint(tgtLen), 0, ...varint(data.length), ...varint(inst.length), ...varint(addr.length),
        ...(adlerOf ? u32(adler(adlerOf)) : []), ...data, ...inst, ...addr];
    return [(src ? 1 : 0) | (adlerOf ? 4 : 0), ...(src ? [...varint(src.len), ...varint(src.pos)] : []), ...varint(body.length), ...body];
}
async function run(bytes, source) {
    const chunks = [];
    const n = await applyVcdiff({ delta: new Blob([new Uint8Array(bytes)]), source: source ? new Blob([new Uint8Array(source)]) : null, sink: { write: async (u) => chunks.push(Buffer.from(u)) } });
    const out = Buffer.concat(chunks); assert.equal(out.length, n); return [...out];
}
const rejects = async (bytes, source, re) => assert.rejects(() => run(bytes, source), re);
const A = (s) => [...Buffer.from(s)];

// ── SHA-256 ──
for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 1000]) {
    const buf = crypto.randomBytes(len);
    assert.equal(new Sha256().update(buf).digestHex(), crypto.createHash('sha256').update(buf).digest('hex'), 'len ' + len);
}
{
    const big = crypto.randomBytes(3_000_001), h = new Sha256();
    for (let i = 0; i < big.length;) { const n = Math.min(1 + Math.floor(Math.random() * 100000), big.length - i); h.update(big.subarray(i, i + n)); i += n; }
    assert.equal(h.digestHex(), crypto.createHash('sha256').update(big).digest('hex'));
    assert.equal(await sha256Blob(new Blob([big]), null, 777777), crypto.createHash('sha256').update(big).digest('hex'));
}
ok('sha256 == node:crypto (bordas de bloco, pedaços aleatórios, 3 MB via Blob)');

// ── VCDIFF ──
// a) ADD puro (opcode 1+varint e opcode 6 = ADD 5) + Adler32
let t = A('hello');
assert.deepEqual(await run([...HEADER, ...win({ tgtLen: 5, data: A('hello'), inst: [6], adlerOf: t })]), t);
assert.deepEqual(await run([...HEADER, ...win({ tgtLen: 5, data: A('hello'), inst: [1, 5] })]), t);
ok('ADD (tamanho no opcode e tamanho explícito) + Adler-32');

// b) COPY da origem: SELF size4 (opcode 20 = mode0 size 4) e HERE size 0 (opcode 35 + varint)
const SRC = A('0123456789ABCDEFGHIJ');
// COPY SELF addr 10 len 4 -> "ABCD"  ; depois COPY HERE len 3, here = 20+4=24, addr 24-? queremos origem addr 2 -> encoded = 24-2 = 22
t = [...A('ABCD'), ...A('234')];
assert.deepEqual(await run([...HEADER, ...win({ src: { len: 20, pos: 0 }, tgtLen: 7, inst: [20, 35, 3], addr: [...varint(10), ...varint(22)] })], SRC), t);
ok('COPY da origem em modo SELF (opcode 20) e HERE (opcode 35 + tamanho explícito)');

// c) fatia da origem com posição != 0
assert.deepEqual(await run([...HEADER, ...win({ src: { len: 5, pos: 10 }, tgtLen: 5, inst: [19, 5], addr: [0] })], SRC), A('ABCDE'));
ok('janela com segmento de origem em posição deslocada');

// d) RUN (opcode 0 + varint) e COPY sobreposto no alvo
assert.deepEqual(await run([...HEADER, ...win({ tgtLen: 6, data: A('z'), inst: [0, 6] })]), A('zzzzzz'));
// ADD 'ab' (opcode 3), COPY mode HERE? sem origem: here = tpos=2; copiar addr 0 len 6 -> 'abababab' (overlap). SELF addr 0, opcode 19 + 6
assert.deepEqual(await run([...HEADER, ...win({ tgtLen: 8, data: A('ab'), inst: [3, 19, 6], addr: [0] })]), A('abababab'));
ok('RUN e COPY com sobreposição (replicação estilo LZ77)');

// e) ADD+COPY combinado: opcode = 163 + mode*12 + (add-1)*3 + (copy-4). mode 3 add 2 copy 5 -> 199+3+1 = 203
//    NEAR slot 1 (mode 3): precisa de near[1]. Primeiro COPY (SELF 0) -> near[0]=0; segundo COPY (SELF 4) -> near[1]=4.
//    Terceira instrução: ADD2 + COPY5 modo 3: addr = near[1] + 1 = 5.
t = [...A('0123'), ...A('4567'), ...A('XY'), ...A('56789')];
assert.deepEqual(await run([...HEADER, ...win({ src: { len: 20, pos: 0 }, tgtLen: 15, data: A('XY'), inst: [20, 20, 203], addr: [0, 4, 1] })], SRC), t);
ok('ADD+COPY combinado (opcode 203) com cache NEAR');

// f) COPY+ADD com SAME: opcode 247+mode. Endereço 300 cacheado; SAME mode 7 byte 44 -> 300%768=300 -> (7-6)*256+44=300
const SRC2 = [...Array(400).keys()].map(i => i & 255);
t = [...SRC2.slice(300, 304), ...SRC2.slice(300, 304), 0x21];
assert.deepEqual(await run([...HEADER, ...win({ src: { len: 400, pos: 0 }, tgtLen: 9, data: [0x21], inst: [20, 254], addr: [...varint(300), 44] })], SRC2), t);
ok('COPY+ADD (opcode 254) com cache SAME');

// f2) SAME na terceira faixa: addr 600 -> 600%768=600 -> mode 6+2=8, byte 600-512=88. COPY4+ADD1 mode 8 = opcode 255
const SRC3 = [...Array(700).keys()].map(i => (i * 7) & 255);
t = [...SRC3.slice(600, 604), ...SRC3.slice(600, 604), 0x21];
assert.deepEqual(await run([...HEADER, ...win({ src: { len: 700, pos: 0 }, tgtLen: 9, data: [0x21], inst: [20, 255], addr: [...varint(600), 88] })], SRC3), t);
ok('COPY+ADD (opcode 255) com cache SAME na 3ª faixa (distingue same=3 de same=2)');

// g) NEAR via opcode simples: COPY size4 mode2 = 51 + (4-3) = 52 ; near[0]=10 depois do 1º COPY; addr = 10+5 = 15
assert.deepEqual(await run([...HEADER, ...win({ src: { len: 20, pos: 0 }, tgtLen: 8, inst: [20, 52], addr: [10, 5] })], SRC), [...A('ABCD'), ...A('FGHI')]);
ok('COPY NEAR (opcode 52)');

// h) várias janelas
const w1 = win({ tgtLen: 3, data: A('abc'), inst: [4] });
const w2 = win({ src: { len: 3, pos: 5 }, tgtLen: 3, inst: [19, 3], addr: [0] });
assert.deepEqual(await run([...HEADER, ...w1, ...w2], SRC), [...A('abc'), ...A('567')]);
ok('múltiplas janelas');

// i) application header do xdelta3 (bit 0x04) é ignorado
assert.deepEqual(await run([0xD6, 0xC3, 0xC4, 0x00, 0x04, 6, ...A('a/b/c.'), ...win({ tgtLen: 2, data: A('hi'), inst: [3] })]), A('hi'));
ok('application header ignorado');

// j) rejeições
await rejects([0x50, 0x4b, 3, 4, 0], null, /assinatura/);
await rejects([0xD6, 0xC3, 0xC4, 0x00, 0x01, 0, 0, 0], null, /secundária/);
await rejects([0xD6, 0xC3, 0xC4, 0x00, 0x02, 0], null, /customizada/);
await rejects([...HEADER, ...win({ tgtLen: 5, data: A('hello'), inst: [6], adlerOf: A('HELLO') })], null, /Adler/);
await rejects([...HEADER, ...win({ tgtLen: 4, inst: [20], addr: [0] })], null, /original|inválido/);          // COPY sem origem -> endereço inválido
await rejects([...HEADER, ...win({ src: { len: 20, pos: 0 }, tgtLen: 4, inst: [20], addr: [30] })], SRC, /inválido/);
await rejects([...HEADER, ...win({ src: { len: 50, pos: 0 }, tgtLen: 1, inst: [2], data: [0] })], SRC, /menor|original/);
await rejects([...HEADER, ...win({ tgtLen: 5, data: A('hello'), inst: [6] }).slice(0, 8)], null, /truncado/);
await rejects([...HEADER, ...win({ tgtLen: 9, data: A('hello'), inst: [6] })], null, /incompleta/);
await rejects([...HEADER, ...win({ tgtLen: 2, data: A('hello'), inst: [6] })], null, /excede/);
ok('rejeita: assinatura, compressão secundária, code table custom, Adler errado, endereço inválido, origem curta, truncado, janela incompleta/excedida');

// k) fuzz de semântica: gera script aleatório de ADD/RUN/COPY(SELF/HERE) e compara com o modelo
for (let iter = 0; iter < 300; iter++) {
    const src = [...crypto.randomBytes(1 + Math.floor(Math.random() * 3000))];
    const srcPos = Math.floor(Math.random() * Math.min(10, src.length)), srcLen = src.length - srcPos;
    const out = [], data = [], inst = [], addr = [];
    const n = 1 + Math.floor(Math.random() * 40);
    for (let k = 0; k < n; k++) {
        const r = Math.random(), segHere = srcLen + out.length;
        if (r < 0.35) { const sz = 1 + Math.floor(Math.random() * 300), b = [...crypto.randomBytes(sz)]; inst.push(1, ...varint(sz)); data.push(...b); out.push(...b); }
        else if (r < 0.45) { const sz = 1 + Math.floor(Math.random() * 300), b = Math.floor(Math.random() * 256); inst.push(0, ...varint(sz)); data.push(b); for (let q = 0; q < sz; q++) out.push(b); }
        else {
            const a = Math.floor(Math.random() * segHere), sz = 1 + Math.floor(Math.random() * 200);
            const useHere = Math.random() < 0.5;
            inst.push(useHere ? 35 : 19, ...varint(sz)); addr.push(...varint(useHere ? segHere - a : a));
            for (let q = 0; q < sz; q++) { const p = a + q; out.push(p < srcLen ? src[srcPos + p] : out[p - srcLen]); }
        }
    }
    const got = await run([...HEADER, ...win({ src: { len: srcLen, pos: srcPos }, tgtLen: out.length, data, inst, addr, adlerOf: out })], src);
    assert.deepEqual(got, out, 'fuzz iter ' + iter);
}
ok('fuzz: 300 deltas aleatórios (ADD/RUN/COPY SELF+HERE, sobreposição, offsets) batem com o modelo');

console.log(`\n${passed} grupos de teste passaram.`);
