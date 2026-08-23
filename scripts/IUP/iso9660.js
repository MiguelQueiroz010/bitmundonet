import { IOextent } from './io_extent.js';
import { UDFUtils } from './udf_osta.js';

export const Tipo_de_Descritor = {
    BootRecord: 0,
    VolumePrimário: 1,
    Outro: 2
};

export class RegrasArquivo {
    static Normal = 0;
    static Oculto = 1;
    static ArquivoAssoc = 2;
    static Atributado = 3;
    static AtributadoExtendido = 4;
    static Continuado = 5;
    static SubDiretorio = 6;
}

export class Arquivo {
    constructor(entradaBytes, offset) {
        if (!entradaBytes || entradaBytes[0] === 0) return;
        this.OffsetinSector = offset;
        try {
            const dv = new DataView(entradaBytes.buffer, entradaBytes.byteOffset);
            this.LBA = IOextent.readUInt(dv, 2, 32);     // LBA LE
            this.Tamanho = IOextent.readUInt(dv, 10, 32); // Size LE

            const dtBytes = IOextent.readBytes(entradaBytes, 18, 7);
            this.Gravacao = IOextent.getDateTimeDir(dtBytes);

            this.Flags = [];
            let flagByte = dv.getUint8(25);
            if (flagByte & 0x01) this.Flags.push(RegrasArquivo.Oculto);
            if (flagByte & 0x02) this.Flags.push(RegrasArquivo.SubDiretorio);

            let nameSize = dv.getUint8(32);
            this.Name = new TextDecoder().decode(entradaBytes.slice(33, 33 + nameSize))
                .split(';')[0]
                .replace(/\0/g, '')
                .trim();
        } catch (e) {
            console.error("Arquivo Parse Error:", e);
        }
    }

    static lerPastas(setorDirArray) {
        let pastas = [];
        let i = 0;
        while (i < setorDirArray.length) {
            let recordSize = setorDirArray[i];
            if (recordSize === 0) {
                i = (Math.floor(i / 2048) + 1) * 2048;
                if (i >= setorDirArray.length) break;
                continue;
            }
            const entrada = setorDirArray.slice(i, i + recordSize);
            const arq = new Arquivo(entrada, i);
            if (arq.Name) pastas.push(arq);
            i += recordSize;
        }
        return pastas;
    }
}

export class Setor {
    static async readSector(isoFile, lba, tamanho = 2048) {
        const slice = isoFile.slice(lba * tamanho, (lba * tamanho) + tamanho);
        const buffer = await slice.arrayBuffer();
        const data = new Uint8Array(buffer);

        const idString = new TextDecoder().decode(data.slice(1, 6));
        if (idString === "CD001") {
            if (data[0] === 1) return new Volume_Primario(data, lba, tamanho);
        }
        return { data, lba, tipo: Tipo_de_Descritor.Outro };
    }
}

