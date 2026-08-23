/**
 * raiden_patcher.js  (v2)
 * Redesign completo com:
 * - Stepper UI (3 etapas)
 * - Worker MD5 em background (não trava UI)
 * - Parse de metadados do .RPT (GameName, Version, Author, TargetMD5, etc.)
 * - Verificação MD5 e modal de confirmação se incompatível
 * - Integração Firebase: contador de usos por patch
 * - showSaveFilePicker para salvar resultado
 */

import { decryptBytes, decryptFileToHandle } from "./IUP/crypto_stuff.js";
import { ISO9660 } from './IUP/iso9660.js';

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════

let isoFileHandle   = null;
let patchFileHandle = null;
let isoFile         = null;
let patchFile       = null;
let debugDirHandle  = null;

let isoMd5          = null;   // resultado MD5 da ISO (string hex)
let isoMd5Done      = false;
let patchMeta       = null;   // { gameName, version, author, targetMd5, desc, fileCount }

let md5Worker       = null;   // Web Worker

// ═══════════════════════════════════════════════════════
// REFERÊNCIAS DOM
// ═══════════════════════════════════════════════════════

const btnSelectIso     = document.getElementById('btn-select-iso');
const btnSelectPatch   = document.getElementById('btn-select-patch');
const btnApplyPatch    = document.getElementById('btn-apply-patch');
const labelIso         = document.getElementById('label-iso');
const labelPatch       = document.getElementById('label-patch');
const spaceLbl         = document.getElementById('space-lbl');
const storageLbl       = document.getElementById('storage-lbl');
const animOverlay      = document.getElementById('anim-overlay');
const btnCloseAnim     = document.getElementById('btn-close-anim');

// Cards
const cardStep1 = document.getElementById('card-step-1');
const cardStep2 = document.getElementById('card-step-2');
const cardStep3 = document.getElementById('card-step-3');

// Stepper
const stepInd1 = document.getElementById('step-indicator-1');
const stepInd2 = document.getElementById('step-indicator-2');
const stepInd3 = document.getElementById('step-indicator-3');
const connector12 = document.getElementById('connector-1-2');
const connector23 = document.getElementById('connector-2-3');

// MD5
const md5Area  = document.getElementById('md5-area');
const md5Bar   = document.getElementById('md5-bar');
const md5Value = document.getElementById('md5-value');

// Patch Summary
const patchSummary   = document.getElementById('patch-summary');
const summaryGrid    = document.getElementById('summary-grid');
const md5MatchBadge  = document.getElementById('md5-match-badge');

// Firebase counter
const firebaseCounter     = document.getElementById('firebase-counter');
const firebaseCounterText = document.getElementById('firebase-counter-text');

// Modal MD5 mismatch
const modalMd5     = document.getElementById('modal-md5-mismatch');
const modalText    = document.getElementById('modal-md5-text');
const modalCancel  = document.getElementById('modal-cancel-btn');
const modalProceed = document.getElementById('modal-proceed-btn');

// Debug
const chkDebugMode       = document.getElementById('chk-debug-mode');
const debugSection       = document.getElementById('debug-section');
const debugControls      = document.getElementById('debug-controls');
const btnToggleDebugUi   = document.getElementById('btn-toggle-debug-ui');
const btnSelectDebugFolder = document.getElementById('btn-select-debug-folder');
const labelDebugFolder   = document.getElementById('label-debug-folder');
const btnApplyDebug      = document.getElementById('btn-apply-debug');

// ═══════════════════════════════════════════════════════
// STEPPER UI
// ═══════════════════════════════════════════════════════

function setStepActive(step) {
    // Reset
    [stepInd1, stepInd2, stepInd3].forEach(el => el.classList.remove('active'));
    [connector12, connector23].forEach(el => el.classList.remove('active'));

    if (step >= 1) stepInd1.classList.add('active');
    if (step >= 2) {
        stepInd1.classList.remove('active');
        stepInd1.classList.add('done');
        connector12.classList.add('active');
        stepInd2.classList.add('active');
        unlockCard(cardStep2);
    }
    if (step >= 3) {
        stepInd2.classList.remove('active');
        stepInd2.classList.add('done');
        connector23.classList.add('active');
        stepInd3.classList.add('active');
        unlockCard(cardStep3);
    }
}

function unlockCard(card) {
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
    card.classList.add('active-card');
}

// ═══════════════════════════════════════════════════════
// SELEÇÃO DE ISO
// ═══════════════════════════════════════════════════════

btnSelectIso.addEventListener('click', async () => {
    try {
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        isoFileHandle = handle;
        isoFile       = await isoFileHandle.getFile();

        labelIso.textContent = isoFile.name;
        labelIso.style.display = 'block';
        btnSelectIso.classList.add('loaded');

        // Iniciar MD5 em background imediatamente
        startMD5Worker(isoFile);
    } catch (e) {
        if (e.name !== 'AbortError') console.error("Erro ao abrir ISO:", e);
    }
});

// ═══════════════════════════════════════════════════════
// MD5 WORKER
// ═══════════════════════════════════════════════════════

