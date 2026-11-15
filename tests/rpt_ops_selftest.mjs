// Testes do motor de operações RPT. Rodar: node tests/rpt_ops_selftest.mjs
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { normalizeOps, applyOps, cleanupWorkDir, parseRelPath, createPayloadFile } from '../scripts/IUP/rpt_ops.js';

let passed = 0;
const ok = (n) => { passed++; console.log('  ok  ' + n); };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ── FS em memória que imita File System Access API (createWritable é atômico: abort descarta) ──
class MemFile {
    kind = 'file';
    constructor(name) { this.name = name; this.data = new Uint8Array(0); }
    async getFile() { return new Blob([this.data.slice()]); }
    async createWritable() {
        const chunks = []; let closed = false; const self = this;
        return {
            async write(u8) { if (closed) throw new Error('fechado'); chunks.push(Uint8Array.from(u8)); },
            async close() { closed = true; self.data = new Uint8Array(Buffer.concat(chunks)); },
            async abort() { closed = true; },
        };
    }
}
class MemDir {
    kind = 'directory';
    constructor(name = '') { this.name = name; this.kids = new Map(); }
    async *entries() { for (const [k, v] of this.kids) yield [k, v]; }
    async getFileHandle(n, { create } = {}) { if (!this.kids.has(n)) { if (!create) throw new DOMException('x', 'NotFoundError'); this.kids.set(n, new MemFile(n)); } return this.kids.get(n); }
    async getDirectoryHandle(n, { create } = {}) { if (!this.kids.has(n)) { if (!create) throw new DOMException('x', 'NotFoundError'); this.kids.set(n, new MemDir(n)); } return this.kids.get(n); }
    async removeEntry(n) { if (!this.kids.delete(n)) throw new DOMException('x', 'NotFoundError'); }
}
async function put(root, path, bytes) { const parts = path.split('/'); let d = root; for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true }); const f = await d.getFileHandle(parts.at(-1), { create: true }); f.data = Uint8Array.from(bytes); return f; }
async function get(root, path) { let d = root; const parts = path.split('/'); for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p); return Buffer.from(await (await (await d.getFileHandle(parts.at(-1))).getFile()).arrayBuffer()); }
const deflate = async (buf) => Buffer.from(await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

// VCDIFF mínimo: ADD + COPY da origem
const varint = (n) => { const o = [n & 0x7f]; n = Math.floor(n / 128); while (n > 0) { o.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); } return o; };
function vcdiffCopyAdd(srcLen, copyFrom, copyLen, addBytes) {   // saída = COPY(copyFrom,copyLen) + ADD(addBytes)
    const data = [...addBytes], inst = [19, ...varint(copyLen), 1, ...varint(addBytes.length)], addr = varint(copyFrom);
    const body = [...varint(copyLen + addBytes.length), 0, ...varint(data.length), ...varint(inst.length), ...varint(addr.length), ...data, ...inst, ...addr];
    return Buffer.from([0xD6, 0xC3, 0xC4, 0x00, 0x00, 1, ...varint(srcLen), 0, ...varint(body.length), ...body]);
}
const baseOp = (o) => ({ ...o });
const H = sha(Buffer.from('x'));

// ── normalizeOps / parseRelPath ──
for (const bad of ['../x', '/abs', 'a/../b', 'a//b', 'a/./b', 'C:/x', 'a\u0000b', 'a|b', '', 'a/'])
    assert.throws(() => parseRelPath(bad), /inválido/, JSON.stringify(bad));
