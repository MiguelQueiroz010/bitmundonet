/**
 * raiden_patcher.js  (v3)
 * - Stepper UI (3 etapas) e Worker MD5 em background (não trava a UI)
 * - Patch .RPT v1 (arquivos inteiros) e v2 (operações replace / delta xdelta / inject — ver IUP/RPT_FORMAT.md)
 * - delta/inject só são aplicados se o SHA-256 do arquivo da ISO do USUÁRIO bater: o patch nunca carrega
 *   conteúdo original do jogo; ele só descreve como transformar o arquivo que o usuário já possui.
 * - Pasta temporária própria (apagada ao final), validação de caminhos e limites contra patches corrompidos
 * - Firebase: contador anônimo de usos por patch (sem nome de ISO)
 * - showSaveFilePicker para salvar o resultado
 */

import { RPT_PASSWORD } from './IUP/rpt_config.js';   // senha compartilhada com o criador de patches (ver aviso no arquivo)

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;   // XML de metadados + operações
const MAX_ENTRIES        = 20000;             // arquivos dentro do .rpt

import { decryptBytes, decryptFileToHandle } from "./IUP/crypto_stuff.js";
import { ISO9660 } from './IUP/iso9660.js';
import { normalizeOps, applyOps, cleanupWorkDir, createPayloadFile, parseRelPath, RPT_PAYLOAD_PREFIX, LIMITS } from './IUP/rpt_ops.js';

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
const chkLegal           = document.getElementById('chk-legal-consent');

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

// Interpreta o XML do patch (metadados + <Ops>). Patches v1 não têm <Ops> e continuam funcionando.
function parseManifestXml(xmlStr) {
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    // Em patches v2 um XML malformado é fatal; em v1 mantemos a tolerância antiga.
    if (doc.querySelector('parsererror') && /<Ops[\s>]/.test(xmlStr))
        throw new Error('O manifesto XML do patch está malformado.');

    const get = (tag) => {
        const el = doc.querySelector(tag);
        return el ? el.textContent.trim() : null;
    };
    const a = (el, n) => el.getAttribute(n);
    const raw = [...doc.querySelectorAll('Ops > Op')].map(el => ({
        type: a(el, 'type'), path: a(el, 'path'), payload: a(el, 'payload'), codec: a(el, 'codec'),
        sha256: a(el, 'sha256'), srcSha256: a(el, 'srcSha256'), size: a(el, 'size'),
        patches: [...el.querySelectorAll('Patch')].map(p => ({ offset: a(p, 'offset'), old: a(p, 'old'), new: a(p, 'new') })),
    }));

    return {
        meta: {
            gameName:  get('GameName')  || get('Game')    || 'N/A',
            version:   get('Version')   || get('Ver')     || 'N/A',
            author:    get('Author')    || get('Creator') || 'N/A',
            targetMd5: get('TargetMD5') || get('MD5')     || get('BaseMD5') || null,
            desc:      get('Resumo')    || get('Description') || get('Desc') || null,
        },
        ops: normalizeOps(raw),   // lança erro se houver caminho/hash/tipo inválido
    };
}

function countOps(ops) {
    const s = { replace: 0, delta: 0, inject: 0 };
    for (const o of ops) s[o.type]++;
    return s;
}

