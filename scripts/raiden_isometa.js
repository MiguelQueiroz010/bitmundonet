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

// ───────────── UDF 1.02 helpers (ECMA-167 / OSTA) ─────────────
const UDF_CRC_TABLE = new Uint16Array([
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7,
  0x8108, 0x9129, 0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF,
  0x1231, 0x0210, 0x3273, 0x2252, 0x52B5, 0x4294, 0x72F7, 0x62D6,
  0x9339, 0x8318, 0xB37B, 0xA35A, 0xD3BD, 0xC39C, 0xF3FF, 0xE3DE,
  0x2462, 0x3443, 0x0420, 0x1401, 0x64E6, 0x74C7, 0x44A4, 0x5485,
  0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE, 0xF5CF, 0xC5AC, 0xD58D,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76D7, 0x66F6, 0x5695, 0x46B4,
  0xB75B, 0xA77A, 0x9719, 0x8738, 0xF7DF, 0xE7FE, 0xD79D, 0xC7BC,
  0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861, 0x2802, 0x3823,
  0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B,
  0x5AF5, 0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12,
  0xDBFD, 0xCBDC, 0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A,
  0x6CA6, 0x7C87, 0x4CE4, 0x5CC5, 0x2C22, 0x3C03, 0x0C60, 0x1C41,
  0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD, 0xAD2A, 0xBD0B, 0x8D68, 0x9D49,
  0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13, 0x2E32, 0x1E51, 0x0E70,
  0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A, 0x9F59, 0x8F78,
  0x9188, 0x81A9, 0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E, 0xE16F,
  0x1080, 0x00A1, 0x30C2, 0x20E3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C, 0xE37F, 0xF35E,
  0x02B1, 0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256,
  0xB5EA, 0xA5CB, 0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D,
  0x34E2, 0x24C3, 0x14A0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
  0xA7DB, 0xB7FA, 0x8799, 0x97B8, 0xE75F, 0xF77E, 0xC71D, 0xD73C,
  0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9, 0xB98A, 0xA9AB,
  0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882, 0x28A3,
  0xCB7D, 0xDB5C, 0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A,
  0x4A75, 0x5A54, 0x6A37, 0x7A16, 0x0AF1, 0x1AD0, 0x2AB3, 0x3A92,
  0xFD2E, 0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B, 0x9DE8, 0x8DC9,
  0x7C26, 0x6C07, 0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1,
  0xEF1F, 0xFF3E, 0xCF5D, 0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8,
  0x6E17, 0x7E36, 0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0,
]);

function udfCrc(buf, len) {
  let crc = 0;
  for (let i = 0; i < len; i++) crc = UDF_CRC_TABLE[((crc >> 8) ^ buf[i]) & 0xff] ^ (crc << 8);
  return crc & 0xffff;
}

function udfTagChecksum(buf) {
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    if (i === 4) continue;
    sum = (sum + buf[i]) & 0xff;
  }
  return sum;
}

function makeUdfTagBuf(tagId, lba, crcLen, crc) {
  const b = new Uint8Array(16);
  putU16le(b, 0, tagId);
  putU16le(b, 2, 2); // UDF 1.02
  putU16le(b, 8, crc);
  putU16le(b, 10, crcLen);
  putU32le(b, 12, lba);
  b[4] = udfTagChecksum(b);
  return b;
}

function updateUdfSectorTag(sector, descriptorLen = 512) {
  const crcLen = descriptorLen - 16;
  const crc = crcLen > 0 ? udfCrc(sector.subarray(16, descriptorLen), crcLen) : 0;
  putU16le(sector, 8, crc);
  putU16le(sector, 10, crcLen);
  sector[4] = udfTagChecksum(sector.subarray(0, 16));
}

