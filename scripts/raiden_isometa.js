// raiden_isometa.js
// Edição de campos ISO9660 (PVD/Joliet), trava reversível com senha e wrapper de
// créditos (imagem OU vídeo .PSS) para ISOs de PS2.
// Funciona no navegador e no Node 19+ (usa WebCrypto). Assume setores de 2048 bytes.
//
// O módulo NÃO escreve nada sozinho: ele devolve "patches" de bytes ({offset, data})
// e, quando necessário, um "append" ({offset, data}) para o fim do arquivo — você
// aplica isso no stream de saída do patcher ou direto no arquivo.

const SECTOR = 2048;
const PVD_OFF = 16 * SECTOR;
const APP_USE = { off: 883, len: 512 };

// Campos de texto (ASCII, padded com espaço) do Primary Volume Descriptor.
const FIELDS = {
  systemId:      { off: 8,   len: 32,  label: 'System Identifier' },
  volumeId:      { off: 40,  len: 32,  label: 'Volume Identifier' },
  volumeSetId:   { off: 190, len: 128, label: 'Volume Set Identifier' },
  publisherId:   { off: 318, len: 128, label: 'Publisher Identifier' },
  preparerId:    { off: 446, len: 128, label: 'Data Preparer Identifier' },
  applicationId: { off: 574, len: 128, label: 'Application Identifier' },
  copyrightFile: { off: 702, len: 37,  label: 'Copyright File Identifier' },
  abstractFile:  { off: 739, len: 37,  label: 'Abstract File Identifier' },
  biblioFile:    { off: 776, len: 37,  label: 'Bibliographic File Identifier' },
};
const DATES = { created: 813, modified: 830, expires: 847, effective: 864 };

// Campos numéricos (both-endian: LE então BE, 2+2 ou 4+4 bytes) que o padrão também
// reserva para edição de "identidade" do volume, além do texto acima.
// volumeSetSize / volumeSequenceNumber: usados quando um "jogo" é distribuído em
// vários discos (ex. "disco 1 de 2"); quase sempre 1/1, mas ficam editáveis porque
// foi pedido "tudo mais" dos campos de identidade do volume.
const NUM_FIELDS = {
  volumeSetSize:        { off: 120, len: 2, label: 'Volume Set Size' },
  volumeSequenceNumber: { off: 124, len: 2, label: 'Volume Sequence Number' },
};
// Campos numéricos somente-leitura (estruturais — mudar isso corrompe a ISO; só
// expostos em readIsoInfo() como informação, nunca aceitos em buildMetaPatches).
const READONLY_NUM = {
  logicalBlockSize: { off: 128, len: 2 },
  volumeSpaceSize:  { off: 80,  len: 4 },
  pathTableSize:    { off: 132, len: 4 },
};

export const ISO_FIELDS = FIELDS;
export const ISO_NUM_FIELDS = NUM_FIELDS;
export const ISO_DATE_KEYS = Object.keys(DATES);

// ───────────── leitores ─────────────
export function blobReader(blob) {
  return {
    size: blob.size,
    read: async (off, len) => new Uint8Array(await blob.slice(off, off + len).arrayBuffer()),
  };
}
export function bufferReader(u8) {
  return { size: u8.length, read: async (off, len) => u8.slice(off, off + len) };
}

// ───────────── helpers ─────────────
const ascii = (u8, o, n) => String.fromCharCode(...u8.subarray(o, o + n));
const u16le = (u8, o) => (u8[o] | (u8[o + 1] << 8)) & 0xffff;
const u32le = (u8, o) => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;
function putU32le(u8, o, v) { u8[o] = v & 255; u8[o + 1] = (v >>> 8) & 255; u8[o + 2] = (v >>> 16) & 255; u8[o + 3] = (v >>> 24) & 255; }
function putU16le(u8, o, v) { u8[o] = v & 255; u8[o + 1] = (v >>> 8) & 255; }
function putU16be(u8, o, v) { u8[o] = (v >>> 8) & 255; u8[o + 1] = v & 255; }
function putU32be(u8, o, v) { u8[o] = (v >>> 24) & 255; u8[o + 1] = (v >>> 16) & 255; u8[o + 2] = (v >>> 8) & 255; u8[o + 3] = v & 255; }
function putBothEndianU16(u8, o, v) { putU16le(u8, o, v); putU16be(u8, o + 2, v); }
function putBothEndianU32(u8, o, v) { putU32le(u8, o, v); putU32be(u8, o + 4, v); }
const eqBytes = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