export class Volume_Primario {
    constructor(data, lba, tamanho) {
        this.data = data;
        this.lba = lba;
        this.tipo = Tipo_de_Descritor.VolumePrimário;
        const dv = new DataView(data.buffer);

        this.VolumeID = new TextDecoder().decode(data.slice(40, 72)).trim();
        this.SectorCount = IOextent.readUInt(dv, 80, 32);
        this.PathTableSize = IOextent.readUInt(dv, 132, 32);
        this.PathTableLBA = IOextent.readUInt(dv, 140, 32);
        this.DirectoryRecordRoot = data.slice(156, 156 + 34);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTRUÇÃO DE SETORES UDF OSTA 1.02 (BASEADO EXATAMENTE NO IUP / PS2 C#)
// ═══════════════════════════════════════════════════════════════════════════════

function formatSonyVolumeSetId(date = new Date(), customUniqueId = null) {
    if (customUniqueId && customUniqueId.length === 8) {
        return customUniqueId;
    }
    // 32-bit timestamp em segundos: codificado em 8 caracteres com nibbles '0' + nibble (comportamento Sony DVD-ROM Generator)
    const totalSecs = Math.floor(date.getTime() / 1000) & 0xFFFFFFFF;
    let uniqueHexStr = "";
    for (let i = 7; i >= 0; i--) {
        const nibble = (totalSecs >>> (i * 4)) & 0x0F;
        uniqueHexStr += String.fromCharCode(0x30 + nibble);
    }
    return uniqueHexStr;
}

function writeUdfTimestamp(dv, offset, date = new Date(), tzMinutes = 540) {
    const tzBits = tzMinutes & 0x0FFF;
    const typeAndTz = (1 << 12) | tzBits; // Type 1 (local time com timezone offset)
    dv.setUint16(offset, typeAndTz, true);
    dv.setUint16(offset + 2, date.getUTCFullYear(), true);
    dv.setUint8(offset + 4, date.getUTCMonth() + 1);
    dv.setUint8(offset + 5, date.getUTCDate());
    dv.setUint8(offset + 6, date.getUTCHours());
    dv.setUint8(offset + 7, date.getUTCMinutes());
    dv.setUint8(offset + 8, date.getUTCSeconds());
    dv.setUint8(offset + 9, 0);
    dv.setUint8(offset + 10, 0);
    dv.setUint8(offset + 11, 0);
}

function makeUdfTag(tagId, lba, payloadCrcLen, payloadCrc) {
    const buf = new Uint8Array(16);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, tagId, true);
    dv.setUint16(2, 2, true);     // Versão UDF 1.02
    dv.setUint8(5, 0);            // Reservado
    dv.setUint16(6, 0, true);     // Serial Number
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

function makeUdfDescriptorSector(tagId, lba, payloadBytes) {
    const sector = new Uint8Array(2048);
    const payloadLen = payloadBytes ? payloadBytes.length : 0;
    if (payloadLen > 0) {
        sector.set(payloadBytes, 16);
    }
    const crc = payloadLen > 0 ? UDFUtils.computeCrc(payloadBytes, payloadLen) : 0;
    const tag = makeUdfTag(tagId, lba, payloadLen, crc);
    sector.set(tag, 0);
    return sector;
}

function makeUdfPvd(lba, volumeLabel, date = new Date(), tzMinutes = 540, customVolSetUnique = null) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);
    dv.setUint32(0, 0, true); // DescritorVolumeSequencialNumber = 0
    dv.setUint32(4, 0, true); // DescritorPrimaryVolumeSequencialNumber = 0

    // Volume ID dstring (32 bytes at payload 8 = descriptor 0x18)
    const volIdBuf = new Uint8Array(32);
    volIdBuf[0] = 8; // CS0 (8-bit compression)
    const label = volumeLabel || "";
    for (let i = 0; i < label.length && i < 30; i++) {
        volIdBuf[1 + i] = label.charCodeAt(i) & 0xFF;
    }
    volIdBuf[31] = Math.min(label.length, 30) + 1; // Termina com o tamanho (0x01 se vazio)
    payload.set(volIdBuf, 8);

    dv.setUint16(40, 1, true); // VolumeSequenceNumber = 1
    dv.setUint16(42, 1, true); // MaxVolumeSequenceNumber = 1
    dv.setUint16(44, 2, true); // InterchangeLevel = 2
    dv.setUint16(46, 2, true); // MaxInterchangeLevel = 2
    dv.setUint32(48, 1, true); // CharacterSetList = 1
    dv.setUint32(52, 1, true); // MaxCharacterSetList = 1

    // Volume Set ID (128 bytes dstring at payload 56 = descriptor 0x48)
    const volSetBuf = new Uint8Array(128);
    volSetBuf[0] = 8; // CS0
    const unique8 = formatSonyVolumeSetId(date, customVolSetUnique);
    for (let i = 0; i < 8; i++) {
        volSetBuf[1 + i] = unique8.charCodeAt(i) & 0xFF;
    }
    const sceiStr = "SCEI";
    for (let i = 0; i < 4; i++) {
        volSetBuf[9 + i] = sceiStr.charCodeAt(i) & 0xFF;
    }
    // 36 espaços (0x20)
    for (let i = 13; i <= 48; i++) {
        volSetBuf[i] = 0x20;
    }
    // Tamanho no último byte (offset 127 = payload 183) = 1 + 8 + 4 + 36 = 49 (0x31)
    volSetBuf[127] = 0x31;
    payload.set(volSetBuf, 56);

    // DescritorCharSet (64 bytes at payload 184 = descriptor 0xC8)
    const ostaCharSet = new TextEncoder().encode("OSTA Compressed Unicode");
    payload[184] = 0;
    payload.set(ostaCharSet.subarray(0, Math.min(23, ostaCharSet.length)), 185);

    // ExplanatoryCharSet (64 bytes at payload 248 = descriptor 0x108)
    payload[248] = 0;
    payload.set(ostaCharSet.subarray(0, Math.min(23, ostaCharSet.length)), 249);

    // ID_Aplicativo (32 bytes at payload 328 = descriptor 0x158)
    const appRegId = new TextEncoder().encode("PLAYSTATION            ");
    payload[328] = 0;
    payload.set(appRegId.subarray(0, Math.min(23, appRegId.length)), 329);

    // DataHoraGravação (12 bytes at payload 360 = descriptor 0x178)
    writeUdfTimestamp(dv, 360, date, tzMinutes);

    // ID_Implementation (32 bytes at payload 372 = descriptor 0x184)
    const implRegId = new TextEncoder().encode("DVD-ROM GENERATOR");
    payload[372] = 0;
    payload.set(implRegId.subarray(0, Math.min(23, implRegId.length)), 373);

    return makeUdfDescriptorSector(1, lba, payload);
}

function makeUdfIuvd(lba, volumeLabel) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);
    dv.setUint32(0, 1, true); // DescritorVolumeSequencialNumber = 1

    // ImplementationID regid (32 bytes at payload 4 = descriptor 0x14)
    const implId = new TextEncoder().encode("*UDF LV Info");
    payload[4] = 0; // regid Flags = 0
    payload.set(implId.subarray(0, Math.min(23, implId.length)), 5);
    // IDSufixo (8 bytes at payload 28 = descriptor 0x2C): UDF 1.02 revision [0x02, 0x01, 0, 0, 0, 0, 0, 0]
    payload.set(new Uint8Array([0x02, 0x01, 0, 0, 0, 0, 0, 0]), 28);

    // LVInformation at payload 36 (descriptor 0x34)
    // LVICharset (64 bytes at payload 36..99)
    const ostaCharSet = new TextEncoder().encode("OSTA Compressed Unicode");
    payload[36] = 0;
    payload.set(ostaCharSet.subarray(0, Math.min(23, ostaCharSet.length)), 37);

    // LVIIdentifier dstring (128 bytes at payload 100..227 = descriptor 0x74..0xF3)
    const lviIdBuf = new Uint8Array(128);
    lviIdBuf[0] = 8; // CS0 (8-bit)
    const label = volumeLabel || "";
    for (let i = 0; i < label.length && i < 126; i++) {
        lviIdBuf[1 + i] = label.charCodeAt(i) & 0xFF;
    }
    lviIdBuf[127] = Math.min(label.length, 126) + 1; // Termina com 0x01 se vazio
    payload.set(lviIdBuf, 100);

    // LVInfo1 (36 bytes dstring at payload 228..263 = descriptor 0xF4..0x117)
    payload[228] = 8;
    payload[263] = 1;

    // LVInfo2 (36 bytes dstring at payload 264..299 = descriptor 0x118..0x13B)
    payload[264] = 8;
    payload[299] = 1;

    // LVInfo3 (36 bytes dstring at payload 300..335 = descriptor 0x13C..0x15F)
    payload[300] = 8;
    payload[335] = 1;

    // ImplementationID regid (32 bytes at payload 336..367 = descriptor 0x160..0x17F)
    const dvdGen = new TextEncoder().encode("DVD-ROM GENERATOR");
    payload[336] = 0; // regid Flags = 0
    payload.set(dvdGen.subarray(0, Math.min(23, dvdGen.length)), 337);

    // ImplementationUse (128 bytes at payload 368..495 - zeros)

    return makeUdfDescriptorSector(4, lba, payload);
}

function makeUdfPd(lba, partitionLba, totalSectors) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);
    dv.setUint32(0, 2, true);  // DescritorVolumeSequencialNumber = 2
    dv.setUint16(4, 1, true);  // Flags = 1 (Allocated)
    dv.setUint16(6, 0, true);  // Partition Number = 0

    // Partition Contents regid (+NSR02, 32 bytes at payload 8)
    const nsr = new TextEncoder().encode("+NSR02");
    payload[8] = 2; // Flags = 2 (Protected / Descritor.regid.Flag.Protegido)
    payload.set(nsr.subarray(0, Math.min(23, nsr.length)), 9);
    payload.set(new Uint8Array([0x02, 0x01, 0, 0, 0, 0, 0, 0]), 32); // IDSufixo = UDF 1.02

    dv.setUint32(168, 1, true); // TipoAcesso = 1
    dv.setUint32(172, partitionLba, true); // LBAPartição
    dv.setUint32(176, Math.max(0, totalSectors - partitionLba), true); // TamanhoPartiçãoBlocks

    // IdImplementação (32 bytes at payload 180)
    const implRegId = new TextEncoder().encode("DVD-ROM GENERATOR");
    payload[180] = 0;
    payload.set(implRegId.subarray(0, Math.min(23, implRegId.length)), 181);

    return makeUdfDescriptorSector(5, lba, payload);
}

