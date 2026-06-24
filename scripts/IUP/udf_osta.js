import { IOextent } from './io_extent.js';

/**
 * Arquivo JS Portado de UDF OSTA (IUP)
 * Classes parseadoras e utilitários para Volumes UDF.
 */

export class UDFUtils {
    // Tabela CRC CCITT do DiscUtils/OSTA
    static CrcTable = new Uint16Array([
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
        0x6E17, 0x7E36, 0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0
    ]);

    static computeCrc(buffer, length) {
        let crc = 0;
        let k = 0, len = length;
        while (len-- > 0) {
            crc = UDFUtils.CrcTable[((crc >> 8) ^ buffer[k++]) & 0xff] ^ (crc << 8);
        }
        return crc & 0xFFFF;
    }

    static tagChecksum(buffer) {
        let sum = buffer[0] + buffer[1] + buffer[2] + buffer[3] + 
                  buffer[5] + buffer[6] + buffer[7] + buffer[8] + 
                  buffer[9] + buffer[10] + buffer[11] + buffer[12] + 
                  buffer[13] + buffer[14] + buffer[15];
        return sum & 0xFF;
    }

    static readCompressedUnicode(buffer) {
        let numberOfBytes = buffer.length;
        if (numberOfBytes === 0) return "";
        let compID = buffer[0];
        
        if (compID !== 8 && compID !== 16 && compID !== 254 && compID !== 255) {
            return "INVALID COMPRESSION!";
        }

        let result = "";
        let byteIndex = 1;
        
        while (byteIndex < numberOfBytes) {
            let charCode = 0;
            if (compID === 16 || compID === 255) {
                charCode = buffer[byteIndex++] << 8;
            }
            if (byteIndex < numberOfBytes) {
                charCode |= buffer[byteIndex++];
            }
            if (charCode !== 0) {
                result += String.fromCharCode(charCode);
            }
        }
        return result;
    }

    /**
     * Codifica string para OSTA Compressed Unicode (default 16-bit)
     */
    static getCompressedUnicode(text, compressionID = 0x10) {
        if (!text) return new Uint8Array([compressionID]);
        
        const bytes = [];
        bytes.push(compressionID);
        
        if (compressionID === 0x10 || compressionID === 255) {
            for (let i = 0; i < text.length; i++) {
                const code = text.charCodeAt(i);
                bytes.push((code >> 8) & 0xFF);
                bytes.push(code & 0xFF);
            }
        } else {
            // 8-bit compression (UTF-8/ASCII)
            for (let i = 0; i < text.length; i++) {
                bytes.push(text.charCodeAt(i) & 0xFF);
            }
        }
        return new Uint8Array(bytes);
    }
}

/**
 * Estruturas comuns de dados UDF
 */
export const UDFStructs = {
    time_stamp: class {
        constructor(date = new Date()) {
            this.UTCspecs = 0x1f4c;
            this.datetime = date;
        }
        getData() {
            const arr = new Uint8Array(12);
            const dv = new DataView(arr.buffer);
            dv.setUint16(0, this.UTCspecs, true);
            dv.setUint16(2, this.datetime.getFullYear(), true);
            arr[4] = this.datetime.getMonth() + 1;
            arr[5] = this.datetime.getDate();
            arr[6] = this.datetime.getHours();
            arr[7] = this.datetime.getMinutes();
            arr[8] = this.datetime.getSeconds();
            arr[9] = 0;
            arr[10] = Math.floor(this.datetime.getMilliseconds());
            arr[11] = 0;
            return arr;
        }
    },
    long_ad: class {
        constructor() {
            this.TamanhoExtent = 0;
            this.LocalizacaoExtent = { LogicalBlockNumber: 0, PartitionReferenceNumber: 0 };
            this.UsoImplementacao = new Uint8Array(6);
        }
        getData() {
            const arr = new Uint8Array(16);
            const dv = new DataView(arr.buffer);
            dv.setUint32(0, this.TamanhoExtent, true);
            dv.setUint32(4, this.LocalizacaoExtent.LogicalBlockNumber, true);
            dv.setUint16(8, this.LocalizacaoExtent.PartitionReferenceNumber, true);
            arr.set(this.UsoImplementacao, 10);
            return arr;
        }
    },
    extent_ad: class {
        constructor() {
            this.ExtentSize = 0;
            this.LBAExtent = 0;
        }
        getData() {
            const arr = new Uint8Array(8);
            const dv = new DataView(arr.buffer);
            dv.setUint32(0, this.ExtentSize, true);
            dv.setUint32(4, this.LBAExtent, true);
            return arr;
        }
    },
    regid: class {
        constructor(id = "") {
            this.Flags = 0;
            this.ID = id;
            this.IDSufixo = new Uint8Array(8);
        }
        getData() {
            const arr = new Uint8Array(32);
            arr[0] = this.Flags;
            const idBytes = new TextEncoder().encode(this.ID);
            arr.set(idBytes.slice(0, 23), 1);
            arr.set(this.IDSufixo, 24);
            return arr;
        }
    },
    icbtag: class {
        constructor(type = 5) {
            this.PreviousDirectEntryNumber = 0;
            this.StrategyType = 4; // FA5
            this.StrategyParameter = new Uint8Array(2);
            this.MaxEntryNumber = 1;
            this.FileType = type;
            this.ICBParentLocation = { LogicalBlockNumber: 0, PartitionReferenceNumber: 0 };
            this.Flags = 0; // Simplified for now
        }
        getData() {
            const arr = new Uint8Array(20);
            const dv = new DataView(arr.buffer);
            dv.setUint32(0, this.PreviousDirectEntryNumber, true);
            dv.setUint16(4, this.StrategyType, true);
            arr.set(this.StrategyParameter, 6);
            dv.setUint16(8, this.MaxEntryNumber, true);
            arr[10] = 0;
            arr[11] = this.FileType;
            dv.setUint32(12, this.ICBParentLocation.LogicalBlockNumber, true);
            dv.setUint16(16, this.ICBParentLocation.PartitionReferenceNumber, true);
            dv.setUint16(18, this.Flags, true);
            return arr;
        }
    }
};