function startMD5Worker(file) {
    // Mostrar área de MD5
    md5Area.classList.add('visible');
    md5Bar.style.width = '0%';
    md5Value.className = 'rp-md5-value computing';
    md5Value.textContent = 'Calculando MD5...';
    isoMd5 = null;
    isoMd5Done = false;

    // Avança para step 2 (ISO selecionada)
    setStepActive(2);

    // Criar worker
    if (md5Worker) md5Worker.terminate();
    md5Worker = new Worker('/scripts/md5_worker.js');

    md5Worker.onmessage = (e) => {
        const { type, value, md5, message } = e.data;

        if (type === 'progress') {
            const pct = Math.floor(value * 100);
            md5Bar.style.width = pct + '%';
            md5Value.textContent = `Calculando... ${pct}%`;
        }

        if (type === 'result') {
            isoMd5 = md5;
            isoMd5Done = true;
            md5Bar.style.width = '100%';
            md5Bar.style.background = 'linear-gradient(90deg,#00aa55,#00ff88)';
            md5Value.className = 'rp-md5-value done-val';
            md5Value.textContent = `MD5: ${md5}`;
            md5Worker.terminate();
            md5Worker = null;
            // Atualizar badge de compatibilidade se patch já estiver carregado
            if (patchMeta) updateMd5CompatBadge();
            checkReady();
        }

        if (type === 'error') {
            md5Value.className = 'rp-md5-value error-val';
            md5Value.textContent = `Erro: ${message}`;
            console.error('MD5 Worker error:', message);
        }
    };

    md5Worker.onerror = (err) => {
        console.error('Worker falhou:', err);
        md5Value.className = 'rp-md5-value error-val';
        md5Value.textContent = 'Erro no cálculo MD5.';
    };

    md5Worker.postMessage({ file });
}

// ═══════════════════════════════════════════════════════
// SELEÇÃO DE PATCH
// ═══════════════════════════════════════════════════════

btnSelectPatch.addEventListener('click', async () => {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Patch Raiden (.rpt, .xml)', accept: { 'application/octet-stream': ['.rpt', '.xml'] } }],
            multiple: false
        });
        patchFileHandle = handle;
        patchFile       = await patchFileHandle.getFile();

        labelPatch.textContent = patchFile.name;
        labelPatch.style.display = 'block';
        btnSelectPatch.classList.add('loaded');

        // Descriptografar e ler metadados em background
        await loadPatchMetadata(patchFile);
        checkReady();
    } catch (e) {
        if (e.name !== 'AbortError') console.error("Erro ao abrir patch:", e);
    }
});

// ═══════════════════════════════════════════════════════
// LEITURA DE METADADOS DO PATCH
// ═══════════════════════════════════════════════════════

async function loadPatchMetadata(file) {
    try {
        patchMeta = null;
        patchSummary.classList.remove('visible');
        md5MatchBadge.innerHTML = '';

        // Indicar carregando
        patchSummary.classList.add('visible');
        summaryGrid.innerHTML = `<span class="rp-sum-key" style="grid-column:1/-1;color:var(--rp-text-dim);font-style:italic;">⏳ Lendo patch...</span>`;

        // AES-CBC exige descriptografar o arquivo completo (blocos de 16 bytes com padding PKCS7).
        // Cortar em 64KB quebraria o padding do último bloco. Usamos decryptBytes na RAM.
        // Para patches grandes (raro no header), lemos até 512KB — suficiente para o XML.
        const MAX_HEADER = Math.min(file.size, 512 * 1024);
        // Garante múltiplo de 16 (tamanho de bloco AES) para evitar erro de padding
        const alignedSize = Math.floor(MAX_HEADER / 16) * 16;
        const encBytes = new Uint8Array(await file.slice(0, alignedSize).arrayBuffer());

        let decBytes;
        try {
            decBytes = await decryptBytes("bit.raiden", encBytes);
        } catch(e) {
            console.warn("Não foi possível descriptografar o patch para ler metadados.", e);
            patchSummary.classList.remove('visible');
            return;
        }

        // Verificar magic RPTP (primeiros 4 bytes após descriptografia)
        const magic = new TextDecoder().decode(decBytes.slice(0, 4));
        if (magic !== 'RPTP') {
            console.warn('Magic RPTP não encontrado. Bytes iniciais:', Array.from(decBytes.slice(0,8)).map(b=>b.toString(16)));
            summaryGrid.innerHTML = `<span class="rp-sum-key" style="grid-column:1/-1;color:var(--rp-red);">❌ Formato inválido — não é um patch RPT válido</span>`;
            return;
        }

        // Estrutura: [4 magic][2 reservado][XML string][0x00][arquivos...]
        let xmlStart = 6;
        let xmlEnd   = xmlStart;
        while (xmlEnd < decBytes.length && decBytes[xmlEnd] !== 0) xmlEnd++;

        const xmlStr = new TextDecoder('utf-8').decode(decBytes.slice(xmlStart, xmlEnd));
        console.log('[RPT] XML extraído:', xmlStr.substring(0, 300));

        // Parse XML
        const parser = new DOMParser();
        const doc    = parser.parseFromString(xmlStr, 'application/xml');

        const get = (tag) => {
            const el = doc.querySelector(tag);
            return el ? el.textContent.trim() : null;
        };

        // Contagem de entradas de arquivo no header já descriptografado
        let fileCount = 0;
        let p = xmlEnd + 1;
        while (p + 8 < decBytes.length) {
            const dv = new DataView(decBytes.buffer, decBytes.byteOffset + p, 8);
            const fSize = Number(dv.getBigUint64(0, true));
            p += 8;
            let nameEnd = p;
            while (nameEnd < decBytes.length && decBytes[nameEnd] !== 0) nameEnd++;
            const fname = new TextDecoder().decode(decBytes.slice(p, nameEnd));
            p = nameEnd + 1;
            if (fname) fileCount++;
            p += fSize;
            if (fSize === 0 || fSize > 67108864) break;
        }

        patchMeta = {
            gameName:  get('GameName')  || get('Game')    || 'N/A',
            version:   get('Version')   || get('Ver')     || 'N/A',
            author:    get('Author')    || get('Creator') || 'N/A',
            targetMd5: get('TargetMD5') || get('MD5')     || get('BaseMD5') || null,
            desc:      get('Resumo')    || get('Description') || get('Desc') || null,
            fileCount,
        };

        renderPatchSummary();
    } catch (e) {
        console.error('Erro ao ler metadados do patch:', e);
        summaryGrid.innerHTML = `<span class="rp-sum-key" style="grid-column:1/-1;color:var(--rp-red);">❌ Erro ao ler patch: ${e.message}</span>`;
    }
}