function makeUdfLv(lba, volumeLabel) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);
    dv.setUint32(0, 3, true); // DescritorVolumeSequencialNumber = 3

    // DescCharSet (64 bytes at payload 4)
    const ostaCharSet = new TextEncoder().encode("OSTA Compressed Unicode");
    payload[4] = 0;
    payload.set(ostaCharSet.subarray(0, Math.min(23, ostaCharSet.length)), 5);

    // LVIdentifier dstring (128 bytes at payload 68)
    const lvIdBuf = new Uint8Array(128);
    lvIdBuf[0] = 8; // CS0/8-bit compression
    const label = volumeLabel || "";
    for (let i = 0; i < label.length && i < 126; i++) {
        lvIdBuf[1 + i] = label.charCodeAt(i) & 0xFF;
    }
    lvIdBuf[127] = Math.min(label.length, 126) + 1; // dstring length
    payload.set(lvIdBuf, 68);

    dv.setUint32(196, 2048, true); // Logical Block Size = 2048

    // Domain Identifier (*OSTA UDF Compliant, 32 bytes at payload 200)
    const domainId = new TextEncoder().encode("*OSTA UDF Compliant");
    payload[200] = 0;
    payload.set(domainId.subarray(0, Math.min(23, domainId.length)), 201);
    payload.set(new Uint8Array([2, 1, 3, 0, 0, 0, 0, 0]), 224); // IDSufixo

    // ContentUse (16 bytes at payload 232): { 0, 0x10, 0, ... }
    payload[233] = 0x10;

    dv.setUint32(248, 6, true); // Partition Map Table Size = 6
    dv.setUint32(252, 1, true); // Map Number = 1

    // ImplementationIdentifier (32 bytes at payload 256)
    const dvdGen = new TextEncoder().encode("DVD-ROM GENERATOR");
    payload[256] = 0;
    payload.set(dvdGen.subarray(0, Math.min(23, dvdGen.length)), 257);
    // UsoImplementação (128 bytes at payload 288 - zeros)

    // IntegritySequenceExtent (8 bytes at payload 416)
    dv.setUint32(416, 0x1000, true); // ExtentSize = 4096
    dv.setUint32(420, 64, true);     // LBAExtent = 64

    // Partition Map Type 1 (6 bytes at payload 424)
    payload[424] = 1; // Type = 1
    payload[425] = 6; // MapLength = 6
    dv.setUint16(426, 1, true); // VolumeSequencialNumber = 1
    dv.setUint16(428, 0, true); // PartitionNumber = 0

    return makeUdfDescriptorSector(6, lba, payload);
}

function makeUdfUsd(lba) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);
    dv.setUint32(0, 4, true); // DescritorVolumeSequencialNumber = 4
    dv.setUint32(4, 0, true); // AllocDescripNumber = 0
    return makeUdfDescriptorSector(7, lba, payload);
}

function makeUdfTd(lba) {
    const payload = new Uint8Array(2032);
    return makeUdfDescriptorSector(8, lba, payload);
}

function makeUdfLvi(lba, totalSectors, partitionLba, fileCount, dirCount, date = new Date(), tzMinutes = 540) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);

    // DataHoraGravação (12 bytes at payload 0)
    writeUdfTimestamp(dv, 0, date, tzMinutes);

    dv.setUint32(12, 1, true);  // Tipo = 1 (Close Integrity)
    // Próximo (extent_ad, 8 bytes at payload 16 - zeros)
    // 4 bytes of 0xFF at payload 24
    dv.setUint32(24, 0xFFFFFFFF, true);
    // UsoVolumeLógico (28 bytes de zeros at payload 28)
    // NúmeroPartições (4 bytes at payload 56)
    dv.setUint32(56, 1, true);          // NúmeroPartições = 1
    dv.setUint32(60, 0x30, true);       // TamanhoUsoImplementação = 0x30 (48 bytes)
    dv.setUint32(64, 0, true);          // TabelaEspaçoLivre[0] = 0
    dv.setUint32(68, Math.max(0, totalSectors - partitionLba), true); // TabelaTamanhos[0]

    // UsoImplementação.GetData() at payload 72 (48 bytes total)
    // ID regid (32 bytes at payload 72)
    const dvdGen = new TextEncoder().encode("DVD-ROM GENERATOR");
    payload[72] = 0;  // regid Flags
    payload.set(dvdGen.subarray(0, Math.min(23, dvdGen.length)), 73);
    // IDSufixo (8 bytes) = zeros at payload 96
    dv.setUint32(104, fileCount, true);      // FileNumber
    dv.setUint32(108, dirCount + 1, true);   // DirectoryNumber
    dv.setUint16(112, 258, true);            // MinUDFReadRev (0x0102)
    dv.setUint16(114, 258, true);            // MinUDFWriteRev (0x0102)
    dv.setUint16(116, 258, true);            // MaxUDFWriteRev (0x0102)

    return makeUdfDescriptorSector(9, lba, payload);
}

function makeUdfAvdp(lba, mainVdsLba = 32, reserveVdsLba = 48) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);
    dv.setUint32(0, 0x8000, true);     // Main VDS Extent Length (32768)
    dv.setUint32(4, mainVdsLba, true); // Main VDS Extent LBA (32)

    dv.setUint32(8, 0x8000, true);        // Reserve VDS Extent Length (32768)
    dv.setUint32(12, reserveVdsLba, true); // Reserve VDS Extent LBA (48)
    return makeUdfDescriptorSector(2, lba, payload);
}

function makeUdfFsd(lba, rootFeLogicalLba, volumeLabel, date = new Date(), tzMinutes = 540) {
    const payload = new Uint8Array(2032);
    const dv = new DataView(payload.buffer);

    // DataHoraGravação at payload 0..11 (descriptor 0x10)
    writeUdfTimestamp(dv, 0, date, tzMinutes);

    dv.setUint16(12, 3, true); // Interchange Level
    dv.setUint16(14, 3, true); // Max Interchange Level
    dv.setUint32(16, 1, true); // Character Set List
    dv.setUint32(20, 1, true); // Max Character Set List
    dv.setUint32(24, 0, true); // File Set Number = 0
    dv.setUint32(28, 0, true); // File Set Descriptor Number = 0

    // LogicalVolumeIdentifierCharSet (64 bytes at payload 32 = descriptor 0x30)
    const ostaCharSet = new TextEncoder().encode("OSTA Compressed Unicode");
    payload[32] = 0;
    payload.set(ostaCharSet.subarray(0, Math.min(23, ostaCharSet.length)), 33);

    // LogicalVolumeIdentifier dstring (128 bytes at payload 96 = descriptor 0x70)
    const lvIdBuf = new Uint8Array(128);
    lvIdBuf[0] = 8; // CS0 (8-bit)
    const lvLabel = volumeLabel || "";
    for (let i = 0; i < lvLabel.length && i < 126; i++) {
        lvIdBuf[1 + i] = lvLabel.charCodeAt(i) & 0xFF;
    }
    lvIdBuf[127] = Math.min(lvLabel.length, 126) + 1; // Termina com 0x01 se vazio
    payload.set(lvIdBuf, 96);

    // FileSetCharSet (64 bytes at payload 224 = descriptor 0xF0 / 240)
    payload[224] = 0;
    payload.set(ostaCharSet.subarray(0, Math.min(23, ostaCharSet.length)), 225);

    // FileSetIdentifier dstring (32 bytes at payload 288 = descriptor 0x130)
    const fsId = new Uint8Array(32);
    fsId[0] = 8;
    const fsText = new TextEncoder().encode("PLAYSTATION2 DVD-ROM FILE SET");
    fsId.set(fsText.subarray(0, Math.min(29, fsText.length)), 1);
    fsId[31] = Math.min(fsText.length, 29) + 1;
    payload.set(fsId, 288);

    // RootDirectoryICB (16 bytes long_ad at payload 384 = descriptor 0x190)
    dv.setUint32(384, 0x13c, true);            // Extent Length
    dv.setUint32(388, rootFeLogicalLba, true); // Extent LBA
    dv.setUint16(392, 0, true);                // Partition Reference

    // DomainIdentifier (32 bytes regid at payload 400 = descriptor 0x1A0)
    const domainId = new TextEncoder().encode("*OSTA UDF Compliant");
    payload[400] = 0;
    payload.set(domainId.subarray(0, Math.min(23, domainId.length)), 401);
    payload.set(new Uint8Array([2, 1, 3, 0, 0, 0, 0, 0]), 424);

    return makeUdfDescriptorSector(256, lba, payload);
}

