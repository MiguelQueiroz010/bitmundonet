import * as M from '../scripts/raiden_isometa.js';
import assert from 'node:assert/strict';

const S = 2048;
function dirRec(name, lba, size, isDir = false) {
  const id = Buffer.from(name, 'latin1');
  const len = 33 + id.length + (id.length % 2 === 0 ? 1 : 0);
  const b = Buffer.alloc(len);
  b[0] = len; b.writeUInt32LE(lba, 2); b.writeUInt32BE(lba, 6);
  b.writeUInt32LE(size, 10); b.writeUInt32BE(size, 14);
  b[25] = isDir ? 2 : 0; b[32] = id.length; id.copy(b, 33);
  return b;
}
function makeIso({ withJoliet = false, withIoprp = false } = {}) {
  const iso = Buffer.alloc(60 * S);
  const cnf = Buffer.from('BOOT2 = cdrom0:\\SLUS_214.19;1\r\nVER = 1.00\r\nVMODE = NTSC\r\n');
  const elf = Buffer.alloc(5000); elf.set([0x7f, 0x45, 0x4c, 0x46]); for (let i = 4; i < elf.length; i++) elf[i] = (i * 31) & 255;
  const ioprp = Buffer.alloc(3000); for (let i = 0; i < ioprp.length; i++) ioprp[i] = (i * 17 + 9) & 255;
  cnf.copy(iso, 19 * S); elf.copy(iso, 20 * S);
  const recs = [dirRec('\0', 18, S, true), dirRec('\x01', 18, S, true), dirRec('SYSTEM.CNF;1', 19, cnf.length), dirRec('SLUS_214.19;1', 20, elf.length)];
  if (withIoprp) { ioprp.copy(iso, 23 * S); recs.push(dirRec('IOPRP300.IMG;1', 23, ioprp.length)); }
  const root = Buffer.concat(recs);
  root.copy(iso, 18 * S);
  const pvd = Buffer.alloc(S); pvd[0] = 1; pvd.write('CD001', 1); pvd[6] = 1;
  pvd.fill(0x20, 8, 72); pvd.write('PLAYSTATION', 8); pvd.write('ORIGINAL_VOL', 40);
  pvd.fill(0x20, 190, 883); pvd.fill(0, 883, 1395);
  pvd.writeUInt16LE(1, 120); pvd.writeUInt16BE(1, 122); // Volume Set Size
  pvd.writeUInt16LE(1, 124); pvd.writeUInt16BE(1, 126); // Volume Sequence Number
  pvd.writeUInt16LE(S, 128); pvd.writeUInt16BE(S, 130); // Logical Block Size
  dirRec('\0', 18, S, true).copy(pvd, 156);
  pvd.fill(0x30, 813, 829);
  pvd.copy(iso, 16 * S);
  let next = 17;
  if (withJoliet) {
    const j = Buffer.from(pvd); j[0] = 2; j.set([0x25, 0x2f, 0x45], 88);
    j.copy(iso, next * S); next++;
  }
  const term = Buffer.alloc(S); term[0] = 255; term.write('CD001', 1); term[6] = 1;
  term.copy(iso, next * S);
  return { iso: new Uint8Array(iso), elf: new Uint8Array(elf), ioprp: new Uint8Array(ioprp) };
}