async function loadPatchMetadata(file) {
    try {
        patchMeta = null;
        patchSummary.classList.remove('visible');
        md5MatchBadge.innerHTML = '';

        // Indicar carregando
        patchSummary.classList.add('visible');
        summaryGrid.innerHTML = `<span class="rp-sum-key" style="grid-column:1/-1;color:var(--rp-text-dim);font-style:italic;">⏳ Lendo patch...</span>`;

        // AES-CBC exige blocos de 16 bytes; lemos só o início (manifesto) e alinhamos ao bloco.
        const MAX_HEADER  = Math.min(file.size, MAX_MANIFEST_BYTES + 4096);
        const alignedSize = Math.floor(MAX_HEADER / 16) * 16;
        const encBytes = new Uint8Array(await file.slice(0, alignedSize).arrayBuffer());

        let decBytes;
        try {
            decBytes = await decryptBytes(RPT_PASSWORD, encBytes);
        } catch (e) {
            console.warn("Não foi possível descriptografar o patch para ler metadados.", e);
            patchSummary.classList.remove('visible');
            return;
        }

        // Verificar magic RPTP (primeiros 4 bytes após descriptografia)
        const magic = new TextDecoder().decode(decBytes.slice(0, 4));
        if (magic !== 'RPTP') {
            patchMeta = { invalid: 'Formato inválido — não é um patch RPT válido.' };
            summaryGrid.innerHTML = `<span class="rp-sum-key" style="grid-column:1/-1;color:var(--rp-red);">❌ ${escHtml(patchMeta.invalid)}</span>`;
            return;
        }

        // Estrutura: [4 magic][2 reservado][XML string][0x00][arquivos...]
        const xmlStart = 6;
        let xmlEnd = xmlStart;
        while (xmlEnd < decBytes.length && decBytes[xmlEnd] !== 0) xmlEnd++;
        if (xmlEnd >= decBytes.length || xmlEnd - xmlStart > MAX_MANIFEST_BYTES)
            throw new Error('Manifesto do patch ausente ou grande demais.');

        const xmlStr = new TextDecoder('utf-8').decode(decBytes.slice(xmlStart, xmlEnd));
        const { meta, ops } = parseManifestXml(xmlStr);

        patchMeta = { ...meta, ops, opsSummary: countOps(ops) };
        renderPatchSummary();
    } catch (e) {
        console.error('Erro ao ler metadados do patch:', e);
        patchMeta = { invalid: e.message };   // bloqueia o botão de aplicar
        summaryGrid.innerHTML = `<span class="rp-sum-key" style="grid-column:1/-1;color:var(--rp-red);">❌ Patch recusado: ${escHtml(e.message)}</span>`;
    }
}