async function findDescriptors(r) {
  const out = { pvd: null, joliet: null };
  for (let i = 0; i < 32; i++) {
    const lba = 16 + i;
    const d = await r.read(lba * SECTOR, SECTOR);
    if (d.length < SECTOR || ascii(d, 1, 5) !== 'CD001') {
      if (i === 0) throw new Error('Descritor ISO9660 (CD001) não encontrado no setor 16. Só ISO de 2048 bytes/setor é suportada.');
      break;
    }
    if (d[0] === 255) break;
    if (d[0] === 1 && !out.pvd) out.pvd = { lba, data: d };
    if (d[0] === 2 && !out.joliet && d[88] === 0x25 && d[89] === 0x2f && [0x40, 0x43, 0x45].includes(d[90])) out.joliet = { lba, data: d };
  }
  if (!out.pvd) throw new Error('Primary Volume Descriptor não encontrado.');
  return out;
}

function decodeStr(u8, ucs2) {
  let s = '';
  if (ucs2) { for (let i = 0; i + 1 < u8.length; i += 2) s += String.fromCharCode((u8[i] << 8) | u8[i + 1]); }
  else s = String.fromCharCode(...u8);
  return s.replace(/[\u0000 ]+$/g, '');
}

function encodeStr(str, len, ucs2) {
  const out = new Uint8Array(len);
  if (ucs2) {
    for (let i = 0; i < len; i += 2) { out[i] = 0x00; out[i + 1] = 0x20; }
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); out[i * 2] = c >> 8; out[i * 2 + 1] = c & 255; }
  } else {
    out.fill(0x20);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  }
  return out;
}