// 1) metadados (texto + numéricos)
{
  const { iso } = makeIso({ withJoliet: true });
  const r = M.bufferReader(iso);
  const before = await M.readIsoInfo(r);
  assert.equal(before.fields.volumeId, 'ORIGINAL_VOL');
  assert.equal(before.hasJoliet, true);
  assert.equal(before.numbers.volumeSetSize, 1);
  assert.equal(before.numbers.volumeSequenceNumber, 1);
  assert.equal(before.info.logicalBlockSize, S);
  const { patches, warnings } = await M.buildMetaPatches(r, {
    volumeId: 'RAIDEN_MOD', publisherId: 'BitMundo', applicationId: 'Raiden Patcher',
    numbers: { volumeSetSize: 2, volumeSequenceNumber: 1 },
    dates: { created: '2026-11-14T12:00:00Z', modified: 'now' },
  });
  assert.equal(warnings.length, 0);
  M.applyPatchesToBuffer(iso, patches);
  const after = await M.readIsoInfo(M.bufferReader(iso));
  assert.equal(after.fields.volumeId, 'RAIDEN_MOD');
  assert.equal(after.fields.publisherId, 'BitMundo');
  assert.equal(after.fields.systemId, 'PLAYSTATION');
  assert.equal(after.numbers.volumeSetSize, 2);
  assert.equal(after.dates.created, '2026-11-14 12:00:00');
  // both-endian: checa o par BE também
  assert.equal(iso[16 * S + 120], 2); assert.equal(iso[16 * S + 123], 2);
  // Joliet em UCS-2BE
  const jv = iso.subarray(17 * S + 40, 17 * S + 72);
  assert.equal(jv[0], 0); assert.equal(jv[1], 'R'.charCodeAt(0));
  await assert.rejects(M.buildMetaPatches(M.bufferReader(iso), { volumeId: 'X'.repeat(33) }), /máximo de 32/);
  await assert.rejects(M.buildMetaPatches(M.bufferReader(iso), { volumeId: 'ação' }), /ASCII/);
  await assert.rejects(M.buildMetaPatches(M.bufferReader(iso), { numbers: { volumeSetSize: 70000 } }), /entre 0 e 65535/);
  const w = await M.buildMetaPatches(M.bufferReader(iso), { volumeId: 'meu jogo' });
  assert.equal(w.warnings.length, 1);
  console.log('ok: metadados (PVD + Joliet + campos numéricos)');
}

// 2) trava / destrava
{
  const { iso, elf } = makeIso();
  const original = new Uint8Array(iso);
  const r = () => M.bufferReader(iso);

  const lk = await M.buildLockPatches(r(), 'senha-forte', { iterations: 1000 });
  assert.deepEqual(lk.files, ['SLUS_214.19']);
  M.applyPatchesToBuffer(iso, lk.patches);
  assert.equal(await M.isLocked(r()), true);
  assert.notDeepEqual(Array.from(iso.subarray(20 * S, 20 * S + 4)), [0x7f, 0x45, 0x4c, 0x46]);
  let diffs = 0; for (let i = 0; i < iso.length; i++) if (iso[i] !== original[i]) diffs++;
  assert.ok(diffs > 4000 && diffs < 5000 + 512);

  await assert.rejects(M.buildLockPatches(r(), 'outra'), /já está travada/);
  await assert.rejects(M.buildUnlockPatches(r(), 'errada'), /Senha incorreta/);

  const tampered = new Uint8Array(iso); tampered[16 * S + 883 + 52] ^= 1;
  await assert.rejects(M.buildUnlockPatches(M.bufferReader(tampered), 'senha-forte'), /Senha incorreta/);
  const t2 = new Uint8Array(iso); t2[20 * S + 100] ^= 1;
  await assert.rejects(M.buildUnlockPatches(M.bufferReader(t2), 'senha-forte'), /hash não confere/);

  const un = await M.buildUnlockPatches(r(), 'senha-forte');
  M.applyPatchesToBuffer(iso, un.patches);
  assert.deepEqual(iso, original);
  console.log('ok: trava/destrava restaura a ISO byte a byte');
}