function renderPatchSummary() {
    if (!patchMeta) return;

    let html = '';

    // Bloco de Resumo — preserva quebras de linha do XML
    if (patchMeta.desc) {
        // Substitui \n por <br> e preserva espaços de indentação
        const descHtml = escHtml(patchMeta.desc)
            .replace(/\n/g, '<br>')
            .replace(/  /g, '&nbsp;&nbsp;');
        html += `<div class="rp-resumo-block">${descHtml}</div>`;
    } else {
        // Sem Resumo: mostra campos básicos
        html += `
            <div class="rp-resumo-fallback">
                <span class="rp-sum-key">Jogo</span><span class="rp-sum-val">${escHtml(patchMeta.gameName)}</span>
                <span class="rp-sum-key">Versão</span><span class="rp-sum-val">${escHtml(patchMeta.version)}</span>
                <span class="rp-sum-key">Autor</span><span class="rp-sum-val">${escHtml(patchMeta.author)}</span>
            </div>`;
    }

    // MD5 alvo sempre exibido se disponível
    if (patchMeta.targetMd5) {
        html += `
            <div class="rp-md5-target-row">
                <span class="rp-md5-target-label">MD5 ALVO</span>
                <code class="rp-md5-target-val">${escHtml(patchMeta.targetMd5)}</code>
            </div>`;
    }

    summaryGrid.innerHTML = html;
    patchSummary.classList.add('visible');

    // Contador Firebase
    loadFirebaseCounter(patchMeta.gameName, patchFile?.name);

    // Badge de compatibilidade MD5
    updateMd5CompatBadge();
}

function updateMd5CompatBadge() {
    if (!patchMeta || !patchMeta.targetMd5) {
        md5MatchBadge.innerHTML = '';
        return;
    }

    if (!isoMd5Done) {
        md5MatchBadge.innerHTML =
            `<span class="rp-md5-badge pending">⏳ Aguardando MD5 da ISO...</span>`;
        return;
    }

    const match = isoMd5?.toLowerCase() === patchMeta.targetMd5?.toLowerCase();
    if (match) {
        md5MatchBadge.innerHTML =
            `<span class="rp-md5-badge match">✓ MD5 Compatível — ISO Correta!</span>`;
    } else {
        md5MatchBadge.innerHTML =
            `<span class="rp-md5-badge nomatch">✗ MD5 Diferente — ISO pode não ser a versão correta</span>`;
    }
}

// ═══════════════════════════════════════════════════════
// CHECK READY
// ═══════════════════════════════════════════════════════

function checkReady() {
    if (!isoFile) return;
    if (!patchFile) return;

    setStepActive(3);
    btnApplyPatch.disabled = false;
    btnApplyPatch.classList.add('rp-pulse');

    if (isoFile && patchFile) {
        const sizeTotal   = isoFile.size + patchFile.size;
        const spaceNeeded = isoFile.size + patchFile.size + 2147483648;
        spaceLbl.textContent = `Streaming nativo ativo · ${formatBytes(sizeTotal)} selecionados`;
        storageLbl.textContent = `Espaço recomendado: ${formatBytes(spaceNeeded)} livres`;
    }
}

// ═══════════════════════════════════════════════════════
// APLICAR PATCH
// ═══════════════════════════════════════════════════════

