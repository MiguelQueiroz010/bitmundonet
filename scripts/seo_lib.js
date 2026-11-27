/**
 * Bit.Raiden - shared SEO helpers (Node, build time only).
 *
 * - Config loader (seo.config.json + environment overrides)
 * - Escaping / text helpers
 * - Global <head> block (Search Console / Bing verification, RSS discovery,
 *   Google tag with Consent Mode v2, runtime script) injected idempotently
 *   into every published page.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');

// ==========================================
// CONFIG
// ==========================================

const ENV_OVERRIDES = {
    ga4MeasurementId: 'GA4_MEASUREMENT_ID',
    googleAdsId: 'GOOGLE_ADS_ID',
    googleAdsDownloadConversionLabel: 'GOOGLE_ADS_DOWNLOAD_LABEL',
    googleSiteVerification: 'GOOGLE_SITE_VERIFICATION',
    bingSiteVerification: 'BING_SITE_VERIFICATION',
    indexNowKey: 'INDEXNOW_KEY'
};

export function loadSeoConfig() {
    const defaults = {
        baseUrl: 'https://bitraiden.org',
        siteName: 'RomHacking do Raiden',
        twitterHandle: '@BitRaiden',
        adsensePublisherId: 'ca-pub-6401015076542561',
        ga4MeasurementId: '',
        googleAdsId: '',
        googleAdsDownloadConversionLabel: '',
        googleSiteVerification: '',
        bingSiteVerification: '',
        indexNowKey: '',
        consentBanner: true,
        consentDefault: 'denied'
    };
    let fileCfg = {};
    try {
        fileCfg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'seo.config.json'), 'utf-8'));
    } catch (e) {
        console.warn('[SEO] seo.config.json not readable, using defaults.');
    }
    const cfg = { ...defaults, ...fileCfg };
    for (const [key, envName] of Object.entries(ENV_OVERRIDES)) {
        if (process.env[envName]) cfg[key] = process.env[envName].trim();
    }
    cfg.baseUrl = String(cfg.baseUrl).replace(/\/+$/, '');
    return cfg;
}

// ==========================================
// TEXT HELPERS
// ==========================================

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function truncateClean(text, maxLen = 158) {
    if (!text) return '';
    const clean = text.trim();
    if (clean.length <= maxLen) return clean;
    const cut = clean.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, '') + '...';
}

/** Safe JSON for embedding inside <script type="application/ld+json">. */
export function jsonLdString(obj) {
    return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

export function toAbsoluteUrl(baseUrl, url, fallback = '/bitmundo_logo.png') {
    const u = url || fallback;
    if (/^https?:\/\//i.test(u)) return u;
    return `${baseUrl}${u.startsWith('/') ? '' : '/'}${u}`;
}

/** Best-effort ISO date (YYYY-MM-DD) from the article/project fields. */
export function toIsoDate(value) {
    if (!value) return '';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const t = new Date(s).getTime();
    return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/** Last commit date of a file (YYYY-MM-DD), or today when git is unavailable. */
export function gitLastMod(relPath) {
    try {
        const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relPath], {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'ignore']
        }).toString().trim();
        if (out) return out;
    } catch (e) { /* not a git checkout */ }
    return new Date().toISOString().slice(0, 10);
}

// ==========================================
// GLOBAL <head> BLOCK
// ==========================================

const HEAD_START = '<!-- SEO:GLOBAL_START -->';
const HEAD_END = '<!-- SEO:GLOBAL_END -->';