// 2a2) trava multi-arquivo (ELF de boot + IOPRP300.IMG)
{
  const { iso, elf, ioprp } = makeIso({ withIoprp: true });
  const original = new Uint8Array(iso);
  const r = () => M.bufferReader(iso);

  const lk = await M.buildLockPatches(r(), 'outra-senha', { iterations: 1000, files: ['IOPRP300.IMG'] });
  assert.deepEqual(lk.files.sort(), ['IOPRP300.IMG', 'SLUS_214.19'].sort());
  M.applyPatchesToBuffer(iso, lk.patches);
  assert.equal(await M.isLocked(r()), true);
  assert.notDeepEqual(Array.from(iso.subarray(20 * S, 20 * S + 4)), [0x7f, 0x45, 0x4c, 0x46]);
  assert.notDeepEqual(iso.subarray(23 * S, 23 * S + ioprp.length), ioprp);

  await assert.rejects(M.buildUnlockPatches(r(), 'senha-errada'), /Senha incorreta/);
  const un = await M.buildUnlockPatches(r(), 'outra-senha');
  assert.equal(un.files.length, 2);
  M.applyPatchesToBuffer(iso, un.patches);
  assert.deepEqual(iso, original);

  await assert.rejects(
    M.buildLockPatches(M.bufferReader(iso), 'x', { iterations: 1000, files: Array.from({ length: 9 }, (_, i) => `F${i}.BIN`) }),
    /No máximo 8 arquivos/
  );
  console.log('ok: trava multi-arquivo (ELF + IOPRP300.IMG)');
}

// 2b) wrapper de créditos — sem mídia (texto só)
{
  const { iso, elf } = makeIso();
  const r = () => M.bufferReader(iso);

  const fakeTemplate = new Uint8Array(4096);
  let p = 200;
  const putMark = (s) => { fakeTemplate.set(new TextEncoder().encode(s), p); p += s.length; };
  putMark('RAIDENBOOT'); p += 40;
  putMark('RAIDENCREDIT'); p += 256;
  putMark('RAIDENHASH1'); p += 2 + 40 * 2;
  putMark('RAIDENMEDIA'); p += 16;

  const res = await M.buildCreditsWrapperPatches(r(), fakeTemplate, {
    credits: 'Traduzido por BitMundo.net — bitmundo.net',
  });
  M.applyPatchesToBuffer(iso, res.patches);
  const grown = M.growAndApplyAppends(iso, res.appends);

  assert.deepEqual(grown.subarray(20 * S, 20 * S + elf.length), elf);
  const info = await M.readIsoInfo(M.bufferReader(grown));
  assert.ok(info);
  const marks = M.readWrapperMarkers(grown.subarray(res.wrapLba * S, res.wrapLba * S + res.wrapSize));
  assert.equal(marks.boot.lba, 20);
  assert.equal(marks.boot.size, elf.length);
  const expectHash = new Uint8Array(await crypto.subtle.digest('SHA-256', elf));
  assert.deepEqual(marks.boot.sha256, expectHash);
  assert.equal(marks.credits, 'Traduzido por BitMundo.net — bitmundo.net');
  assert.equal(marks.media, null); // sem opts.media => marcador gravado como NONE
  assert.equal(res.media, null);
  console.log('ok: wrapper de créditos sem mídia — ELF intocado, diretório redirecionado, media=NONE');
}