function parseDate(u8, o) {
  const s = ascii(u8, o, 16);
  if (/^0+$/.test(s) || !/^\d{16}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
}

function encodeDate(v) {
  const out = new Uint8Array(17);
  if (v === null || v === '') { out.fill(0x30, 0, 16); out[16] = 0; return out; }
  const d = v === 'now' ? new Date() : (v instanceof Date ? v : new Date(v));
  if (isNaN(d)) throw new Error('Data inválida: ' + v);
  const p = (n, w) => String(n).padStart(w, '0');
  const s = p(d.getUTCFullYear(), 4) + p(d.getUTCMonth() + 1, 2) + p(d.getUTCDate(), 2) +
            p(d.getUTCHours(), 2) + p(d.getUTCMinutes(), 2) + p(d.getUTCSeconds(), 2) + '00';
  for (let i = 0; i < 16; i++) out[i] = s.charCodeAt(i);
  out[16] = 0; // UTC
  return out;
}

// ───────────── leitura ─────────────
export async function readIsoInfo(r) {
  const { pvd, joliet } = await findDescriptors(r);
  const fields = {};
  for (const [k, f] of Object.entries(FIELDS)) fields[k] = decodeStr(pvd.data.subarray(f.off, f.off + f.len), false);
  const numbers = {};
  for (const [k, f] of Object.entries(NUM_FIELDS)) numbers[k] = u16le(pvd.data, f.off);
  const info = {};
  info.logicalBlockSize = u16le(pvd.data, READONLY_NUM.logicalBlockSize.off);
  info.volumeSpaceSize = u32le(pvd.data, READONLY_NUM.volumeSpaceSize.off);
  info.pathTableSize = u32le(pvd.data, READONLY_NUM.pathTableSize.off);
  const dates = {};
  for (const [k, o] of Object.entries(DATES)) dates[k] = parseDate(pvd.data, o);
  return {
    fields, numbers, info, dates, hasJoliet: !!joliet,
    lock: parseLockRecord(pvd.data.subarray(APP_USE.off, APP_USE.off + APP_USE.len)),
  };
}

// ───────────── edição de campos ─────────────
// changes: { volumeId:'MEU_JOGO', publisherId:'...', numbers:{volumeSetSize:1}, dates:{ modified:'now' } }
// campo de texto undefined = não mexe; '' = limpa (espaços). Número undefined = não mexe.
// Valida um objeto "changes" SEM tocar em nenhuma ISO (serve para checar um manifesto de patch antes de gravar
// qualquer coisa). Lança erro em valor inválido; devolve a lista de avisos não-fatais.
export function validateMetaChanges(changes) {
  const warnings = [];
  for (const [k, f] of Object.entries(FIELDS)) {
    const v = changes[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') throw new Error(`${f.label}: valor precisa ser texto.`);
    if (!/^[\x20-\x7e]*$/.test(v)) throw new Error(`${f.label}: só ASCII imprimível é aceito no ISO9660.`);
    if (v.length > f.len) throw new Error(`${f.label}: máximo de ${f.len} caracteres (recebido ${v.length}).`);
    if ((k === 'volumeId' || k === 'systemId') && !/^[A-Z0-9_. ]*$/.test(v)) warnings.push(`${f.label}: fora do conjunto estrito ISO9660 (A-Z, 0-9, _). Funciona na prática, mas ferramentas rígidas podem reclamar.`);
  }
  for (const [k, f] of Object.entries(NUM_FIELDS)) {
    const v = changes.numbers?.[k];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new Error(`${f.label}: valor precisa ser um inteiro entre 0 e 65535 (recebido ${v}).`);
  }
  for (const k of Object.keys(DATES)) {
    const v = changes.dates?.[k];
    if (v !== undefined) encodeDate(v); // lança se a data for inválida
  }
  return warnings;
}

export async function buildMetaPatches(r, changes, opts = {}) {
  const { pvd, joliet } = await findDescriptors(r);
  const patches = [];
  const warnings = validateMetaChanges(changes);
  const touchJoliet = joliet && opts.joliet !== false;

  for (const [k, f] of Object.entries(FIELDS)) {
    const v = changes[k];
    if (v === undefined) continue;
    patches.push({ offset: PVD_OFF + f.off, data: encodeStr(v, f.len, false) });
    if (touchJoliet && f.len >= 32 && k !== 'copyrightFile' && k !== 'abstractFile' && k !== 'biblioFile') {
      const jlen = f.len - (f.len % 2);
      const jv = v.slice(0, jlen / 2);
      patches.push({ offset: joliet.lba * SECTOR + f.off, data: encodeStr(jv, jlen, true) });
    }
  }
  for (const [k, f] of Object.entries(NUM_FIELDS)) {
    const v = changes.numbers?.[k];
    if (v === undefined) continue;
    const b = new Uint8Array(4); putBothEndianU16(b, 0, v);
    patches.push({ offset: PVD_OFF + f.off, data: b });
    if (touchJoliet) patches.push({ offset: joliet.lba * SECTOR + f.off, data: b });
  }
  for (const [k, o] of Object.entries(DATES)) {
    const v = changes.dates?.[k];
    if (v === undefined) continue;
    const d = encodeDate(v);
    patches.push({ offset: PVD_OFF + o, data: d });
    if (touchJoliet) patches.push({ offset: joliet.lba * SECTOR + o, data: d });
  }
  return { patches, warnings };
}

// ───────────── trava com senha (reversível, multi-arquivo) ─────────────
// Cifra uma LISTA de arquivos (ELF de boot + opcionalmente outros, ex. IOPRP300.IMG)
// com AES-256-CTR, mesmo tamanho cada um, layout intacto. A ISO fica sem boot até
// ser destravada com a senha. Os parâmetros ficam no campo "Application Use" (512
// bytes) do PVD, que o padrão reserva para uso livre. Até 8 arquivos cabem nesse
// espaço (64 bytes de cabeçalho + 56 bytes por arquivo).
const MAGIC = 'RAIDENLK';
const LOCK_VERSION = 2;
const MAX_LOCKED_FILES = 8;
const ENTRY_LEN = 56; // lba(4) + size(4) + nonce(16) + sha256(32)
// magic(8) + version(1) + filler(1) + count(1) + reservado(1) + iterations(4) + salt(16) + mac(32) = 64
const HEADER_LEN = 64;
const subtle = () => globalThis.crypto.subtle;

function parseLockRecord(u8) {
  if (ascii(u8, 0, 8) !== MAGIC) return null;
  if (u8[8] !== LOCK_VERSION) throw new Error(`Registro de trava de versão desconhecida (${u8[8]}). Esta ISO foi travada com uma versão incompatível do raiden_isometa.js.`);
  const count = u8[10];
  const iterations = u32le(u8, 12);
  const salt = u8.slice(16, 32);
  const mac = u8.slice(32, 64);
  const files = [];
  let p = HEADER_LEN;
  for (let i = 0; i < count; i++) {
    files.push({
      lba: u32le(u8, p), size: u32le(u8, p + 4),
      nonce: u8.slice(p + 8, p + 24), sha256: u8.slice(p + 24, p + 56),
    });
    p += ENTRY_LEN;
  }
  return { version: u8[8], filler: u8[9], count, iterations, salt, mac, files, raw: u8 };
}

async function deriveKeys(password, salt, iterations) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  return { encKey: bits.slice(0, 32), macKey: bits.slice(32, 64) };
}
const aesKey = (k) => subtle().importKey('raw', k, 'AES-CTR', false, ['encrypt', 'decrypt']);
async function hmac(macKey, data) {
  const k = await subtle().importKey('raw', macKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, data));
}
const sha256 = async (d) => new Uint8Array(await subtle().digest('SHA-256', d));

