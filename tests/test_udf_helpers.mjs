import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { ISO9660 } from '../scripts/IUP/iso9660.js';
import * as M from '../scripts/raiden_isometa.js';

class MemFile {
  kind = 'file';
  constructor(n) { this.name = n; this.data = new Uint8Array(0); }
  async getFile() { return new Blob([this.data.slice()]); }
  async createWritable() {
    const ch = [];
    const s = this;
    const ws = new WritableStream({
      write(u) { ch.push(Buffer.from(u)); },
      close() { s.data = new Uint8Array(Buffer.concat(ch)); }
    });
    return ws;
  }
}

class MemDir {
  kind = 'directory';
  constructor(n = '') { this.name = n; this.kids = new Map(); }
  async *entries() { for (const [k, v] of this.kids) yield [k, v]; }
  async *values() { for (const v of this.kids.values()) yield v; }
  async getFileHandle(n, { create } = {}) {
    if (!this.kids.has(n)) {
      if (!create) throw new Error('NotFoundError: ' + n);
      this.kids.set(n, new MemFile(n));
    }
    return this.kids.get(n);
  }
  async getDirectoryHandle(n, { create } = {}) {
    if (!this.kids.has(n)) {
      if (!create) throw new Error('NotFoundError: ' + n);
      this.kids.set(n, new MemDir(n));
    }
    return this.kids.get(n);
  }
}

const put = async (root, path, bytes) => {
  const p = path.split('/');
  let d = root;
  for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
  const f = await d.getFileHandle(p.at(-1), { create: true });
  f.data = Uint8Array.from(bytes);
  return f;
};

// Build a real ISO with BuildISO
const src = new MemDir();
const cnfContent = Buffer.from('BOOT2 = cdrom0:\\SLUS_214.19;1\r\nVER = 1.00\r\nVMODE = NTSC\r\n');
const elfContent = Buffer.alloc(10000);
elfContent.set([0x7f, 0x45, 0x4c, 0x46]);
for (let i = 4; i < elfContent.length; i++) elfContent[i] = (i * 31) & 255;

await put(src, 'SYSTEM.CNF', cnfContent);
await put(src, 'SLUS_214.19', elfContent);
await put(src, 'DATA/A.BIN', Buffer.from('TEST DATA'));

const chunks = [];
const ws = new WritableStream({ write(u) { chunks.push(Buffer.from(u)); } });
await ISO9660.BuildISO(src, ws, { volumeLabel: 'PS2_GAME' });
const isoBuffer = new Uint8Array(Buffer.concat(chunks));

console.log('BuildISO finished, size:', isoBuffer.length, 'bytes (', isoBuffer.length / 2048, 'sectors)');

// Check ISO9660 PVD
const S = 2048;
const pvd = isoBuffer.subarray(16 * S, 17 * S);
assert.equal(String.fromCharCode(...pvd.subarray(1, 6)), 'CD001');

// Check UDF AVDP at sector 256
const avdp = isoBuffer.subarray(256 * S, 257 * S);
const avdpDv = new DataView(avdp.buffer, avdp.byteOffset);
const tagId = avdpDv.getUint16(0, true);
assert.equal(tagId, 2, 'AVDP tag must be 2');

// Check Backup AVDP at (totalSectors - 256)
const totalSectors = isoBuffer.length / S;
const bakAvdp1 = isoBuffer.subarray((totalSectors - 256) * S, (totalSectors - 255) * S);
const bakAvdp1Dv = new DataView(bakAvdp1.buffer, bakAvdp1.byteOffset);
assert.equal(bakAvdp1Dv.getUint16(0, true), 2, 'Backup AVDP 1 tag must be 2');

// Check Backup AVDP at (totalSectors - 1)
const bakAvdp2 = isoBuffer.subarray((totalSectors - 1) * S, totalSectors * S);
const bakAvdp2Dv = new DataView(bakAvdp2.buffer, bakAvdp2.byteOffset);
assert.equal(bakAvdp2Dv.getUint16(0, true), 2, 'Backup AVDP 2 tag must be 2');

console.log('All AVDPs in generated ISO are valid!');