// 2c) wrapper de créditos — COM imagem anexada
{
  const { iso, elf } = makeIso();
  const r = () => M.bufferReader(iso);

  const fakeTemplate = new Uint8Array(4096);
  let p = 200;
  const putMark = (s) => { fakeTemplate.set(new TextEncoder().encode(s), p); p += s.length; };
  putMark('RAIDENBOOT'); p += 40;
  putMark('RAIDENCREDIT'); p += 256;
  putMark('RAIDENHASH1'); p += 2 + 40 * 2;
  putMark('RAIDENMEDIA'); p += 16;

  const w = 64, h = 32;
  const imageData = new Uint8Array(w * h * 4); // RGBA32 cru
  for (let i = 0; i < imageData.length; i++) imageData[i] = (i * 7) & 255;

  const res = await M.buildCreditsWrapperPatches(r(), fakeTemplate, {
    credits: 'Abertura — BitMundo.net',
    media: { type: 'image', data: imageData, width: w, height: h, durationSec: 5 },
  });
  M.applyPatchesToBuffer(iso, res.patches);
  const grown = M.growAndApplyAppends(iso, res.appends);

  assert.equal(res.appends.length, 2); // wrapper + mídia
  assert.ok(res.media);
  assert.equal(res.media.size, imageData.length);
  const marks = M.readWrapperMarkers(grown.subarray(res.wrapLba * S, res.wrapLba * S + res.wrapSize));
  assert.equal(marks.media.type, 'image');
  assert.equal(marks.media.width, w);
  assert.equal(marks.media.height, h);
  assert.equal(marks.media.durationSec, 5);
  assert.equal(marks.media.size, imageData.length);
  // os bytes da imagem precisam estar exatamente no LBA gravado
  const mediaBytes = grown.subarray(marks.media.lba * S, marks.media.lba * S + marks.media.size);
  assert.deepEqual(mediaBytes, imageData);
  console.log('ok: wrapper de créditos com imagem — anexada e referenciada corretamente');
}

// 2d) wrapper de créditos — COM vídeo .PSS anexado
{
  const { iso, elf } = makeIso();
  const r = () => M.bufferReader(iso);

  const fakeTemplate = new Uint8Array(4096);
  let p = 200;
  const putMark = (s) => { fakeTemplate.set(new TextEncoder().encode(s), p); p += s.length; };
  putMark('RAIDENBOOT'); p += 40;
  putMark('RAIDENCREDIT'); p += 256;
  putMark('RAIDENHASH1'); p += 2 + 40 * 2;
  putMark('RAIDENMEDIA'); p += 16;

  const pssData = new Uint8Array(9000); // tamanho qualquer, não-múltiplo de setor, pra testar o padding
  for (let i = 0; i < pssData.length; i++) pssData[i] = (i * 13 + 3) & 255;

  const res = await M.buildCreditsWrapperPatches(r(), fakeTemplate, {
    media: { type: 'movie', data: pssData },
  });
  M.applyPatchesToBuffer(iso, res.patches);
  const grown = M.growAndApplyAppends(iso, res.appends);

  const marks = M.readWrapperMarkers(grown.subarray(res.wrapLba * S, res.wrapLba * S + res.wrapSize));
  assert.equal(marks.media.type, 'movie');
  assert.equal(marks.media.size, pssData.length);
  const mediaBytes = grown.subarray(marks.media.lba * S, marks.media.lba * S + marks.media.size);
  assert.deepEqual(mediaBytes, pssData);
  // tipo inválido é rejeitado
  await assert.rejects(
    M.buildCreditsWrapperPatches(r(), fakeTemplate, { media: { type: 'mp4', data: pssData } }),
    /opts\.media\.type inválido/
  );
  // imagem sem width/height é rejeitada
  await assert.rejects(
    M.buildCreditsWrapperPatches(r(), fakeTemplate, { media: { type: 'image', data: pssData } }),
    /width\/height/
  );
  console.log('ok: wrapper de créditos com vídeo .PSS — anexado e referenciado corretamente');
}

// 3) Application Use com conteúdo próprio
{
  const { iso } = makeIso();
  iso[16 * S + 883 + 5] = 0x41;
  await assert.rejects(M.buildLockPatches(M.bufferReader(iso), 'x', { iterations: 1000 }), /Application Use/);
  console.log('ok: protege Application Use existente');
}