btnApplyPatch.addEventListener('click', async () => {
    if (!isoFile || !patchFile) return;

    // Verificar MD5 — se incompatível, mostrar modal
    if (patchMeta?.targetMd5 && isoMd5Done) {
        const match = isoMd5?.toLowerCase() === patchMeta.targetMd5?.toLowerCase();
        if (!match) {
            const proceed = await showMd5Modal(isoMd5, patchMeta.targetMd5);
            if (!proceed) return;
        }
    }

    try {
        const suggestedName = patchMeta?.gameName && patchMeta.gameName !== 'N/A'
            ? `${patchMeta.gameName.replace(/[^a-zA-Z0-9_\- ]/g,'_')}_Patched.iso`
            : 'Patched_Raiden.iso';

        const saveHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: 'ISO File', accept: { 'application/octet-stream': ['.iso'] } }]
        });

        // Selecionar pasta de trabalho para extrair os arquivos do patch temporariamente.
        // Instrução exibida via UI antes do picker abrir.
        showInfoBanner('📁 Selecione a PASTA onde deseja salvar a ISO — arquivos temporários serão extraídos lá.');
        const workDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        hideInfoBanner();

        animOverlay.style.display = 'block';
        startAnim();

        const writableStream = await saveHandle.createWritable();
        let success = false;
        try {
            await executeStreamingPatch(isoFile, patchFile, writableStream, workDirHandle);
            success = true;
        } finally {
            recordPatchUsage(patchFile.name, isoFile.name, success).catch(() => {});
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error("Erro ao aplicar patch:", e);
            hideInfoBanner();
        }
        animOverlay.style.display = 'none';
    }
});

btnCloseAnim.addEventListener('click', () => {
    animOverlay.style.display = 'none';
    restartAnim();
});

// ═══════════════════════════════════════════════════════
// MODAL MD5
// ═══════════════════════════════════════════════════════

function showMd5Modal(actualMd5, expectedMd5) {
    return new Promise((resolve) => {
        modalText.innerHTML =
            `O MD5 da sua ISO:<br>
             <code style="color:#3af;font-size:0.75rem;">${actualMd5 ?? 'Não calculado'}</code><br><br>
             MD5 esperado pelo patch:<br>
             <code style="color:#ffb700;font-size:0.75rem;">${expectedMd5}</code><br><br>
             Aplicar em uma ISO incorreta pode gerar um disco corrompido.`;

        modalMd5.classList.add('open');

        const cleanup = () => { modalMd5.classList.remove('open'); };

        modalProceed.onclick = () => { cleanup(); resolve(true); };
        modalCancel.onclick  = () => { cleanup(); resolve(false); };
    });
}

// ═══════════════════════════════════════════════════════
// FIREBASE — CONTADOR DE USOS
// ═══════════════════════════════════════════════════════

async function loadFirebaseCounter(gameName, patchFileName) {
    try {
        const { dbPromise } = await import('./db-context.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js');
        const db = await dbPromise;
        if (!db) return;

        const key = slugify(patchFileName || gameName);
        const ref = doc(db, 'patch_stats', key);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            const count = snap.data().count || 0;
            firebaseCounterText.textContent =
                `🔥 ${count.toLocaleString('pt-BR')} ${count === 1 ? 'pessoa aplicou' : 'pessoas aplicaram'} este patch`;
            firebaseCounter.classList.add('visible');
        }
    } catch (e) {
        // Firebase não disponível — silencioso
        console.debug('Firebase counter indisponível:', e.message);
    }
}

async function recordPatchUsage(patchFileName, isoFileName, success) {
    try {
        const { dbPromise } = await import('./db-context.js');
        const {
            doc, getDoc, setDoc, updateDoc, increment, serverTimestamp
        } = await import('https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js');
        const db = await dbPromise;
        if (!db) return;

        const key = slugify(patchFileName);
        const ref = doc(db, 'patch_stats', key);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            await updateDoc(ref, {
                count: increment(1),
                lastApplied: serverTimestamp(),
                ...(success ? { successCount: increment(1) } : { failCount: increment(1) })
            });
        } else {
            await setDoc(ref, {
                patchName: patchFileName,
                isoName:   isoFileName,
                count: 1,
                successCount: success ? 1 : 0,
                failCount:    success ? 0 : 1,
                createdAt: serverTimestamp(),
                lastApplied: serverTimestamp(),
            });
        }

        // Atualizar o counter na UI
        const updated = await getDoc(ref);
        if (updated.exists()) {
            const count = updated.data().count || 0;
            firebaseCounterText.textContent =
                `🔥 ${count.toLocaleString('pt-BR')} ${count === 1 ? 'pessoa aplicou' : 'pessoas aplicaram'} este patch`;
            firebaseCounter.classList.add('visible');
        }
    } catch (e) {
        console.debug('Não foi possível registrar uso no Firebase:', e.message);
    }
}

// ═══════════════════════════════════════════════════════
// DEBUG MODE
// ═══════════════════════════════════════════════════════

if (chkDebugMode) {
    chkDebugMode.addEventListener('change', (e) => {
        debugControls.style.display = e.target.checked ? 'flex' : 'none';
    });
}
if (btnToggleDebugUi) {
    btnToggleDebugUi.addEventListener('click', () => {
        debugSection.style.display = 'none';
    });
}
if (btnSelectDebugFolder) {
    btnSelectDebugFolder.addEventListener('click', async () => {
        try {
            debugDirHandle = await window.showDirectoryPicker({ mode: 'read' });
            labelDebugFolder.textContent = debugDirHandle.name;
            labelDebugFolder.style.display = 'block';
            btnSelectDebugFolder.classList.add('loaded');
            btnApplyDebug.disabled = false;
        } catch (e) {
            if (e.name !== 'AbortError') console.error("Erro ao selecionar pasta debug:", e);
        }
    });
}
if (btnApplyDebug) {
    btnApplyDebug.addEventListener('click', async () => {
        if (!debugDirHandle) return;
        try {
            const saveHandle = await window.showSaveFilePicker({
                suggestedName: 'Rebuilt_' + debugDirHandle.name + '.iso',
                types: [{ description: 'ISO File', accept: { 'application/octet-stream': ['.iso'] } }]
            });

            animOverlay.style.display = 'block';
            startAnim();

            const writableStream = await saveHandle.createWritable();
            await executeDebugFolderBuild(debugDirHandle, writableStream);
        } catch (e) {
            if (e.name !== 'AbortError') console.error("Erro na remontagem debug:", e);
            animOverlay.style.display = 'none';
        }
    });
}

