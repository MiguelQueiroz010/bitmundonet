import { IOextent } from './io_extent.js';

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
            // Sanitização imediata do nome ao ler
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
                // Pular para o próximo setor se encontrar padding
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

export class ISO9660 {

    /**
     * PatchISO: O ponto de entrada principal.
     * 1. Cria/Acede à pasta patch_files.
     * 2. Chama a extração da ISO (que respeita os ficheiros já lá postos pelo RPT).
     * 3. Chama o BuildISO para gerar o ficheiro final.
     */
    static async PatchISO(sourceIsoFile, workDirHandle, outputStream, options = {}) {
        const { onProgress } = options;

        try {
            // 1. Garantir que a subpasta existe (onde o scanPatchMetadata já deve ter posto os ficheiros do RPT)
            const patchDir = await workDirHandle.getDirectoryHandle("patch_files");

            // 2. Extração inteligente: Percorre a ISO e só extrai o que NÃO está na pasta
            // Isso une os ficheiros originais com os modificados pelo RPT
            if (onProgress) onProgress(2, "A sincronizar ficheiros originais e modificados...");
            await ISO9660.ExtrairNaPasta(sourceIsoFile, patchDir, options);

            // 3. Reconstrução: Pega na pasta completa e gera a nova ISO
            if (onProgress) onProgress(4, "A reconstruir estrutura ISO9660 final...");
            const success = await ISO9660.BuildISO(patchDir, outputStream, options);

            return success;
        } catch (err) {
            console.error("Erro fatal no PatchISO:", err);
            throw err;
        }
    }
    /**
     * Reconstroi a ISO. Diferente do C#, aqui usamos Streams para não estourar a RAM. [CORRIGIR COM ERRO]
     */
    static async BuildISO(dirHandle, outputStream, options = {}) {
        const writer = outputStream.getWriter();
        const tamanhoSetor = 2048;
        const files = [];

        // 1. Escaneamento recursivo (Zero RAM)
        async function scan(handle, path = "") {
            for await (const entry of handle.values()) {
                if (entry.kind === 'file') {
                    const f = await entry.getFile();
                    files.push({ name: entry.name, size: f.size, handle: entry });
                } else {
                    await scan(entry, path + entry.name + "/");
                }
            }
        }
        await scan(dirHandle);

        // 2. Escrita dos Metadados (Simplificado para o fluxo do Patcher)
        // Setores 0-16
        await writer.write(new Uint8Array(16 * tamanhoSetor));

        // 3. Escrita dos Arquivos em Stream
        for (const file of files) {
            const fData = await file.handle.getFile();
            // pipeTo não está disponível em WritableStreamDefaultWriter, usamos loop de leitura
            const reader = fData.stream().getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await writer.write(value);
            }
            // Padding do setor
            const padding = (tamanhoSetor - (file.size % tamanhoSetor)) % tamanhoSetor;
            if (padding > 0) await writer.write(new Uint8Array(padding));
        }

        await writer.close();
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

                // Sanitização contra "Name not allowed"
                const safeName = entry.Name.replace(/[<>:"/\\|?*]/g, '_').trim();
                if (!safeName) continue;

                if (entry.Flags.includes(RegrasArquivo.SubDiretorio)) {
                    const subHandle = await currentHandle.getDirectoryHandle(safeName, { create: true });
                    await walk(entry.LBA, entry.Tamanho, subHandle, path + safeName + "/");
                } else {
                    // Tenta verificar se o arquivo já foi extraído pelo patch
                    let exists = false;
                    try {
                        await currentHandle.getFileHandle(safeName, { create: false });
                        exists = true;
                    } catch (e) { }

                    if (!exists) {
                        const fileHandle = await currentHandle.getFileHandle(safeName, { create: true });
                        const writable = await fileHandle.createWritable();
                        const fileSlice = isoFile.slice(entry.LBA * 2048, (entry.LBA * 2048) + entry.Tamanho);
                        await fileSlice.stream().pipeTo(writable);
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