assert.deepEqual(parseRelPath('DATA\\TEXT\\a.dat'), ['DATA', 'TEXT', 'a.dat']);
const good = { type: 'delta', path: 'MOVIE/M1.PSS', payload: '__rpt/1.vcdiff', srcSha256: H, sha256: H };
assert.equal(normalizeOps([good]).length, 1);
const badOps = [
    [{ ...good, path: '../M1' }, /proibido/], [{ ...good, payload: 'x/1' }, /__rpt/], [{ ...good, payload: '__rpt/../x' }, /proibido/],
    [{ ...good, srcSha256: undefined }, /obrigatório/], [{ ...good, sha256: undefined }, /obrigatório/], [{ ...good, srcSha256: 'abc' }, /SHA-256/],
    [{ ...good, codec: 'zstd' }, /codec/], [{ ...good, type: 'bsdiff' }, /desconhecido/], [{ ...good, size: -1 }, /size/],
    [{ type: 'inject', path: 'S', srcSha256: H, patches: [] }, /sem alterações/],
    [{ type: 'inject', path: 'S', srcSha256: H, patches: [{ offset: '0', old: 'AA', new: 'BBCC' }] }, /mesmo tamanho/],
    [{ type: 'inject', path: 'S', srcSha256: H, patches: [{ offset: '0', old: 'AAA', new: 'BBC' }] }, /hex/],
    [{ type: 'inject', path: 'S', srcSha256: H, patches: [{ offset: '-1', old: 'AA', new: 'BB' }] }, /offset/],
    [{ type: 'inject', path: 'S', srcSha256: H, patches: [{ offset: '0', old: 'AAAAAAAA', new: 'BBBBBBBB' }, { offset: '3', old: 'AA', new: 'BB' }] }, /sobrepostas/],
];
for (const [o, re] of badOps) assert.throws(() => normalizeOps([o]), re, JSON.stringify(o).slice(0, 80));
assert.throws(() => normalizeOps([good, { ...good, path: 'movie/m1.pss' }]), /mais de uma/);
ok('normalizeOps rejeita caminhos perigosos, hashes ausentes/ruins, codec/tipo inválidos, injects inconsistentes e duplicatas');

// ── replace ──
{
    const files = new MemDir(), pay = new MemDir();
    await put(files, 'DATA/TEXT/US.DAT;1', Buffer.from('original'));
    const novo = Buffer.from('texto traduzido '.repeat(200));
    await put(pay, '1.bin', await deflate(novo));
    await put(pay, '2.bin', novo);
    const ops = normalizeOps([
        { type: 'replace', path: 'data/text/us.dat', payload: '__rpt/1.bin', codec: 'deflate-raw', sha256: sha(novo), size: novo.length },
        { type: 'replace', path: 'EXTRA/NEW.TXT', payload: '__rpt/2.bin', sha256: sha(novo) },
    ]);
    const r = await applyOps({ ops, filesRoot: files, payloadRoot: pay });
    assert.equal(r.applied, 2);
    assert.deepEqual(await get(files, 'DATA/TEXT/US.DAT;1'), novo);       // achou "US.DAT;1" por nome tolerante (maiúsculas, ;1)
    assert.deepEqual(await get(files, 'EXTRA/NEW.TXT'), novo);            // arquivo novo criado
    ok('replace: nome tolerante a caixa/";1", descompressão deflate-raw, hash e size conferidos, cria arquivos novos');
}
{
    const files = new MemDir(), pay = new MemDir();
    await put(files, 'A.DAT', Buffer.from('original'));
    await put(pay, '1.bin', Buffer.from('conteudo'));
    const mk = (extra) => normalizeOps([{ type: 'replace', path: 'A.DAT', payload: '__rpt/1.bin', ...extra }]);
    await assert.rejects(applyOps({ ops: mk({ sha256: sha('outro') }), filesRoot: files, payloadRoot: pay }), /Verificação falhou/);
    await assert.rejects(applyOps({ ops: mk({ size: 3 }), filesRoot: files, payloadRoot: pay }), /maior que o declarado/);
    await assert.rejects(applyOps({ ops: mk({ size: 99 }), filesRoot: files, payloadRoot: pay }), /menor que o declarado/);
    await assert.rejects(applyOps({ ops: normalizeOps([{ type: 'replace', path: 'A.DAT', payload: '__rpt/nao_existe.bin' }]), filesRoot: files, payloadRoot: pay }), /incompleto/);
    assert.deepEqual(await get(files, 'A.DAT'), Buffer.from('original'));
    ok('replace: hash errado / size divergente / payload ausente → erro e arquivo original INTACTO (escrita abortada)');
}