function makeUdfFileEntry(lba, isDir, dataSize, dataLba, date = new Date(), tzMinutes = 540) {
    const payload = new Uint8Array(300);
    const dv = new DataView(payload.buffer);

    // 0..19: TagICB (icbtag, 20 bytes)
    dv.setUint32(0, 0, true);       // Prior Direct Entries = 0
    dv.setUint16(4, 4, true);       // Strategy Type = 4
    dv.setUint16(6, 0, true);       // Strategy Parameter = 0
    dv.setUint16(8, 1, true);       // Max Entry Number = 1
    dv.setUint8(10, 0);             // Reserved = 0
    dv.setUint8(11, isDir ? 4 : 5); // File Type: 4=Dir, 5=File
    // 12..17: ICBParentLocation (lb_addr, 6 bytes zeroes)
    dv.setUint16(18, 0, true);      // Flags: 0 = Short Allocation Descriptors (short_ad)

    // 20..31: Security & Permissions
    dv.setUint32(20, 0xFFFFFFFF, true); // UID = 0xFFFFFFFF
    dv.setUint32(24, 0xFFFFFFFF, true); // GID = 0xFFFFFFFF
    dv.setUint32(28, 0x14A5, true);     // Permissions = 0x14A5

    // 32..39: File Record Properties
    dv.setUint16(32, 1, true);          // LinkedFileCount = 1
    dv.setUint8(34, 0);                 // RecordFormat = 0
    dv.setUint8(35, 0);                 // RecordAttrs = 0
    dv.setUint32(36, 0, true);          // RecordSize = 0

    // 40..55: Sizes
    dv.setBigUint64(40, BigInt(dataSize), true); // InfoSize
    const blocks = BigInt(Math.ceil(dataSize / 2048));
    dv.setBigUint64(48, blocks, true);           // LogicalBlocksWrited

    // 56..91: TimeStamps (Acesso, Modificação, Atributo - 12 bytes cada)
    writeUdfTimestamp(dv, 56, date, tzMinutes);
    writeUdfTimestamp(dv, 68, date, tzMinutes);
    writeUdfTimestamp(dv, 80, date, tzMinutes);

    // 92..95: Checkpoint
    dv.setUint32(92, 1, true);

    // 96..111: ICBAttrExtendido (long_ad, 16 bytes zeroes)

    // 112..143: IDImplementação (regid, 32 bytes)
    const implId = new TextEncoder().encode("DVD-ROM GENERATOR");
    payload[112] = 0;
    payload.set(implId.subarray(0, Math.min(23, implId.length)), 113);

    // 144..151: UniqueID (8 bytes zeroes)

    // 152..159: EA & Allocation Descriptor Sizes
    dv.setUint32(152, 0x84, true); // TamanhoAttrExtendidos = 0x84 (132 bytes)
    dv.setUint32(156, 8, true);    // TamanhoDescritoresAloc = 8 bytes

    // 160..291: AtributosExtendidos (EA Space, 132 bytes total)
    // EA embedded Tag (16 bytes at payload 160..175)
    const eaPayloadForCrc = new Uint8Array(8);
    const eaDv = new DataView(eaPayloadForCrc.buffer);
    eaDv.setUint32(0, 0x18, true); // OffsetImplementationUse = 24
    eaDv.setUint32(4, 0x84, true); // OffsetApplicationUse = 132
    const eaCrc = UDFUtils.computeCrc(eaPayloadForCrc, 8);
    const eaTag = makeUdfTag(0x106, lba, 8, eaCrc);
    payload.set(eaTag, 160); // Tag at 160..175

    // EA offsets (8 bytes at payload 176..183)
    dv.setUint32(176, 0x18, true); // OffsetImplementationUse = 0x18 (24)
    dv.setUint32(180, 0x84, true); // OffsetApplicationUse = 0x84 (132)

    // EA[0]: *UDF FreeEASpace (52 bytes at payload 184 = 160 + 24)
    dv.setUint32(184, 0x800, true); // TipodeAtributo = 0x800
    payload[188] = 1;               // SubTipodeAtributo = 1
    dv.setUint32(192, 0x34, true);  // TamanhoAtributo = 52
    dv.setUint32(196, 4, true);     // TamanhoImplementationUse = 4
    const freeEaRegId = new TextEncoder().encode("*UDF FreeEASpace");
    payload[200] = 0;               // regid Flags
    payload.set(freeEaRegId.subarray(0, Math.min(23, freeEaRegId.length)), 201);
    payload.set(new Uint8Array([0x02, 0x01]), 224); // regid IDSufixo
    dv.setUint16(232, 0x561, true); // FreeEASpace HeaderChecksum (2 bytes)

    // EA[1]: *UDF DVD CGMS Info (56 bytes at payload 236 = 184 + 52)
    dv.setUint32(236, 0x800, true); // TipodeAtributo = 0x800
    payload[240] = 1;               // SubTipodeAtributo = 1
    dv.setUint32(244, 0x38, true);  // TamanhoAtributo = 56
    dv.setUint32(248, 8, true);     // TamanhoImplementationUse = 8
    const cgmsRegId = new TextEncoder().encode("*UDF DVD CGMS Info");
    payload[252] = 0;               // regid Flags
    payload.set(cgmsRegId.subarray(0, Math.min(23, cgmsRegId.length)), 253);
    payload.set(new Uint8Array([0x02, 0x01]), 276); // regid IDSufixo
    dv.setUint16(284, 0x549, true); // DVDGGMSInfo HeaderChecksum (2 bytes)

    // 292..299: DescritoresAlocação (short_ad, 8 bytes at 160 + 132 = 292)
    dv.setUint32(292, dataSize, true); // Extent Length
    dv.setUint32(296, dataLba, true);  // Extent Position LBA

    return makeUdfDescriptorSector(261, lba, payload);
}

