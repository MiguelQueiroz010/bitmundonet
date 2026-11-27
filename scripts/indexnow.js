/**
 * Submits recently changed sitemap URLs to IndexNow (Bing, Yandex, Seznam, Naver...).
 * Google does not support IndexNow: for Google, keep sitemap.xml registered in
 * Search Console - it is regenerated on every build.
 *
 * Usage (after the site is live): node scripts/indexnow.js [daysBack=2]
 * No-op unless an IndexNow key is configured (seo.config.json or INDEXNOW_KEY).
 */
import fs from 'fs';
import path from 'path';
import { loadSeoConfig, ROOT_DIR } from './seo_lib.js';

const cfg = loadSeoConfig();
if (!cfg.indexNowKey) {
    console.log('[IndexNow] No key configured, skipping.');
    process.exit(0);
}

const daysBack = parseInt(process.argv[2] || '2', 10);
const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
const xml = fs.readFileSync(path.join(ROOT_DIR, 'sitemap.xml'), 'utf-8');

const urls = [];
for (const block of xml.split('<url>').slice(1)) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '';
    if (loc && lastmod >= cutoff) urls.push(loc.replace(/&amp;/g, '&'));
}

if (urls.length === 0) {
    console.log('[IndexNow] Nothing changed recently, skipping.');
    process.exit(0);
}

const host = new URL(cfg.baseUrl).host;
const resp = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
        host,
        key: cfg.indexNowKey,
        keyLocation: `${cfg.baseUrl}/${cfg.indexNowKey}.txt`,
        urlList: urls.slice(0, 10000)
    })
});
console.log(`[IndexNow] Submitted ${urls.length} URLs -> HTTP ${resp.status}`);
// 200/202 = accepted; do not fail the deploy on a transient 4xx/5xx.
process.exit(0);
