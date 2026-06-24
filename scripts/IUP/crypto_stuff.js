/**
 * crypto_stuff.js
 * Equivalente JS de CryptoStuff.cs
 *
 * Usa node-forge para AES-CBC com suporte a streaming real (update/finish),
 * evitando os problemas de padding da Web Crypto API em chunks.
 */

// forge não tem build ESM oficial no CDN — carregamos via import() dinâmico
// usando o bundle UMD do cdnjs que expõe window.forge, com fallback para import direto.
const forge = await (async () => {
    if (typeof window !== 'undefined' && window.forge) {
        // Já carregado via <script> no HTML — reutiliza
        return window.forge;
    }
    // Carrega dinamicamente o bundle UMD e retorna o global injetado
    await import('https://cdnjs.cloudflare.com/ajax/libs/forge/1.3.1/forge.min.js');
    if (typeof window !== 'undefined' && window.forge) return window.forge;
    throw new Error('Falha ao carregar node-forge. Adicione o script no HTML ou verifique a conexão.');
})();

const SALT = [0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0xF1, 0xF0, 0xEE, 0x21, 0x22, 0x45];
const ITERATIONS = 1000;
const KEY_SIZE = 32; // 256 bits → bytes
const IV_SIZE = 16; // 128 bits → bytes
const CHUNK_SIZE = 4 * 1024 * 1024; // 64 MB

// ─── Derivação de chave (PBKDF2 SHA-1, compatível com Rfc2898DeriveBytes) ─────

function deriveKeyMaterial(password) {
    const saltStr = SALT.map(b => String.fromCharCode(b)).join('');
    const derived = forge.pkcs5.pbkdf2(password, saltStr, ITERATIONS, KEY_SIZE + IV_SIZE, forge.md.sha1.create());
    return {
        key: derived.substring(0, KEY_SIZE),
        iv: derived.substring(KEY_SIZE, KEY_SIZE + IV_SIZE),
    };
}

// ─── Primitiva: bytes → bytes ─────────────────────────────────────────────────

export async function cryptBytes(password, inBytes, encrypt) {
    const { key, iv } = deriveKeyMaterial(password);
    const cipher = encrypt
        ? forge.cipher.createCipher('AES-CBC', key)
        : forge.cipher.createDecipher('AES-CBC', key);

    cipher.start({ iv });
    cipher.update(forge.util.createBuffer(inBytes));
    cipher.finish();

    const output = cipher.output.getBytes();
    return new Uint8Array(output.split('').map(c => c.charCodeAt(0)));
}

export async function encryptBytes(password, inBytes) {
    return cryptBytes(password, inBytes, true);
}

export async function decryptBytes(password, inBytes) {
    return cryptBytes(password, inBytes, false);
}

// ─── Strings ──────────────────────────────────────────────────────────────────

export async function encryptString(password, plainText) {
    return cryptBytes(password, new TextEncoder().encode(plainText), true);
}

export async function decryptString(password, encryptedBytes) {
    const out = await cryptBytes(password, encryptedBytes, false);
    return new TextDecoder('utf-8').decode(out);
}

// ─── Arquivos pequenos (Blob → Blob, tudo em RAM) ─────────────────────────────

export async function encryptFile(password, file) {
    const inBytes = new Uint8Array(await file.arrayBuffer());
    const outBytes = await cryptBytes(password, inBytes, true);
    return new Blob([outBytes], { type: 'application/octet-stream' });
}

export async function decryptFile(password, file) {
    const inBytes = new Uint8Array(await file.arrayBuffer());
    const outBytes = await cryptBytes(password, inBytes, false);
    return new Blob([outBytes], { type: 'application/octet-stream' });
}

// ─── Arquivos grandes — stream real via forge (sem problema de padding) ────────
//
// forge.cipher suporta .update() incremental + .finish() no final,
// o que resolve exatamente o problema do padding PKCS7 em chunks intermediários.

export async function encryptFileToHandle(password, file, outHandle, onProgress) {
    const { key, iv } = deriveKeyMaterial(password);
    const fileSize = file.size;

    const cipher = forge.cipher.createCipher('AES-CBC', key);
    cipher.start({ iv });

    let writable = null;
    try {
        writable = await outHandle.createWritable();

        let offset = 0;
        while (offset < fileSize) {
            const end = Math.min(offset + CHUNK_SIZE, fileSize);
            const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
            const isLast = end >= fileSize;

            // 1. Alimenta o cipher
            cipher.update(forge.util.createBuffer(chunk));

            if (isLast) {
                cipher.finish();
            }

            // 2. Extrai os bytes processados e LIMPA o buffer interno do forge
            // cipher.output.getBytes() remove os bytes lidos do buffer interno, liberando RAM
            const outBytes = stringToUint8(cipher.output.getBytes());

            if (outBytes.length > 0) {
                // 3. Escrita direta no caminho do arquivo (Disk I/O)
                await writable.write(outBytes);
            }

            offset = end;
            if (onProgress) onProgress(offset / fileSize);

            // 4. Força o respiro do Garbage Collector e da UI
            await yieldToGC();
        }

        await writable.close();
        writable = null;

    } finally {
        if (writable) {
            try { await writable.abort(); } catch (_) { }
        }
    }
}

export async function decryptFileToHandle(password, file, outHandle, onProgress) {
    const { key, iv } = deriveKeyMaterial(password);
    const fileSize = file.size;

    const decipher = forge.cipher.createDecipher('AES-CBC', key);
    decipher.start({ iv });

    let writable = null;
    try {
        writable = await outHandle.createWritable();

        let offset = 0;
        while (offset < fileSize) {
            const end = Math.min(offset + CHUNK_SIZE, fileSize);
            const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
            const isLast = end >= fileSize;

            decipher.update(forge.util.createBuffer(chunk));

            if (isLast) {
                decipher.finish();
            }

            // A mágica da economia de RAM: getBytes() consome o buffer
            const outBytes = stringToUint8(decipher.output.getBytes());

            if (outBytes.length > 0) {
                await writable.write(outBytes);
            }

            offset = end;
            if (onProgress) onProgress(offset / fileSize);

            await yieldToGC();
        }

        await writable.close();
        writable = null;

    } finally {
        if (writable) {
            try { await writable.abort(); } catch (_) { }
        }
    }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

export function toHex(bytes, addSpaces = false) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(addSpaces ? ' ' : '');
}

export function fromHex(hexString) {
    hexString = hexString.replace(/\s+/g, '');
    const result = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        result[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return result;
}

function stringToUint8(str) {
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
    return buf;
}

function yieldToGC() {
    return new Promise(r => setTimeout(r, 0));
}