function makeUdfFid(lba, isDir, isParent, name, targetFeLogicalLba) {
    const nameUnicode = isParent ? new Uint8Array(0) : UDFUtils.getCompressedUnicode(name);
    const nameLen = nameUnicode.length;

    const fidLen = 38 + nameLen;
    const paddedLen = (fidLen + 3) & ~3; // Alinhar a 4 bytes
    const buf = new Uint8Array(paddedLen);
    const dv = new DataView(buf.buffer);

    dv.setUint16(16, 1, true); // File Version Number
    let flags = 0;
    if (isDir) flags |= 0x02;
    if (isParent) flags |= 0x08;
    dv.setUint8(18, flags);
    dv.setUint8(19, nameLen);

    // ICB (long_ad)
    dv.setUint32(20, 0x13c, true);               // Extent Length
    dv.setUint32(24, targetFeLogicalLba, true); // Extent LBA
    dv.setUint16(28, 0, true);                  // Partition Reference

    dv.setUint16(36, 0, true); // Implementation Use Length
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

export class ISO9660 {

    /**
     * PatchISO: O ponto de entrada principal.
     */
    static async PatchISO(sourceIsoFile, workDirHandle, outputStream, options = {}) {
        const { onProgress } = options;

        try {
            const patchDir = await workDirHandle.getDirectoryHandle("patch_files");

            if (onProgress) onProgress(2, "A sincronizar ficheiros originais e modificados...");
            await ISO9660.ExtrairNaPasta(sourceIsoFile, patchDir, options);

            if (onProgress) onProgress(4, "A reconstruir estrutura ISO9660+UDF final...");
            const success = await ISO9660.BuildISO(patchDir, outputStream, { ...options, sourceIsoFile });

            return success;
        } catch (err) {
            console.error("Erro fatal no PatchISO:", err);
            throw err;
        }
    }

    /**
     * Reconstroi a ISO9660 + UDF 1.02 dual filesystem usando o layout exato do IUP PS2.
     */
    static async BuildISO(dirHandle, outputStream, options = {}) {
        const { onProgress, sourceIsoFile, volumeLabel = "PS2_DISC" } = options;
        const writer = outputStream.getWriter();
        const SECTOR_SIZE = 2048;

        if (onProgress) onProgress(4, "Escaneando estrutura de diretórios e arquivos...");

        class DirNode {
            constructor(name, parent = null) {
                this.name = name;
                this.parent = parent;
                this.subdirs = [];
                this.files = [];
                this.dirIndex = 1;
                this.parentDirIndex = 1;
                this.isoLba = 0;
                this.isoSize = 0;
                this.udfFeLogicalLba = 0;
                this.udfFidLogicalLba = 0;
            }
        }

        class FileNode {
            constructor(name, handle, size, parent) {
                this.name = name;
                this.handle = handle;
                this.size = size;
                this.parent = parent;
                this.isoLba = 0;
                this.udfFeLogicalLba = 0;
            }
        }

        const rootDir = new DirNode("");
        const allDirs = [rootDir];
        const allFiles = [];

        async function scanDirectory(handle, currentDirNode) {
            const entries = [];
            for await (const entry of handle.values()) {
                entries.push(entry);
            }
            // Ordenar alfabeticamente
            entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

            // 1. Processar primeiro os arquivos do diretório atual (garante SYSTEM.CNF e executável no início do stream)
            for (const entry of entries) {
                if (entry.kind === 'file') {
                    const f = await entry.getFile();
                    const fileNode = new FileNode(entry.name, entry, f.size, currentDirNode);
                    currentDirNode.files.push(fileNode);
                    allFiles.push(fileNode);
                }
            }

            // 2. Processar depois os subdiretórios recursivamente
            for (const entry of entries) {
                if (entry.kind === 'directory') {
                    const subDirNode = new DirNode(entry.name, currentDirNode);
                    currentDirNode.subdirs.push(subDirNode);
                    allDirs.push(subDirNode);
                    await scanDirectory(entry, subDirNode);
                }
            }
        }

        await scanDirectory(dirHandle, rootDir);

        let dirCounter = 1;
        for (const d of allDirs) {
            d.dirIndex = dirCounter++;
            d.parentDirIndex = d.parent ? d.parent.dirIndex : 1;
        }

        // ════════════════════════════════════════════════════════════════════════
        // ALOCAÇÃO DE LBAS (ESTRUTURA IUP PS2 EXATA)
        // ════════════════════════════════════════════════════════════════════════
        const mainVdsLba = 32;    // LBA 32..37 (PVD, IUVD, PD, LV, USD, TD)
        const reserveVdsLba = 48; // LBA 48..53 (Copy VDS)
        const lviLba = 64;        // LBA 64..65 (LVI, TD)

        function nameByteLen(name) {
            return new TextEncoder().encode(name).length;
        }

        const pathTableLba = 257; // LBA 257
        let pathTableSize = 0;
        for (const d of allDirs) {
            const idLen = d.parent === null ? 1 : nameByteLen(d.name);
            const entrySize = 4 + 2 + 2 + idLen + (idLen % 2 === 1 ? 1 : 0);
            pathTableSize += entrySize;
        }
        const pathTableSectors = Math.ceil(pathTableSize / SECTOR_SIZE);

        const pathTableBeLba = pathTableLba + (pathTableSectors * 2);
        const fileEntriesLba = pathTableBeLba + (pathTableSectors * 2);

        // Alocar LBAs dos Diretórios ISO9660
        let currentLba = fileEntriesLba;
        for (const d of allDirs) {
            d.isoLba = currentLba;
            let dirBytes = 34 + 34; // . e ..
            for (const sub of d.subdirs) {
                const nameLen = nameByteLen(sub.name);
                const recLen = 33 + nameLen + (nameLen % 2 === 0 ? 1 : 0);
                dirBytes += recLen;
            }
            for (const f of d.files) {
                const nameLen = nameByteLen(f.name) + 2; // ;1
                const recLen = 33 + nameLen + (nameLen % 2 === 0 ? 1 : 0);
                dirBytes += recLen;
            }
            d.isoSize = dirBytes;
            currentLba += Math.ceil(dirBytes / SECTOR_SIZE);
        }

        const sectorCountRecords = currentLba - fileEntriesLba;
        const partitionLba = currentLba; // Inicio do UDF FileSet (FSD)

        // UDF File Identifiers (FID) e File Entries (FE)
        // PartitionLBA = FSD, PartitionLBA + 1 = TD, PartitionLBA + 2 = FIDs
        let fidCurrentLogicalLba = 2;

        for (const d of allDirs) {
            d.udfFidLogicalLba = fidCurrentLogicalLba;

            let fidLen = makeUdfFid(0, true, true, "", 0).length; // parent ..
            for (const sub of d.subdirs) {
                fidLen += makeUdfFid(0, true, false, sub.name, 0).length;
            }
            for (const f of d.files) {
                fidLen += makeUdfFid(0, false, false, f.name, 0).length;
            }
            fidCurrentLogicalLba += Math.ceil(fidLen / SECTOR_SIZE);
        }

        const feStartLogicalLba = partitionLba + 2 + (fidCurrentLogicalLba - 2);

        let currentFeLogical = feStartLogicalLba - partitionLba;
        for (const d of allDirs) {
            d.udfFeLogicalLba = currentFeLogical++;
        }
        for (const f of allFiles) {
            f.udfFeLogicalLba = currentFeLogical++;
        }

        const streamStartLba = partitionLba + currentFeLogical;

        // Alocar Arquivos de Dados
        currentLba = streamStartLba;
        for (const f of allFiles) {
            f.isoLba = currentLba;
            const fileSectors = Math.ceil(f.size / SECTOR_SIZE);
            currentLba += fileSectors;
        }

        // Alinhamento de 16 setores (ECC block PS2) + 256 setores para o AVDP de backup final
        const minSectors = ((currentLba + 256 + 15) & ~15);
        let totalSectors = minSectors;
        if (sourceIsoFile && sourceIsoFile.size >= minSectors * SECTOR_SIZE) {
            totalSectors = Math.floor(sourceIsoFile.size / SECTOR_SIZE);
        }

        // ════════════════════════════════════════════════════════════════════════
        // ESCRITA DOS SETORES DE SISTEMA E METADADOS
        // ════════════════════════════════════════════════════════════════════════

        let writtenLba = 0;

        // 1. System Area (LBA 0..15)
        if (sourceIsoFile && sourceIsoFile.size >= 32768) {
            const sysSlice = await sourceIsoFile.slice(0, 32768).arrayBuffer();
            await writer.write(new Uint8Array(sysSlice));
        } else {
            await writer.write(new Uint8Array(16 * SECTOR_SIZE));
        }
        writtenLba = 16;

        // 2. ISO9660 PVD (LBA 16)
        const pvdSector = new Uint8Array(SECTOR_SIZE);
        pvdSector[0] = 1;
        pvdSector.set(new TextEncoder().encode("CD001"), 1);
        pvdSector[6] = 1;
        pvdSector[7] = 0;

        function setPadStr(offset, len, str) {
            const buf = new Uint8Array(len).fill(0x20); // space padding 0x20
            const enc = new TextEncoder().encode(str);
            buf.set(enc.subarray(0, Math.min(len, enc.length)));
            pvdSector.set(buf, offset);
        }

        setPadStr(8, 32, "PLAYSTATION");
        setPadStr(40, 32, volumeLabel);

        pvdSector.set(IOextent.toLEBE(totalSectors, 32), 80);
        pvdSector.set(IOextent.toLEBE(1, 16), 120);
        pvdSector.set(IOextent.toLEBE(1, 16), 124);
        pvdSector.set(IOextent.toLEBE(2048, 16), 128);
        pvdSector.set(IOextent.toLEBE(pathTableSize, 32), 132);

        const pvdDv = new DataView(pvdSector.buffer);
        pvdDv.setUint32(140, pathTableLba, true);
        pvdDv.setUint32(148, pathTableBeLba, false);

        // Extrair data/hora original da ISO original para manter fidelidade 100% (ou usar data atual)
        let baseDate = options.timestamp || new Date();
        let baseTz = 540; // UTC+9 (JST), padrão dos masters PS2 da Sony
        let customVolSetUnique = null;

        if (sourceIsoFile && sourceIsoFile.size >= 33 * SECTOR_SIZE) {
            try {
                const uPvdBuf = await sourceIsoFile.slice(32 * SECTOR_SIZE, 33 * SECTOR_SIZE).arrayBuffer();
                const uPvdDv = new DataView(uPvdBuf);
                if (uPvdDv.getUint16(0, true) === 1) { // PVD Tag
                    const rawTz = uPvdDv.getUint16(0x178, true);
                    const rawYear = uPvdDv.getUint16(0x17A, true);
                    const rawMonth = uPvdDv.getUint8(0x17C);
                    const rawDay = uPvdDv.getUint8(0x17D);
                    const rawHour = uPvdDv.getUint8(0x17E);
                    const rawMinute = uPvdDv.getUint8(0x17F);
                    const rawSecond = uPvdDv.getUint8(0x180);

                    if (rawYear >= 1990 && rawYear <= 2040 && rawMonth >= 1 && rawMonth <= 12) {
                        baseDate = new Date(Date.UTC(rawYear, rawMonth - 1, rawDay, rawHour, rawMinute, rawSecond));
                        let tzVal = rawTz & 0x0FFF;
                        if (tzVal & 0x0800) tzVal -= 0x1000;
                        baseTz = tzVal;
                    }

                    // Extrair os 8 caracteres de ID único do VolumeSetID original se existirem
                    const rawVolSetBytes = new Uint8Array(uPvdBuf, 0x48, 16);
                    if (rawVolSetBytes[0] === 8) {
                        let extractedId = "";
                        for (let i = 1; i <= 8; i++) {
                            extractedId += String.fromCharCode(rawVolSetBytes[i]);
                        }
                        customVolSetUnique = extractedId;
                    }
                }
            } catch (_) {}
        }

        // Root Directory Record (34 bytes at offset 156)
        pvdSector[156] = 34; // Record len
        pvdSector[157] = 0;  // Ext attr len
        pvdSector.set(IOextent.toLEBE(rootDir.isoLba, 32), 158);
        pvdSector.set(IOextent.toLEBE(Math.ceil(rootDir.isoSize / SECTOR_SIZE) * SECTOR_SIZE, 32), 166);

        pvdSector[174] = baseDate.getUTCFullYear() - 1900;
        pvdSector[175] = baseDate.getUTCMonth() + 1;
        pvdSector[176] = baseDate.getUTCDate();
        pvdSector[177] = baseDate.getUTCHours();
        pvdSector[178] = baseDate.getUTCMinutes();
        pvdSector[179] = baseDate.getUTCSeconds();
        pvdSector[180] = Math.round(baseTz / 15); // GMT offset

        pvdSector[181] = 0x02; // Flags = Directory
        pvdSector[182] = 0;    // File unit size
        pvdSector[183] = 0;    // Interleave gap size
        pvdSector.set(IOextent.toLEBE(1, 16), 184); // VolSeqNum
        pvdSector[188] = 1;    // File Identifier len
        pvdSector[189] = 0;    // File Identifier = \x00 (Root)

        setPadStr(190, 128, ""); // VolumeSetID
        setPadStr(318, 128, ""); // Publisher
        setPadStr(446, 128, ""); // DataPreparer
        setPadStr(574, 128, ""); // ApplicationID
        setPadStr(702, 37, "");  // Copyright
        setPadStr(739, 37, "");  // Abstract
        setPadStr(776, 37, "");  // Bibliography

        function setDateStr(offset, dateObj) {
            if (!dateObj) {
                const emptyDate = new Uint8Array(17).fill(0x30); // '0'
                emptyDate[16] = 0;
                pvdSector.set(emptyDate, offset);
                return;
            }
            const pad = (n, c) => n.toString().padStart(c, '0');
            const str = pad(dateObj.getUTCFullYear(), 4) +
                        pad(dateObj.getUTCMonth() + 1, 2) +
                        pad(dateObj.getUTCDate(), 2) +
                        pad(dateObj.getUTCHours(), 2) +
                        pad(dateObj.getUTCMinutes(), 2) +
                        pad(dateObj.getUTCSeconds(), 2) +
                        "00"; // hundredths
            pvdSector.set(new TextEncoder().encode(str), offset);
            pvdSector[offset + 16] = Math.round(baseTz / 15);
        }

        setDateStr(813, baseDate);  // Criação
        setDateStr(830, baseDate);  // Modificação
        setDateStr(847, null);      // Validade
        setDateStr(864, null);      // Disponível

        pvdSector[881] = 1; // File structure version
        pvdSector[882] = 0; // Reserved

        await writer.write(pvdSector);
        writtenLba = 17;

        // 3. ISO9660 VDST (LBA 17)
        const vdstSector = new Uint8Array(SECTOR_SIZE);
        vdstSector[0] = 255;
        vdstSector.set(new TextEncoder().encode("CD001"), 1);
        vdstSector[6] = 1;
        await writer.write(vdstSector);
        writtenLba = 18;

        // 4. UDF VRS (LBA 18, 19, 20)
        const bea = new Uint8Array(SECTOR_SIZE);
        bea.set(new TextEncoder().encode("\x00BEA01\x01"), 0);
        await writer.write(bea);

        const nsr = new Uint8Array(SECTOR_SIZE);
        nsr.set(new TextEncoder().encode("\x00NSR02\x01"), 0);
        await writer.write(nsr);

        const tea = new Uint8Array(SECTOR_SIZE);
        tea.set(new TextEncoder().encode("\x00TEA01\x01"), 0);
        await writer.write(tea);
        writtenLba = 21;

        // Padding para LBA 32
        if (writtenLba < 32) {
            await writer.write(new Uint8Array((32 - writtenLba) * SECTOR_SIZE));
            writtenLba = 32;
        }

        // 5. Main VDS (LBA 32..37)
        await writer.write(makeUdfPvd(32, volumeLabel, baseDate, baseTz, customVolSetUnique));
        await writer.write(makeUdfIuvd(33, volumeLabel));
        await writer.write(makeUdfPd(34, partitionLba, totalSectors));
        await writer.write(makeUdfLv(35, volumeLabel));
        await writer.write(makeUdfUsd(36));
        await writer.write(makeUdfTd(37));
        writtenLba = 38;

        // Padding para LBA 48
        if (writtenLba < 48) {
            await writer.write(new Uint8Array((48 - writtenLba) * SECTOR_SIZE));
            writtenLba = 48;
        }

        // 6. Reserve VDS (LBA 48..53)
        await writer.write(makeUdfPvd(48, volumeLabel, baseDate, baseTz, customVolSetUnique));
        await writer.write(makeUdfIuvd(49, volumeLabel));
        await writer.write(makeUdfPd(50, partitionLba, totalSectors));
        await writer.write(makeUdfLv(51, volumeLabel));
        await writer.write(makeUdfUsd(52));
        await writer.write(makeUdfTd(53));
        writtenLba = 54;

        // Padding para LBA 64
        if (writtenLba < 64) {
            await writer.write(new Uint8Array((64 - writtenLba) * SECTOR_SIZE));
            writtenLba = 64;
        }

        // 7. Integrity Volume (LBA 64..65)
        await writer.write(makeUdfLvi(64, totalSectors, partitionLba, allFiles.length, allDirs.length, baseDate, baseTz));
        await writer.write(makeUdfTd(65));
        writtenLba = 66;

        // Padding para LBA 256
        if (writtenLba < 256) {
            await writer.write(new Uint8Array((256 - writtenLba) * SECTOR_SIZE));
            writtenLba = 256;
        }

        // 8. AVDP (LBA 256)
        await writer.write(makeUdfAvdp(256, 32, 48));
        writtenLba = 257;

        // 9. ISO9660 Path Tables L e M (LBA 257..)
        const lPathBuf = new Uint8Array(pathTableSectors * SECTOR_SIZE);
        const mPathBuf = new Uint8Array(pathTableSectors * SECTOR_SIZE);
        let lOff = 0, mOff = 0;

        for (const d of allDirs) {
            const idBytes = d.parent === null ? new Uint8Array([0]) : new TextEncoder().encode(d.name);
            const idLen = idBytes.length;
            const entryLen = 8 + idLen + (idLen % 2 === 1 ? 1 : 0);

            const lDv = new DataView(lPathBuf.buffer, lOff);
            lDv.setUint8(0, idLen);
            lDv.setUint32(2, d.isoLba, true);
            lDv.setUint16(6, d.parentDirIndex, true);
            lPathBuf.set(idBytes, lOff + 8);
            lOff += entryLen;

            const mDv = new DataView(mPathBuf.buffer, mOff);
            mDv.setUint8(0, idLen);
            mDv.setUint32(2, d.isoLba, false);
            mDv.setUint16(6, d.parentDirIndex, false);
            mPathBuf.set(idBytes, mOff + 8);
            mOff += entryLen;
        }

        // Write L LE twice and M BE twice to match C# ISO9660.cs
        await writer.write(lPathBuf);
        await writer.write(lPathBuf);
        await writer.write(mPathBuf);
        await writer.write(mPathBuf);
        writtenLba += (pathTableSectors * 4);

        // 10. ISO9660 Directory Records (LBA FileEntriesLBA)
        for (const d of allDirs) {
            const dirBuf = new Uint8Array(Math.ceil(d.isoSize / SECTOR_SIZE) * SECTOR_SIZE);
            let off = 0;

            function addRec(lba, size, isDir, name) {
                const isRoot = name === "\x00";
                const isParent = name === "\x01";
                let nameBytes = isRoot || isParent ? new Uint8Array([name.charCodeAt(0)]) : new TextEncoder().encode(isDir ? name : name + ";1");
                const nameLen = nameBytes.length;
                const recLen = 33 + nameLen + (nameLen % 2 === 0 ? 1 : 0);

                if (off + recLen > dirBuf.length) return;
                const dv = new DataView(dirBuf.buffer, off);
                dirBuf[off] = recLen;
                dirBuf.set(IOextent.toLEBE(lba, 32), off + 2);
                dirBuf.set(IOextent.toLEBE(size, 32), off + 10);
                dirBuf[off + 18] = baseDate.getUTCFullYear() - 1900;
                dirBuf[off + 19] = baseDate.getUTCMonth() + 1;
                dirBuf[off + 20] = baseDate.getUTCDate();
                dirBuf[off + 21] = baseDate.getUTCHours();
                dirBuf[off + 22] = baseDate.getUTCMinutes();
                dirBuf[off + 23] = baseDate.getUTCSeconds();
                dirBuf[off + 24] = Math.round(baseTz / 15);
                dirBuf[off + 25] = isDir ? 0x02 : 0x00;
                dirBuf.set(IOextent.toLEBE(1, 16), off + 28);
                dirBuf[off + 32] = nameLen;
                dirBuf.set(nameBytes, off + 33);

                off += recLen;
            }

            // Em ISO9660 ECMA-119:
            // 1. '.' (\x00)
            // 2. '..' (\x01)
            // 3. Todos os outros registros (pastas e arquivos) ordenados juntos em ordem alfabética ascendente
            addRec(d.isoLba, Math.ceil(d.isoSize / SECTOR_SIZE) * SECTOR_SIZE, true, "\x00"); // .
            addRec(d.parent ? d.parent.isoLba : d.isoLba, Math.ceil((d.parent ? d.parent.isoSize : d.isoSize) / SECTOR_SIZE) * SECTOR_SIZE, true, "\x01"); // ..

            const combinedEntries = [
                ...d.subdirs.map(sub => ({ lba: sub.isoLba, size: Math.ceil(sub.isoSize / SECTOR_SIZE) * SECTOR_SIZE, isDir: true, name: sub.name })),
                ...d.files.map(f => ({ lba: f.isoLba, size: f.size, isDir: false, name: f.name }))
            ];
            combinedEntries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

            for (const item of combinedEntries) {
                addRec(item.lba, item.size, item.isDir, item.name);
            }

            await writer.write(dirBuf);
            writtenLba += Math.ceil(d.isoSize / SECTOR_SIZE);
        }

        // 11. UDF Partition Area (LBA PartitionLBA)
        // PartitionLBA: FSD (Logical LBA 0 inside partition)
        await writer.write(makeUdfFsd(0, rootDir.udfFeLogicalLba, volumeLabel, baseDate, baseTz));
        writtenLba++;

        // PartitionLBA + 1: TD (Logical LBA 1 inside partition)
        await writer.write(makeUdfTd(1));
        writtenLba++;

        // PartitionLBA + 2: UDF FIDs (Logical LBA 2.. inside partition)
        for (const d of allDirs) {
            const fidsList = [
                makeUdfFid(d.udfFidLogicalLba, true, true, "", d.parent ? d.parent.udfFeLogicalLba : rootDir.udfFeLogicalLba)
            ];
            for (const sub of d.subdirs) {
                fidsList.push(makeUdfFid(d.udfFidLogicalLba, true, false, sub.name, sub.udfFeLogicalLba));
            }
            for (const f of d.files) {
                fidsList.push(makeUdfFid(d.udfFidLogicalLba, false, false, f.name, f.udfFeLogicalLba));
            }

            let totalFidBytes = 0;
            for (const fid of fidsList) totalFidBytes += fid.length;
            d.udfFidTotalSize = totalFidBytes; // SAVE EXACT UDF FIDs LENGTH

            const fidBuf = new Uint8Array(Math.ceil(totalFidBytes / SECTOR_SIZE) * SECTOR_SIZE);
            let fidOff = 0;
            for (const fid of fidsList) {
                fidBuf.set(fid, fidOff);
                fidOff += fid.length;
            }
            await writer.write(fidBuf);
            writtenLba += Math.ceil(totalFidBytes / SECTOR_SIZE);
        }

        // UDF File Entries (FE) (Logical LBAs inside partition)
        for (const d of allDirs) {
            await writer.write(makeUdfFileEntry(d.udfFeLogicalLba, true, d.udfFidTotalSize, d.udfFidLogicalLba, baseDate, baseTz));
            writtenLba++;
        }

        for (const f of allFiles) {
            // CORREÇÃO: o Tag Location deste FE deve ser o LBA relativo à partição
            // (igual ao usado para os diretórios acima e para o ICB no FID que aponta
            // para este FE). Somar partitionLba aqui misturava endereçamento absoluto
            // com relativo dentro do mesmo campo, gerando uma Tag Location inconsistente.
            await writer.write(makeUdfFileEntry(f.udfFeLogicalLba, false, f.size, f.isoLba - partitionLba, baseDate, baseTz));
            writtenLba++;
        }

        // ════════════════════════════════════════════════════════════════════════
        // ESCRITA DOS ARQUIVOS DE DADOS EM STREAMING (ZERO IMPACTO NA RAM)
        // ════════════════════════════════════════════════════════════════════════
        let processedFiles = 0;
        for (const fileNode of allFiles) {
            processedFiles++;
            if (onProgress) {
                onProgress(4, `Gravando arquivo (${processedFiles}/${allFiles.length}): ${fileNode.name}`);
            }

            const fData = await fileNode.handle.getFile();
            const reader = fData.stream().getReader();

            let bytesWrittenForFile = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await writer.write(value);
                bytesWrittenForFile += value.length;
            }

            const padding = (SECTOR_SIZE - (fileNode.size % SECTOR_SIZE)) % SECTOR_SIZE;
            if (padding > 0) {
                await writer.write(new Uint8Array(padding));
            }
            writtenLba += Math.ceil(fileNode.size / SECTOR_SIZE);
        }

        // ════════════════════════════════════════════════════════════════════════
        // FINALIZAÇÃO: BACKUP AVDP E PADDING ATÉ totalSectors
        // ════════════════════════════════════════════════════════════════════════
        const backupAvdpLba = totalSectors - 256;
        if (writtenLba < backupAvdpLba) {
            await writer.write(new Uint8Array((backupAvdpLba - writtenLba) * SECTOR_SIZE));
            writtenLba = backupAvdpLba;
        }

        // AVDP de Backup no setor (totalSectors - 256)
        await writer.write(makeUdfAvdp(writtenLba, 32, 48));
        writtenLba++;

        // Padding e AVDP duplicado no último setor (totalSectors - 1)
        if (writtenLba < totalSectors - 1) {
            await writer.write(new Uint8Array((totalSectors - 1 - writtenLba) * SECTOR_SIZE));
            writtenLba = totalSectors - 1;
        }

        await writer.write(makeUdfAvdp(writtenLba, 32, 48));
        writtenLba++;

        await writer.close();
        if (onProgress) onProgress(5, "Reconstrução ISO9660+UDF (Layout IUP PS2) concluída com sucesso!");
        return true;
    }

    static async ExtrairNaPasta(isoFile, destHandle, options = {}) {
        const { onProgress } = options;
        const pvd = await Setor.readSector(isoFile, 16);

        const rootLba = IOextent.readUInt(new DataView(pvd.DirectoryRecordRoot.buffer), 2, 32);
        const rootSize = IOextent.readUInt(new DataView(pvd.DirectoryRecordRoot.buffer), 10, 32);

        async function walk(lba, size, currentHandle, path = "") {
            const slice = isoFile.slice(lba * 2048, (lba * 2048) + size);
            const data = new Uint8Array(await slice.arrayBuffer());
            const entries = Arquivo.lerPastas(data);

            for (const entry of entries) {
                if (!entry.Name ||
                    entry.Name === "." ||
                    entry.Name === ".." ||
                    entry.Name === "\x00" ||
                    entry.Name === "\x01" ||
                    entry.Name.length <= 1) {
                    continue;
                }

                const safeName = entry.Name.replace(/[<>:"/\\|?*]/g, '_').trim();
                if (!safeName) continue;

                if (entry.Flags.includes(RegrasArquivo.SubDiretorio)) {
                    const subHandle = await currentHandle.getDirectoryHandle(safeName, { create: true });
                    await walk(entry.LBA, entry.Tamanho, subHandle, path + safeName + "/");
                } else {
                    let exists = false;
                    try {
                        await currentHandle.getFileHandle(safeName, { create: false });
                        exists = true;
                    } catch (e) { }

                    if (!exists) {
                        try {
                            const fileHandle = await currentHandle.getFileHandle(safeName, { create: true });
                            const writable = await fileHandle.createWritable();
                            const fileSlice = isoFile.slice(entry.LBA * 2048, (entry.LBA * 2048) + entry.Tamanho);
                            await fileSlice.stream().pipeTo(writable);
                        } catch (errFile) {
                            console.warn("Aviso ao extrair arquivo original:", safeName, errFile);
                        }
                    }
                    if (onProgress) onProgress(2, `Processando: ${path}${safeName}`);
                }
            }
        }
        await walk(rootLba, rootSize, destHandle);
    }

    static async readSectorData(isoFile, lba, size = 2048) {
        const slice = isoFile.slice(lba * 2048, (lba * 2048) + size);
        return new Uint8Array(await slice.arrayBuffer());
    }
}