export class Descritor {
    constructor() {
        this.lba = 0;
        this.tamanhosetor = 2048;
        this.offsetsetor = 0;
        this.ChecksumPass = false;
        this.CRCPass = false;
        this.tag = {
            ID_de_Descritor: 0,
            Versao: 0,
            TagChecksum: 0,
            Reservado: 0,
            VolumeSerialNumber: 0,
            CRC_Descritor: 0,
            Tamanho_CRC_Descritor: 0,
            LBA_This_Descritor: 0
        };
    }

    getDescriptorTagBytes() {
        const buffer = new Uint8Array(16);
        const dv = new DataView(buffer.buffer);
        dv.setUint16(0, this.tag.ID_de_Descritor, true);
        dv.setUint16(2, this.tag.Versao, true);
        dv.setUint8(4, this.tag.TagChecksum);
        dv.setUint8(5, this.tag.Reservado);
        dv.setUint16(6, this.tag.VolumeSerialNumber, true);
        dv.setUint16(8, this.tag.CRC_Descritor, true);
        dv.setUint16(10, this.tag.Tamanho_CRC_Descritor, true);
        dv.setUint32(12, this.tag.LBA_This_Descritor, true);
        return buffer;
    }

    /**
     * Calcula o Checksum da Tag (soma dos bytes 0-3 e 5-15 mod 256)
     */
    static calculateTagChecksum(buffer) {
        let sum = 0;
        for (let i = 0; i < 16; i++) {
            if (i === 4) continue;
            sum += buffer[i];
        }
        return sum & 0xFF;
    }

    sectorToBin() {
        // Base implementation: just the tag
        const out = new Uint8Array(this.tamanhosetor || 2048);
        const tagBytes = this.getDescriptorTagBytes();
        out.set(tagBytes, 0);
        return out;
    }

    readDTAG(entradaArray) {
        let dv = new DataView(entradaArray.buffer, entradaArray.byteOffset);
        this.tag.ID_de_Descritor = IOextent.readUInt(dv, 0, 16);
        this.tag.Versao = IOextent.readUInt(dv, 2, 16);
        this.tag.TagChecksum = dv.getUint8(4);
        
        if (this.tag.TagChecksum === UDFUtils.tagChecksum(entradaArray)) {
            this.ChecksumPass = true;
        }
        
        this.tag.Reservado = dv.getUint8(5);
        this.tag.VolumeSerialNumber = IOextent.readUInt(dv, 6, 16);
        this.tag.CRC_Descritor = IOextent.readUInt(dv, 8, 16);
        this.tag.Tamanho_CRC_Descritor = IOextent.readUInt(dv, 10, 16);
        
        let crcBuffer = IOextent.readBytes(entradaArray, 16, this.tag.Tamanho_CRC_Descritor);
        if (UDFUtils.computeCrc(crcBuffer, this.tag.Tamanho_CRC_Descritor) === this.tag.CRC_Descritor) {
            this.CRCPass = true;
        }
        
        this.tag.LBA_This_Descritor = IOextent.readUInt(dv, 12, 32);
    }

    static readSector(bufferArray, lba, tamanho, particaoDict = null, FIentry = false) {
        let sector = FIentry ? IOextent.readBytes(bufferArray, lba, tamanho) 
                             : IOextent.readSector(bufferArray, lba, tamanho);
        
        let dv = new DataView(sector.buffer, sector.byteOffset);
        let tagid = dv.getUint16(0, true); // LE default for most cases, check endianness
        
        let s = new Descritor();
        s.readDTAG(sector);
        s.lba = lba;
        s.tamanhosetor = tamanho;
        s.offsetsetor = lba * tamanho;
        
        // Em um sistema real, nós instancariamos e fariamos extend das classes filhas baseadas 
        // em `tagid`, como PVD(1), AVDP(2), IUVD(4), PD(5), LV(6), USD(7), TD(8), LVI(9)
        // Por exemplo para PVD: if(tagid === 1) return new PVD(sector);
        return s;
    }
}

/**
 * UDF Root Manager
 */
export class UDF {
    constructor(iso9660Instance) {
        this.inheritISO = iso9660Instance;
        this.Setores = [];
        
        // Ponteiro de âncora de Volume (Anchor Volume Descriptor Pointer) -> Sector 256
        let avdp = Descritor.readSector(iso9660Instance.ISOfile, 256, iso9660Instance.Tamanho_Setor);
        this.Setores.push(avdp);
        
        // O restante dos parsers UDF seguiriam aqui: lendo VolumePrimario e SetorReserva pelo LBA armazenado na tag do AVDP.
    }
}