// 4) validateMetaChanges (sem precisar de ISO) — usado para validar o manifesto de um patch antes de gravar
{
  assert.deepEqual(M.validateMetaChanges({}), []);
  assert.equal(M.validateMetaChanges({ volumeId: 'meu jogo' }).length, 1);
  assert.throws(() => M.validateMetaChanges({ volumeId: 'ação' }), /ASCII/);
  assert.throws(() => M.validateMetaChanges({ publisherId: 'x'.repeat(129) }), /máximo de 128/);
  assert.throws(() => M.validateMetaChanges({ volumeId: 42 }), /precisa ser texto/);
  assert.throws(() => M.validateMetaChanges({ numbers: { volumeSetSize: -1 } }), /entre 0 e 65535/);
  assert.throws(() => M.validateMetaChanges({ numbers: { volumeSetSize: 1.5 } }), /entre 0 e 65535/);
  assert.throws(() => M.validateMetaChanges({ dates: { created: 'não é data' } }), /Data inválida/);
  assert.doesNotThrow(() => M.validateMetaChanges({ dates: { modified: 'now', created: '2026-11-14T12:00:00Z', expires: '' } }));
  assert.deepEqual(M.ISO_DATE_KEYS, ['created', 'modified', 'expires', 'effective']);
  console.log('ok: validateMetaChanges (texto, tamanho, números, datas)');
}

// 5) fetchWrapperTemplate: só aceita um .elf que realmente pareça o wrapper; nunca lança
{
  const mkTpl = (marks) => {
    const t = new Uint8Array(4096); t.set([0x7f, 0x45, 0x4c, 0x46]);
    let p = 200; for (const m of marks) { t.set(new TextEncoder().encode(m), p); p += m.length + 60; }
    return t;
  };
  const ALL = ['RAIDENBOOT', 'RAIDENCREDIT', 'RAIDENHASH1', 'RAIDENMEDIA', 'RAIDENFAIL'];
  const realFetch = globalThis.fetch;
  const serve = (res) => { globalThis.fetch = async () => res; };
  try {
    const good = mkTpl(ALL);
    serve({ ok: true, arrayBuffer: async () => good.buffer });
    const got = await M.fetchWrapperTemplate();
    assert.ok(got instanceof Uint8Array && got.length === 4096);
    serve({ ok: true, arrayBuffer: async () => mkTpl(ALL.slice(0, 3)).buffer });
    assert.equal(await M.fetchWrapperTemplate(), null);               // falta um marcador
    const notElf = mkTpl(ALL); notElf[0] = 0;
    serve({ ok: true, arrayBuffer: async () => notElf.buffer });
    assert.equal(await M.fetchWrapperTemplate(), null);               // sem cabeçalho ELF (ex.: página 404 em HTML)
    serve({ ok: false, arrayBuffer: async () => good.buffer });
    assert.equal(await M.fetchWrapperTemplate(), null);               // 404
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await M.fetchWrapperTemplate(), null);               // rede caiu
  } finally { globalThis.fetch = realFetch; }
  console.log('ok: fetchWrapperTemplate valida ELF + marcadores e nunca lança');
}

// --- mensagem de falha + capacidades ---
{
  const { iso } = makeIso();
  const t = new Uint8Array(4096); let p = 200;
  const mk = (s, n, init) => { t.set(new TextEncoder().encode(s), p); p += s.length; if (init) t[p] = init; p += n; };
  mk('RAIDENBOOT', 40); mk('RAIDENCREDIT', 256); mk('RAIDENHASH1', 82); mk('RAIDENMEDIA', 16); mk('RAIDENFAIL', 256); mk('RAIDENCAPS', 1, 0);
  const rd = () => M.bufferReader(iso);
  const res = await M.buildCreditsWrapperPatches(rd(), t, { failText: 'Arquivos alterados! Reinstale.' });
  const w = res.append.data.slice(0, res.wrapSize);
  assert.equal(M.readWrapperMarkers(w).failText, 'Arquivos alterados! Reinstale.');
  await assert.rejects(M.buildCreditsWrapperPatches(rd(), t, { failText: 'x'.repeat(256) }), /255/);
  await assert.rejects(M.buildCreditsWrapperPatches(rd(), t, { media: { type: 'movie', data: new Uint8Array(10) } }), /sem suporte a filme/);
  t[t.length - 1] = 0;
  console.log('ok failText/caps');
}