async function scanRootDir(r, pvd) {
  const root = pvd.data.subarray(156, 190);
  const dirLba = u32le(root, 2), dirSize = u32le(root, 10);
  const dir = await r.read(dirLba * SECTOR, dirSize);
  const entries = [];
  let pos = 0;
  while (pos < dir.length) {
    const len = dir[pos];
    if (len === 0) { pos = (Math.floor(pos / SECTOR) + 1) * SECTOR; continue; }
    const idLen = dir[pos + 32];
    const name = ascii(dir, pos + 33, idLen).replace(/;\d+$/, '').toUpperCase();
    entries.push({
      name, lba: u32le(dir, pos + 2), size: u32le(dir, pos + 10), isDir: !!(dir[pos + 25] & 2),
      recOffset: dirLba * SECTOR + pos, // offset absoluto do início do registro na imagem
    });
    pos += len;
  }
  return entries;
}

async function findBootFile(r, pvd) {
  const entries = await scanRootDir(r, pvd);
  const cnf = entries.find((e) => e.name === 'SYSTEM.CNF');
  if (!cnf) throw new Error('SYSTEM.CNF não encontrado na raiz da ISO.');
  const text = ascii(await r.read(cnf.lba * SECTOR, Math.min(cnf.size, 4096)), 0, Math.min(cnf.size, 4096));
  const m = text.match(/BOOT2?\s*=\s*cdrom0:\\?([^;\s\r\n]+)/i);
  if (!m) throw new Error('Linha BOOT2 não encontrada no SYSTEM.CNF.');
  const bootName = m[1].replace(/^[\\/]+/, '').toUpperCase();   // aceita cdrom0:\SLUS e cdrom0:/SLUS
  if (bootName.includes('\\') || bootName.includes('/')) throw new Error('ELF de boot em subpasta não é suportado: ' + bootName);
  const elf = entries.find((e) => e.name === bootName && !e.isDir);
  if (!elf) throw new Error('ELF de boot não encontrado na raiz: ' + bootName);
  return { ...elf, name: bootName };
}

// ───────────── wrapper de créditos + mídia (imagem OU vídeo .PSS) + verificação ─────────────
// Não move nem reescreve o ELF original: ele fica intacto onde está.
// Anexa um ELF "wrapper" pré-compilado (feito uma vez com PS2SDK) no fim da ISO,
// grava nele (via marcadores) o LBA/tamanho/hash do ELF original + os hashes de
// verificação + o texto dos créditos + (opcional) uma mídia de abertura, e só altera
// a ENTRADA DE DIRETÓRIO do ELF de boot para apontar para o wrapper. Em tempo de
// boot, o wrapper mostra os créditos (texto + imagem, ou texto + vídeo .PSS), confere
// os hashes e, se baterem, lê o ELF original direto do LBA gravado e salta para ele;
// se não baterem, mostra um aviso.
//
// A mídia (imagem ou .PSS) NÃO vira um arquivo na árvore ISO9660 — ela é anexada
// como bytes crus logo depois do wrapper (sector-alinhada) e referenciada só por
// LBA/tamanho, exatamente como o próprio ELF original é referenciado pelo wrapper.
// Isso evita ter que recriar/realocar o diretório raiz (que exigiria deslocar o LBA
// de todo arquivo que vem depois dele na imagem) só para registrar um arquivo novo.
const WB_MARK = 'RAIDENBOOT';   // + u32 origLba, u32 origSize, 32 bytes sha256(ELF original)
const WC_MARK = 'RAIDENCREDIT'; // + 1 byte len, até 255 bytes de texto UTF-8 (ASCII recomendado), resto zerado
const WH_MARK = 'RAIDENHASH1';  // + u16 count, N * (u32 lba, u32 size, 32 bytes sha256) — arquivos extras a verificar
// + u8 mediaType (0=nenhuma,1=imagem,2=filme .PSS), u32 lba, u32 size,
//   u16 width, u16 height (só p/ imagem; 0 em filme), u16 durationSec (0 = tela de
//   imagem some só ao apertar um botão; filme sempre toca inteiro), u8[1] reservado
const WM_MARK = 'RAIDENMEDIA';
const WF_MARK = 'RAIDENFAIL';   // + 1 byte len, até 255 bytes (Latin-1/ASCII): mensagem exibida (e que trava) quando a verificação de integridade falha
const WK_MARK = 'RAIDENCAPS';   // + 1 byte de capacidades compiladas no wrapper: bit0 = reproduz filme .PSS. Opcional (wrappers antigos não têm)
export const CAPS = { MOVIE: 1 };
export const FAIL_TEXT_MAX = 255;
export const MEDIA_TYPE = { NONE: 0, IMAGE: 1, MOVIE_PSS: 2 };
const VOL_SPACE_OFF = 80; // Volume Space Size (PVD), 8 bytes both-endian

