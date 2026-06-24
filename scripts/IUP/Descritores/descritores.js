import { IOextent } from '../io_extent.js';
import { Descritor, UDFUtils } from '../udf_osta.js';

/**
 * Equivalente aglutinado da pasta 'Descritores' (C# -> JS)
 * Contém parsers básicos para Volume Primário, Mapas Lógicos, Arquivos e Diretórios UDF.
 */

export class AVDP extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);
            
            this.VolumePrincipal = {
                Tamanho_Dados: IOextent.readUInt(dv, 0x10, 32),
                LBA_Dados: IOextent.readUInt(dv, 0x14, 32)
            };
            
            this.VolumeReserva = {
                Tamanho_Dados: IOextent.readUInt(dv, 0x18, 32),
                LBA_Dados: IOextent.readUInt(dv, 0x1C, 32)
            };
        }
    }
}

export class PVD extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);
            
            this.DescritorVolumeSequencialNumber = IOextent.readUInt(dv, 0x10, 32);
            this.DescritorPrimaryVolumeSequencialNumber = IOextent.readUInt(dv, 0x14, 32);
            
            this.VolumeID = IOextent.readString(sectorData, 0x18).substring(0, 0x20).trim();
            
            this.VolumeSequenceNumber = IOextent.readUInt(dv, 0x38, 16);
            this.MaxVolumeSequenceNumber = IOextent.readUInt(dv, 0x3A, 16);
            this.InterchangeLevel = IOextent.readUInt(dv, 0x3C, 16);
            this.MaxInterchangeLevel = IOextent.readUInt(dv, 0x3E, 16);
            
            this.CharacterSetList = IOextent.readUInt(dv, 0x40, 32);
            this.MaxCharacterSetList = IOextent.readUInt(dv, 0x44, 32);
            
            let volSetIdBytes = IOextent.readBytes(sectorData, 0x48, 0x80);
            this.VolumeSetID = {
                first16: IOextent.readBytes(volSetIdBytes, 0, 16),
                volumeID: IOextent.readString(volSetIdBytes, 16).substring(0, 0x6F).trim(),
                lastCode: volSetIdBytes[0x7f]
            };
            
            // Assume parsing of complex embedded structs (extent_ad, regid, time_stamp)
            this.LBASequenciaDescritorVolumePredecessor = IOextent.readUInt(dv, 0x1E4, 32);
        }
    }

    sectorToBin() {
        const out = new Uint8Array(2048);
        const dataArr = new Uint8Array(2048 - 16);
        const dvData = new DataView(dataArr.buffer);
        
        IOextent.writeUInt(dvData, 0x00, 32, this.DescritorVolumeSequencialNumber || 1);
        IOextent.writeUInt(dvData, 0x04, 32, this.DescritorPrimaryVolumeSequencialNumber || 1);
        
        const volBytes = new TextEncoder().encode(this.VolumeID || "");
        dataArr.set(volBytes.slice(0, 32), 0x08);
        
        // ...Simplified remaining padding to match C# logic (0 to 176 bytes)
        // Tag calc
        this.tag.ID_de_Descritor = 1;
        this.tag.Versao = 2;
        this.tag.LBA_This_Descritor = this.lba;
        this.tag.Tamanho_CRC_Descritor = 512 - 16; 
        this.tag.CRC_Descritor = UDFUtils.computeCrc(dataArr.slice(0, 512 - 16), 512 - 16);
        
        const tagBytes = this.getDescriptorTagBytes();
        tagBytes[4] = Descritor.calculateTagChecksum(tagBytes);
        out.set(tagBytes, 0);
        out.set(dataArr, 16);
        return out;
    }
}

