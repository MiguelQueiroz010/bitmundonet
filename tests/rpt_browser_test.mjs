// Testes em Chromium real. Rodar: node tests/rpt_browser_test.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif' };

// Extrai do raiden_patcher.js REAL os trechos que não dependem do DOM da página.
const src = fs.readFileSync(path.join(ROOT, 'scripts/raiden_patcher.js'), 'utf8');
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('marcador não encontrado: ' + from + ' / ' + to); return src.slice(a, b); };
const snippetBody = cut('// Interpreta o XML do patch', 'async function loadPatchMetadata') + '\n' +
    cut('class ByteStream', '// ═══════════════════════════════════════════════════════\n// UTILITÁRIOS');
const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
    if (p === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>t</title>'); }
    if (p === '/__snippet.mjs') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(
        `import { normalizeOps, createPayloadFile, parseRelPath, RPT_PAYLOAD_PREFIX, LIMITS } from '/scripts/IUP/rpt_ops.js';\nconst MAX_MANIFEST_BYTES = 4*1024*1024, MAX_ENTRIES = 20000;\n${snippetBody}\nexport { parseManifestXml, countOps, extractPatchPayload, ByteStream };`); }
    const f = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
let failed = 0;
try {
    // ── 1) testes de lógica no navegador real ──
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.goto(base + '/__blank');
    await page.addScriptTag({ type: 'module', content: `import { runAll } from ${JSON.stringify(base + '/tests/rpt_browser_inpage.mjs')};
window.__done = runAll(${JSON.stringify(base + '/__snippet.mjs')}, ${JSON.stringify(base + '/scripts/IUP/rpt_ops.js')}, ${JSON.stringify(base + '/scripts/IUP/rpt_sha256.js')}, ${JSON.stringify(base + '/scripts/IUP/rpt_builder.js')}).then(r => window.__res = r, e => window.__res = [{ name: 'harness', ok: false, err: String(e && e.stack || e) }]);` });
    await page.waitForFunction(() => window.__res, null, { timeout: 120000 });
    const results = await page.evaluate(() => window.__res);
    for (const r of results) { console.log((r.ok ? '  ok  ' : '  FALHOU ') + r.name); if (!r.ok) { failed++; console.log(r.err.split('\n').slice(0, 4).join('\n')); } }

    // ── 2) a página real carrega e o botão só libera com a declaração marcada ──
    const p2 = await browser.newPage(); const errs = [];
    p2.on('pageerror', (e) => errs.push(e.message));
    await p2.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(base)) return route.continue();
        const js = (body) => route.fulfill({ status: 200, contentType: 'text/javascript', body });
        if (/forge/.test(u)) return js('window.forge={cipher:{},pkcs5:{},md:{},util:{}};');   // sem rede: forge falso (descriptografia não é testada aqui)
        if (/w3data/.test(u)) return js('function w3IncludeHTML(){}');
        if (/jquery/.test(u)) return js('window.$=window.jQuery=function(){return {on(){},ready(f){},css(){return this}}};');
        if (/firebase|gstatic|googleapis/.test(u)) return js('export const initializeApp=()=>({}),getFirestore=()=>null,getAuth=()=>null,getMessaging=()=>null,doc=()=>null,getDoc=async()=>({exists:()=>false}),setDoc=async()=>{},updateDoc=async()=>{},increment=()=>0,serverTimestamp=()=>0,GoogleAuthProvider=class{},signInWithPopup=async()=>({}),signOut=async()=>{},onAuthStateChanged=()=>()=>{},collection=()=>null,getDocs=async()=>({docs:[],forEach(){}}),query=()=>null,where=()=>null,orderBy=()=>null,limit=()=>null,addDoc=async()=>({}),deleteDoc=async()=>{},onSnapshot=()=>()=>{},getToken=async()=>null,onMessage=()=>{},isSupported=async()=>false;');
        return route.abort();
    });
    await p2.addInitScript(() => {            // stubs dos seletores de arquivo (Chromium headless não abre diálogo)
        window.__mk = async (name, bytes) => { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(bytes); await w.close(); return h; };
        let n = 0; window.showOpenFilePicker = async () => [await window.__mk(n++ === 0 ? 'jogo.iso' : 'patch.rpt', new Uint8Array(4096).fill(7))];
    });
    await p2.goto(base + '/raiden_patcher.html');
    await p2.waitForSelector('#chk-legal-consent');
    const st = async () => p2.evaluate(() => ({ disabled: document.getElementById('btn-apply-patch').disabled, lbl: document.getElementById('space-lbl').textContent, consent: document.getElementById('chk-legal-consent').checked }));
    const s0 = await st(); if (!s0.disabled) { failed++; console.log('  FALHOU botão deveria iniciar desabilitado'); }
    await p2.click('#btn-select-iso'); await p2.waitForFunction(() => document.getElementById('md5-value').textContent.startsWith('MD5:'), null, { timeout: 15000 });
    await p2.click('#btn-select-patch'); await p2.waitForTimeout(500);
    const s1 = await st();
    if (!s1.disabled || !/declaração/.test(s1.lbl)) { failed++; console.log('  FALHOU sem marcar a declaração o botão deve ficar bloqueado:', JSON.stringify(s1)); } else console.log('  ok  página real: botão bloqueado até marcar a declaração (' + s1.lbl + ')');
    await p2.check('#chk-legal-consent'); await p2.waitForTimeout(150);
    const s2 = await st(); if (s2.disabled) { failed++; console.log('  FALHOU após marcar a declaração o botão deveria habilitar:', JSON.stringify(s2)); } else console.log('  ok  página real: marcar a declaração habilita o botão');
    await p2.uncheck('#chk-legal-consent'); await p2.waitForTimeout(150);
    if (!(await st()).disabled) { failed++; console.log('  FALHOU desmarcar deve bloquear de novo'); } else console.log('  ok  página real: desmarcar bloqueia de novo');
    const bad = errs.filter(m => /rpt_|raiden_patcher|iso9660|does not provide an export|is not defined|before initialization|Cannot read/.test(m));
    if (bad.length) { failed++; console.log('  FALHOU erros de JS ao carregar a página:\n   ' + bad.join('\n   ')); } else console.log('  ok  página real carregou o módulo raiden_patcher.js sem erros de JS (' + errs.length + ' erros ignorados de terceiros/stubs)');

    // ── 3) aba "Criar patch": ISOs reais (BuildISO do projeto) → analisar → revisão ──
    const p3 = await browser.newPage(); const errs3 = [];
    p3.on('pageerror', (e) => { errs3.push(e.message); console.log('  [p3 pageerror]', e.message); }); p3.on('console', (m) => { if (m.type() === 'error') console.log('  [p3 console]', m.text().slice(0, 200)); });
    await p3.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(base)) return route.continue();
        const js = (body) => route.fulfill({ status: 200, contentType: 'text/javascript', body });
        if (/forge/.test(u)) return js('window.forge={cipher:{},pkcs5:{},md:{},util:{}};');
        if (/w3data/.test(u)) return js('function w3IncludeHTML(){}');
        if (/jquery/.test(u)) return js('window.$=window.jQuery=function(){return {on(){},ready(f){},css(){return this}}};');
        if (/firebase|gstatic|googleapis/.test(u)) return js('export const initializeApp=()=>({}),getFirestore=()=>null,getAuth=()=>null,getMessaging=()=>null,doc=()=>null,getDoc=async()=>({exists:()=>false}),setDoc=async()=>{},updateDoc=async()=>{},increment=()=>0,serverTimestamp=()=>0,GoogleAuthProvider=class{},signInWithPopup=async()=>({}),signOut=async()=>{},onAuthStateChanged=()=>()=>{},collection=()=>null,getDocs=async()=>({docs:[],forEach(){}}),query=()=>null,where=()=>null,orderBy=()=>null,limit=()=>null,addDoc=async()=>({}),deleteDoc=async()=>{},onSnapshot=()=>()=>{},getToken=async()=>null,onMessage=()=>{},isSupported=async()=>false;');
        return route.abort();
    });
    await p3.goto(base + '/raiden_patcher.html');
    await p3.waitForSelector('#tab-create');
    await p3.addScriptTag({ type: 'module', content: `
        import { ISO9660 } from '/scripts/IUP/iso9660.js';
        const root = await navigator.storage.getDirectory();
        const rnd = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(i + 65536, n))); return b; };
        const put = async (dir, path, bytes) => { const p = path.split('/'); let d = dir; for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true }); const fh = await d.getFileHandle(p.at(-1), { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); };
        const mk = async (name, files) => {
            const dir = await root.getDirectoryHandle(name + '_src', { create: true });
            for (const [k, v] of Object.entries(files)) await put(dir, k, v);
            const out = await root.getFileHandle(name + '.iso', { create: true });
            const w = await out.createWritable(); await ISO9660.BuildISO(dir, w, {}); 
            return out;
        };
        const movie = rnd(300000), elf = rnd(8000), same = rnd(20000), txt = rnd(12000);
        const movie2 = new Uint8Array(movie); movie2.set(new TextEncoder().encode('LEGENDA'), 150000);
        const elf2 = new Uint8Array(elf); elf2.set([1,2,3], 64);
        window.__isoOrig = await mk('orig', { 'SYSTEM.CNF': new TextEncoder().encode('BOOT2 = cdrom0:/SLUS_213.73;1'), 'SLUS_213.73': elf, 'MOVIE/M1.PSS': movie, 'DATA/SAME.BIN': same, 'DATA/T.DAT': txt });
        window.__isoMod  = await mk('mod',  { 'SYSTEM.CNF': new TextEncoder().encode('BOOT2 = cdrom0:/SLUS_213.73;1'), 'SLUS_213.73': elf2, 'MOVIE/M1.PSS': movie2, 'DATA/SAME.BIN': same, 'DATA/T.DAT': txt, 'DATA/NEW.TXT': new TextEncoder().encode('novo arquivo do autor') });
        window.__ready = true;`});
    await p3.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    await p3.evaluate(() => {
        const queue = [window.__isoOrig, window.__isoMod]; window.showOpenFilePicker = async () => [queue.shift()];
        window.showDirectoryPicker = async () => navigator.storage.getDirectory().then(r => r.getDirectoryHandle('work', { create: true }));
    });
    await p3.click('#tab-create');
    const vis = await p3.evaluate(() => ({ creator: getComputedStyle(document.getElementById('creator-section')).display, stepper: getComputedStyle(document.getElementById('rp-stepper')).display, card1: getComputedStyle(document.getElementById('card-step-1')).display }));
    if (vis.creator === 'none' || vis.stepper !== 'none' || vis.card1 !== 'none') { failed++; console.log('  FALHOU alternar para a aba Criar:', JSON.stringify(vis)); } else console.log('  ok  aba "Criar patch" mostra o criador e esconde o aplicador');
    const an = () => p3.evaluate(() => document.getElementById('btn-cr-analyze').disabled);
    if (!(await an())) { failed++; console.log('  FALHOU "Analisar" deveria iniciar desabilitado'); }
    await p3.click('#btn-cr-orig'); await p3.click('#btn-cr-mod'); await p3.fill('#cr-name', 'Jogo de teste');
    await p3.fill('#cr-md5', 'zzz'); if (!(await an())) { failed++; console.log('  FALHOU MD5 inválido deveria bloquear'); }
    await p3.fill('#cr-md5', '');
    if (await an()) { failed++; console.log('  FALHOU com as 2 ISOs e o nome, "Analisar" deveria habilitar'); } else console.log('  ok  botão "Analisar" só habilita com ISO original + modificada + nome (e MD5 válido)');
    await p3.click('#btn-cr-analyze');
    await p3.waitForFunction(() => document.getElementById('cr-review').style.display !== 'none' || /❌/.test(document.getElementById('cr-status').textContent), null, { timeout: 90000 });
    const rev = await p3.evaluate(() => ({ status: document.getElementById('cr-status').textContent, sum: (document.querySelector('.rp-cr-summary') || {}).textContent, rows: [...document.querySelectorAll('.rp-cr-row')].map(r => r.querySelector('.rp-cr-badge').textContent + ' ' + r.querySelector('.rp-cr-path').textContent) }));
    const rows = rev.rows.sort().join(' | ');
    const want = 'inject MOVIE/M1.PSS | inject SLUS_213.73 | replace DATA/NEW.TXT';
    if (rows !== want) { failed++; console.log('  FALHOU revisão inesperada:', JSON.stringify(rev)); } else console.log('  ok  análise de ISOs reais: ' + rev.sum);
    const gen0 = await p3.evaluate(() => document.getElementById('btn-cr-generate').disabled);
    await p3.check('#chk-creator-legal'); const gen1 = await p3.evaluate(() => document.getElementById('btn-cr-generate').disabled);
    if (!gen0 || gen1) { failed++; console.log('  FALHOU "Gerar" deve exigir a declaração:', gen0, gen1); } else console.log('  ok  "Gerar .RPT" só habilita após marcar a declaração');
    const tmpLeft = await p3.evaluate(async () => { const w = await (await navigator.storage.getDirectory()).getDirectoryHandle('work'); const n = []; for await (const [k] of w.entries()) n.push(k); return n; });
    console.log('  info pastas temporárias após análise: ' + JSON.stringify(tmpLeft));
    const bad3 = errs3.filter(m => /rpt_|raiden_|iso9660|does not provide an export|is not defined|before initialization|Cannot read/.test(m));
    if (bad3.length) { failed++; console.log('  FALHOU erros de JS:\n   ' + bad3.join('\n   ')); }
    } finally { await browser.close(); server.close(); }
console.log(failed ? `\n${failed} FALHA(S)` : '\nTodos os testes de navegador passaram.');
process.exit(failed ? 1 : 0);