function findMarker(buf, marker) {
  const m = new TextEncoder().encode(marker);
  outer: for (let i = 0; i <= buf.length - m.length; i++) {
    for (let j = 0; j < m.length; j++) if (buf[i + j] !== m[j]) continue outer;
    return i + m.length; // retorna o offset logo após o texto do marcador
  }
  return -1;
}
function requireMarker(buf, marker, minBytesAfter) {
  const off = findMarker(buf, marker);
  if (off === -1) throw new Error(`Marcador "${marker}" não encontrado no wrapper. O .elf precisa reservar esse marcador (ver template em C).`);
  if (off + minBytesAfter > buf.length) throw new Error(`Marcador "${marker}" encontrado perto demais do fim do arquivo; não há espaço reservado suficiente.`);
  return off;
}

// Monta (sem tocar na ISO ainda) a imagem/vídeo + o wrapper num único blob anexável,
// e devolve os patches de diretório/PVD + o bloco a anexar no fim do arquivo.
export async function buildCreditsWrapperPatches(r, wrapperTemplate, opts = {}) {
  const { pvd } = await findDescriptors(r);
  const elf = await findBootFile(r, pvd);
  const origBytes = await r.read(elf.lba * SECTOR, elf.size);
  const origHash = await sha256(origBytes);

  const wrapper = new Uint8Array(wrapperTemplate); // cópia editável

  // Grava LBA/tamanho/hash do ELF original
  const bOff = requireMarker(wrapper, WB_MARK, 4 + 4 + 32);
  putU32le(wrapper, bOff, elf.lba);
  putU32le(wrapper, bOff + 4, elf.size);
  wrapper.set(origHash, bOff + 8);

  // Texto dos créditos (opcional)
  if (opts.credits !== undefined) {
    const cOff = requireMarker(wrapper, WC_MARK, 256);
    const bytes = new TextEncoder().encode(opts.credits);
    if (bytes.length > 255) throw new Error('Texto de créditos limitado a 255 bytes nesse template.');
    wrapper.fill(0, cOff, cOff + 256);
    wrapper[cOff] = bytes.length;
    wrapper.set(bytes, cOff + 1);
  }

  // Mensagem de falha de integridade (opcional)
  if (opts.failText !== undefined) {
    const fOff = requireMarker(wrapper, WF_MARK, 256);
    const fb = new TextEncoder().encode(opts.failText);
    if (fb.length > FAIL_TEXT_MAX) throw new Error('Mensagem de falha limitada a 255 bytes nesse template.');
    wrapper.fill(0, fOff, fOff + 256);
    wrapper[fOff] = fb.length;
    wrapper.set(fb, fOff + 1);
  }
  if (opts.media?.type === 'movie') {
    const kOff = findMarker(wrapper, WK_MARK);
    if (kOff !== -1 && !(wrapper[kOff] & CAPS.MOVIE)) throw new Error('Este wrapper foi compilado sem suporte a filme (.PSS). Use imagem ou recompile com RAIDEN_WITH_MOVIE=1.');
  }

  // Hashes extras de integridade (arquivos-chave além do ELF, opcional)
  const extra = opts.verifyFiles ?? [];
  if (extra.length > 2) throw new Error('O wrapper reserva espaço para no máximo 2 arquivos extras de verificação.');
  if (extra.length) {
    const hOff = requireMarker(wrapper, WH_MARK, 2 + extra.length * 40);
    wrapper[hOff] = extra.length & 255; wrapper[hOff + 1] = (extra.length >> 8) & 255;
    const entries = await scanRootDir(r, pvd);
    let p = hOff + 2;
    for (const name of extra) {
      const e = entries.find((x) => x.name === name.toUpperCase() && !x.isDir);
      if (!e) throw new Error(`Arquivo a verificar não encontrado na raiz: ${name}`);
      const data = await r.read(e.lba * SECTOR, e.size);
      putU32le(wrapper, p, e.lba); putU32le(wrapper, p + 4, e.size);
      wrapper.set(await sha256(data), p + 8);
      p += 40;
    }
  }

  // Anexa o wrapper sector-alinhado no fim da imagem atual
  const curSectors = Math.ceil(r.size / SECTOR);
  let nextLba = curSectors;
  const wrapLba = nextLba;
  const wrapSectors = Math.ceil(wrapper.length / SECTOR);
  nextLba += wrapSectors;

  // Mídia de abertura (opcional): imagem crua OU vídeo .PSS, anexada logo após o wrapper.
  // opts.media: { type: 'image'|'movie', data: Uint8Array, width?, height?, durationSec? }
  let mediaBlock = null;
  if (opts.media) {
    const { type, data } = opts.media;
    if (!(data instanceof Uint8Array) || !data.length) throw new Error('opts.media.data precisa ser um Uint8Array não-vazio.');
    const typeCode = type === 'image' ? MEDIA_TYPE.IMAGE : type === 'movie' ? MEDIA_TYPE.MOVIE_PSS : null;
    if (typeCode === null) throw new Error(`opts.media.type inválido: ${type} (use 'image' ou 'movie').`);
    if (typeCode === MEDIA_TYPE.IMAGE && (!opts.media.width || !opts.media.height)) throw new Error('opts.media.width/height são obrigatórios para type:"image" (o wrapper precisa saber a resolução pra fazer upload de textura).');

    const mOff = requireMarker(wrapper, WM_MARK, 1 + 4 + 4 + 2 + 2 + 2 + 1);
    const mediaLba = nextLba;
    const mediaSectors = Math.ceil(data.length / SECTOR);
    wrapper[mOff] = typeCode;
    putU32le(wrapper, mOff + 1, mediaLba);
    putU32le(wrapper, mOff + 5, data.length);
    putU16le(wrapper, mOff + 9, opts.media.width ?? 0);
    putU16le(wrapper, mOff + 11, opts.media.height ?? 0);
    putU16le(wrapper, mOff + 13, opts.media.durationSec ?? 0);
    wrapper[mOff + 15] = 0; // reservado

    const mediaPadded = new Uint8Array(mediaSectors * SECTOR);
    mediaPadded.set(data);
    mediaBlock = { lba: mediaLba, sectors: mediaSectors, padded: mediaPadded };
    nextLba += mediaSectors;
  } else {
    // Garante que, se o template tiver o marcador, ele fique com type=NONE explicitamente
    // (em vez de lixo de fábrica), pra o wrapper só mostrar texto e seguir pro jogo.
    const mOff = findMarker(wrapper, WM_MARK);
    if (mOff !== -1 && mOff + 16 <= wrapper.length) {
      wrapper[mOff] = MEDIA_TYPE.NONE;
      putU32le(wrapper, mOff + 1, 0); putU32le(wrapper, mOff + 5, 0);
      putU16le(wrapper, mOff + 9, 0); putU16le(wrapper, mOff + 11, 0); putU16le(wrapper, mOff + 13, 0);
    }
  }

  const padded = new Uint8Array(wrapSectors * SECTOR);
  padded.set(wrapper);

  // Redireciona a entrada de diretório do ELF de boot para o wrapper
  const patches = [
    { offset: elf.recOffset + 2, data: (() => { const b = new Uint8Array(8); putBothEndianU32(b, 0, wrapLba); return b; })() },
    { offset: elf.recOffset + 10, data: (() => { const b = new Uint8Array(8); putBothEndianU32(b, 0, wrapper.length); return b; })() },
    { offset: VOL_SPACE_OFF, data: (() => { const b = new Uint8Array(8); putBothEndianU32(b, 0, nextLba); return b; })() }, // dentro do PVD
  ];
  // offset do campo de Volume Space Size é relativo ao PVD inteiro
  patches[2].offset += PVD_OFF;

  const appends = [{ offset: wrapLba * SECTOR, data: padded }];
  if (mediaBlock) appends.push({ offset: mediaBlock.lba * SECTOR, data: mediaBlock.padded });

  return {
    patches,
    appends, // aplique em ordem no fim do arquivo (o patcher precisa crescer o arquivo até offset+data.length do último)
    append: appends[0], // retrocompatibilidade com quem só esperava um único "append" (sem mídia)
    wrapLba, wrapSize: wrapper.length,
    media: mediaBlock ? { lba: mediaBlock.lba, size: opts.media.data.length } : null,
    bootFile: elf.name,
  };
}

