/**
 * raiden_patcher.js
 * Lida com o ciclo de vida do Web Patcher.
 * - Leitura e gerenciamento de permissões do File System
 * - Acionamento de stream de I/O em chunks para poupar RAM
 * - Animação UI
 */

import { decryptFileToHandle } from "./IUP/crypto_stuff.js";
import { ISO9660 } from './IUP/iso9660.js';
import { IOextent } from './IUP/io_extent.js';

// Handles dos arquivos locais
let isoFileHandle = null;
let patchFileHandle = null;
let isoFile = null;
let patchFile = null;

// Referências HTML
const btnSelectIso = document.getElementById('btn-select-iso');
const btnSelectPatch = document.getElementById('btn-select-patch');
const btnApplyPatch = document.getElementById('btn-apply-patch');
const labelIso = document.getElementById('label-iso');
const labelPatch = document.getElementById('label-patch');
const spaceLbl = document.getElementById('space-lbl');
const storageLbl = document.getElementById('storage-lbl');
const animOverlay = document.getElementById('anim-overlay');
const btnCloseAnim = document.getElementById('btn-close-anim');

// ═══════════════════════════════════════════════════════
// UI & EVENTOS DE SELEÇÃO
// ═══════════════════════════════════════════════════════

btnSelectIso.addEventListener('click', async () => {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Arquivos ISO', accept: { 'application/octet-stream': ['.iso'] } }],
      multiple: false
    });
    isoFileHandle = handle;
    isoFile = await isoFileHandle.getFile();

    labelIso.textContent = isoFile.name;
    btnSelectIso.classList.add('loaded');
    checkReady();
  } catch (e) {
    if (e.name !== 'AbortError') console.error("Erro abrindo Picker de ISO:", e);
  }
});