// ═══════════════════════════════════════════════════════
// ALGORITMO DE STREAMING E PATCHING
// ═══════════════════════════════════════════════════════

async function executeStreamingPatch(origIsoFile, patchFile, writableStream, workDirHandle) {
    updateStatusUI(1); setProgressUI(15);

    // ── 1. Descriptografar o .RPT para a pasta de trabalho ──────────────────
    updateStatusUI(2); setProgressUI(20);
    const password = "bit.raiden";

    // Nome do arquivo decriptado: mesmo nome base mas com extensão .dec
    const decName = patchFile.name.replace(/\.rpt$/i, '') + '_dec.bin';
    // { create: true } garante que o arquivo é criado se não existir
    const patchDecHandle = await workDirHandle.getFileHandle(decName, { create: true });

    try {
        await decryptFileToHandle(password, patchFile, patchDecHandle, (progress) => {
            setProgressUI(20 + progress * 10);
        });
        console.log('[RPT] Descriptografia concluída →', decName);
    } catch (e) {
        console.error("Falha na decriptação RPT.", e);
        throw new Error("Não foi possível descriptografar o patch (.rpt): " + e.message);
    }
    setProgressUI(30);

    // ── 2. Parsear o .dec para extrair os arquivos e metadados ───────────────
    updateStatusUI(3); setProgressUI(30);
    const patchInfo = await scanPatchMetadata(patchDecHandle, workDirHandle);
    console.log(`[RPT] ${patchInfo.length} arquivos extraídos do patch.`);

    // ── 3. Reconstrução ISO9660+UDF ──────────────────────────────────────────
    updateStatusUI(4); setProgressUI(40);
    await ISO9660.PatchISO(origIsoFile, workDirHandle, writableStream, {
        onProgress: (status, progMsg) => {
            console.log(progMsg);
            if (status === 2) updateStatusUI(3);
            if (status === 4) updateStatusUI(4);
            if (status === 5) updateStatusUI(5);
            setProgressUI(Math.min(95, animProgress + 3));
        }
    });

    setProgressUI(100);
    updateStatusUI(5);
    setTimeout(() => { triggerFinale(); }, 300);
    setTimeout(() => {
        btnCloseAnim.style.pointerEvents = 'auto';
        btnCloseAnim.style.opacity = '1';
    }, 2000);
}

async function executeDebugFolderBuild(debugDirHandle, writableStream) {
    updateStatusUI(4); setProgressUI(20);
    await ISO9660.BuildISO(debugDirHandle, writableStream, {
        volumeLabel: debugDirHandle.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').substring(0, 32) || "RAIDEN_DEBUG",
        onProgress: (status, progMsg) => {
            if (status === 4) updateStatusUI(4);
            if (status === 5) updateStatusUI(5);
            setProgressUI(Math.min(95, animProgress + 5));
        }
    });

    setProgressUI(100);
    updateStatusUI(5);
    setTimeout(() => { triggerFinale(); }, 300);
    setTimeout(() => {
        btnCloseAnim.style.pointerEvents = 'auto';
        btnCloseAnim.style.opacity = '1';
    }, 2000);
}

// ═══════════════════════════════════════════════════════
// SCAN DE METADADOS DO PATCH (STREAMING)
// ═══════════════════════════════════════════════════════

async function scanPatchMetadata(patchFileHandle, baseDirHandle) {
    const patchDir = await baseDirHandle.getDirectoryHandle("patch_files", { create: true });
    const file     = await patchFileHandle.getFile();
    const reader   = file.stream().getReader();

    let { value: buffer, done } = await reader.read();
    let offset = 0;

    async function ensureBytes(n) {
        while (buffer && (buffer.length - offset < n)) {
            const { value: nextChunk, done: isDone } = await reader.read();
            if (isDone) break;
            const nb = new Uint8Array(buffer.length - offset + nextChunk.length);
            nb.set(buffer.slice(offset));
            nb.set(nextChunk, buffer.length - offset);
            buffer = nb;
            offset = 0;
        }
    }

    await ensureBytes(6);
    const magic = new TextDecoder().decode(buffer.slice(offset, offset + 4));
    if (magic !== "RPTP") throw new Error("Assinatura de patch inválida!");
    offset += 6;

    while (true) {
        await ensureBytes(1);
        if (buffer[offset++] === 0) break;
    }

    let filesFound = [];

    while (true) {
        await ensureBytes(8);
        if (!buffer || buffer.length - offset < 8) break;

        const sizeView = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
        const fileSize = Number(sizeView.getBigUint64(0, true));
        offset += 8;

        let nameBytes = [];
        while (true) {
            await ensureBytes(1);
            const byte = buffer[offset++] === 0 ? 0 : buffer[offset - 1];
            if (byte === 0) break;
            nameBytes.push(byte);
        }
        const fileName = new TextDecoder().decode(new Uint8Array(nameBytes));

        if (fileName) {
            const pathParts = fileName.split(/[\\\/]/);
            const nameOnly  = pathParts.pop();
            let currentDir  = patchDir;

            for (const part of pathParts) {
                if (part.trim() !== "") {
                    currentDir = await currentDir.getDirectoryHandle(part, { create: true });
                }
            }

            const fHandle  = await currentDir.getFileHandle(nameOnly, { create: true });
            const writable = await fHandle.createWritable();
            let remaining  = fileSize;

            while (remaining > 0) {
                const available = buffer.length - offset;
                const toWrite   = Math.min(available, remaining);

                if (toWrite > 0) {
                    await writable.write(buffer.slice(offset, offset + toWrite));
                    offset   += toWrite;
                    remaining -= toWrite;
                }

                if (remaining > 0) {
                    const { value: nextChunk, done: isDone } = await reader.read();
                    if (isDone) break;
                    buffer = nextChunk;
                    offset = 0;
                }
            }
            await writable.close();
            filesFound.push(fileName);

            if (buffer) { buffer = buffer.slice(offset); offset = 0; }
        }
    }
    return filesFound;
}