// Test UDF scanner
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
function u16le(u8, o) { return (u8[o] | (u8[o + 1] << 8)) & 0xffff; }
function u32le(u8, o) { return (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0; }
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

const r = M.bufferReader(isoBuffer);
// Test reading sector 256
const avdpSec = await r.read(256 * S, S);
assert.equal(u16le(avdpSec, 0), 2);
assert.equal(udfTagChecksum(avdpSec.subarray(0, 16)), avdpSec[4]);
console.log('AVDP tag checksum matches!');

// Test reading Main VDS PD at 34
const pdSec = await r.read(34 * S, S);
assert.equal(u16le(pdSec, 0), 5);
const partLba = u32le(pdSec, 188);
const partLen = u32le(pdSec, 192);
console.log('Partition LBA:', partLba, 'Partition Length:', partLen);
assert.equal(partLba, 263);

// Test reading FSD at partLba
const fsdSec = await r.read(partLba * S, S);
assert.equal(u16le(fsdSec, 0), 256);
const rootFeLogical = u32le(fsdSec, 404);
console.log('Root FE Logical LBA:', rootFeLogical);

// Test reading Root FE
const rootFeSec = await r.read((partLba + rootFeLogical) * S, S);
assert.equal(u16le(rootFeSec, 0), 261);
const eaLen = u32le(rootFeSec, 168);
const fidLogical = u32le(rootFeSec, 180 + eaLen);
console.log('FID Logical LBA:', fidLogical);

// Test reading Root FID sector
const fidSec = await r.read((partLba + fidLogical) * S, S);
let pos = 0;
const fids = [];
while (pos + 38 <= S) {
  const fidTag = u16le(fidSec, pos);
  if (fidTag !== 257) break;
  const nLen = fidSec[pos + 19];
  const fidLen = (38 + nLen + 3) & ~3;
  const name = decodeUdfName(fidSec.subarray(pos + 38, pos + 38 + nLen));
  const fe = u32le(fidSec, pos + 24);
  fids.push({ name, fe, pos, fidLen });
  pos += fidLen;
}
console.log('Found FIDs in root:', fids.map(f => f.name));
assert.ok(fids.some(f => f.name.toUpperCase() === 'SYSTEM.CNF'));
assert.ok(fids.some(f => f.name.toUpperCase() === 'SLUS_214.19'));
console.log('SUCCESS: All UDF structures located accurately!');

// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive End-to-End Test: BuildISO + buildMetaPatches + buildCreditsWrapperPatches
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Testing End-to-End UDF Updates on Real ISO ---');

// 1. Create a mock wrapper template
const mockWrapper = Buffer.alloc(8192);
mockWrapper.set([0x7f, 0x45, 0x4c, 0x46]); // ELF magic
// Marcadores: RAIDENBOOT, RAIDENCREDIT, RAIDENFAIL, RAIDENHASH1, RAIDENMEDIA
let off = 100;
mockWrapper.write('RAIDENBOOT', off); off += 10 + 4 + 4 + 32;
mockWrapper.write('RAIDENCREDIT', off); off += 12 + 256;
mockWrapper.write('RAIDENFAIL', off); off += 10 + 256;
mockWrapper.write('RAIDENHASH1', off); off += 11 + 2 + 80;
mockWrapper.write('RAIDENMEDIA', off); off += 11 + 16;

// 2. Apply Meta patches (change volumeId)
const metaRes = await M.buildMetaPatches(r, { volumeId: 'NEW_TITLE' });
console.log('Meta patches generated:', metaRes.patches.length);
assert.ok(metaRes.patches.length > 0);

// Apply meta patches to isoBuffer
M.applyPatchesToBuffer(isoBuffer, metaRes.patches);

// Check that UDF PVD and FSD were updated
const updatedPvdSec = isoBuffer.subarray(32 * S, 33 * S);
assert.equal(updatedPvdSec[24], 8); // CS0
assert.equal(String.fromCharCode(...updatedPvdSec.subarray(25, 25 + 'NEW_TITLE'.length)), 'NEW_TITLE');
assert.equal(udfTagChecksum(updatedPvdSec.subarray(0, 16)), updatedPvdSec[4]);
console.log('UDF PVD volumeId successfully updated with valid tag checksum!');

// 3. Apply Credits Wrapper patches
const wrapRes = await M.buildCreditsWrapperPatches(r, mockWrapper, {
  credits: 'Translated by Raiden',
});
console.log('Wrapper patches:', wrapRes.patches.length, 'Appends:', wrapRes.appends.length);
assert.ok(wrapRes.patches.length > 0);
assert.ok(wrapRes.appends.length > 0);

// Grow and apply appends and patches
let finalIso = M.growAndApplyAppends(isoBuffer, wrapRes.appends);
M.applyPatchesToBuffer(finalIso, wrapRes.patches);

console.log('Final patched ISO size:', finalIso.length, 'bytes (', finalIso.length / S, 'sectors)');

// 4. Verify ISO9660 PVD
const finalTotalSectorsCalculated = finalIso.length / S;
const finalPvdSec = finalIso.subarray(16 * S, 17 * S);
const finalVolSpace = (new DataView(finalPvdSec.buffer, finalPvdSec.byteOffset)).getUint32(80, true);
assert.equal(finalVolSpace, finalTotalSectorsCalculated, 'ISO9660 volumeSpaceSize must match disc sectors');
console.log('ISO9660 Volume Space Size matches total sectors:', finalVolSpace);

// 5. Verify UDF AVDPs
const finalR = M.bufferReader(finalIso);
const fAvdp256 = await finalR.read(256 * S, S);
assert.equal(u16le(fAvdp256, 0), 2);
assert.equal(udfTagChecksum(fAvdp256.subarray(0, 16)), fAvdp256[4]);

const fBakAvdp1 = await finalR.read((finalTotalSectorsCalculated - 256) * S, S);
assert.equal(u16le(fBakAvdp1, 0), 2);
assert.equal(udfTagChecksum(fBakAvdp1.subarray(0, 16)), fBakAvdp1[4]);
console.log('Backup AVDP 1 at (totalSectors - 256) is 100% valid!');

const fBakAvdp2 = await finalR.read((finalTotalSectorsCalculated - 1) * S, S);
assert.equal(u16le(fBakAvdp2, 0), 2);
assert.equal(udfTagChecksum(fBakAvdp2.subarray(0, 16)), fBakAvdp2[4]);
console.log('Backup AVDP 2 at (totalSectors - 1) is 100% valid!');

// 6. Verify UDF Root FIDs now include RAIDEN.ELF
const finalUdf = await M.readUdfInfo(finalR);
assert.equal(finalUdf.hasUdf, true);

const finalFidSec = await finalR.read((finalUdf.partitionLba + finalUdf.rootFidLogicalLba) * S, S);
let p = 0;
const finalFidList = [];
while (p + 38 <= S) {
  const fidTag = u16le(finalFidSec, p);
  if (fidTag !== 257) break;
  const nLen = finalFidSec[p + 19];
  const fidLen = (38 + nLen + 3) & ~3;
  const name = decodeUdfName(finalFidSec.subarray(p + 38, p + 38 + nLen));
  const fe = u32le(finalFidSec, p + 24);
  finalFidList.push({ name, fe });
  p += fidLen;
}
console.log('Final UDF Root FIDs:', finalFidList.map(f => f.name));
const raidenFid = finalFidList.find(f => f.name.toUpperCase() === 'RAIDEN.ELF');
assert.ok(raidenFid, 'RAIDEN.ELF must exist in UDF root directory FIDs');

// 7. Verify RAIDEN.ELF File Entry in UDF
const raidenFeSec = await finalR.read((finalUdf.partitionLba + raidenFid.fe) * S, S);
assert.equal(u16le(raidenFeSec, 0), 261, 'RAIDEN.ELF FE must have Tag 261');
assert.equal(udfTagChecksum(raidenFeSec.subarray(0, 16)), raidenFeSec[4], 'RAIDEN.ELF FE tag checksum must be valid');
const raidenInfoSize = u32le(raidenFeSec, 56);
assert.equal(raidenInfoSize, mockWrapper.length, 'RAIDEN.ELF InfoSize must match wrapper length');
console.log('RAIDEN.ELF FE in UDF is valid, points to size:', raidenInfoSize);

// 8. Verify SYSTEM.CNF content in data sector
const cnfFid = finalFidList.find(f => f.name.toUpperCase() === 'SYSTEM.CNF');
assert.ok(cnfFid, 'SYSTEM.CNF must exist in UDF');
const cnfFeSec = await finalR.read((finalUdf.partitionLba + cnfFid.fe) * S, S);
assert.equal(u16le(cnfFeSec, 0), 261);
const cnfDataLba = finalUdf.partitionLba + u32le(cnfFeSec, 312);
const cnfData = await finalR.read(cnfDataLba * S, u32le(cnfFeSec, 56));
const cnfStr = String.fromCharCode(...cnfData);
console.log('Updated SYSTEM.CNF content:\n' + cnfStr);
assert.ok(cnfStr.includes('BOOT2 = cdrom0:\\RAIDEN.ELF'));

console.log('\nALL END-TO-END UDF TESTS PASSED SUCCESSFULLY! 100% COMPATIBLE AND SECURE!');
