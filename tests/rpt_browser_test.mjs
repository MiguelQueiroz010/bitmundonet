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
window.__done = runAll(${JSON.stringify(base + '/__snippet.mjs')}, ${JSON.stringify(base + '/scripts/IUP/rpt_ops.js')}, ${JSON.stringify(base + '/scripts/IUP/rpt_sha256.js')}).then(r => window.__res = r, e => window.__res = [{ name: 'harness', ok: false, err: String(e && e.stack || e) }]);` });
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
} finally { await browser.close(); server.close(); }
console.log(failed ? `\n${failed} FALHA(S)` : '\nTodos os testes de navegador passaram.');
process.exit(failed ? 1 : 0);
