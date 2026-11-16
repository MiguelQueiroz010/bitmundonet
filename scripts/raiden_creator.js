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
import { sha256Blob } from './IUP/rpt_sha256.js';
import * as ISOMETA from './raiden_isometa.js';

const $ = (id) => document.getElementById(id);
const APPLY_IDS = ['rp-stepper', 'card-step-1', 'card-step-2', 'card-step-3', 'debug-section'];

const st = { origIso: null, modIso: null, modFolder: null, modMode: 'iso', workDir: null, tmpName: null, tmpDir: null, ops: null, stats: null, busy: false,
    media: null, mediaType: 'none', template: null, lockHandle: null, lockInfo: null };

const MEDIA_MAX_BYTES = 64 * 1048576;   // mesmo limite do aplicador
const IMG_W = 640, IMG_H = 448;           // NTSC

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
    $('btn-cr-generate').disabled = st.busy || !st.ops || !st.ops.length || !$('chk-creator-legal').checked || !!collectPost().error;
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

// ───────────── Metadados da ISO / créditos / mídia (pós-processamento) ─────────────

function buildMetaFields() {
    const box = $('cr-meta-fields'); if (!box || box.childElementCount) return;
    const mk = (id, label, max, type = 'text') => {
        const w = document.createElement('div'); w.className = 'rp-field';
        const l = document.createElement('label'); l.htmlFor = id; l.textContent = label;
        const i = document.createElement('input'); i.className = 'rp-input'; i.id = id; i.type = type; i.autocomplete = 'off'; i.spellcheck = false;
        if (type === 'number') { i.min = '0'; i.max = '65535'; } else i.maxLength = max;
        i.addEventListener('input', updateButtons);
        w.append(l, i); return w;
    };
    for (const [k, f] of Object.entries(ISOMETA.ISO_FIELDS)) box.appendChild(mk(`cr-meta-${k}`, `${f.label} (máx. ${f.len})`, f.len));
    const nums = $('cr-meta-numbers');
    for (const [k, f] of Object.entries(ISOMETA.ISO_NUM_FIELDS)) nums.appendChild(mk(`cr-meta-${k}`, f.label, 0, 'number'));
    const err = document.createElement('div'); err.id = 'cr-meta-err'; err.className = 'rp-cr-warn'; err.style.display = 'none';
    box.parentElement.insertBefore(err, nums);
    $('cr-meta-now').addEventListener('change', updateButtons);
}

// Lê os controles de metadados/créditos/mídia. Devolve { meta:{isoMeta,credits,media}, error } — error é texto para o usuário.
function collectPost() {
    const out = { meta: {}, error: '' };
    const setErr = (id, msg) => { const e = $(id); if (e) { e.textContent = msg ? '⚠️ ' + msg : ''; e.style.display = msg ? '' : 'none'; } };
    if (!$('cr-meta-fields')) return out;

    const changes = {};
    for (const k of Object.keys(ISOMETA.ISO_FIELDS)) { const v = $(`cr-meta-${k}`)?.value ?? ''; if (v !== '') changes[k] = v; }
    const numbers = {};
    for (const k of Object.keys(ISOMETA.ISO_NUM_FIELDS)) { const v = $(`cr-meta-${k}`)?.value ?? ''; if (v !== '') numbers[k] = Number(v); }
    if (Object.keys(numbers).length) changes.numbers = numbers;
    if ($('cr-meta-now')?.checked) changes.dates = { modified: 'now' };
    let metaErr = '';
    if (Object.keys(changes).length) {
        try { ISOMETA.validateMetaChanges(changes); out.meta.isoMeta = changes; } catch (e) { metaErr = e.message; }
    }
    setErr('cr-meta-err', metaErr);

    let credErr = '';
    const text = ($('cr-credits-text')?.value ?? '').trim();
    if (st.template && text) {
        if (new TextEncoder().encode(text).length > 255) credErr = 'O texto dos créditos passa de 255 bytes.';
        else out.meta.credits = text;
    }
    const ftext = ($('cr-fail-text')?.value ?? '').trim();
    if (st.template && ftext) {
        if (/[^\x20-\x7e\xa0-\xff]/.test(ftext)) credErr = credErr || 'A mensagem de falha só aceita caracteres Latin-1 (a fonte do PS2 não tem outros).';
        else if (new TextEncoder().encode(ftext).length > 255) credErr = credErr || 'A mensagem de falha passa de 255 bytes.';
        else out.meta.failText = ftext;
    }
    if (st.template && st.mediaType !== 'none') {
        if (!st.media) credErr = credErr || 'Selecione o arquivo de imagem/vídeo de abertura ou escolha "Só texto".';
        else {
            const dur = Number($('cr-media-duration')?.value || 0);
            if (st.media.type === 'image' && (!Number.isInteger(dur) || dur < 0 || dur > 3600)) credErr = credErr || 'Duração da imagem inválida (0 a 3600).';
            out.meta.media = { ...st.media, durationSec: st.media.type === 'image' ? dur : 0 };
        }
    }
    setErr('cr-credits-err', credErr);
    out.error = metaErr || credErr;
    return out;
}