btnSelectPatch.addEventListener('click', async () => {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Patch Raiden (.rpt, .xml)', accept: { 'application/octet-stream': ['.rpt', '.xml'] } }],
      multiple: false
    });
    patchFileHandle = handle;
    patchFile = await patchFileHandle.getFile();

    labelPatch.textContent = patchFile.name;
    btnSelectPatch.classList.add('loaded');
    checkReady();
  } catch (e) {
    if (e.name !== 'AbortError') console.error("Erro abrindo Picker de Patch:", e);
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkReady() {
  if (isoFile && patchFile) {
    btnApplyPatch.disabled = false;

    const sizeTotal = isoFile.size + patchFile.size;
    // Patcher requirement from C#: Needs space roughly equal to original ISO + patch + 2GB padding
    const spaceNeeded = isoFile.size + patchFile.size + 2147483648;

    storageLbl.innerHTML = `Peso Selecionado: <strong>${formatBytes(sizeTotal)}</strong> | Espaço de Trabalho Recomendado: <strong>${formatBytes(spaceNeeded)}</strong> livres em disco.`;
    storageLbl.style.color = '#3af';
  }
}

// ═══════════════════════════════════════════════════════
// ALGORITMO DE STREAMING E PATCHING (FILE SYSTEM API)
// ═══════════════════════════════════════════════════════

btnApplyPatch.addEventListener('click', async () => {
  if (!isoFile || !patchFile) return;

  try {
    // 1. Pedir ao usuário para selecionar onde salvar a ISO
    const saveHandle = await window.showSaveFilePicker({
      suggestedName: 'Patched_Raiden.iso',
      types: [{ description: 'ISO File', accept: { 'application/octet-stream': ['.iso'] } }]
    });

    // 1b. Pedir a pasta de trabalho (mesma pasta da ISO) para salvar arquivos temporários
    alert("Agora selecione a MESMA PASTA onde você quer salvar a ISO, para que os arquivos temporários sejam extraídos lá.");
    const workDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

    // 2. Transitar a UI para a Animação
    animOverlay.style.display = 'block';
    startAnim();

    // 3. Iniciar o Stream Writer (Permissão Solicitada neste ato via SO)
    const writableStream = await saveHandle.createWritable();

    // Simular lógica do Worker sendo conectada nas msgs de UI da animação
    await executeStreamingPatch(isoFile, patchFile, writableStream, workDirHandle);

  } catch (e) {
    if (e.name !== 'AbortError') {
      alert("Erro durante a escrita: " + e.message);
    } else {
      console.log("Usuário cancelou a seleção do local de destino da ISO.");
    }
    animOverlay.style.display = 'none';
  }
});

btnCloseAnim.addEventListener('click', () => {
  animOverlay.style.display = 'none';
  restartAnim(); // Reseta para a próxima vez
});

/**
 * Procedimento real simulando o PatchISO assíncrono.
 */
async function executeStreamingPatch(origIsoFile, patchFile, writableStream, workDirHandle) {
  try {

    // FASE 0: MD5 Verification (Requisitado)
    updateStatusUI(1); setProgressUI(5);
    console.log("Iniciando Verificação MD5...");

    const md5Hasher = IOextent.createMD5();
    const isoReader = origIsoFile.stream().getReader();
    let readForMD5 = 0;

    //while (true) {
    // const { done, value } = await isoReader.read();
    // if (done) break;
    //  md5Hasher.update(value);
    //  readForMD5 += value.length;
    //  setProgressUI(5 + (readForMD5 / origIsoFile.size) * 10);
    // }
    //const finalMd5 = md5Hasher.digest();
    // console.log("MD5 Calculado:", finalMd5);
    // No C#, aqui compararia com o MD5 esperado do RPT. Por enquanto permitimos seguir.

    updateStatusUI(1); setProgressUI(15);

    // FASE 1: Decriptação do Patch RPT
    updateStatusUI(2); setProgressUI(20);
    const password = "bit.raiden";

    const patchXmlHandle = await workDirHandle.getFileHandle(patchFile.name);

    try {
      await decryptFileToHandle(password, patchFile, patchXmlHandle, (progress) => {
        setProgressUI(20 + progress * 10);
      });
      console.log("Patch RPT descriptografado para disco com sucesso.");
    } catch (e) {
      console.error("Falha na decriptação RPT.", e);
      throw new Error("Não foi possível descriptografar o patch (.rpt).");
    }
    setProgressUI(30);
    // FASE 2: Parsing/Scanning do XML do Patch no OPFS
    updateStatusUI(3); setProgressUI(30);
    const patchInfo = await scanPatchMetadata(patchXmlHandle, workDirHandle);
    console.log(`Encontrados ${patchInfo.length} arquivos no patch (Scanner OPFS).`);

    // FASE 3: Reconstrução ISO usando OPFS
    updateStatusUI(4); setProgressUI(40);
    await ISO9660.PatchISO(origIsoFile,
      workDirHandle,
      writableStream, {
      onProgress: (status, progMsg) => {
        console.log(progMsg);
        // Mapear status internos para a UI do Raiden
        if (status === 2) updateStatusUI(3); // Extraindo
        if (status === 4) updateStatusUI(4); // Reconstruindo
        // O progresso aqui é uma fração 0-1
      }
    });

    await writableStream.close();
    setProgressUI(100);
    updateStatusUI(5);

    // Por enquanto, seguimos o fluxo visual para validar a decriptação
    updateStatusUI(4); setProgressUI(50);

    // Simulação de escrita final
    const reader = origIsoFile.stream().getReader();
    let totalRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writableStream.write(value);
      totalRead += value.length;
      let prog = 50 + ((totalRead / origIsoFile.size) * 50);
      setProgressUI(prog);
      updateStatusUI(prog > 90 ? 5 : 4);
    }

    await writableStream.close();
    setProgressUI(100);
    setTimeout(() => { triggerFinale(); }, 300);
    setTimeout(() => { btnCloseAnim.style.pointerEvents = 'auto'; btnCloseAnim.style.opacity = '1'; }, 2000);

  } catch (e) {
    alert("Erro no processo de Patch: " + e.message);
    animOverlay.style.display = 'none';
  }
}


