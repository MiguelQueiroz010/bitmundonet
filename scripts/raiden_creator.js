/**
 * raiden_creator.js — aba "Criar patch" do Raiden Web Patcher.
 * Compara a ISO original com a ISO modificada (ou uma pasta de arquivos) e gera um .rpt só com as diferenças.
 * Tudo local: nada é enviado a servidor.
 */
import { ISO9660 } from './IUP/iso9660.js';
import { encryptFileToHandle } from './IUP/crypto_stuff.js';
import { RPT_PASSWORD } from './IUP/rpt_config.js';
import { listFiles, analyzeTrees, assemblePlainRpt } from './IUP/rpt_builder.js';
import { cleanupWorkDir } from './IUP/rpt_ops.js';

const $ = (id) => document.getElementById(id);
const APPLY_IDS = ['rp-stepper', 'card-step-1', 'card-step-2', 'card-step-3', 'debug-section'];

const st = { origIso: null, modIso: null, modFolder: null, modMode: 'iso', workDir: null, tmpName: null, tmpDir: null, ops: null, stats: null, busy: false };

const fmt = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`;

function setTab(which) {
    const create = which === 'create';
    for (const id of APPLY_IDS) { const el = $(id); if (el) el.style.display = create ? 'none' : ''; }
    $('creator-section').style.display = create ? '' : 'none';
    $('tab-apply').classList.toggle('active', !create);
    $('tab-create').classList.toggle('active', create);
}

function status(msg, kind = '') {
    const el = $('cr-status');
    el.textContent = msg || '';
    el.className = 'rp-cr-status' + (kind ? ' ' + kind : '');
    el.style.display = msg ? '' : 'none';
}
function progress(frac, msg) {
    $('cr-bar').style.width = `${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%`;
    if (msg) $('cr-prog-msg').textContent = msg;
}
function showProgress(on) { $('cr-progress').style.display = on ? '' : 'none'; if (!on) progress(0, ''); }

function updateButtons() {
    const modOk = st.modMode === 'iso' ? !!st.modIso : !!st.modFolder;
    const md5 = $('cr-md5').value.trim();
    const md5Ok = !md5 || /^[0-9a-f]{32}$/i.test(md5);
    $('btn-cr-analyze').disabled = st.busy || !st.origIso || !modOk || !md5Ok || !$('cr-name').value.trim();
    $('btn-cr-generate').disabled = st.busy || !st.ops || !st.ops.length || !$('chk-creator-legal').checked;
    $('cr-md5').style.borderColor = md5Ok ? '' : 'var(--rp-red)';
}

async function pickIso(label) {
    const [h] = await window.showOpenFilePicker({ types: [{ description: 'Imagem de disco', accept: { 'application/octet-stream': ['.iso', '.bin', '.img'] } }] });
    const f = await h.getFile();
    label.textContent = `${f.name} (${fmt(f.size)})`; label.style.display = '';
    return f;
}

async function cleanup() {
    if (st.workDir && st.tmpName) await cleanupWorkDir(st.workDir, [st.tmpName]);
    st.tmpName = null; st.tmpDir = null; st.ops = null; st.stats = null;
}

function renderReview() {
    const { ops, stats } = st;
    const box = $('cr-review'); box.textContent = '';
    box.style.display = '';
    const head = document.createElement('div'); head.className = 'rp-cr-summary';
    const parts = [`${stats.same} arquivo(s) idêntico(s) (ficam FORA do patch)`];
    if (stats.inject) parts.push(`${stats.inject} inject`);
    if (stats.delta) parts.push(`${stats.delta} delta`);
    if (stats.replace) parts.push(`${stats.replace} substituição(ões)`);
    head.textContent = `${ops.length} arquivo(s) no patch · conteúdo ≈ ${fmt(stats.payloadBytes)} — ${parts.join(' · ')}`;
    box.appendChild(head);

    const warns = [];
    if (!ops.length) warns.push('Nenhuma diferença encontrada: a versão modificada é idêntica à original.');
    const bigReplace = ops.filter(o => o.type === 'replace' && o.size > 8 * 1048576);
    if (bigReplace.length) warns.push(`${bigReplace.length} arquivo(s) grande(s) entrarão INTEIROS no patch (${bigReplace.slice(0, 3).map(o => o.path).join(', ')}${bigReplace.length > 3 ? '…' : ''}). Confira se é conteúdo seu; para vídeos/áudios alterados prefira gerar a diferença (delta) a partir do original.`);
    if (stats.payloadBytes > 200 * 1048576) warns.push('O patch ficou muito grande (> 200 MB). Isso indica que muito conteúdo do jogo original pode estar sendo incluído — revise a lista abaixo.');
    for (const w of warns) { const d = document.createElement('div'); d.className = 'rp-cr-warn'; d.textContent = '⚠️ ' + w; box.appendChild(d); }

    const list = document.createElement('div'); list.className = 'rp-cr-list';
    for (const o of ops.slice(0, 500)) {
        const row = document.createElement('div'); row.className = 'rp-cr-row';
        const b = document.createElement('span'); b.className = 'rp-cr-badge ' + o.type; b.textContent = o.type;
        const p = document.createElement('span'); p.className = 'rp-cr-path'; p.textContent = o.path;
        const r = document.createElement('span'); r.className = 'rp-cr-reason'; r.textContent = `${o.reason} · ${fmt(o.bytes)}`;
        row.append(b, p, r); list.appendChild(row);
    }
    if (ops.length > 500) { const d = document.createElement('div'); d.className = 'rp-cr-reason'; d.textContent = `… e mais ${ops.length - 500}`; list.appendChild(d); }
    box.appendChild(list);
}

async function analyze() {
    if (st.busy) return;
    st.busy = true; updateButtons(); status('');
    try {
        await cleanup(); $('cr-review').style.display = 'none';
        status('📁 Escolha uma PASTA com bastante espaço livre (será criada uma subpasta temporária, apagada ao final).', 'info');
        st.workDir = await window.showDirectoryPicker({ mode: 'readwrite' });
        status('');
        showProgress(true);
        st.tmpName = `raiden_tmp_create_${Date.now().toString(36)}`;
        st.tmpDir = await st.workDir.getDirectoryHandle(st.tmpName, { create: true });

        progress(0.02, 'Extraindo a ISO original…');
        const origDir = await st.tmpDir.getDirectoryHandle('orig', { create: true });
        await ISO9660.ExtrairNaPasta(st.origIso, origDir, { onProgress: (_, m) => $('cr-prog-msg').textContent = m });

        let modFiles;
        if (st.modMode === 'iso') {
            progress(0.2, 'Extraindo a ISO modificada…');
            const modDir = await st.tmpDir.getDirectoryHandle('mod', { create: true });
            await ISO9660.ExtrairNaPasta(st.modIso, modDir, { onProgress: (_, m) => $('cr-prog-msg').textContent = m });
            modFiles = await listFiles(modDir);
        } else modFiles = await listFiles(st.modFolder);

        const origFiles = await listFiles(origDir);
        if (!origFiles.length) throw new Error('Não foi possível ler arquivos da ISO original (formato não reconhecido?).');
        if (!modFiles.length) throw new Error('Nenhum arquivo encontrado na versão modificada.');

        const payloadDir = await st.tmpDir.getDirectoryHandle('payload', { create: true });
        const { ops, stats } = await analyzeTrees({
            origFiles, modFiles, payloadDir,
            onProgress: (f, m) => progress(0.35 + f * 0.65, m),
        });
        st.ops = ops; st.stats = stats;
        progress(1, 'Análise concluída.');
        renderReview();
        status(ops.length ? '✅ Análise concluída. Revise a lista, marque a declaração e gere o .rpt.' : '', 'ok');
    } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); status('❌ ' + (e.name === 'QuotaExceededError' ? 'Sem espaço em disco suficiente.' : e.message || 'Falha na análise.'), 'err'); }
        await cleanup();
    } finally { st.busy = false; showProgress(false); updateButtons(); }
}

async function generate() {
    if (st.busy || !st.ops || !st.ops.length) return;
    st.busy = true; updateButtons(); status('');
    try {
        const safe = $('cr-name').value.trim().replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60) || 'patch';
        const saveHandle = await window.showSaveFilePicker({ suggestedName: `${safe}.rpt`, types: [{ description: 'Patch Raiden', accept: { 'application/octet-stream': ['.rpt'] } }] });
        showProgress(true);
        const meta = {
            gameName: $('cr-name').value.trim(), version: $('cr-version').value.trim(), author: $('cr-author').value.trim(),
            targetMd5: $('cr-md5').value.trim().toLowerCase(), desc: $('cr-desc').value.trim(),
        };
        const payloadDir = await st.tmpDir.getDirectoryHandle('payload');
        const plain = await st.tmpDir.getFileHandle('rpt_plain.bin', { create: true });
        progress(0.05, 'Montando o patch…');
        await assemblePlainRpt({ ops: st.ops, meta, payloadDir, plainHandle: plain, onProgress: (f) => progress(0.05 + f * 0.45) });
        progress(0.5, 'Criptografando…');
        await encryptFileToHandle(RPT_PASSWORD, await plain.getFile(), saveHandle, (f) => progress(0.5 + f * 0.5));
        const size = (await (await saveHandle.getFile()).size);
        progress(1, 'Pronto!');
        status(`✅ Patch criado: ${saveHandle.name} (${fmt(size)}). Teste aplicando-o a uma ISO limpa na aba "Aplicar patch" antes de publicar.`, 'ok');
        await cleanup(); $('cr-review').style.display = 'none';
    } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); status('❌ ' + (e.message || 'Falha ao gerar o patch.'), 'err'); }
    } finally { st.busy = false; showProgress(false); updateButtons(); }
}

function init() {
    if (!$('creator-section')) return;
    $('tab-apply').addEventListener('click', () => setTab('apply'));
    $('tab-create').addEventListener('click', () => setTab('create'));
    $('btn-cr-orig').addEventListener('click', async () => { try { st.origIso = await pickIso($('cr-orig-label')); } catch (e) { if (e.name !== 'AbortError') status('❌ ' + e.message, 'err'); } updateButtons(); });
    $('btn-cr-mod').addEventListener('click', async () => {
        try {
            if (st.modMode === 'iso') st.modIso = await pickIso($('cr-mod-label'));
            else { st.modFolder = await window.showDirectoryPicker({ mode: 'read' }); $('cr-mod-label').textContent = `📁 ${st.modFolder.name}`; $('cr-mod-label').style.display = ''; }
        } catch (e) { if (e.name !== 'AbortError') status('❌ ' + e.message, 'err'); }
        updateButtons();
    });
    for (const r of document.querySelectorAll('input[name="cr-mod-mode"]')) r.addEventListener('change', () => {
        st.modMode = r.value; $('cr-mod-label').style.display = 'none';
        $('cr-mod-text').textContent = st.modMode === 'iso' ? 'Selecionar ISO Modificada' : 'Selecionar Pasta Modificada';
        updateButtons();
    });
    for (const id of ['cr-name', 'cr-md5', 'chk-creator-legal']) { $(id).addEventListener('input', updateButtons); $(id).addEventListener('change', updateButtons); }
    $('btn-cr-analyze').addEventListener('click', analyze);
    $('btn-cr-generate').addEventListener('click', generate);
    window.addEventListener('beforeunload', () => { /* temporários são apagados ao concluir; se a aba fechar no meio, a subpasta raiden_tmp_create_* pode ser apagada à mão */ });
    updateButtons();
}
init();