function decodeUdfName(u8) {
  if (!u8 || u8.length === 0) return '';
  const comp = u8[0];
  let s = '';
  if (comp === 8) {
    for (let i = 1; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  } else if (comp === 16) {
    for (let i = 1; i + 1 < u8.length; i += 2) s += String.fromCharCode((u8[i] << 8) | u8[i + 1]);
  }
  return s;
}

function makeUdfAvdpSector(lba, mainVdsLba = 32, reserveVdsLba = 48) {
  const s = new Uint8Array(2048);
  putU32le(s, 16, 0x8000);
  putU32le(s, 20, mainVdsLba);
  putU32le(s, 24, 0x8000);
  putU32le(s, 28, reserveVdsLba);
  const tag = makeUdfTagBuf(2, lba, 496, udfCrc(s.subarray(16, 512), 496));
  s.set(tag, 0);
  return s;
}

function makeUdfFileEntrySector(lba, isDir, dataSize, dataLba) {
  const s = new Uint8Array(2048);
  putU16le(s, 20, 4); // Strategy Type = 4
  putU16le(s, 24, 1); // Max Entry Number = 1
  s[27] = isDir ? 4 : 5; // File Type: 4=Dir, 5=File
  putU32le(s, 36, 0xffffffff);
  putU32le(s, 40, 0xffffffff);
  putU32le(s, 44, 0x14a5);
  putU16le(s, 48, 1);
  putU32le(s, 56, dataSize);
  putU32le(s, 64, Math.ceil(dataSize / 2048));
  putU32le(s, 108, 1);
  const impl = new TextEncoder().encode('DVD-ROM GENERATOR');
  s.set(impl, 129);
  putU32le(s, 168, 0x84); // EA Size = 132
  putU32le(s, 172, 8);    // Alloc Desc Size = 8

  // EA space (132 bytes) at offset 176..307
  putU32le(s, 192, 0x18);
  putU32le(s, 196, 0x84);
  const eaCrc = udfCrc(s.subarray(192, 200), 8);
  const eaTag = makeUdfTagBuf(0x106, lba, 8, eaCrc);
  s.set(eaTag, 176);

  putU32le(s, 200, 0x800);
  s[204] = 1;
  putU32le(s, 208, 0x34);
  putU32le(s, 212, 4);
  const freeEa = new TextEncoder().encode('*UDF FreeEASpace');
  s.set(freeEa, 217);
  s.set([2, 1], 240);
  putU16le(s, 248, 0x561);

  putU32le(s, 252, 0x800);
  s[256] = 1;
  putU32le(s, 260, 0x38);
  putU32le(s, 264, 8);
  const cgms = new TextEncoder().encode('*UDF DVD CGMS Info');
  s.set(cgms, 269);
  s.set([2, 1], 292);
  putU16le(s, 300, 0x549);

  // Alloc desc (short_ad) at offset 308
  putU32le(s, 308, dataSize);
  putU32le(s, 312, dataLba);

  const crc = udfCrc(s.subarray(16, 316), 300);
  const tag = makeUdfTagBuf(261, lba, 300, crc);
  s.set(tag, 0);
  return s;
}

function makeUdfFidBuf(lba, isDir, isParent, name, targetFeLogicalLba) {
  const nameBytes = new TextEncoder().encode(name);
  const nameUnicode = isParent ? new Uint8Array(0) : new Uint8Array(1 + nameBytes.length);
  if (!isParent) {
    nameUnicode[0] = 8; // CS0 (8-bit)
    nameUnicode.set(nameBytes, 1);
  }
  const nameLen = nameUnicode.length;
  const fidLen = (38 + nameLen + 3) & ~3;
  const buf = new Uint8Array(fidLen);
  putU16le(buf, 16, 1);
  let flags = 0;
  if (isDir) flags |= 0x02;
  if (isParent) flags |= 0x08;
  buf[18] = flags;
  buf[19] = nameLen;
  putU32le(buf, 20, 0x13c);
  putU32le(buf, 24, targetFeLogicalLba);
  putU16le(buf, 28, 0);
  if (nameLen > 0) buf.set(nameUnicode, 38);
  const payloadLen = fidLen - 16;
  const crc = udfCrc(buf.subarray(16, fidLen), payloadLen);
  const tag = makeUdfTagBuf(257, lba, payloadLen, crc);
  buf.set(tag, 0);
  return buf;
}

export async function readUdfInfo(r) {
  if (r.size < 257 * SECTOR) return { hasUdf: false };
  const avdpSec = await r.read(256 * SECTOR, SECTOR);
  const tagId = u16le(avdpSec, 0);
  if (tagId !== 2 || udfTagChecksum(avdpSec.subarray(0, 16)) !== avdpSec[4]) {
    const pvdSec = await r.read(32 * SECTOR, SECTOR);
    if (u16le(pvdSec, 0) !== 1 || udfTagChecksum(pvdSec.subarray(0, 16)) !== pvdSec[4]) {
      return { hasUdf: false };
    }
  }

  const mainVdsLba = u32le(avdpSec, 20) || 32;
  const reserveVdsLba = u32le(avdpSec, 28) || 48;

  let pdLba = null, lvdLba = null, pvdLba = null, iuvdLba = null;
  let partitionLba = 0, partitionLength = 0, lviLba = 64;

  for (let i = 0; i < 16; i++) {
    const lba = mainVdsLba + i;
    const sec = await r.read(lba * SECTOR, SECTOR);
    const id = u16le(sec, 0);
    if (id === 1 && !pvdLba) pvdLba = lba;
    if (id === 4 && !iuvdLba) iuvdLba = lba;
    if (id === 5 && !pdLba) {
      pdLba = lba;
      partitionLba = u32le(sec, 188);
      partitionLength = u32le(sec, 192);
    }
    if (id === 6 && !lvdLba) {
      lvdLba = lba;
      lviLba = u32le(sec, 436) || 64;
    }
    if (id === 8) break;
  }

  if (!pdLba || partitionLba === 0) return { hasUdf: false };

  let reservePdLba = null, reserveLvdLba = null, reservePvdLba = null, reserveIuvdLba = null;
  for (let i = 0; i < 16; i++) {
    const lba = reserveVdsLba + i;
    const sec = await r.read(lba * SECTOR, SECTOR);
    const id = u16le(sec, 0);
    if (id === 1 && !reservePvdLba) reservePvdLba = lba;
    if (id === 4 && !reserveIuvdLba) reserveIuvdLba = lba;
    if (id === 5 && !reservePdLba) reservePdLba = lba;
    if (id === 6 && !reserveLvdLba) reserveLvdLba = lba;
    if (id === 8) break;
  }

  let fileCount = 0, dirCount = 0;
  if (lviLba && lviLba * SECTOR < r.size) {
    const lviSec = await r.read(lviLba * SECTOR, SECTOR);
    if (u16le(lviSec, 0) === 9) {
      fileCount = u32le(lviSec, 120);
      dirCount = u32le(lviSec, 124);
    }
  }

  const fsdSec = await r.read(partitionLba * SECTOR, SECTOR);
  if (u16le(fsdSec, 0) !== 256) return { hasUdf: false };
  const rootFeLogicalLba = u32le(fsdSec, 404);

  const rootFeSec = await r.read((partitionLba + rootFeLogicalLba) * SECTOR, SECTOR);
  if (u16le(rootFeSec, 0) !== 261) return { hasUdf: false };
  const rootInfoSize = u32le(rootFeSec, 56);
  const eaLen = u32le(rootFeSec, 168);
  const rootFidTotalBytes = u32le(rootFeSec, 176 + eaLen);
  const rootFidLogicalLba = u32le(rootFeSec, 180 + eaLen);
  const rootFidSectors = Math.max(1, Math.ceil(rootFidTotalBytes / SECTOR));

  let cnfFeLogicalLba = null;
  let lastFidSectorLba = partitionLba + rootFidLogicalLba;
  let lastFidEnd = 0;
  let rootFidLogicalForNewEntry = rootFidLogicalLba;

  for (let s = 0; s < rootFidSectors; s++) {
    const secLba = partitionLba + rootFidLogicalLba + s;
    const secData = await r.read(secLba * SECTOR, SECTOR);
    let pos = 0;
    while (pos + 38 <= SECTOR) {
      const fidTagId = u16le(secData, pos);
      if (fidTagId !== 257) break;
      const nameLen = secData[pos + 19];
      const fidLen = (38 + nameLen + 3) & ~3;
      if (pos + fidLen > SECTOR) break;
      const name = decodeUdfName(secData.subarray(pos + 38, pos + 38 + nameLen)).toUpperCase();
      const targetFe = u32le(secData, pos + 24);
      if (name === 'SYSTEM.CNF') {
        cnfFeLogicalLba = targetFe;
      }
      pos += fidLen;
    }
    if (pos <= SECTOR) {
      lastFidSectorLba = secLba;
      lastFidEnd = pos;
      rootFidLogicalForNewEntry = rootFidLogicalLba + s;
    }
  }

  return {
    hasUdf: true,
    mainVdsLba, reserveVdsLba,
    pvdLba, iuvdLba, pdLba, lvdLba,
    reservePvdLba, reserveIuvdLba, reservePdLba, reserveLvdLba,
    lviLba, partitionLba, partitionLength,
    fileCount, dirCount,
    rootFeLogicalLba,
    rootInfoSize,
    rootFidLogicalLba: rootFidLogicalForNewEntry,
    rootFidTotalBytes,
    rootFidSectors,
    lastFidSectorLba,
    lastFidEnd,
    cnfFeLogicalLba,
  };
}

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
  let udf = { hasUdf: false };
  try { udf = await readUdfInfo(r); } catch (_) {}
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
    fields, numbers, info, dates, hasJoliet: !!joliet, hasUdf: udf.hasUdf,
    udf: udf.hasUdf ? udf : null,
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

  // Sincroniza metadados com descritores UDF 1.02 quando presentes
  if (changes.volumeId !== undefined) {
    try {
      const udf = await readUdfInfo(r);
      if (udf.hasUdf) {
        const v = changes.volumeId;
        // PVD (LBA 32 e Reserve)
        for (const lba of [udf.pvdLba, udf.reservePvdLba].filter(Boolean)) {
          const sec = new Uint8Array(await r.read(lba * SECTOR, SECTOR));
          sec[24] = 8; // CS0 (8-bit)
          for (let i = 0; i < 30; i++) sec[25 + i] = i < v.length ? v.charCodeAt(i) & 0xff : 0;
          sec[55] = Math.min(v.length, 30) + 1;
          updateUdfSectorTag(sec, 512);
          patches.push({ offset: lba * SECTOR, data: sec });
        }
        // IUVD (LBA 33 e Reserve)
        for (const lba of [udf.iuvdLba, udf.reserveIuvdLba].filter(Boolean)) {
          const sec = new Uint8Array(await r.read(lba * SECTOR, SECTOR));
          sec[116] = 8;
          for (let i = 0; i < 126; i++) sec[117 + i] = i < v.length ? v.charCodeAt(i) & 0xff : 0;
          sec[243] = Math.min(v.length, 126) + 1;
          updateUdfSectorTag(sec, 512);
          patches.push({ offset: lba * SECTOR, data: sec });
        }
        // LVD (LBA 35 e Reserve)
        for (const lba of [udf.lvdLba, udf.reserveLvdLba].filter(Boolean)) {
          const sec = new Uint8Array(await r.read(lba * SECTOR, SECTOR));
          sec[84] = 8;
          for (let i = 0; i < 126; i++) sec[85 + i] = i < v.length ? v.charCodeAt(i) & 0xff : 0;
          sec[211] = Math.min(v.length, 126) + 1;
          updateUdfSectorTag(sec, 512);
          patches.push({ offset: lba * SECTOR, data: sec });
        }
        // FSD (partitionLba)
        if (udf.partitionLba) {
          const sec = new Uint8Array(await r.read(udf.partitionLba * SECTOR, SECTOR));
          sec[112] = 8;
          for (let i = 0; i < 126; i++) sec[113 + i] = i < v.length ? v.charCodeAt(i) & 0xff : 0;
          sec[239] = Math.min(v.length, 126) + 1;
          updateUdfSectorTag(sec, 512);
          patches.push({ offset: udf.partitionLba * SECTOR, data: sec });
        }
      }
    } catch (_) {}
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
// O ELF original do jogo NÃO é movido, renomeado nem reescrito: continua na raiz, com o mesmo nome e no mesmo LBA
// (o jogo pode reler o próprio ELF do disco; redirecionar a entrada dele para o wrapper quebrava o carregamento).
// O wrapper é um ELF A MAIS: pré-compilado (feito uma vez com PS2SDK), anexado no fim da ISO, registrado como um
// arquivo novo na raiz (WRAPPER_NAME) e apontado pelo BOOT2 do SYSTEM.CNF. Nele (via marcadores) vão o LBA/tamanho/
// hash do ELF original, os hashes de verificação, o texto dos créditos e (opcional) uma mídia de abertura.
// Em tempo de boot o wrapper mostra os créditos (texto + imagem, ou texto + vídeo .PSS), confere os hashes e, se
// baterem, lê o ELF original direto do LBA gravado e salta para ele; se não baterem, mostra um aviso.
//
// Só mexe em: um registro novo no fim do diretório raiz (cabe sem realocar nada se sobrar espaço no setor), o tamanho
// e o texto do SYSTEM.CNF, e o tamanho do volume. A mídia (imagem ou .PSS) NÃO vira arquivo na árvore: é anexada
// como bytes crus logo depois do wrapper (setor-alinhada) e referenciada só por LBA/tamanho.
export const WRAPPER_NAME = 'RAIDEN.ELF';
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

// Registro ISO9660 de um arquivo (id "NOME;1"), copiando a data de gravação de um registro existente.
function makeFileRecord(name, lba, size, date7) {
  const id = new TextEncoder().encode(name + ';1');
  const len = 33 + id.length + (id.length % 2 === 0 ? 1 : 0);
  const b = new Uint8Array(len);
  b[0] = len;
  putBothEndianU32(b, 2, lba); putBothEndianU32(b, 10, size);
  if (date7) b.set(date7.subarray(0, 7), 18);
  putU16le(b, 28, 1); b[30] = 0; b[31] = 1;            // volume sequence number = 1 (both-endian)
  b[32] = id.length; b.set(id, 33);
  return b;
}

// Acha onde cabe um registro de `recLen` bytes no diretório raiz (fim da área usada de algum setor). Devolve o offset
// absoluto na imagem. Não reordena nem realoca: se não sobrar espaço, avisa (o diretório teria de crescer).
async function findRootSlot(r, pvd, recLen) {
  const root = pvd.data.subarray(156, 190);
  const dirLba = u32le(root, 2), dirSize = u32le(root, 10);
  const dir = await r.read(dirLba * SECTOR, dirSize);
  let slot = -1;
  for (let sec = 0; sec * SECTOR < dir.length; sec++) {
    let pos = sec * SECTOR; const end = Math.min(pos + SECTOR, dir.length);
    while (pos < end && dir[pos] !== 0) pos += dir[pos];
    if (pos + recLen <= end) slot = dirLba * SECTOR + pos;   // o último setor com espaço vence
  }
  if (slot < 0) throw new Error('O diretório raiz da ISO não tem espaço para o ELF de créditos (precisaria crescer).');
  return slot;
}

// Monta (sem tocar na ISO ainda) a imagem/vídeo + o wrapper num único blob anexável,
// e devolve os patches de diretório/PVD + o bloco a anexar no fim do arquivo.
export async function buildCreditsWrapperPatches(r, wrapperTemplate, opts = {}) {
  const { pvd } = await findDescriptors(r);
  const elf = await findBootFile(r, pvd);
  const rootEntries = await scanRootDir(r, pvd);
  if (rootEntries.some((e) => e.name === WRAPPER_NAME)) throw new Error(`A ISO já tem um arquivo ${WRAPPER_NAME} na raiz (créditos já aplicados?).`);
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

  // Registro novo do wrapper na raiz + BOOT2 do SYSTEM.CNF apontando para ele. O registro do ELF original não é tocado.
  const cnf = rootEntries.find((e) => e.name === 'SYSTEM.CNF');
  const cnfOld = await r.read(cnf.lba * SECTOR, cnf.size);
  const cnfText = ascii(cnfOld, 0, cnfOld.length);
  const cnfNewText = cnfText.replace(/(BOOT2\s*=\s*cdrom0:[\\/]?)[^;\s\r\n]+/i, (_, pre) => pre + WRAPPER_NAME);
  if (cnfNewText === cnfText) throw new Error('Não consegui reescrever a linha BOOT2 do SYSTEM.CNF.');
  const cnfNew = Uint8Array.from(cnfNewText, (c) => c.charCodeAt(0) & 255);
  const cnfRoom = Math.ceil(cnf.size / SECTOR) * SECTOR;
  if (cnfNew.length > cnfRoom) throw new Error('O SYSTEM.CNF novo não cabe no setor do original.');
  const cnfData = new Uint8Array(Math.max(cnfNew.length, cnf.size)); cnfData.set(cnfNew);   // zera o que sobrar do texto antigo
  const date7 = await r.read(cnf.recOffset + 18, 7);
  const rec = makeFileRecord(WRAPPER_NAME, wrapLba, wrapper.length, date7);
  const slot = await findRootSlot(r, pvd, rec.length);
  const patches = [
    { offset: slot, data: rec },
    { offset: cnf.lba * SECTOR, data: cnfData },
    { offset: cnf.recOffset + 10, data: (() => { const b = new Uint8Array(8); putBothEndianU32(b, 0, cnfNew.length); return b; })() },
  ];

  const appends = [{ offset: wrapLba * SECTOR, data: padded }];
  if (mediaBlock) appends.push({ offset: mediaBlock.lba * SECTOR, data: mediaBlock.padded });

  let finalTotalSectors = nextLba;

  // Sincronização UDF 1.02 completa (segurança e integridade equivalentes ao ISO9660)
  const udf = await readUdfInfo(r);
  if (udf.hasUdf) {
    // 1. Aloca File Entry (FE) para RAIDEN.ELF em UDF
    const raidenFeLba = nextLba++;
    const raidenFeLogicalLba = raidenFeLba - udf.partitionLba;
    const raidenFeSector = makeUdfFileEntrySector(raidenFeLogicalLba, false, wrapper.length, wrapLba - udf.partitionLba);
    appends.push({ offset: raidenFeLba * SECTOR, data: raidenFeSector });

    // 2. Insere FID para RAIDEN.ELF no diretório raiz do UDF
    const raidenFid = makeUdfFidBuf(udf.rootFidLogicalLba, false, false, WRAPPER_NAME, raidenFeLogicalLba);
    if (udf.lastFidEnd + raidenFid.length <= SECTOR) {
      patches.push({ offset: udf.lastFidSectorLba * SECTOR + udf.lastFidEnd, data: raidenFid });
      const neededSize = udf.lastFidEnd + raidenFid.length;
      if (neededSize > udf.rootInfoSize) {
        const rootFeSec = new Uint8Array(await r.read((udf.partitionLba + udf.rootFeLogicalLba) * SECTOR, SECTOR));
        putU32le(rootFeSec, 56, neededSize);
        putU32le(rootFeSec, 60, 0);
        // O Allocation Descriptor (short_ad) do diretório também precisa cobrir o FID novo — se só o
        // InfoSize crescer, o descritor de alocação continua dizendo que o extent tem o tamanho antigo,
        // e um leitor UDF que confia nele (em vez de assumir que o resto está logo depois) não vê o
        // arquivo novo: a ISO9660 mostraria RAIDEN.ELF mas o UDF, não — os dois precisam concordar.
        const eaLen = u32le(rootFeSec, 168);
        putU32le(rootFeSec, 176 + eaLen, neededSize);
        updateUdfSectorTag(rootFeSec, 316);
        patches.push({ offset: (udf.partitionLba + udf.rootFeLogicalLba) * SECTOR, data: rootFeSec.subarray(0, 316) });
      }
    }

    // 3. Atualiza File Entry do SYSTEM.CNF em UDF
    if (udf.cnfFeLogicalLba !== null) {
      const cnfFeSec = new Uint8Array(await r.read((udf.partitionLba + udf.cnfFeLogicalLba) * SECTOR, SECTOR));
      if (u16le(cnfFeSec, 0) === 261) {
        putU32le(cnfFeSec, 56, cnfNew.length);
        putU32le(cnfFeSec, 60, 0);
        putU32le(cnfFeSec, 64, Math.ceil(cnfNew.length / SECTOR));
        putU32le(cnfFeSec, 68, 0);
        const cnfEaLen = u32le(cnfFeSec, 168);
        putU32le(cnfFeSec, 176 + cnfEaLen, cnfNew.length);
        updateUdfSectorTag(cnfFeSec, 316);
        patches.push({ offset: (udf.partitionLba + udf.cnfFeLogicalLba) * SECTOR, data: cnfFeSec.subarray(0, 316) });
      }
    }

    // 4. Calcula novo total de setores (alinhamento ECC PS2 de 16 setores + 256 setores para AVDP de backup)
    finalTotalSectors = ((nextLba + 256 + 15) & ~15);
    const newPartLength = Math.max(0, finalTotalSectors - udf.partitionLba);

    // 5. Atualiza Partition Descriptors (Main e Reserve)
    for (const lba of [udf.pdLba, udf.reservePdLba].filter(Boolean)) {
      const sec = new Uint8Array(await r.read(lba * SECTOR, SECTOR));
      putU32le(sec, 192, newPartLength);
      updateUdfSectorTag(sec, 512);
      patches.push({ offset: lba * SECTOR, data: sec });
    }

    // 6. Atualiza Logical Volume Integrity (LVI)
    if (udf.lviLba && udf.lviLba * SECTOR < r.size) {
      const lviSec = new Uint8Array(await r.read(udf.lviLba * SECTOR, SECTOR));
      if (u16le(lviSec, 0) === 9) {
        putU32le(lviSec, 84, newPartLength);
        putU32le(lviSec, 120, udf.fileCount + 1);
        updateUdfSectorTag(lviSec, 136);
        patches.push({ offset: udf.lviLba * SECTOR, data: lviSec });
      }
    }

    // 7. Backup AVDPs nos setores finais
    const backupAvdp1 = makeUdfAvdpSector(finalTotalSectors - 256, udf.mainVdsLba, udf.reserveVdsLba);
    const backupAvdp2 = makeUdfAvdpSector(finalTotalSectors - 1, udf.mainVdsLba, udf.reserveVdsLba);
    appends.push({ offset: (finalTotalSectors - 256) * SECTOR, data: backupAvdp1 });
    appends.push({ offset: (finalTotalSectors - 1) * SECTOR, data: backupAvdp2 });
  }

  // 8. Atualiza ISO9660 PVD Volume Space Size
  patches.push({
    offset: PVD_OFF + VOL_SPACE_OFF,
    data: (() => { const b = new Uint8Array(8); putBothEndianU32(b, 0, finalTotalSectors); return b; })(),
  });

  return {
    patches,
    appends, // aplique em ordem no fim do arquivo (o patcher precisa crescer o arquivo até offset+data.length do último)
    append: appends[0], // retrocompatibilidade com quem só esperava um único "append" (sem mídia)
    wrapLba, wrapSize: wrapper.length,
    media: mediaBlock ? { lba: mediaBlock.lba, size: opts.media.data.length } : null,
    bootFile: WRAPPER_NAME,      // o que o BOOT2 aponta agora
    origBootFile: elf.name,      // ELF do jogo, intacto
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