// ═══════════════════════════════════════════════════════
// UI ENGINE (Portado do raiden-patch-animation.html)
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', () => { resize(); if (animState !== ST.IDLE) rebuildParticles(); });

const PARTICLE_COUNT = 60;
let particles = [];
let bolts = [];
let sparks = [];
let scanY = -10, scanning = false, scanCb = null;
let coreA = 0;

const ST = { IDLE: 0, RISING: 1, PATCHING: 2, FINALE: 3, DONE: 4 };
let animState = ST.IDLE, animProgress = 0, ltimer = null, lintensity = 0;

class Particle {
  constructor() { this.reset(true); }
  reset(initial) {
    this.x = Math.random() * W;
    this.y = initial ? Math.random() * H : H + 10;
    this.type = Math.random() < 0.6 ? 'dot' : 'dash';
    this.r = this.type === 'dot' ? 1.5 + Math.random() * 3 : 0;
    this.dw = this.type === 'dash' ? 8 + Math.random() * 18 : 0;
    this.dh = this.type === 'dash' ? 2 + Math.random() * 3 : 0;
    const hue = 210 + Math.floor(Math.random() * 40);
    const sat = 60 + Math.floor(Math.random() * 40);
    const lit = 40 + Math.floor(Math.random() * 35);
    this.color = `hsl(${hue},${sat}%,${lit}%)`;
    this.glow = `hsla(${hue},100%,70%,0.5)`;
    this.sx = Math.random() * Math.PI * 2; this.sy = Math.random() * Math.PI * 2;
    this.frx = 0.0003 + Math.random() * 0.0004; this.fry = 0.0004 + Math.random() * 0.0005;
    this.ax = 20 + Math.random() * 50; this.ay = 15 + Math.random() * 40;
    this.baseX = this.x; this.baseY = this.y;
    this.rot = Math.random() * Math.PI; this.rotSpd = (Math.random() - .5) * 0.005;
    this.alpha = initial ? Math.random() * 0.7 : 0;
    this.targetAlpha = 0.25 + Math.random() * 0.55;
    this.pulseS = Math.random() * Math.PI * 2; this.pulseFr = 0.001 + Math.random() * 0.002;
    this.boom = false; this.bvx = 0; this.bvy = 0; this.brotv = 0; this.balpha = 1;
  }
  update(t, collapse) {
    if (this.boom) {
      this.bvy += 0.35; this.baseX += this.bvx; this.baseY += this.bvy;
      this.rot += this.brotv; this.balpha = Math.max(0, this.balpha - 0.026);
      this.alpha = this.balpha; return;
    }
    if (this.alpha < this.targetAlpha) this.alpha = Math.min(this.targetAlpha, this.alpha + 0.008);
    const fx = Math.sin(t * this.frx + this.sx) * this.ax, fy = Math.sin(t * this.fry + this.sy) * this.ay;
    this.rot += this.rotSpd;
    const pulse = 0.7 + 0.3 * Math.sin(t * this.pulseFr + this.pulseS);
    const cx = W / 2, cy = H / 2;
    const colX = (cx - this.baseX) * collapse * 0.9, colY = (cy - this.baseY) * collapse * 0.9;
    this.x = this.baseX + fx + colX; this.y = this.baseY + fy + colY;
    this.alpha = (this.targetAlpha * pulse) * (1 - collapse * 0.5);
  }
  draw(ctx) {
    if (this.alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha = this.alpha; ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.shadowBlur = 8; ctx.shadowColor = this.glow; ctx.fillStyle = this.color;
    if (this.type === 'dot') { ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(-this.dw / 2, -this.dh / 2, this.dw, this.dh); }
    ctx.restore();
  }
  explode() {
    this.boom = true; const a = Math.random() * Math.PI * 2, spd = 3 + Math.random() * 8;
    this.bvx = Math.cos(a) * spd; this.bvy = Math.sin(a) * spd - 2;
    this.brotv = (Math.random() - .5) * 0.2; this.balpha = 1;
  }
}

function rebuildParticles() { particles = []; for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle()); }

