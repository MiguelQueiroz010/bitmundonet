function ReadBuffer(buffer, offset, size) {
    const reader = new DataView(buffer);
    return reader.buffer.slice(offset, offset + size);
}

function readUint8(buffer, offset) {
    const reader = new DataView(buffer);
    return reader.getUint8(offset);
}

function readUint16(buffer, offset) {
    const reader = new DataView(buffer);
    return reader.getUint16(offset, true);
}

function readUint32(buffer, offset) {
    const reader = new DataView(buffer);
    return reader.getUint32(offset, true);
}

function readString(buffer, offset) {
    const reader = new DataView(buffer);
    let name = "";
    let i = offset;
    while (reader.getUint8(i) !== 0) {
        name += String.fromCharCode(reader.getUint8(i));
        i++;
    }
    return name;
}

class FileEntry {
    constructor(nameOffset, offset, size) {
        this.nameOffset = nameOffset;
        this.size = size;
        this.offset = offset;
    }
}

class HogFile {
    constructor() {
        this.magic = "";
        this.fileCount = 0;
        this.entries = [];
    }

    parse(buffer) {
        console.log("Iniciando a leitura (parse) do cabeçalho HOG...");

        this.magic = readUint32(buffer, 0);
        this.fileCount = readUint32(buffer, 4);
        const FileIndexBuffer_Size = readUint32(buffer, 8);
        const FileIndexBuffer_Offset = readUint32(buffer, 0xC);

        for (let i = FileIndexBuffer_Offset; i < FileIndexBuffer_Offset + (this.fileCount * 0xC); i += 0xC) {
            let entry = new FileEntry(
                readUint32(buffer, i),
                readUint32(buffer, i + 4),
                readUint32(buffer, i + 8)
            );
            this.entries.push(entry);
            //console.log(`Arquivo ${i}: nameoffs: 0x${entry.nameOffset.toString(16)} size: 0x${entry.size.toString(16)} offs: 0x${entry.offset.toString(16)}`);
        }

        console.log(`Parse concluído: HOG identificado com ${this.fileCount} arquivos.`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnOpenFile = document.getElementById('btn-open-file');
    const infoArea = document.getElementById('info-area');
    const animationContainer = document.getElementById('animation-container');

    btnOpenFile.addEventListener('click', async () => {
        try {

            //Verificar se está compatível as funções do navegador
            if (typeof window.showOpenFilePicker !== 'function') {
                let diagnostic = "";
                const protocol = window.location.protocol;
                const host = window.location.hostname;

                if (protocol === 'file:') {
                    diagnostic = "Você ainda está acessando o arquivo direto do Windows (`file:///C:/...`).";
                } else if (protocol === 'http:' && host !== 'localhost' && host !== '127.0.0.1') {
                    diagnostic = `Você abriu o Live Server mas usando o IP da sua rede WiFi/cabo lógico (EX: \`http://${host}:5500\`). O Chrome não considera IPs locais de rede como conexões seguras, apenas "localhost" ou "127.0.0.1".`;
                } else {
                    diagnostic = "A versão do seu navegador ou a configuração atual ocultou o suporte nativo a manipulação de disco.";
                }

                throw new Error(`
                    <strong>O Chrome bloqueou a API (showOpenFilePicker não definida).</strong><br><br>
                    <strong>MOTIVO:</strong> ${diagnostic}<br><br>
                    <strong>COMO CORRIGIR AGORA MESMO:</strong><br>
                    Olhe a barra de endereços do seu Chrome. Altere para que ela fique estritamente assim:<br>
                    <span style='color:var(--highlight)'>http://127.0.0.1:5500/hog_extractor.html</span>
                `);
            }

            const [fileHandle] = await window.showOpenFilePicker({
                types: [
                    {
                        description: 'Pacotes HOG (Dragon Ball)',
                        accept: { 'application/octet-stream': ['.hog', '.bin'] }
                    }
                ],
                multiple: false // Queremos apenas um arquivo
            });

            const file = await fileHandle.getFile();

            infoArea.innerHTML = `
                <p style="color: var(--highlight)"><strong>Arquivo Carregado:</strong> ${file.name} <em>(${(file.size / 1024).toFixed(2)} KB)</em></p>
                <p>Por favor, selecione a <strong>pasta de destino</strong> para a extração...</p>
            `;

            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite' // Pedimos acesso de ESCRITA na pasta para poder criar arquivos lá dentro
            });

            // 3. ATIVAÇÃO DE PROCESSAMENTO VISUAL (ANIMAÇÃO DBZ AURA)
            animationContainer.style.display = 'block';
            animationContainer.classList.add('active');

            infoArea.innerHTML += `
                <p style="color: var(--highlight)"><strong>Pasta de Destino:</strong> \`${dirHandle.name}\` liberada para gravação!</p>
                <p class="blink-text">Extraindo conteúdo... Elevando o Ki! ⚡</p>
            `;

            // Transcreve arquivo para a RAM (ArrayBuffer puro)
            const arrayBuffer = await file.arrayBuffer();

            // 4. LÊ O PACOTE HOG (Sua Classe)
            const hogFile = new HogFile();
            hogFile.parse(arrayBuffer);

            infoArea.innerHTML += `<hr><p>Total de Entradas: ${hogFile.fileCount}</p><ul>`;

            // 5. SALVANDO OS ARQUIVOS NA PASTA ESCOLHIDA
            for (let i = 0; i < hogFile.entries.length; i++) {
                const entry = hogFile.entries[i];
                const fileName = readString(arrayBuffer, entry.nameOffset);
                const fileSize = entry.size;
                const fileOffset = entry.offset;

                infoArea.innerHTML += `<li>> Extraindo: <span style="color:white">${fileName}</span> <span style="font-size: 0.9em; opacity: 0.7">(${(fileSize / 1024).toFixed(2)} KB)</span><span style="font-size: 0.9em; opacity: 0.7"> - Offset: 0x${(fileOffset.toString(16))}</span></li>`;

                // O Chrome File System Access API NÃO permite colocar "Pasta/Nome.bin" de uma só vez (ele retorna erro).
                // Precisamos quebrar isso em partes (split) e criar diretório por diretório iterativamente.
                // Exemplo: `ARQUIVOS/MAPA/VILA/TEXTURA.bin` -> Ele cria pasta a pasta até chegar na última e salvar o arquivo
                const pathParts = fileName.split(/[/\\]/); // Permite barra \ ou /
                const arquivoFinal = pathParts.pop();      // Tira o último da lista (que é o nome do arquivo), sobra as pastas

                let pastaNivelAtual = dirHandle;

                // Passo A: Resolve (Entra ou Cria) cada pasta na sub-rota iterativamente
                for (const folder of pathParts) {
                    if (folder) {
                        pastaNivelAtual = await pastaNivelAtual.getDirectoryHandle(folder, { create: true });
                    }
                }

                // Passo B: Pedir para criar/substituir o arquivo VAZIO dentro desta última subpasta encontrada
                const newFileHandle = await pastaNivelAtual.getFileHandle(arquivoFinal, { create: true });

                // Passo C: Abrir o fluxo de escrita deste arquivo na máquina
                const writable = await newFileHandle.createWritable();

                // Passo D: Jogar nossos bytes do ArrayBuffer lá pra dentro
                // (Notei que sua função lá no topo começa com 'R' maiúsculo -> ReadBuffer, ajustei aqui)
                await writable.write(ReadBuffer(arrayBuffer, fileOffset, fileSize));

                // Passo E: Fechar o buffer (Termina de Salvar do Cache pro HD do Usuário)
                await writable.close();
            }
            infoArea.innerHTML += `</ul>`;

            setTimeout(() => {
                animationContainer.style.display = 'none';
                animationContainer.classList.remove('active');

                infoArea.innerHTML += `
                    <p style="color: #4CAF50; font-size: 1.25rem; font-weight: bold; margin-top: 1.5rem; border: 1px dashed #4CAF50; padding: 1rem; border-radius: 8px; text-align: center; background: rgba(76,175,80,0.1)">
                        ✓ Extração Concluída com Sucesso!<br>
                        <span style="font-size: 0.85rem; color:#AEEA00">(Poder de Luta Mais de 8000!)</span>
                    </p>
                `;
            }, 3000);

        } catch (error) {
            console.error("Falha no processo:", error);
            if (error.name !== 'AbortError') { // Ignora se o usuário apenas fechou a janela de seleção
                infoArea.innerHTML += `<p style="color: #f44336; font-weight: bold; padding: 1rem; border: 1px solid #f44336; border-radius:8px; margin-top:1rem">Atenção:<br>${error.message}</p>`;
                animationContainer.style.display = 'none';
                animationContainer.classList.remove('active');
            }
        }
    });
});