// ═══════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugify(str) {
    return (str || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 64);
}

// Banner informativo temporário (substitui alert() por UI inline)
let _infoBanner = null;
function showInfoBanner(msg) {
    if (_infoBanner) _infoBanner.remove();
    _infoBanner = document.createElement('div');
    _infoBanner.style.cssText = `
        position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
        z-index: 4000; background: rgba(5,15,40,0.97); border: 1px solid rgba(51,170,255,0.5);
        border-radius: 10px; padding: 0.9rem 1.5rem;
        font-family: 'Share Tech Mono', monospace; font-size: 0.82rem;
        color: #c8dff8; letter-spacing: 0.08em; max-width: 90vw; text-align: center;
        box-shadow: 0 0 30px rgba(51,170,255,0.2); animation: rp-fade-in 0.3s ease;
    `;
    _infoBanner.textContent = msg;
    document.body.appendChild(_infoBanner);
}
function hideInfoBanner() {
    if (_infoBanner) { _infoBanner.remove(); _infoBanner = null; }
}

// ═══════════════════════════════════════════════════════
// UI ENGINE (Portado do raiden-patch-animation.html)
// ═══════════════════════════════════════════════════════

const canvas = document.getElementById('mainCanvas');
const ctx    = canvas.getContext('2d');
let W = 0, H = 0;

function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', () => { resize(); if (animState !== ST.IDLE) rebuildParticles(); });

const PARTICLE_COUNT = 60;
let particles = [], bolts = [], sparks = [];
let scanY = -10, scanning = false, scanCb = null, coreA = 0;

const ST = { IDLE: 0, RISING: 1, PATCHING: 2, FINALE: 3, DONE: 4 };
let animState = ST.IDLE, animProgress = 0, ltimer = null, lintensity = 0;

class Particle {
  constructor() { this.reset(true); }
  reset(initial) {
    this.x = Math.random() * W; this.y = initial ? Math.random() * H : H + 10;
    this.type = Math.random() < 0.6 ? 'dot' : 'dash';
    this.r = this.type === 'dot' ? 1.5 + Math.random() * 3 : 0;
    this.dw = this.type === 'dash' ? 8 + Math.random() * 18 : 0;
    this.dh = this.type === 'dash' ? 2 + Math.random() * 3 : 0;
    const hue = 210 + Math.floor(Math.random() * 40), sat = 60 + Math.floor(Math.random() * 40), lit = 40 + Math.floor(Math.random() * 35);
    this.color = `hsl(${hue},${sat}%,${lit}%)`; this.glow = `hsla(${hue},100%,70%,0.5)`;
    this.sx = Math.random()*Math.PI*2; this.sy = Math.random()*Math.PI*2;
    this.frx = 0.0003 + Math.random()*0.0004; this.fry = 0.0004 + Math.random()*0.0005;
    this.ax = 20 + Math.random()*50; this.ay = 15 + Math.random()*40;
    this.baseX = this.x; this.baseY = this.y;
    this.rot = Math.random()*Math.PI; this.rotSpd = (Math.random()-.5)*0.005;
    this.alpha = initial ? Math.random()*0.7 : 0; this.targetAlpha = 0.25 + Math.random()*0.55;
    this.pulseS = Math.random()*Math.PI*2; this.pulseFr = 0.001 + Math.random()*0.002;
    this.boom = false; this.bvx = 0; this.bvy = 0; this.brotv = 0; this.balpha = 1;
  }
  update(t, collapse) {
    if (this.boom) { this.bvy += 0.35; this.baseX += this.bvx; this.baseY += this.bvy; this.rot += this.brotv; this.balpha = Math.max(0, this.balpha - 0.026); this.alpha = this.balpha; return; }
    if (this.alpha < this.targetAlpha) this.alpha = Math.min(this.targetAlpha, this.alpha + 0.008);
    const fx = Math.sin(t*this.frx+this.sx)*this.ax, fy = Math.sin(t*this.fry+this.sy)*this.ay;
    this.rot += this.rotSpd;
    const pulse = 0.7 + 0.3*Math.sin(t*this.pulseFr+this.pulseS);
    const cx = W/2, cy = H/2;
    const colX = (cx-this.baseX)*collapse*0.9, colY = (cy-this.baseY)*collapse*0.9;
    this.x = this.baseX+fx+colX; this.y = this.baseY+fy+colY;
    this.alpha = (this.targetAlpha*pulse)*(1-collapse*0.5);
  }
  draw(ctx) {
    if (this.alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha = this.alpha; ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.shadowBlur = 8; ctx.shadowColor = this.glow; ctx.fillStyle = this.color;
    if (this.type === 'dot') { ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill(); }
    else { ctx.fillRect(-this.dw/2,-this.dh/2,this.dw,this.dh); }
    ctx.restore();
  }
  explode() { this.boom = true; const a = Math.random()*Math.PI*2, spd = 3+Math.random()*8; this.bvx = Math.cos(a)*spd; this.bvy = Math.sin(a)*spd-2; this.brotv = (Math.random()-.5)*0.2; this.balpha = 1; }
}

function rebuildParticles() { particles = []; for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle()); }