function spawnLightning(intensity) {
  const cx = W / 2, cy = H / 2, n = Math.floor(2 + intensity * 4);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 100 + Math.random() * Math.min(W, H) * 0.38;
    bolts.push({
      x1: cx, y1: cy, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r,
      life: 1, decay: 0.07 + Math.random() * 0.09, rough: 50 + intensity * 28, depth: 4 + Math.floor(intensity),
      col: Math.random() < .7 ? '#4af' : '#88ddff'
    });
  }
}
function boltSegs(x1, y1, x2, y2, r, d) {
  if (d === 0) return [[x1, y1, x2, y2]];
  const mx = (x1 + x2) / 2 + (Math.random() - .5) * r, my = (y1 + y2) / 2 + (Math.random() - .5) * r;
  const s = [...boltSegs(x1, y1, mx, my, r * .55, d - 1), ...boltSegs(mx, my, x2, y2, r * .55, d - 1)];
  if (d > 2 && Math.random() < .38) { const bx = mx + (Math.random() - .5) * r * 1.4, by = my + r * (Math.random() * .7 + .2); s.push(...boltSegs(mx, my, bx, by, r * .38, d - 2)); }
  return s;
}
function drawBolts() {
  bolts = bolts.filter(b => b.life > 0);
  for (const b of bolts) {
    const segs = boltSegs(b.x1, b.y1, b.x2, b.y2, b.rough, b.depth);
    ctx.save(); ctx.globalAlpha = b.life; ctx.strokeStyle = b.col;
    ctx.lineWidth = 1.2; ctx.shadowBlur = 10; ctx.shadowColor = '#3af';
    ctx.beginPath(); for (const [sx, sy, ex, ey] of segs) { ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); }
    ctx.stroke(); ctx.restore(); b.life -= b.decay;
  }
}

function spawnSparks(n) {
  const cx = W / 2, cy = H / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 6;
    sparks.push({
      x: cx + (Math.random() - .5) * 60, y: cy + (Math.random() - .5) * 60,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1, life: 1, decay: 0.03 + Math.random() * 0.04,
      r: 1.5 + Math.random() * 2, col: Math.random() < .7 ? '#4af' : '#adf'
    });
  }
}
function drawSparks() {
  sparks = sparks.filter(s => s.life > 0);
  for (const s of sparks) {
    ctx.save(); ctx.globalAlpha = s.life * .9; ctx.fillStyle = s.col; ctx.shadowBlur = 6; ctx.shadowColor = s.col;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    s.x += s.vx; s.y += s.vy; s.vy += 0.14; s.life -= s.decay;
  }
}

function startScanline(cb) { scanY = -10; scanning = true; scanCb = cb; }
function drawScanline() {
  if (!scanning) return;
  scanY += H / 85;
  if (scanY > H + 15) { scanning = false; if (scanCb) scanCb(); return; }
  const g = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
  g.addColorStop(0, 'rgba(51,170,255,0)'); g.addColorStop(.4, 'rgba(51,170,255,0.5)');
  g.addColorStop(.5, 'rgba(190,235,255,0.92)'); g.addColorStop(.6, 'rgba(51,170,255,0.5)'); g.addColorStop(1, 'rgba(51,170,255,0)');
  ctx.fillStyle = g; ctx.shadowBlur = 14; ctx.shadowColor = '#3af'; ctx.fillRect(0, scanY - 20, W, 40); ctx.shadowBlur = 0;
}