// ── delta ──
{
    const orig = crypto.randomBytes(5000), add = Buffer.from('LEGENDA-PT-BR');
    const expected = Buffer.concat([orig.subarray(1000, 3000), add]);
    const delta = vcdiffCopyAdd(orig.length, 1000, 2000, add);
    const mkOp = (o = {}) => normalizeOps([{ type: 'delta', path: 'MOVIE/M1.PSS', payload: '__rpt/m1.vcdiff', srcSha256: sha(orig), sha256: sha(expected), ...o }]);

    for (const codec of ['none', 'deflate-raw', 'gzip']) {
        const files = new MemDir(), pay = new MemDir();
        await put(files, 'MOVIE/M1.PSS;1', orig);
        await put(pay, 'm1.vcdiff', codec === 'none' ? delta : codec === 'gzip'
            ? Buffer.from(await new Response(new Blob([delta]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()) : await deflate(delta));
        const prog = [];
        await applyOps({ ops: mkOp({ codec }), filesRoot: files, payloadRoot: pay, onProgress: (f, m) => prog.push(f) });
        assert.deepEqual(await get(files, 'MOVIE/M1.PSS;1'), expected, codec);
        assert.equal(prog.at(-1), 1);
    }
    ok('delta: aplica VCDIFF sobre o original da ISO (none / deflate-raw / gzip) e reporta progresso até 100%');

    const files = new MemDir(), pay = new MemDir();
    await put(pay, 'm1.vcdiff', delta);
    await put(files, 'MOVIE/M1.PSS', crypto.randomBytes(5000));        // ISO "de outra versão"
    await assert.rejects(applyOps({ ops: mkOp(), filesRoot: files, payloadRoot: pay }), /não é o esperado/);
    await put(files, 'MOVIE/M1.PSS', orig);
    await assert.rejects(applyOps({ ops: mkOp({ sha256: sha('errado') }), filesRoot: files, payloadRoot: pay }), /Verificação falhou/);
    assert.deepEqual(await get(files, 'MOVIE/M1.PSS'), orig);          // resultado errado NÃO foi confirmado
    await assert.rejects(applyOps({ ops: normalizeOps([{ type: 'delta', path: 'NAO/EXISTE.BIN', payload: '__rpt/m1.vcdiff', srcSha256: H, sha256: H }]), filesRoot: files, payloadRoot: pay }), /não encontrad/);
    ok('delta: ISO com arquivo diferente / resultado com hash errado / alvo inexistente → erro, nada é gravado');
}

// ── inject ──
{
    const elf = crypto.randomBytes(4096);
    const patches = [{ offset: '0x10', old: elf.subarray(0x10, 0x14).toString('hex'), new: 'DEADBEEF' }, { offset: '200', old: elf.subarray(200, 202).toString('hex'), new: 'CAFE' }];
    const want = Buffer.from(elf); Buffer.from('DEADBEEF', 'hex').copy(want, 0x10); Buffer.from('CAFE', 'hex').copy(want, 200);
    const mk = (p, o = {}) => normalizeOps([{ type: 'inject', path: 'SLUS_213.73', srcSha256: sha(elf), sha256: sha(want), patches: p, ...o }]);

    const files = new MemDir(), pay = new MemDir();
    await put(files, 'SLUS_213.73;1', elf);
    await applyOps({ ops: mk(patches), filesRoot: files, payloadRoot: pay });
    assert.deepEqual(await get(files, 'SLUS_213.73;1'), want);
    ok('inject: [offset, old, new] aplicados (hex 0x e decimal)');

    await put(files, 'SLUS_213.73;1', elf);
    const wrongOld = [{ ...patches[0], old: '00000000' }, patches[1]];
    await assert.rejects(applyOps({ ops: mk(wrongOld), filesRoot: files, payloadRoot: pay }), /não conferem/);
    await assert.rejects(applyOps({ ops: mk([{ offset: '99999', old: 'AA', new: 'BB' }]), filesRoot: files, payloadRoot: pay }), /fora do arquivo/);
    await assert.rejects(applyOps({ ops: mk(patches, { srcSha256: sha('x') }), filesRoot: files, payloadRoot: pay }), /não é o esperado/);
    assert.deepEqual(await get(files, 'SLUS_213.73;1'), elf);
    ok('inject: bytes originais diferentes / offset fora / ELF de outra versão → erro, nenhum byte é alterado');
}

// ── limpeza ──
{
    const root = new MemDir(); await put(root, 'patch_files/a/b.bin', [1]); await put(root, 'x_dec.bin', [1]);
    await cleanupWorkDir(root, ['patch_files', 'patch_ops', 'x_dec.bin']);   // patch_ops não existe: não pode lançar
    assert.equal(root.kids.size, 0);
    ok('cleanupWorkDir remove temporários e ignora os que não existem');
}

console.log(`\n${passed} grupos de teste passaram.`);
