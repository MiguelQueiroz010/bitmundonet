// Pasta virtual sobre a ISO. Rodar: node tests/iso_vfs_selftest.mjs
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { ISO9660 } from '../scripts/IUP/iso9660.js';
import { applyOps } from '../scripts/IUP/rpt_ops.js';
import { listFiles } from '../scripts/IUP/rpt_builder.js';

let passed = 0; const ok = (n) => { passed++; console.log('  ok  ' + n); };
class MemFile { kind = 'file'; constructor(n) { this.name = n; this.data = new Uint8Array(0); }
    async getFile() { return new Blob([this.data.slice()]); }
    async createWritable() { const ch = []; let c = false; const s = this;
        const ws = new WritableStream({ write(u) { ch.push(Buffer.from(u)); }, close() { c = true; s.data = new Uint8Array(Buffer.concat(ch)); }, abort() { c = true; } });
        ws.write = async (u) => { if (c) throw new Error('fechado'); ch.push(Buffer.from(u)); };
        return ws; } }
class MemDir { kind = 'directory'; constructor(n = '') { this.name = n; this.kids = new Map(); }
    async *entries() { for (const [k, v] of this.kids) yield [k, v]; }
    async *values() { for (const v of this.kids.values()) yield v; }
    async getFileHandle(n, { create } = {}) { if (!this.kids.has(n)) { if (!create) throw new DOMException('x', 'NotFoundError'); this.kids.set(n, new MemFile(n)); } return this.kids.get(n); }
    async getDirectoryHandle(n, { create } = {}) { if (!this.kids.has(n)) { if (!create) throw new DOMException('x', 'NotFoundError'); this.kids.set(n, new MemDir(n)); } return this.kids.get(n); }
    async removeEntry(n) { if (!this.kids.delete(n)) throw new DOMException('x', 'NotFoundError'); } }