function spawnLightning(intensity) {
  const cx = W/2, cy = H/2, n = Math.floor(2+intensity*4);
  for (let i = 0; i < n; i++) {
    const a = Math.random()*Math.PI*2, r = 100+Math.random()*Math.min(W,H)*0.38;
    bolts.push({ x1:cx, y1:cy, x2:cx+Math.cos(a)*r, y2:cy+Math.sin(a)*r, life:1, decay:0.07+Math.random()*0.09, rough:50+intensity*28, depth:4+Math.floor(intensity), col:Math.random()<.7?'#4af':'#88ddff' });
  }
}
function boltSegs(x1,y1,x2,y2,r,d) {
  if (d===0) return [[x1,y1,x2,y2]];
  const mx=(x1+x2)/2+(Math.random()-.5)*r, my=(y1+y2)/2+(Math.random()-.5)*r;
  const s=[...boltSegs(x1,y1,mx,my,r*.55,d-1),...boltSegs(mx,my,x2,y2,r*.55,d-1)];
  if (d>2&&Math.random()<.38) { const bx=mx+(Math.random()-.5)*r*1.4,by=my+r*(Math.random()*.7+.2); s.push(...boltSegs(mx,my,bx,by,r*.38,d-2)); }
  return s;
}
function drawBolts() {
  bolts = bolts.filter(b=>b.life>0);
  for (const b of bolts) {
    const segs = boltSegs(b.x1,b.y1,b.x2,b.y2,b.rough,b.depth);
    ctx.save(); ctx.globalAlpha=b.life; ctx.strokeStyle=b.col; ctx.lineWidth=1.2; ctx.shadowBlur=10; ctx.shadowColor='#3af';
    ctx.beginPath(); for (const [sx,sy,ex,ey] of segs) { ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); } ctx.stroke(); ctx.restore();
    b.life -= b.decay;
  }
}
function spawnSparks(n) {
  const cx=W/2, cy=H/2;
  for (let i=0;i<n;i++) { const a=Math.random()*Math.PI*2, spd=2+Math.random()*6; sparks.push({ x:cx+(Math.random()-.5)*60, y:cy+(Math.random()-.5)*60, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd-1, life:1, decay:0.03+Math.random()*0.04, r:1.5+Math.random()*2, col:Math.random()<.7?'#4af':'#adf' }); }
}
function drawSparks() {
  sparks = sparks.filter(s=>s.life>0);
  for (const s of sparks) {
    ctx.save(); ctx.globalAlpha=s.life*.9; ctx.fillStyle=s.col; ctx.shadowBlur=6; ctx.shadowColor=s.col;
    ctx.beginPath(); ctx.arc(s.x,s.y,s.r*s.life,0,Math.PI*2); ctx.fill(); ctx.restore();
    s.x+=s.vx; s.y+=s.vy; s.vy+=0.14; s.life-=s.decay;
  }
}
function startScanline(cb) { scanY=-10; scanning=true; scanCb=cb; }
function drawScanline() {
  if (!scanning) return;
  scanY += H/85;
  if (scanY > H+15) { scanning=false; if (scanCb) scanCb(); return; }
  const g=ctx.createLinearGradient(0,scanY-20,0,scanY+20);
  g.addColorStop(0,'rgba(51,170,255,0)'); g.addColorStop(.4,'rgba(51,170,255,0.5)');
  g.addColorStop(.5,'rgba(190,235,255,0.92)'); g.addColorStop(.6,'rgba(51,170,255,0.5)'); g.addColorStop(1,'rgba(51,170,255,0)');
  ctx.fillStyle=g; ctx.shadowBlur=14; ctx.shadowColor='#3af'; ctx.fillRect(0,scanY-20,W,40); ctx.shadowBlur=0;
}
function drawCore(t) {
  if (coreA<=0) return;
  const p=0.72+0.28*Math.sin(t*.0018), r=115+28*p;
  const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,r);
  g.addColorStop(0,`rgba(55,140,255,${0.2*coreA*p})`); g.addColorStop(.5,`rgba(18,58,200,${0.09*coreA})`); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