async function loadTemplateAvailability() {
    st.template = await ISOMETA.fetchWrapperTemplate();
    const off = !st.template;
    const un = $('cr-credits-unavailable'), body = $('cr-credits-body');
    if (!un || !body) return;
    un.style.display = off ? '' : 'none';
    un.textContent = off ? '⚠️ O wrapper de créditos (scripts/raiden_wrapper.elf) ainda não foi compilado/publicado neste site, então créditos e abertura estão desabilitados. Compile scripts/credits_wrapper.c com o PS2SDK e coloque o .elf resultante em scripts/ para habilitar.' : '';
    body.style.display = off ? 'none' : '';
    // wrapper sem suporte a filme (RAIDENCAPS bit0 = 0): desabilita a opção "Vídeo .PSS"
    const mv = document.querySelector('input[name="cr-media-type"][value="movie"]');
    if (mv && st.template) {
        const caps = ISOMETA.readWrapperMarkers(st.template).caps;
        const noMovie = caps && !caps.movie;
        mv.disabled = !!noMovie;
        if (mv.parentElement) mv.parentElement.title = noMovie ? 'Este wrapper foi compilado sem suporte a vídeo .PSS' : '';
        if (noMovie && mv.checked) { const none = document.querySelector('input[name="cr-media-type"][value="none"]'); if (none) { none.checked = true; none.dispatchEvent(new Event('change')); } }
    }
    updateButtons();
}

// PNG/JPG → RGBA32 cru no layout que o wrapper envia direto à GS (640x448, alfa 0..128 = convenção da GS).
async function imageToRgba32(file) {
    const bmp = await createImageBitmap(file);
    const cv = document.createElement('canvas'); cv.width = IMG_W; cv.height = IMG_H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, IMG_W, IMG_H);
    const k = Math.min(IMG_W / bmp.width, IMG_H / bmp.height);          // "contain": mantém a proporção, barras pretas
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    g.drawImage(bmp, (IMG_W - w) >> 1, (IMG_H - h) >> 1, w, h);
    if (bmp.close) bmp.close();
    const px = new Uint8Array(g.getImageData(0, 0, IMG_W, IMG_H).data);
    for (let i = 3; i < px.length; i += 4) px[i] = (px[i] * 128 / 255) | 0;
    return px;
}

async function pickMedia() {
    const isImg = st.mediaType === 'image';
    const [h] = await window.showOpenFilePicker(isImg
        ? { types: [{ description: 'Imagem', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }] }
        : { types: [{ description: 'Vídeo PS2 (.pss)', accept: { 'application/octet-stream': ['.pss', '.str', '.mpg'] } }] });
    const f = await h.getFile();
    if (!isImg && f.size > MEDIA_MAX_BYTES) throw new Error(`O vídeo passa de ${MEDIA_MAX_BYTES / 1048576} MB (limite do patch).`);
    if (isImg) st.media = { type: 'image', width: IMG_W, height: IMG_H, data: await imageToRgba32(f), size: IMG_W * IMG_H * 4 };
    else st.media = { type: 'movie', width: 0, height: 0, file: f, size: f.size };
    $('cr-media-label').textContent = `${f.name} (${fmt(f.size)})`; $('cr-media-label').style.display = '';
}

// Grava o payload da mídia na pasta de payloads e completa os dados do <Media> (nome, tamanho, SHA-256).
async function writeMediaPayload(payloadDir, m) {
    const fh = await payloadDir.getFileHandle('media.bin', { create: true });
    const w = await fh.createWritable();
    try { if (m.data) await w.write(m.data); else await m.file.stream().pipeTo(w, { preventClose: true }); await w.close(); }
    catch (e) { try { await w.abort(); } catch (_) {} throw e; }
    const f = await fh.getFile();
    return { type: m.type, payloadName: 'media.bin', size: f.size, sha256: await sha256Blob(f), width: m.width, height: m.height, durationSec: m.durationSec };
}

// ───────────── Ferramentas avulsas: travar / destravar ISO ─────────────