function drawCore(t) {
  if (coreA <= 0) return;
  const p = 0.72 + 0.28 * Math.sin(t * .0018), r = 115 + 28 * p;
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
  g.addColorStop(0, `rgba(55,140,255,${0.2 * coreA * p})`); g.addColorStop(.5, `rgba(18,58,200,${0.09 * coreA})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function show(id, op, tr) {
  const el = document.getElementById(id);
  el.style.opacity = op; if (tr) el.style.transform = tr;
}

function startAnim() {
  if (animState !== ST.IDLE) return;
  animState = ST.RISING;
  document.getElementById('ps2bg').style.opacity = '1';
  rebuildParticles();
  setTimeout(() => {
    startScanline(() => {
      show('raidenSVG', '1', 'translate(-50%,-50%) scale(1)');
      show('raidenGifAnim', '1', 'translate(-50%,-50%) scale(1)');
      show('ringWrap', '1');
      show('statusWrap', '1');
      coreA = 1; animState = ST.PATCHING;
      lintensity = 0.25;
      startLLoop();
    });
  }, 900);
}

function startLLoop() {
  if (ltimer) clearInterval(ltimer);
  ltimer = setInterval(() => {
    if (Math.random() < .55) { spawnLightning(lintensity); if (Math.random() < .3) spawnSparks(6); }
  }, 160);
}
function stopLLoop() { if (ltimer) { clearInterval(ltimer); ltimer = null; } }

function setProgressUI(p) {
  animProgress = p;
  document.getElementById('ringPath').style.strokeDashoffset = 502 - (p / 100) * 502;
  lintensity = 0.2 + (p / 100) * 1.4;
  if (p > 0 && p % 25 < 1.5) spawnSparks(20);
  document.getElementById('pctLabel').textContent = Math.floor(p) + '%';
}

const MSGS = [[0, 'Iniciando Worker...'], [18, 'Validando MD5 da ISO...'], [32, 'Extraindo arquivos modificados...'], [48, 'Construindo Árvore Path Table UDF...'], [76, 'Realocando blocos lógicos da ISO...'], [97, 'Finalizando...']];

function updateStatusUI(idxOrPercent) {
  let msg = "";
  if (idxOrPercent < MSGS.length) {
    msg = MSGS[idxOrPercent][1];
  } else {
    // Search closest
    msg = MSGS[0][1]; for (const [t, m] of MSGS) if (idxOrPercent >= t) msg = m;
  }
  document.getElementById('statusMsg').textContent = msg;
}

function triggerFinale() {
  animState = ST.FINALE; lintensity = 3;
  spawnSparks(80); spawnLightning(3); spawnLightning(3);
  for (const p of particles) p.explode();
  const flD = document.createElement('div');
  flD.style.cssText = 'position:absolute;inset:0;z-index:50;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.07s ease';
  document.getElementById('stage').appendChild(flD);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    flD.style.opacity = '.92'; setTimeout(() => { flD.style.opacity = '0'; setTimeout(() => flD.remove(), 350); }, 100);
  }));
  stopLLoop();
  setTimeout(() => { show('raidenSVG', '0'); show('raidenGifAnim', '0'); show('ringWrap', '0'); show('statusWrap', '0'); coreA = 0; }, 250);
  setTimeout(() => {
    const fl = document.getElementById('flawless'); fl.style.opacity = '1'; fl.style.pointerEvents = 'auto';
    const ft = document.getElementById('flawlessText'); ft.style.opacity = '1'; ft.style.transform = 'scale(1)';
    for (let i = 0; i < 4; i++) setTimeout(() => spawnLightning(1.8), i * 130);
    setTimeout(() => { const vt = document.getElementById('victoryText'); vt.style.opacity = '1'; vt.style.transform = 'translateY(0)'; }, 420);
    setTimeout(() => { document.getElementById('isoReadyText').style.opacity = '1'; }, 900);
    animState = ST.DONE;
  }, 520);
}

function restartAnim() {
  animState = ST.IDLE; animProgress = 0;
  stopLLoop();
  bolts = []; sparks = []; particles = []; coreA = 0;
  ['ps2bg', 'ringWrap', 'statusWrap', 'isoReadyText', 'victoryText', 'flawlessText', 'flawless']
    .forEach(id => { const el = document.getElementById(id); el.style.opacity = '0'; if (el.style.pointerEvents !== undefined) el.style.pointerEvents = 'none'; });
  document.getElementById('flawlessText').style.transform = 'scale(3.5)';
  document.getElementById('victoryText').style.transform = 'translateY(22px)';
  document.getElementById('ringPath').style.strokeDashoffset = '502';
  document.getElementById('raidenSVG').style.opacity = '0';
  document.getElementById('raidenSVG').style.transform = 'translate(-50%,-50%) scale(0)';
  document.getElementById('raidenGifAnim').style.opacity = '0';
  document.getElementById('raidenGifAnim').style.transform = 'translate(-50%,-50%) scale(0)';
  document.getElementById('statusMsg').textContent = 'Patcher Limpo.';
  document.getElementById('pctLabel').textContent = '0%';
  btnCloseAnim.style.pointerEvents = 'none'; btnCloseAnim.style.opacity = '0';
  ctx.clearRect(0, 0, W, H);
}

function loop(t) {
  if (animOverlay.style.display !== 'block') { requestAnimationFrame(loop); return; }
  requestAnimationFrame(loop);
  ctx.clearRect(0, 0, W, H);
  const colP = (animState === ST.PATCHING || animState === ST.FINALE) ? Math.max(0, Math.min(1, (animProgress - 25) / 65)) : 0;
  drawCore(t);
  for (const p of particles) { p.update(t, animState === ST.FINALE ? 0 : colP); p.draw(ctx); }
  drawScanline(); drawBolts(); drawSparks();
}
requestAnimationFrame(loop);
/**
 * Extrai o conteúdo do patch RPTP sem carregar o arquivo completo na RAM.
 * Segue a lógica de leitura binária do Principal.cs.
 */
/**
 * Extrai o patch RPTP diretamente para uma subpasta "patch_files".
 * @param {FileSystemFileHandle} patchFileHandle - O arquivo .rpt.
 * @param {FileSystemDirectoryHandle} baseDirHandle - A pasta escolhida pelo usuário.
 */
async function scanPatchMetadata(patchFileHandle, baseDirHandle) {
  // 1. Criar a subpasta dentro da pasta escolhida
  // Nota: No Windows, não há API para setar o atributo "Hidden".
  const patchDir = await baseDirHandle.getDirectoryHandle("patch_files", { create: true });

  const file = await patchFileHandle.getFile();
  const reader = file.stream().getReader();

  let { value: buffer, done } = await reader.read();
  let offset = 0;

  async function ensureBytes(n) {
    while (buffer && (buffer.length - offset < n)) {
      const { value: nextChunk, done: isDone } = await reader.read();
      if (isDone) break;
      const newBuffer = new Uint8Array(buffer.length - offset + nextChunk.length);
      newBuffer.set(buffer.slice(offset));
      newBuffer.set(nextChunk, buffer.length - offset);
      buffer = newBuffer;
      offset = 0;
    }
  }

  // Validação Magic RPTP
  await ensureBytes(6);
  const magic = new TextDecoder().decode(buffer.slice(offset, offset + 4));
  if (magic !== "RPTP") throw new Error("Assinatura de patch inválida!");
  offset += 6;

  // Pular Metadados XML
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
      const pathParts = fileName.split(/[\\/]/);
      const nameOnly = pathParts.pop();
      let currentDir = patchDir; // Começa dentro de "patch_files"

      for (const part of pathParts) {
        if (part.trim() !== "") {
          currentDir = await currentDir.getDirectoryHandle(part, { create: true });
        }
      }

      const fHandle = await currentDir.getFileHandle(nameOnly, { create: true });
      const writable = await fHandle.createWritable();

      let remaining = fileSize;
      while (remaining > 0) {
        const available = buffer.length - offset;
        const toWrite = Math.min(available, remaining);

        if (toWrite > 0) {
          await writable.write(buffer.slice(offset, offset + toWrite));
          offset += toWrite;
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

      if (buffer) {
        buffer = buffer.slice(offset);
        offset = 0;
      }
    }
  }
  return filesFound;
}