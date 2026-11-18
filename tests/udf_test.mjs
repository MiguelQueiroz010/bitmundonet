import { UDFUtils } from '../scripts/IUP/udf_osta.js';

const SECTOR_SIZE = 2048;

function makeUdfTag(tagId, lba, payloadCrcLen, payloadCrc) {
    const buf = new Uint8Array(16);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, tagId, true);
    dv.setUint16(2, 2, true);
    dv.setUint8(5, 0);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, payloadCrc, true);
    dv.setUint16(10, payloadCrcLen, true);
    dv.setUint32(12, lba, true);

    let sum = 0;
    for (let i = 0; i < 16; i++) {
        if (i === 4) continue;
        sum += buf[i];
    }
    dv.setUint8(4, sum & 0xFF);
    return buf;
}

function makeUdfFid(lba, isDir, isParent, name, targetFeLogicalLba) {
    const nameUnicode = isParent ? new Uint8Array(0) : UDFUtils.getCompressedUnicode(name);
    const nameLen = nameUnicode.length;

    const fidLen = 38 + nameLen;
    const paddedLen = (fidLen + 3) & ~3;
    const buf = new Uint8Array(paddedLen);
    const dv = new DataView(buf.buffer);

    dv.setUint16(16, 1, true);
    let flags = 0;
    if (isDir) flags |= 0x02;
    if (isParent) flags |= 0x08;
    dv.setUint8(18, flags);
    dv.setUint8(19, nameLen);

    dv.setUint32(20, 0x13c, true);
    dv.setUint32(24, targetFeLogicalLba, true);
    dv.setUint16(28, 0, true);

    dv.setUint16(36, 0, true);
    if (nameLen > 0) {
        buf.set(nameUnicode, 38);
    }

    const payloadLen = paddedLen - 16;
    const payloadBytes = buf.subarray(16, paddedLen);
    const crc = UDFUtils.computeCrc(payloadBytes, payloadLen);
    const tag = makeUdfTag(257, lba, payloadLen, crc);
    buf.set(tag, 0);

    return buf;
}

function packDirectoryFids(entries, startLogicalLba) {
    const sectors = [];
    let currentSector = new Uint8Array(SECTOR_SIZE);
    let secOff = 0;
    let currentLba = startLogicalLba;

    for (const e of entries) {
        const nameUnicode = e.isParent ? new Uint8Array(0) : UDFUtils.getCompressedUnicode(e.name);
        const nameLen = nameUnicode.length;
        const fidLen = ((38 + nameLen + 3) & ~3);

        if (secOff + fidLen > SECTOR_SIZE) {
            sectors.push(currentSector);
            currentSector = new Uint8Array(SECTOR_SIZE);
            currentLba++;
            secOff = 0;
        }

        const fid = makeUdfFid(currentLba, e.isDir, e.isParent, e.name, e.targetFe);
        currentSector.set(fid, secOff);
        secOff += fid.length;
    }
    sectors.push(currentSector);

    const totalBytes = sectors.length * SECTOR_SIZE;
    const buf = new Uint8Array(totalBytes);
    for (let i = 0; i < sectors.length; i++) {
        buf.set(sectors[i], i * SECTOR_SIZE);
    }

    return { buf, sectorCount: sectors.length };
}

// Test with 60 files
const entries = [
    { isDir: true, isParent: true, name: '', targetFe: 0 }
];
for (let i = 0; i < 60; i++) {
    entries.push({ isDir: false, isParent: false, name: 'FILE_' + i + '.BIN', targetFe: i + 1 });
}

const { buf, sectorCount } = packDirectoryFids(entries, 2);
console.log('Sector count:', sectorCount, 'Total bytes:', buf.length);

// Verify every single FID in the buffer
let parsed = 0;
for (let s = 0; s < sectorCount; s++) {
    const lba = 2 + s;
    const sec = buf.subarray(s * SECTOR_SIZE, (s + 1) * SECTOR_SIZE);
    let off = 0;
    while (off < SECTOR_SIZE) {
        const id = sec[off] | (sec[off + 1] << 8);
        if (id !== 257) break; // Trailing zeros

        const crc = sec[off + 8] | (sec[off + 9] << 8);
        const crcLen = sec[off + 10] | (sec[off + 11] << 8);
        const tagLba = (sec[off + 12] | (sec[off + 13] << 8) | (sec[off + 14] << 16) | (sec[off + 15] << 24)) >>> 0;

        let sum = 0;
        for (let i = 0; i < 16; i++) { if (i !== 4) sum += sec[off + i]; }
        const cksumOk = (sum & 0xff) === sec[off + 4];
        const calcCrc = UDFUtils.computeCrc(sec.subarray(off + 16, off + 16 + crcLen), crcLen);
        const crcOk = (calcCrc === crc);
        const lbaOk = (tagLba === lba);

        const nameLen = sec[off + 19];
        const fidLen = ((38 + nameLen + 3) & ~3);

        parsed++;
        if (!cksumOk || !crcOk || !lbaOk) {
            console.error(`FAIL at sector ${s} (LBA ${lba}) off ${off}: cksum=${cksumOk}, crc=${crcOk}, lba=${lbaOk}`);
            process.exit(1);
        }
        off += fidLen;
    }
}

console.log(`SUCCESS: Parsed all ${parsed} FIDs across ${sectorCount} sectors without errors!`);