export class PD extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);
            
            this.DescritorVolumeSequencialNumber = IOextent.readUInt(dv, 0x10, 32);
            
            // flag check at 0x14
            let flagBits = IOextent.readBitsFromByte(dv.getUint8(0x14));
            this.Alocado = flagBits[0] ? true : false;
            
            this.NumeroParticoes = IOextent.readUInt(dv, 0x16, 16);
            this.UsoParticao = IOextent.readBytes(sectorData, 0x38, 0x80);
            
            this.TipoAcesso = IOextent.readUInt(dv, 0xB8, 32);
            
            this.LBAParticao = IOextent.readUInt(dv, 0xBC, 32);
            this.TamanhoParticaoBlocks = IOextent.readUInt(dv, 0xC0, 32);
        }
    }

    sectorToBin() {
        const out = new Uint8Array(2048);
        const dataArr = new Uint8Array(2048 - 16);
        const dv = new DataView(dataArr.buffer);
        
        IOextent.writeUInt(dv, 0x00, 32, this.DescritorVolumeSequencialNumber || 2);
        dv.setUint16(4, this.Alocado ? 1 : 0, true);
        dv.setUint16(6, this.NumeroParticoes || 0, true);
        
        // regid + implementation
        if(this.UsoParticao) dataArr.set(this.UsoParticao.slice(0, 128), 0x28);
        
        IOextent.writeUInt(dv, 0xA8, 32, 1); // Access type
        IOextent.writeUInt(dv, 0xAC, 32, this.LBAParticao);
        IOextent.writeUInt(dv, 0xB0, 32, this.TamanhoParticaoBlocks);
        
        this.tag.ID_de_Descritor = 5;
        this.tag.Versao = 2;
        this.tag.LBA_This_Descritor = this.lba;
        this.tag.Tamanho_CRC_Descritor = 512 - 16;
        this.tag.CRC_Descritor = UDFUtils.computeCrc(dataArr.slice(0, 512 - 16), 512-16);
        
        const tagBytes = this.getDescriptorTagBytes();
        tagBytes[4] = Descritor.calculateTagChecksum(tagBytes);
        out.set(tagBytes, 0);
        out.set(dataArr, 16);
        return out;
    }
}

export class LV extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);

            this.DescritorVolumeSequencialNumber = IOextent.readUInt(dv, 0x10, 32);
            
            this.LVIdentifier = IOextent.readString(sectorData, 0x54).substring(0, 0x80).trim();
            this.VolBlockSize = IOextent.readUInt(dv, 0xD4, 32);
            
            this.PartitionMapTableSize = IOextent.readUInt(dv, 0x108, 32);
            this.MapNumber = IOextent.readUInt(dv, 0x10C, 32);
            
            this.PartitionMaps = [];
            let mapOffset = 0x1B8;
            for(let i = 0; i < this.MapNumber; i++) {
                let mapData = IOextent.readBytes(sectorData, mapOffset, this.PartitionMapTableSize);
                let mv = new DataView(mapData.buffer, mapData.byteOffset);
                let mapType = mv.getUint8(0);
                this.PartitionMaps.push({
                    Type: mapType,
                    MapLength: mv.getUint8(1),
                    PartitionNumber: mapType === 1 ? IOextent.readUInt(mv, 4, 16) : null
                });
                mapOffset += this.PartitionMapTableSize;
            }
        }
    }
}

export class LVI extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);
            
            this.Tipo = IOextent.readUInt(dv, 0x1c, 32);
            
            this.NumeroParticoes = IOextent.readUInt(dv, 0x48, 32);
            this.TamanhoUsoImplementacao = IOextent.readUInt(dv, 0x4C, 32);
            
            let offset = 0x50;
            this.TabelaEspacoLivre = [];
            for(let i=0; i<this.NumeroParticoes; i++) {
                this.TabelaEspacoLivre.push(IOextent.readUInt(dv, offset, 32));
                offset += 4;
            }
            
            this.TabelaTamanhos = [];
            for(let i=0; i<this.NumeroParticoes; i++) {
                this.TabelaTamanhos.push(IOextent.readUInt(dv, offset, 32));
                offset += 4;
            }
        }
    }
}