function renderPatchSummary() {
    if (!patchMeta) return;

    let html = '';

    // Bloco de Resumo — preserva quebras de linha do XML
    if (patchMeta.desc) {
        const descHtml = escHtml(patchMeta.desc)
            .replace(/\n/g, '<br>')
            .replace(/  /g, '&nbsp;&nbsp;');
        html += `<div class="rp-resumo-block">${descHtml}</div>`;
    } else {
        html += `
            <div class="rp-resumo-fallback">
                <span class="rp-sum-key">Jogo</span><span class="rp-sum-val">${escHtml(patchMeta.gameName)}</span>
                <span class="rp-sum-key">Versão</span><span class="rp-sum-val">${escHtml(patchMeta.version)}</span>
                <span class="rp-sum-key">Autor</span><span class="rp-sum-val">${escHtml(patchMeta.author)}</span>
            </div>`;
    }

    // Operações do patch v2
    const s = patchMeta.opsSummary;
    if (s && (s.replace || s.delta || s.inject)) {
        const parts = [];
        if (s.delta)   parts.push(`${s.delta} delta`);
        if (s.inject)  parts.push(`${s.inject} inject`);
        if (s.replace) parts.push(`${s.replace} substituição${s.replace > 1 ? 'ões' : ''}`);
        html += `
            <div class="rp-md5-target-row">
                <span class="rp-md5-target-label">OPERAÇÕES</span>
                <code class="rp-md5-target-val">${escHtml(parts.join(' · '))}</code>
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

    const invalid = !!patchMeta?.invalid;
    // Sem a caixa de declaração no HTML (página antiga em cache) o botão permanece bloqueado.
    const consent = !!chkLegal && chkLegal.checked;
    btnApplyPatch.disabled = invalid || !consent;
    btnApplyPatch.classList.toggle('rp-pulse', !btnApplyPatch.disabled);

    const sizeTotal   = isoFile.size + patchFile.size;
    const spaceNeeded = isoFile.size + patchFile.size + 2147483648;
    if (invalid)        spaceLbl.textContent = 'Patch inválido — não pode ser aplicado';
    else if (!chkLegal) spaceLbl.textContent = 'Página desatualizada — recarregue com Ctrl+F5';
    else if (!consent)  spaceLbl.textContent = 'Marque a declaração acima para liberar o botão';
    else                spaceLbl.textContent = `Streaming nativo ativo · ${formatBytes(sizeTotal)} selecionados`;
    storageLbl.textContent = `Espaço recomendado: ${formatBytes(spaceNeeded)} livres`;
}

if (chkLegal) chkLegal.addEventListener('change', () => checkReady());

// ═══════════════════════════════════════════════════════
// APLICAR PATCH
// ═══════════════════════════════════════════════════════

btnApplyPatch.addEventListener('click', async () => {
    if (!isoFile || !patchFile) return;
    if (patchMeta?.invalid) { showErrorBanner(patchMeta.invalid); return; }
    if (!chkLegal || !chkLegal.checked) return;

    // Verificar MD5 — se incompatível, mostrar modal
    if (patchMeta?.targetMd5 && isoMd5Done) {
        const match = isoMd5?.toLowerCase() === patchMeta.targetMd5?.toLowerCase();
        if (!match) {
            const proceed = await showMd5Modal(isoMd5, patchMeta.targetMd5);
            if (!proceed) return;
        }
    }

    let writableStream = null;
    try {
        const suggestedName = patchMeta?.gameName && patchMeta.gameName !== 'N/A'
            ? `${patchMeta.gameName.replace(/[^a-zA-Z0-9_\- ]/g,'_')}_Patched.iso`
            : 'Patched_Raiden.iso';

        const saveHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: 'ISO File', accept: { 'application/octet-stream': ['.iso'] } }]
        });

        // Os arquivos temporários ficam numa SUBPASTA própria ("raiden_tmp_…") criada e apagada pelo patcher;
        // nada que já exista na pasta escolhida é tocado.
        showInfoBanner('📁 Selecione uma PASTA com espaço livre. Será criada uma subpasta temporária, apagada ao terminar.');
        const workDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        hideInfoBanner();

        animOverlay.style.display = 'block';
        startAnim();

        writableStream = await saveHandle.createWritable();
        let success = false;
        try {
            await executeStreamingPatch(isoFile, patchFile, writableStream, workDirHandle, {
                keepTemp: !!(chkDebugMode && chkDebugMode.checked),
            });
            success = true;
        } finally {
            recordPatchUsage(patchFile.name, success).catch(() => {});
        }
    } catch (e) {
        hideInfoBanner();
        animOverlay.style.display = 'none';
        restartAnim();                       // sem isso a animação não reinicia numa nova tentativa
        if (writableStream) { try { await writableStream.abort(); } catch (_) { /* já fechado */ } }
        if (e.name !== 'AbortError') {
            console.error("Erro ao aplicar patch:", e);
            showErrorBanner(e.name === 'QuotaExceededError'
                ? 'Sem espaço em disco suficiente. Libere espaço ou escolha outra pasta e tente de novo.'
                : (e.message || 'Falha ao aplicar o patch.'));
        }
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
        // expectedMd5 vem do patch (não confiável): sempre escapar antes de usar em innerHTML.
        modalText.innerHTML =
            `O MD5 da sua ISO:<br>
             <code style="color:#3af;font-size:0.75rem;">${escHtml(actualMd5 ?? 'Não calculado')}</code><br><br>
             MD5 esperado pelo patch:<br>
             <code style="color:#ffb700;font-size:0.75rem;">${escHtml(expectedMd5)}</code><br><br>
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

async function recordPatchUsage(patchFileName, success) {
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

async function executeStreamingPatch(origIsoFile, patchFile, writableStream, workDirHandle, { keepTemp = false } = {}) {
    // Subpasta exclusiva desta execução (evita misturar sobras de execuções anteriores e nunca apaga dados do usuário).
    const tmpName = `raiden_tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const tmpDir  = await workDirHandle.getDirectoryHandle(tmpName, { create: true });

    try {
        updateStatusUI(1); setProgressUI(15);

        // ── 1. Descriptografar o .RPT para a subpasta temporária ──────────────────
        updateStatusUI(2); setProgressUI(20);
        const patchDecHandle = await tmpDir.getFileHandle('patch_dec.bin', { create: true });
        try {
            await decryptFileToHandle(RPT_PASSWORD, patchFile, patchDecHandle, (progress) => {
                setProgressUI(20 + progress * 10);
            });
        } catch (e) {
            console.error("Falha na decriptação RPT.", e);
            throw new Error("Não foi possível descriptografar o patch (.rpt): " + e.message);
        }
        setProgressUI(30);

        // ── 2. Extrair arquivos (patch_files/) e conteúdos de operações (patch_ops/) ──
        updateStatusUI(3); setProgressUI(30);
        const { xml, entries } = await extractPatchPayload(patchDecHandle, tmpDir);
        const { ops } = parseManifestXml(xml);
        console.log(`[RPT] ${entries.length} arquivo(s) no patch, ${ops.length} operação(ões).`);

        // Cache antigo (service worker) pode servir um iso9660.js sem o gancho beforeBuild: nesse caso os deltas seriam
        // ignorados em silêncio e a ISO sairia "ok" mas sem a tradução. Falha antes de gravar qualquer coisa.
        if (ops.length && !(ISO9660.HOOKS_VERSION >= 1))
            throw new Error('Módulos em cache desatualizados. Recarregue a página com Ctrl+F5 e tente novamente.');

        // ── 3. Reconstrução ISO9660+UDF ───────────────────────────────────────────
        // beforeBuild roda DEPOIS de copiar os arquivos originais da ISO do usuário e ANTES de gravar a ISO final:
        // é aqui que delta/inject transformam o arquivo original, com verificação de SHA-256.
        updateStatusUI(4); setProgressUI(40);
        await ISO9660.PatchISO(origIsoFile, tmpDir, writableStream, {
            onProgress: (status, progMsg) => {
                console.log(progMsg);
                if (status === 2) updateStatusUI(3);
                if (status === 4) updateStatusUI(4);
                if (status === 5) updateStatusUI(5);
                setProgressUI(Math.min(95, animProgress + 3));
            },
            beforeBuild: async (patchDir) => {
                if (!ops.length) return;
                const payloadRoot = await tmpDir.getDirectoryHandle('patch_ops', { create: true });
                const { report } = await applyOps({
                    ops, filesRoot: patchDir, payloadRoot,
                    onProgress: (f, msg) => { setProgressUI(Math.max(animProgress, 55 + f * 20)); setStatusText(msg); },
                });
                console.log('[RPT] operações aplicadas e verificadas:', report);
            },
        });

        setProgressUI(100);
        updateStatusUI(5);
        setTimeout(() => { triggerFinale(); }, 300);
        setTimeout(() => {
            btnCloseAnim.style.pointerEvents = 'auto';
            btnCloseAnim.style.opacity = '1';
        }, 2000);
    } finally {
        // Apaga sempre (sucesso ou erro): senão ficam GBs de arquivos extraídos da ISO na pasta do usuário.
        if (!keepTemp) await cleanupWorkDir(workDirHandle, [tmpName]);
    }
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
// EXTRAÇÃO DO PAYLOAD DO PATCH (STREAMING + VALIDAÇÃO)
// ═══════════════════════════════════════════════════════

// Leitor sequencial sobre um ReadableStream, com limites e erro claro em arquivo truncado.
class ByteStream {
    constructor(stream) { this.r = stream.getReader(); this.buf = new Uint8Array(0); this.pos = 0; this.ended = false; }
    async _more() {
        if (this.ended) return false;
        const { value, done } = await this.r.read();
        if (done) { this.ended = true; return false; }
        if (this.pos >= this.buf.length) { this.buf = value; this.pos = 0; }
        else {
            const rest = this.buf.length - this.pos;
            const nb = new Uint8Array(rest + value.length);
            nb.set(this.buf.subarray(this.pos)); nb.set(value, rest);
            this.buf = nb; this.pos = 0;
        }
        return true;
    }
    async need(n) {
        while (this.buf.length - this.pos < n) { if (!(await this._more())) return false; }
        return true;
    }
    async take(n) {
        if (!(await this.need(n))) throw new Error('Patch truncado ou corrompido.');
        const out = this.buf.subarray(this.pos, this.pos + n);
        this.pos += n;
        return out;                       // view: use antes da próxima leitura
    }
    async cstring(max) {
        const bytes = [];
        for (;;) {
            if (!(await this.need(1))) throw new Error('Patch truncado ou corrompido.');
            const b = this.buf[this.pos++];
            if (b === 0) return new Uint8Array(bytes);
            if (bytes.length >= max) throw new Error('Patch inválido: campo de texto longo demais.');
            bytes.push(b);
        }
    }
    async copyTo(sink, n) {
        let rem = n;
        while (rem > 0) {
            if (this.pos >= this.buf.length && !(await this._more())) throw new Error('Patch truncado: arquivo interno incompleto.');
            const k = Math.min(rem, this.buf.length - this.pos);
            await sink.write(this.buf.slice(this.pos, this.pos + k));
            this.pos += k; rem -= k;
        }
    }
    async release() { try { await this.r.cancel(); } catch (_) { /* já terminado */ } }
}

/**
 * Lê o .rpt já descriptografado e grava:
 *   - entradas normais        → tmpDir/patch_files/<caminho>   (substituem arquivos da ISO — comportamento v1)
 *   - entradas "__rpt/..."    → tmpDir/patch_ops/<caminho>     (conteúdo de operações delta/replace do v2)
 * Todo caminho vindo do patch é validado (sem "..", sem caracteres de controle, profundidade limitada).
 */
async function extractPatchPayload(patchDecHandle, tmpDir) {
    const filesDir = await tmpDir.getDirectoryHandle('patch_files', { create: true });
    const opsDir   = await tmpDir.getDirectoryHandle('patch_ops',   { create: true });
    const file = await patchDecHandle.getFile();
    const bs = new ByteStream(file.stream());
    const entries = [];
    let xml = '';

    try {
        const head = await bs.take(6);
        if (new TextDecoder().decode(head.subarray(0, 4)) !== 'RPTP') throw new Error('Assinatura de patch inválida!');

        xml = new TextDecoder('utf-8').decode(await bs.cstring(MAX_MANIFEST_BYTES));

        while (await bs.need(8)) {               // <8 bytes sobrando = fim (tolerância do formato v1)
            const sz = await bs.take(8);
            const big = new DataView(sz.buffer, sz.byteOffset, 8).getBigUint64(0, true);
            if (big > BigInt(LIMITS.maxFileBytes)) throw new Error('Patch inválido: arquivo interno maior que 4 GiB.');
            const size = Number(big);

            const name = new TextDecoder().decode(await bs.cstring(LIMITS.maxPathChars));
            if (entries.length >= MAX_ENTRIES) throw new Error('Patch inválido: arquivos demais.');

            if (!name) { await bs.copyTo({ write: async () => {} }, size); continue; }   // entrada sem nome: ignora

            const norm = name.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '');
            const isOp = norm.startsWith(RPT_PAYLOAD_PREFIX);
            const parts = parseRelPath(isOp ? norm.slice(RPT_PAYLOAD_PREFIX.length) : norm, 'arquivo do patch');

            const fh = await createPayloadFile(isOp ? opsDir : filesDir, parts);
            const writable = await fh.createWritable();
            try {
                await bs.copyTo(writable, size);
                await writable.close();
            } catch (e) {
                try { await writable.abort(); } catch (_) { /* já fechado */ }
                throw e;
            }
            entries.push(norm);
        }
    } finally {
        await bs.release();
    }
    return { xml, entries };
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

// Banner temporário (substitui alert() por UI inline). kind: 'info' | 'error'
let _infoBanner = null, _bannerTimer = null;
function showInfoBanner(msg, kind = 'info') {
    if (_infoBanner) _infoBanner.remove();
    clearTimeout(_bannerTimer);
    const err = kind === 'error';
    _infoBanner = document.createElement('div');
    _infoBanner.style.cssText = `
        position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
        z-index: 10000; background: ${err ? 'rgba(40,5,5,0.97)' : 'rgba(5,15,40,0.97)'};
        border: 1px solid ${err ? 'rgba(255,59,59,0.6)' : 'rgba(51,170,255,0.5)'};
        border-radius: 10px; padding: 0.9rem 1.5rem; cursor: pointer;
        font-family: 'Share Tech Mono', monospace; font-size: 0.82rem;
        color: ${err ? '#ffd0d0' : '#c8dff8'}; letter-spacing: 0.08em; max-width: 90vw; text-align: center;
        box-shadow: 0 0 30px ${err ? 'rgba(255,59,59,0.2)' : 'rgba(51,170,255,0.2)'}; animation: rp-fade-in 0.3s ease;
    `;
    _infoBanner.textContent = msg;               // textContent: nunca interpreta HTML
    _infoBanner.addEventListener('click', hideInfoBanner);
    document.body.appendChild(_infoBanner);
}
function showErrorBanner(msg) {
    showInfoBanner('⚠️ ' + msg + '  (clique para fechar)', 'error');
    _bannerTimer = setTimeout(hideInfoBanner, 20000);
}
function hideInfoBanner() {
    clearTimeout(_bannerTimer);
    if (_infoBanner) { _infoBanner.remove(); _infoBanner = null; }
}
function setStatusText(msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.textContent = String(msg);
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