function show(id,op,tr) { const el=document.getElementById(id); el.style.opacity=op; if(tr) el.style.transform=tr; }

function startAnim() {
  if (animState!==ST.IDLE) return;
  animState=ST.RISING;
  document.getElementById('ps2bg').style.opacity='1';
  rebuildParticles();
  setTimeout(() => {
    startScanline(() => {
      show('raidenSVG','1','translate(-50%,-50%) scale(1)');
      show('raidenGifAnim','1','translate(-50%,-50%) scale(1)');
      show('ringWrap','1'); show('statusWrap','1');
      coreA=1; animState=ST.PATCHING; lintensity=0.25; startLLoop();
    });
  }, 900);
}
function startLLoop() {
  if (ltimer) clearInterval(ltimer);
  ltimer = setInterval(() => {
    if (Math.random()<.55) { spawnLightning(lintensity); if(Math.random()<.3) spawnSparks(6); }
  }, 160);
}
function stopLLoop() { if (ltimer) { clearInterval(ltimer); ltimer=null; } }

function setProgressUI(p) {
  animProgress=p;
  document.getElementById('ringPath').style.strokeDashoffset = 502-(p/100)*502;
  lintensity = 0.2+(p/100)*1.4;
  if (p>0&&p%25<1.5) spawnSparks(20);
  document.getElementById('pctLabel').textContent = Math.floor(p)+'%';
}

const MSGS = [
    [0,  'Iniciando Worker...'],
    [18, 'Validando MD5 da ISO...'],
    [32, 'Extraindo arquivos modificados...'],
    [48, 'Construindo Árvore Path Table UDF...'],
    [76, 'Realocando blocos lógicos da ISO...'],
    [97, 'Finalizando...']
];
function updateStatusUI(idxOrPercent) {
  let msg = "";
  if (idxOrPercent < MSGS.length) { msg = MSGS[idxOrPercent][1]; }
  else { msg = MSGS[0][1]; for (const [t,m] of MSGS) if (idxOrPercent >= t) msg = m; }
  document.getElementById('statusMsg').textContent = msg;
}

function triggerFinale() {
  animState=ST.FINALE; lintensity=3;
  spawnSparks(80); spawnLightning(3); spawnLightning(3);
  for (const p of particles) p.explode();
  const flD=document.createElement('div');
  flD.style.cssText='position:absolute;inset:0;z-index:50;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.07s ease';
  document.getElementById('stage').appendChild(flD);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ flD.style.opacity='.92'; setTimeout(()=>{ flD.style.opacity='0'; setTimeout(()=>flD.remove(),350); },100); }));
  stopLLoop();
  setTimeout(()=>{ show('raidenSVG','0'); show('raidenGifAnim','0'); show('ringWrap','0'); show('statusWrap','0'); coreA=0; },250);
  setTimeout(()=>{
    const fl=document.getElementById('flawless'); fl.style.opacity='1'; fl.style.pointerEvents='auto';
    const ft=document.getElementById('flawlessText'); ft.style.opacity='1'; ft.style.transform='scale(1)';
    for (let i=0;i<4;i++) setTimeout(()=>spawnLightning(1.8),i*130);
    setTimeout(()=>{ const vt=document.getElementById('victoryText'); vt.style.opacity='1'; vt.style.transform='translateY(0)'; },420);
    setTimeout(()=>{ document.getElementById('isoReadyText').style.opacity='1'; },900);
    animState=ST.DONE;
  },520);
}

function restartAnim() {
  animState=ST.IDLE; animProgress=0;
  stopLLoop();
  bolts=[]; sparks=[]; particles=[]; coreA=0;
  ['ps2bg','ringWrap','statusWrap','isoReadyText','victoryText','flawlessText','flawless']
    .forEach(id=>{ const el=document.getElementById(id); el.style.opacity='0'; if(el.style.pointerEvents!==undefined) el.style.pointerEvents='none'; });
  document.getElementById('flawlessText').style.transform='scale(3.5)';
  document.getElementById('victoryText').style.transform='translateY(22px)';
  document.getElementById('ringPath').style.strokeDashoffset='502';
  document.getElementById('raidenSVG').style.opacity='0';
  document.getElementById('raidenSVG').style.transform='translate(-50%,-50%) scale(0)';
  document.getElementById('raidenGifAnim').style.opacity='0';
  document.getElementById('raidenGifAnim').style.transform='translate(-50%,-50%) scale(0)';
  document.getElementById('statusMsg').textContent='Patcher Limpo.';
  document.getElementById('pctLabel').textContent='0%';
  btnCloseAnim.style.pointerEvents='none'; btnCloseAnim.style.opacity='0';
  ctx.clearRect(0,0,W,H);
}

function loop(t) {
  if (animOverlay.style.display!=='block') { requestAnimationFrame(loop); return; }
  requestAnimationFrame(loop);
  ctx.clearRect(0,0,W,H);
  const colP=(animState===ST.PATCHING||animState===ST.FINALE)?Math.max(0,Math.min(1,(animProgress-25)/65)):0;
  drawCore(t);
  for (const p of particles) { p.update(t,animState===ST.FINALE?0:colP); p.draw(ctx); }
  drawScanline(); drawBolts(); drawSparks();
}
requestAnimationFrame(loop);