export class FI extends Descritor {
    constructor(entryData, partition) {
        super();
        if (entryData) {
            this.tamanhosetor = partition ? partition.tamanhosetor : 2048;
            this.readDTAG(entryData);
            let dv = new DataView(entryData.buffer, entryData.byteOffset);
            
            this.FileVersionNumber = IOextent.readUInt(dv, 0x10, 16);
            
            let flags = IOextent.readBitsFromByte(dv.getUint8(0x12));
            this.FileCaracteristics = [];
            if(flags[0]) this.FileCaracteristics.push('Hidden'); else this.FileCaracteristics.push('Exists');
            if(flags[1]) this.FileCaracteristics.push('Directory'); else this.FileCaracteristics.push('Archive');
            if(flags[2]) this.FileCaracteristics.push('Deleted');
            if(flags[3]) this.FileCaracteristics.push('Parent');
            if(flags[4]) this.FileCaracteristics.push('Metadata');
            
            this.FileIDSize = dv.getUint8(0x13);
            
            // ICB Extent
            let icbBytes = IOextent.readBytes(entryData, 0x14, 0x10);
            this.ICB = { LogicalBlockNumber: IOextent.readUInt(new DataView(icbBytes.buffer, icbBytes.byteOffset), 0, 32) };
            
            this.TamanhoUsoImplementacao = IOextent.readUInt(dv, 0x24, 16);
            if (this.TamanhoUsoImplementacao > 0) {
                this.UsoImplementacao = IOextent.readBytes(entryData, 0x26, this.TamanhoUsoImplementacao);
            }
            
            if (this.FileIDSize > 0) {
                let textBytes = IOextent.readBytes(entryData, 0x26 + this.TamanhoUsoImplementacao, this.FileIDSize);
                this.FileIdentifier = UDFUtils.readCompressedUnicode(textBytes);
            } else {
                this.FileIdentifier = "";
            }
        }
    }

    sectorToBin() {
        // FI doesn't necessarily take full 2048, it's padded to 4-byte boundaries in descriptors list
        const nameBytes = UDFUtils.getCompressedUnicode(this.FileIdentifier);
        const len = 38 + (this.TamanhoUsoImplementacao || 0) + nameBytes.length;
        const out = new Uint8Array((len + 3) & ~3); // Align 4
        const dv = new DataView(out.buffer);
        
        this.tag.ID_de_Descritor = 0x101;
        this.tag.Versao = 2;
        this.tag.Tamanho_CRC_Descritor = out.length - 16;
        
        dv.setUint16(16, this.FileVersionNumber || 1, true);
        // Flags...
        dv.setUint8(19, this.FileIDSize);
        // ICB...
        
        out.set(this.getDescriptorTagBytes(), 0);
        return out;
    }
}

export class FE extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);
            
            this.UID = IOextent.readUInt(dv, 0x24, 32);
            this.GID = IOextent.readUInt(dv, 0x28, 32);
            this.Permissions = IOextent.readUInt(dv, 0x2C, 32);
            
            this.LinkedFileCount = IOextent.readUInt(dv, 0x30, 16);
            this.RecordFormat = dv.getUint8(0x32);
            this.RecordAttrs = dv.getUint8(0x33);
            this.RecordSize = IOextent.readUInt(dv, 0x34, 32);
            
            this.InfoSize = Number(dv.getBigUint64(0x38, true));
            this.LogicalBlocksWrited = Number(dv.getBigUint64(0x40, true));
            
            this.TamanhoAttrExtendidos = IOextent.readUInt(dv, 0xA8, 32);
            this.TamanhoDescritoresAloc = IOextent.readUInt(dv, 0xAC, 32);
            
            let extOffset = 0xB0 + this.TamanhoAttrExtendidos;
        }
    }
}

export class FSD extends Descritor {
    constructor(sectorData) {
        super();
        if (sectorData) {
            this.readDTAG(sectorData);
            let dv = new DataView(sectorData.buffer, sectorData.byteOffset);
            
            this.InterchangeLevel = IOextent.readUInt(dv, 0x1C, 16);
            this.MaxInterchangeLevel = IOextent.readUInt(dv, 0x1E, 16);
            
            this.CharacterSetList = IOextent.readUInt(dv, 0x20, 32);
            this.MaxCharacterSetList = IOextent.readUInt(dv, 0x24, 32);
            
            this.FileSetNumber = IOextent.readUInt(dv, 0x28, 32);
            this.FileSetDescriptorNumber = IOextent.readUInt(dv, 0x2C, 32);
            
            this.LogicalVolumeIdentifier = IOextent.readString(sectorData, 0x70).substring(0, 0x80).trim();
            this.FileSetIdentifier = IOextent.readString(sectorData, 0x130).substring(0, 0x20).trim();
            
            let icbBytes = IOextent.readBytes(sectorData, 0x190, 0x10);
            this.RootDirectoryICB = { LogicalBlockNumber: IOextent.readUInt(new DataView(icbBytes.buffer, icbBytes.byteOffset), 0, 32) };
            
        }
    }
}