const put = async (root, path, bytes) => { const p = path.split('/'); let d = root; for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true }); const f = await d.getFileHandle(p.at(-1), { create: true }); f.data = Uint8Array.from(bytes); return f; };
const rnd = (n) => crypto.randomBytes(n);
const toIso = async (dir) => { const ch = []; const ws = new WritableStream({ write(u) { ch.push(Buffer.from(u)); } }); await ISO9660.BuildISO(dir, ws, {}); return new Blob([Buffer.concat(ch)]); };
const flat = async (dir, pre = '', out = {}) => { for await (const [n, h] of dir.entries()) h.kind === 'directory' ? await flat(h, pre + n + '/', out) : (out[pre + n] = Buffer.from(await (await h.getFile()).arrayBuffer())); return out; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ISO de teste: raiz + pastas aninhadas, arquivo vazio, arquivo de >1 setor, nomes com ponto
const src = new MemDir();
const files = { 'SYSTEM.CNF': rnd(70), 'SLUS_214.19': rnd(300000), 'DATA/A.BIN': rnd(5000), 'DATA/B.BIN': rnd(2048), 'DATA/SUB/C.TXT': rnd(1), 'DATA/SUB/DEEP/D.DAT': rnd(9000), 'MOVIE/M1.PSS': rnd(1_500_000), 'VAZIO.TXT': Buffer.alloc(0) };
for (const [k, v] of Object.entries(files)) await put(src, k, v);
const iso = await toIso(src);

// 1) igual à extração tradicional
const ext = new MemDir(); await ISO9660.ExtrairNaPasta(iso, ext, {});
const vfs = await ISO9660.MontarPastaVirtual(iso);
const A = await flat(ext), B = await flat(vfs);
assert.deepEqual(Object.keys(B).sort(), Object.keys(A).sort());
for (const k of Object.keys(A)) assert.ok(A[k].equals(B[k]), 'conteudo difere: ' + k);
ok(`pasta virtual == ExtrairNaPasta (${Object.keys(A).length} arquivos, conteúdo idêntico)`);

// 2) BuildISO sobre a pasta virtual reproduz a ISO (mesmos arquivos)
const iso2 = await toIso(vfs);
const ext2 = new MemDir(); await ISO9660.ExtrairNaPasta(iso2, ext2, {});
const C = await flat(ext2); for (const k of Object.keys(A)) assert.ok(A[k].equals(C[k]), 'reconstrução difere: ' + k);
assert.equal(iso2.size, iso.size);
ok('BuildISO(pasta virtual) gera ISO com os mesmos arquivos e o mesmo tamanho');

// 3) listFiles / busca sem diferenciar caixa / getFile são preguiçosos (fatias)
const lf = await listFiles(vfs); assert.equal(lf.length, Object.keys(A).length);
assert.ok((await (await vfs.getDirectoryHandle('data')).getFileHandle('a.bin')).name === 'A.BIN');
await assert.rejects(vfs.getFileHandle('NAO_EXISTE'), (e) => e.name === 'NotFoundError');
await assert.rejects(vfs.getDirectoryHandle('SYSTEM.CNF'), (e) => e.name === 'TypeMismatchError');
ok('listFiles, busca sem caixa, NotFoundError/TypeMismatchError');

// 4) escrita: só o arquivo alterado vira arquivo real; abort descarta; os outros continuam fatias
const scratch = new MemDir(); const v2 = await ISO9660.MontarPastaVirtual(iso, { scratchDir: scratch });
const fh = await (await v2.getDirectoryHandle('DATA')).getFileHandle('A.BIN');
let w = await fh.createWritable(); await w.write(Buffer.from('lixo')); await w.abort();
assert.ok(Buffer.from(await (await fh.getFile()).arrayBuffer()).equals(files['DATA/A.BIN']) && scratch.kids.size === 0);
w = await fh.createWritable(); await w.write(Buffer.from('NOVO CONTEUDO')); await w.close();
assert.equal(Buffer.from(await (await fh.getFile()).arrayBuffer()).toString(), 'NOVO CONTEUDO');
assert.equal(scratch.kids.size, 1);
const created = await (await v2.getDirectoryHandle('NOVA', { create: true })).getFileHandle('X.BIN', { create: true });
w = await created.createWritable(); await w.write(Buffer.from('abc')); await w.close();
const D = await flat(v2); assert.equal(D['NOVA/X.BIN'].toString(), 'abc'); assert.equal(D['DATA/A.BIN'].toString(), 'NOVO CONTEUDO'); assert.ok(D['DATA/B.BIN'].equals(files['DATA/B.BIN']));
ok('createWritable: abort descarta, close grava só o alterado, cria pasta/arquivo novos');

// 5) overlay (arquivos "v1" do patch) substitui sem diferenciar caixa e acrescenta novos
const ov = new MemDir(); await put(ov, 'data/b.bin', Buffer.from('DO PATCH')); await put(ov, 'EXTRA/E.BIN', Buffer.from('extra'));
const v3 = await ISO9660.MontarPastaVirtual(iso, { overlayDir: ov, scratchDir: new MemDir() });
const E = await flat(v3);
assert.equal(E['DATA/b.bin'].toString(), 'DO PATCH'); assert.ok(!('DATA/B.BIN' in E)); assert.equal(E['EXTRA/E.BIN'].toString(), 'extra'); assert.ok(E['DATA/A.BIN'].equals(files['DATA/A.BIN']));
ok('overlay: substitui (sem caixa), acrescenta novos, mantém o resto da ISO');

// 6) applyOps real (inject + replace) sobre a pasta virtual, e a ISO final sai certa
const orig = files['DATA/B.BIN'], mod = Buffer.from(orig); mod.write('TRADUZIDO', 100);
const payloads = new MemDir(); await put(payloads, 'p1.bin', Buffer.from('arquivo novo!'));
const hex = (b) => Buffer.from(b).toString('hex').toUpperCase();
const v4 = await ISO9660.MontarPastaVirtual(iso, { scratchDir: new MemDir() });
const { normalizeOps } = await import('../scripts/IUP/rpt_ops.js');
const ops = normalizeOps([
    { type: 'inject', path: 'DATA/B.BIN', srcSha256: sha(orig), sha256: sha(mod), patches: [{ offset: '0x64', old: hex(orig.subarray(100, 109)), new: hex(mod.subarray(100, 109)) }] },
    { type: 'replace', path: 'NOVO/N.TXT', payload: '__rpt/p1.bin', codec: 'none', sha256: sha(Buffer.from('arquivo novo!')), size: 13 },
]);
const pr = new MemDir(); await put(pr, 'p1.bin', Buffer.from('arquivo novo!'));
await applyOps({ ops, filesRoot: v4, payloadRoot: pr });
const iso3 = await toIso(v4); const ext3 = new MemDir(); await ISO9660.ExtrairNaPasta(iso3, ext3, {});
const F = await flat(ext3);
assert.ok(F['DATA/B.BIN'].equals(mod)); assert.equal(F['NOVO/N.TXT'].toString(), 'arquivo novo!'); assert.ok(F['SLUS_214.19'].equals(files['SLUS_214.19']));
ok('applyOps (inject + replace) na pasta virtual → BuildISO → ISO correta');

// 7) hash errado: applyOps falha e o arquivo original continua intacto
const v5 = await ISO9660.MontarPastaVirtual(iso, { scratchDir: new MemDir() });
const bad = normalizeOps([{ type: 'inject', path: 'DATA/B.BIN', srcSha256: sha(orig), sha256: sha(Buffer.from('x')), patches: [{ offset: '0x64', old: hex(orig.subarray(100, 109)), new: hex(mod.subarray(100, 109)) }] }]);
await assert.rejects(applyOps({ ops: bad, filesRoot: v5, payloadRoot: pr }), /Verificação falhou/);
assert.ok((await flat(v5))['DATA/B.BIN'].equals(orig));
ok('verificação falha → original intacto');

console.log(`\n${passed} grupos de teste passaram.`);