// Carrega o .elf do wrapper (compilado uma vez com o PS2SDK) e confere que parece mesmo um wrapper:
// cabeçalho ELF + os quatro marcadores. Devolve null se não existir/for inválido (nunca lança), para a UI
// poder desabilitar a opção de créditos em vez de gerar uma ISO que não inicia.
export const WRAPPER_URL = '/scripts/raiden_wrapper.elf';
export async function fetchWrapperTemplate(url = WRAPPER_URL) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const u8 = new Uint8Array(await res.arrayBuffer());
    if (u8.length < 64 || u8[0] !== 0x7f || u8[1] !== 0x45 || u8[2] !== 0x4c || u8[3] !== 0x46) return null;
    for (const m of [WB_MARK, WC_MARK, WH_MARK, WM_MARK, WF_MARK]) if (findMarker(u8, m) === -1) return null;
    return u8;
  } catch (_) { return null; }
}

// Útil para depurar/testar um wrapper já gravado, sem precisar do PS2.
export function readWrapperMarkers(wrapper) {
  const out = {};
  const bOff = findMarker(wrapper, WB_MARK);
  if (bOff !== -1) out.boot = { lba: u32le(wrapper, bOff), size: u32le(wrapper, bOff + 4), sha256: wrapper.slice(bOff + 8, bOff + 40) };
  const cOff = findMarker(wrapper, WC_MARK);
  if (cOff !== -1) { const len = wrapper[cOff]; out.credits = new TextDecoder().decode(wrapper.slice(cOff + 1, cOff + 1 + len)); }
  const fOff2 = findMarker(wrapper, WF_MARK);
  if (fOff2 !== -1) out.failText = new TextDecoder().decode(wrapper.slice(fOff2 + 1, fOff2 + 1 + wrapper[fOff2]));
  const kOff2 = findMarker(wrapper, WK_MARK);
  if (kOff2 !== -1) out.caps = { movie: !!(wrapper[kOff2] & CAPS.MOVIE) };
  const hOff = findMarker(wrapper, WH_MARK);
  if (hOff !== -1) {
    const count = wrapper[hOff] | (wrapper[hOff + 1] << 8);
    out.extra = [];
    let p = hOff + 2;
    for (let i = 0; i < count; i++) { out.extra.push({ lba: u32le(wrapper, p), size: u32le(wrapper, p + 4), sha256: wrapper.slice(p + 8, p + 40) }); p += 40; }
  }
  const mOff = findMarker(wrapper, WM_MARK);
  if (mOff !== -1 && mOff + 16 <= wrapper.length) {
    const type = wrapper[mOff];
    out.media = type === MEDIA_TYPE.NONE ? null : {
      type: type === MEDIA_TYPE.IMAGE ? 'image' : type === MEDIA_TYPE.MOVIE_PSS ? 'movie' : 'desconhecido',
      lba: u32le(wrapper, mOff + 1), size: u32le(wrapper, mOff + 5),
      width: u16le(wrapper, mOff + 9), height: u16le(wrapper, mOff + 11), durationSec: u16le(wrapper, mOff + 13),
    };
  }
  return out;
}

