/**
 * md5_worker.js
 * Web Worker (módulo) para cálculo de MD5 em background.
 * Recebe: { file: File }  via postMessage
 * Envia de volta: { type: 'progress', value: 0..1 }
 *                 { type: 'result',   md5: string }
 *                 { type: 'error',    message: string }
 *
 * O MD5 em si está em IUP/rpt_md5.js. Criar com: new Worker('/scripts/md5_worker.js', { type: 'module' }).
 */
import { Md5 } from './IUP/rpt_md5.js';

const CHUNK_SIZE = 16 * 1024 * 1024;   // 16 MB por leitura; o próximo chunk é lido enquanto o atual é hasheado
const PROGRESS_EVERY_MS = 100;

self.onmessage = async function (e) {
    const { file } = e.data;
    if (!file) {
        self.postMessage({ type: 'error', message: 'Nenhum arquivo recebido.' });
        return;
    }
    try {
        const md5 = new Md5();
        const size = file.size;
        const read = (off) => file.slice(off, Math.min(off + CHUNK_SIZE, size)).arrayBuffer();
        let next = size ? read(0) : null;
        let lastPost = 0;
        for (let off = 0; off < size; off += CHUNK_SIZE) {
            const buf = await next;
            const nextOff = off + CHUNK_SIZE;
            next = nextOff < size ? read(nextOff) : null;
            md5.update(new Uint8Array(buf));
            const now = performance.now();
            if (now - lastPost >= PROGRESS_EVERY_MS) {
                lastPost = now;
                self.postMessage({ type: 'progress', value: Math.min(nextOff, size) / size });
            }
        }
        self.postMessage({ type: 'progress', value: 1 });
        self.postMessage({ type: 'result', md5: md5.digestHex() });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};