export function buildGlobalHeadBlock(cfg, { hasAdsenseMeta = false } = {}) {
    const lines = [HEAD_START];

    if (cfg.googleSiteVerification) {
        lines.push(`<meta name="google-site-verification" content="${escapeHtml(cfg.googleSiteVerification)}" />`);
    }
    if (cfg.bingSiteVerification) {
        lines.push(`<meta name="msvalidate.01" content="${escapeHtml(cfg.bingSiteVerification)}" />`);
    }
    if (cfg.adsensePublisherId && !hasAdsenseMeta) {
        lines.push(`<meta name="google-adsense-account" content="${escapeHtml(cfg.adsensePublisherId)}" />`);
    }
    lines.push(`<link rel="alternate" type="application/rss+xml" title="${escapeHtml(cfg.siteName)} - Novidades" href="${cfg.baseUrl}/feed.xml" />`);

    const tagIds = [cfg.ga4MeasurementId, cfg.googleAdsId].filter(Boolean);
    const runtimeCfg = {
        ga4: cfg.ga4MeasurementId || '',
        ads: cfg.googleAdsId || '',
        adsDownloadLabel: cfg.googleAdsDownloadConversionLabel || '',
        banner: cfg.consentBanner !== false,
        consentDefault: cfg.consentDefault === 'granted' ? 'granted' : 'denied'
    };
    lines.push(`<script>window.__BM_SEO=${JSON.stringify(runtimeCfg)};</script>`);

    if (tagIds.length > 0) {
        const d = runtimeCfg.consentDefault;
        const configCalls = tagIds.map(id => `gtag('config','${id}');`).join('');
        lines.push(
`<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'${d}',ad_user_data:'${d}',ad_personalization:'${d}',analytics_storage:'${d}',wait_for_update:500});
try{var s=JSON.parse(localStorage.getItem('bm_consent')||'null');if(s){var v=s.granted?'granted':'denied';gtag('consent','update',{ad_storage:v,ad_user_data:v,ad_personalization:v,analytics_storage:v});}}catch(e){}
gtag('js',new Date());${configCalls}
</script>`);
        lines.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagIds[0])}"></script>`);
    }

    lines.push('<script defer src="/scripts/seo_runtime.js"></script>');
    lines.push(HEAD_END);
    return lines.map((l, i) => (i === 0 ? l : '    ' + l)).join('\n');
}

/** Insert (or replace) the global block right before </head>. */
export function injectGlobalHead(html, cfg) {
    if (!/<\/head>/i.test(html)) return html;
    const markerRe = new RegExp(`\\s*${HEAD_START}[\\s\\S]*?${HEAD_END}`, 'g');
    let out = html.replace(markerRe, '');
    const hasAdsenseMeta = /<meta\s+name=["']google-adsense-account["']/i.test(out);
    const block = buildGlobalHeadBlock(cfg, { hasAdsenseMeta });
    return out.replace(/<\/head>/i, `    ${block}\n</head>`);
}

// ==========================================
// FILE DISCOVERY
// ==========================================

const SKIP_ROOT_PAGES = new Set([
    'admin_dashboard.html', 'admin_login.html', 'navbar.html', 'footer.html',
    'tool_view.html', 'project_view.html'
]);
const PAGE_DIRS = ['projetos', 'projects', 'posts', 'ferramentas', path.join('tools', 'Fully')];

function walkHtml(dirAbs, out) {
    if (!fs.existsSync(dirAbs)) return;
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        const full = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) walkHtml(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
}

/** Every public HTML page that should carry the global head block. */
export function listPublicHtmlFiles() {
    const files = [];
    for (const entry of fs.readdirSync(ROOT_DIR, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.html') && !SKIP_ROOT_PAGES.has(entry.name)) {
            files.push(path.join(ROOT_DIR, entry.name));
        }
    }
    for (const dir of PAGE_DIRS) walkHtml(path.join(ROOT_DIR, dir), files);
    return files;
}

export function injectGlobalHeadEverywhere(cfg) {
    const files = listPublicHtmlFiles();
    let changed = 0;
    for (const f of files) {
        const original = fs.readFileSync(f, 'utf-8');
        const updated = injectGlobalHead(original, cfg);
        if (updated !== original) {
            fs.writeFileSync(f, updated, 'utf-8');
            changed++;
        }
    }
    console.log(`[SEO] Global head block applied to ${changed}/${files.length} pages.`);
}