// opts.files: nomes extras a travar além do ELF de boot (ex.: ['IOPRP300.IMG']).
// O ELF de boot é sempre incluído automaticamente. Até MAX_LOCKED_FILES no total.
export async function buildLockPatches(r, password, opts = {}) {
  if (!password) throw new Error('Senha vazia.');
  const iterations = opts.iterations ?? 200000;
  const { pvd } = await findDescriptors(r);
  const app = pvd.data.subarray(APP_USE.off, APP_USE.off + APP_USE.len);
  if (parseLockRecord(app)) throw new Error('Esta ISO já está travada.');
  const uniform = app.every((b) => b === app[0]) && (app[0] === 0x00 || app[0] === 0x20);
  if (!uniform && !opts.force) throw new Error('O campo Application Use já tem conteúdo próprio; use force:true para sobrescrever (o original não poderá ser restaurado).');

  const bootElf = await findBootFile(r, pvd);
  const wantedNames = [bootElf.name, ...(opts.files ?? []).map((n) => n.toUpperCase())];
  const uniqueNames = [...new Set(wantedNames)];
  if (uniqueNames.length > MAX_LOCKED_FILES) throw new Error(`No máximo ${MAX_LOCKED_FILES} arquivos podem ser travados nesta versão (pediu ${uniqueNames.length}).`);

  const entries = await scanRootDir(r, pvd);
  const targets = uniqueNames.map((name) => {
    if (name === bootElf.name) return bootElf;
    const e = entries.find((x) => x.name === name && !x.isDir);
    if (!e) throw new Error(`Arquivo a travar não encontrado na raiz da ISO: ${name}`);
    return e;
  });
  const bootHeader = await r.read(bootElf.lba * SECTOR, 4);
  if (!(bootHeader[0] === 0x7f && bootHeader[1] === 0x45 && bootHeader[2] === 0x4c && bootHeader[3] === 0x46) && !opts.force)
    throw new Error(`${bootElf.name} não parece um ELF (cabeçalho 7F 45 4C 46 ausente).`);

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const { encKey, macKey } = await deriveKeys(password, salt, iterations);

  const patches = [];
  const fileEntries = [];
  for (const t of targets) {
    const plain = await r.read(t.lba * SECTOR, t.size);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-CTR', counter: nonce, length: 64 }, await aesKey(encKey), plain));
    patches.push({ offset: t.lba * SECTOR, data: cipher });
    fileEntries.push({ lba: t.lba, size: t.size, nonce, hash: await sha256(plain) });
  }

  const rec = new Uint8Array(APP_USE.len);
  for (let i = 0; i < 8; i++) rec[i] = MAGIC.charCodeAt(i);
  rec[8] = LOCK_VERSION;
  rec[9] = uniform ? app[0] : 0x00; // filler original, pra restaurar na destrava
  rec[10] = fileEntries.length;
  putU32le(rec, 12, iterations);
  rec.set(salt, 16);
  let p = HEADER_LEN;
  for (const f of fileEntries) {
    putU32le(rec, p, f.lba); putU32le(rec, p + 4, f.size);
    rec.set(f.nonce, p + 8); rec.set(f.hash, p + 24);
    p += ENTRY_LEN;
  }
  // MAC cobre o cabeçalho (sem o próprio campo de MAC) + todas as entradas.
  const forMac = new Uint8Array(32 + fileEntries.length * ENTRY_LEN);
  forMac.set(rec.subarray(0, 32), 0);
  forMac.set(rec.subarray(HEADER_LEN, HEADER_LEN + fileEntries.length * ENTRY_LEN), 32);
  rec.set(await hmac(macKey, forMac), 32);

  patches.push({ offset: PVD_OFF + APP_USE.off, data: rec });
  return { patches, files: targets.map((t) => t.name) };
}