function lockStatus(msg, kind = '') {
    const el = $('cr-lock-status'); if (!el) return;
    el.textContent = msg || ''; el.className = 'rp-cr-status' + (kind ? ' ' + kind : ''); el.style.display = msg ? '' : 'none';
}
function updateLockButtons() {
    const ok = !!st.lockHandle && !st.busy && !!$('cr-lock-pass').value;
    $('btn-cr-lock').disabled = !ok || !!st.lockInfo?.lock;
    $('btn-cr-unlock').disabled = !ok || !st.lockInfo?.lock;
}
async function pickLockIso() {
    const [h] = await window.showOpenFilePicker({ types: [{ description: 'Imagem de disco', accept: { 'application/octet-stream': ['.iso', '.bin', '.img'] } }] });
    const f = await h.getFile();
    st.lockHandle = h; st.lockInfo = null;
    $('cr-lock-label').textContent = `${f.name} (${fmt(f.size)})`; $('cr-lock-label').style.display = '';
    try {
        st.lockInfo = await ISOMETA.readIsoInfo(ISOMETA.blobReader(f));
        lockStatus(st.lockInfo.lock ? '🔒 Esta ISO está travada (arquivos criptografados). Informe a senha para destravar.' : '🔓 Esta ISO não está travada.', 'info');
    } catch (e) { st.lockHandle = null; lockStatus('❌ ' + e.message, 'err'); }
    updateLockButtons();
}
async function runLock(unlock) {
    if (!st.lockHandle || st.busy) return;
    const pass = $('cr-lock-pass').value;
    if (!pass) return;
    if (!unlock && !window.confirm('Travar altera ESTE arquivo no próprio lugar e criptografa o ELF de boot.\n\nSem a senha não há como recuperar a ISO. Você está usando uma CÓPIA de trabalho e guardou a senha?')) return;
    st.busy = true; updateButtons(); updateLockButtons(); lockStatus(unlock ? '⏳ Destravando… (derivação da chave leva alguns segundos)' : '⏳ Travando…', 'info');
    try {
        const r = ISOMETA.blobReader(await st.lockHandle.getFile());
        let res;
        if (unlock) res = await ISOMETA.buildUnlockPatches(r, pass);
        else {
            const extra = $('cr-lock-files').value.split(',').map((x) => x.trim()).filter(Boolean);
            res = await ISOMETA.buildLockPatches(r, pass, { files: extra });
        }
        await ISOMETA.applyPatchesInPlace(st.lockHandle, res.patches);
        st.lockInfo = await ISOMETA.readIsoInfo(ISOMETA.blobReader(await st.lockHandle.getFile()));
        const names = unlock ? res.files.length + ' arquivo(s)' : res.files.join(', ');
        lockStatus(unlock ? `✅ ISO destravada (${names} restaurado(s)).` : `✅ ISO travada (${names}). Guarde a senha.`, 'ok');
    } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); lockStatus('❌ ' + (e.message || 'Falha na operação.'), 'err'); } else lockStatus('');
    } finally { st.busy = false; $('cr-lock-pass').value = ''; updateButtons(); updateLockButtons(); }
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
        const post = collectPost();
        if (post.error) throw new Error(post.error);
        Object.assign(meta, post.meta);
        if (meta.media) meta.media = await writeMediaPayload(payloadDir, meta.media);
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
    buildMetaFields();
    $('cr-credits-text')?.addEventListener('input', updateButtons);
    $('cr-fail-text')?.addEventListener('input', updateButtons);
    $('cr-media-duration')?.addEventListener('input', updateButtons);
    for (const r of document.querySelectorAll('input[name="cr-media-type"]')) r.addEventListener('change', () => {
        st.mediaType = r.value; st.media = null; $('cr-media-label').style.display = 'none';
        $('btn-cr-media').style.display = st.mediaType === 'none' ? 'none' : '';
        $('cr-media-duration-wrap').style.display = st.mediaType === 'image' ? '' : 'none';
        $('cr-media-text').textContent = st.mediaType === 'image' ? 'Selecionar imagem' : 'Selecionar vídeo .PSS';
        $('cr-media-sub').textContent = st.mediaType === 'image' ? 'PNG ou JPG — será ajustada a 640×448 (barras pretas se a proporção for outra)' : `Arquivo .PSS (Sofdec/MPEG2 do PS2), até ${MEDIA_MAX_BYTES / 1048576} MB`;
        updateButtons();
    });
    $('btn-cr-media')?.addEventListener('click', async () => {
        try { await pickMedia(); status(''); } catch (e) { if (e.name !== 'AbortError') status('❌ ' + e.message, 'err'); }
        updateButtons();
    });
    $('btn-cr-lock-iso')?.addEventListener('click', async () => { try { await pickLockIso(); } catch (e) { if (e.name !== 'AbortError') lockStatus('❌ ' + e.message, 'err'); } });
    $('cr-lock-pass')?.addEventListener('input', updateLockButtons);
    $('btn-cr-lock')?.addEventListener('click', () => runLock(false));
    $('btn-cr-unlock')?.addEventListener('click', () => runLock(true));
    loadTemplateAvailability();
    $('btn-cr-analyze').addEventListener('click', analyze);
    $('btn-cr-generate').addEventListener('click', generate);
    window.addEventListener('beforeunload', () => { /* temporários são apagados ao concluir; se a aba fechar no meio, a subpasta raiden_tmp_create_* pode ser apagada à mão */ });
    updateButtons();
}
init();