export async function buildUnlockPatches(r, password) {
  const { pvd } = await findDescriptors(r);
  const lock = parseLockRecord(pvd.data.subarray(APP_USE.off, APP_USE.off + APP_USE.len));
  if (!lock) throw new Error('Esta ISO não está travada.');
  const { encKey, macKey } = await deriveKeys(password, lock.salt, lock.iterations);

  const forMac = new Uint8Array(32 + lock.count * ENTRY_LEN);
  forMac.set(lock.raw.subarray(0, 32), 0);
  forMac.set(lock.raw.subarray(HEADER_LEN, HEADER_LEN + lock.count * ENTRY_LEN), 32);
  const mac = await hmac(macKey, forMac);
  if (!eqBytes(mac, lock.mac)) throw new Error('Senha incorreta (ou o registro de trava foi alterado).');

  const patches = [];
  for (const f of lock.files) {
    const cipher = await r.read(f.lba * SECTOR, f.size);
    const plain = new Uint8Array(await subtle().decrypt({ name: 'AES-CTR', counter: f.nonce, length: 64 }, await aesKey(encKey), cipher));
    if (!eqBytes(await sha256(plain), f.sha256)) throw new Error(`Um dos arquivos travados (LBA ${f.lba}) foi modificado depois da trava: hash não confere.`);
    patches.push({ offset: f.lba * SECTOR, data: plain });
  }
  const app = new Uint8Array(APP_USE.len).fill(lock.filler);
  patches.push({ offset: PVD_OFF + APP_USE.off, data: app });
  return { patches, files: lock.files.map((f) => ({ lba: f.lba, size: f.size })) };
}

// Para o patcher/criador recusarem ISOs travadas:
export async function isLocked(r) { return !!(await readIsoInfo(r)).lock; }

// ───────────── aplicação dos patches ─────────────
export function applyPatchesToBuffer(u8, patches) {
  for (const p of patches) u8.set(p.data, p.offset);
  return u8;
}
// Cresce um buffer para caber um ou mais blocos "append" (fim do arquivo) e aplica.
// Use isto quando buildCreditsWrapperPatches() devolver `appends` com mídia incluída.
export function growAndApplyAppends(u8, appends) {
  const end = Math.max(u8.length, ...appends.map((a) => a.offset + a.data.length));
  let out = u8;
  if (end > u8.length) { out = new Uint8Array(end); out.set(u8); }
  for (const a of appends) out.set(a.data, a.offset);
  return out;
}
// Edição in-place no navegador (File System Access API): handle de showOpenFilePicker()
export async function applyPatchesInPlace(fileHandle, patches) {
  const w = await fileHandle.createWritable({ keepExistingData: true });
  try { for (const p of patches) await w.write({ type: 'write', position: p.offset, data: p.data }); }
  finally { await w.close(); }
}
// Variante que também escreve os blocos anexados (cresce o arquivo).
export async function applyPatchesAndAppendsInPlace(fileHandle, patches, appends) {
  const w = await fileHandle.createWritable({ keepExistingData: true });
  try {
    for (const p of patches) await w.write({ type: 'write', position: p.offset, data: p.data });
    for (const a of appends) await w.write({ type: 'write', position: a.offset, data: a.data });
  } finally { await w.close(); }
}
