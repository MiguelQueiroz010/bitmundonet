/**
 * Bit.Raiden - SSG for content that previously had no URL of its own:
 *
 *  - /posts/<slug>.html      one indexable page per published article
 *  - /posts.html             archive of all published articles
 *  - /ferramentas/<slug>.html one page per external tool/download
 *  - /feed.xml               RSS 2.0 (latest articles)
 *  - /404.html               noindex fallback for GitHub Pages
 *
 * Every builder returns the entries the sitemap needs, so a new Firestore
 * article/tool shows up in the sitemap (and in Google) on the next build.
 */

import fs from 'fs';
import path from 'path';
import { parseArticleTags, renderTopics, articleSlug, toolSlug } from './utils.js';
import {
    ROOT_DIR, escapeHtml, escapeXml, stripHtml, truncateClean,
    jsonLdString, toAbsoluteUrl, toIsoDate
} from './seo_lib.js';

// ==========================================
// SHARED PAGE SHELL
// ==========================================

function renderShell(cfg, o) {
    const canonical = `${cfg.baseUrl}${o.path}`;
    const image = toAbsoluteUrl(cfg.baseUrl, o.image);
    const robots = o.noindex
        ? 'noindex, follow'
        : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    const fullTitle = o.title.includes(cfg.siteName) ? o.title : `${o.title} | ${cfg.siteName}`;

    const ogArticle = o.ogType === 'article' && o.published
        ? `    <meta property="article:published_time" content="${escapeHtml(o.published)}" />
${o.modified ? `    <meta property="article:modified_time" content="${escapeHtml(o.modified)}" />\n` : ''}    <meta property="article:author" content="${escapeHtml(o.author || 'Bit.Raiden')}" />\n`
        : '';

    const ld = o.jsonLd ? `\n    <script type="application/ld+json">\n${jsonLdString(o.jsonLd)}\n    </script>\n` : '';

    return `<!DOCTYPE html>
<html lang="pt-br">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(fullTitle)}</title>
    <meta name="description" content="${escapeHtml(o.description)}" />
    <meta name="robots" content="${robots}" />
    <meta name="author" content="${escapeHtml(o.author || 'Raiden')}" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="pt-BR" href="${canonical}" />
    <meta name="theme-color" content="#020814" />

    <meta property="og:type" content="${o.ogType || 'website'}" />
    <meta property="og:site_name" content="${escapeHtml(cfg.siteName)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${escapeHtml(fullTitle)}" />
    <meta property="og:description" content="${escapeHtml(o.description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:alt" content="${escapeHtml(o.imageAlt || o.title)}" />
${ogArticle}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${escapeHtml(cfg.twitterHandle)}" />
    <meta name="twitter:creator" content="${escapeHtml(cfg.twitterHandle)}" />
    <meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(o.description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
${ld}
    <link rel="apple-touch-icon" sizes="180x180" href="/fav/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/fav/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/fav/favicon-16x16.png" />
    <link rel="manifest" href="/fav/site.webmanifest" />
    <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin />

    <link rel="stylesheet" href="/css/style.css" />
    <link rel="stylesheet" href="/css/comments.css" />
    <link rel="stylesheet" href="/css/reactions.css" />

    <script src="https://www.w3schools.com/lib/w3data.js"></script>
    <script type="text/javascript" src="/scripts/navbar.js"></script>
    <script type="module" src="/scripts/navbar_auth.js"></script>
    <script type="text/javascript" src="/scripts/router.js"></script>
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(cfg.adsensePublisherId)}" crossorigin="anonymous"></script>

    <style>
        .seo-crumbs { font-size: .85rem; color: rgba(255,255,255,.55); margin: 1rem 0 1.25rem; }
        .seo-crumbs a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
        .seo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.25rem; margin-top: 1.25rem; }
        .seo-card { display: block; text-decoration: none; color: inherit; border-radius: 12px; overflow: hidden;
            background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
        .seo-card img { width: 100%; height: 150px; object-fit: cover; display: block; background: rgba(255,255,255,.05); }
        .seo-card div { padding: .85rem 1rem 1rem; }
        .seo-card h3 { margin: 0 0 .35rem; font-size: 1rem; line-height: 1.3; }
        .seo-card p { margin: 0; font-size: .85rem; color: rgba(255,255,255,.6); }
        .seo-meta-list { list-style: none; padding: 0; margin: 1.25rem 0; display: grid; gap: .4rem; }
        .seo-cta { display: inline-block; margin-top: 1rem; padding: .8rem 1.6rem; border-radius: 8px; font-weight: 700;
            text-decoration: none; background: var(--highlight, #f1a32e); color: #04121f !important; }
    </style>
</head>

<body${o.bodyAttrs ? ' ' + o.bodyAttrs : ''}>
    <div w3-include-html="/navbar.html"></div>
    <script>w3IncludeHTML();</script>

    <main class="container">
${o.body}
    </main>

    <footer>
        <div w3-include-html="/footer.html">
            <p>
                <span class="footer-copyright">&copy; <b>${escapeHtml(cfg.siteName)} (Bit.Raiden)</b> ${new Date().getFullYear()}. Todos os direitos reservados.</span>
                <span class="footer-sep">|</span>
                <a href="/about.html" class="footer-link">Sobre &amp; Contato</a>
                <span class="footer-sep">|</span>
                <a href="/termos.html" class="footer-link">Termos de Uso</a>
                <span class="footer-sep">|</span>
                <a href="/privacidade.html" class="footer-link">Política de Privacidade</a>
            </p>
        </div>
        <script>w3IncludeHTML();</script>
    </footer>
${o.bodyEnd || ''}
</body>

</html>
`;
}

function breadcrumbHtml(items) {
    return `        <nav class="seo-crumbs" aria-label="Você está em">${items
        .map((it, i) => (it.href && i < items.length - 1
            ? `<a href="${it.href}">${escapeHtml(it.name)}</a>`
            : `<span>${escapeHtml(it.name)}</span>`))
        .join(' &rsaquo; ')}</nav>`;
}

function breadcrumbLd(cfg, items) {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.name,
            item: `${cfg.baseUrl}${it.href}`
        }))
    };
}

function writeFile(rel, content) {
    const full = path.join(ROOT_DIR, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
}

/** Removes previously generated pages so deleted/unpublished items disappear. */
function cleanDir(rel) {
    const full = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(full)) return;
    for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.html')) fs.unlinkSync(path.join(full, f));
    }
}

// ==========================================
// POSTS
// ==========================================

export function publishedArticles(articles = []) {
    const seen = new Set();
    return articles
        .filter(a => a && a.selected === true && a.id !== 'site_config_main' && (a.title || '').trim())
        .map(a => {
            let slug = articleSlug(a);
            if (seen.has(slug)) slug = `${slug}-${String(a.id).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            seen.add(slug);
            const published = toIsoDate(a.sortDate) || toIsoDate(a.date) || toIsoDate(a._createTime);
            const modified = toIsoDate(a._updateTime) || published;
            const contentHtml = (a.topics && Array.isArray(a.topics) && a.topics.length)
                ? renderTopics(a.topics)
                : parseArticleTags(a.content || '');
            // Topic headings are dropped from the text used for descriptions/excerpts
            // so "Título Texto..." is not glued together without punctuation.
            const plain = stripHtml(contentHtml.replace(/<h[1-6][^>]*class="topic-title"[^>]*>[\s\S]*?<\/h[1-6]>/gi, ' '));
            return { ...a, _slug: slug, _published: published, _modified: modified, _contentHtml: contentHtml, _plain: plain };
        })
        .sort((x, y) => (y._published || '').localeCompare(x._published || ''));
}

function postCard(p) {
    return `            <a class="seo-card" href="/posts/${p._slug}.html">
                ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" />` : ''}
                <div>
                    <h3>${escapeHtml(p.title)}</h3>
                    <p>${escapeHtml(truncateClean(p._plain, 110))}</p>
                </div>
            </a>`;
}

export function buildPosts(articles, cfg) {
    const posts = publishedArticles(articles);
    cleanDir('posts');
    const entries = [];

    posts.forEach(p => {
        const urlPath = `/posts/${p._slug}.html`;
        const canonical = `${cfg.baseUrl}${urlPath}`;
        const description = truncateClean(p._plain || p.title, 158);
        const image = toAbsoluteUrl(cfg.baseUrl, p.image);
        const crumbs = [
            { name: 'Início', href: '/' },
            { name: 'Novidades', href: '/posts.html' },
            { name: p.title, href: urlPath }
        ];
        const related = posts.filter(x => x._slug !== p._slug).slice(0, 4);
        const align = escapeHtml(p.align || 'left');
        const dateLabel = p._published ? new Date(p._published + 'T12:00:00').toLocaleDateString('pt-BR') : (p.date || '');

        const jsonLd = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'BlogPosting',
                    '@id': `${canonical}#post`,
                    mainEntityOfPage: canonical,
                    headline: truncateClean(p.title, 110),
                    description,
                    image: [image],
                    inLanguage: 'pt-BR',
                    ...(p._published ? { datePublished: p._published } : {}),
                    ...(p._modified ? { dateModified: p._modified } : {}),
                    ...(p.category ? { articleSection: p.category } : {}),
                    wordCount: p._plain ? p._plain.split(/\s+/).length : undefined,
                    author: { '@type': 'Person', name: p.author || 'Bit.Raiden', url: `${cfg.baseUrl}/about.html` },
                    publisher: {
                        '@type': 'Organization',
                        name: cfg.siteName,
                        url: cfg.baseUrl,
                        logo: { '@type': 'ImageObject', url: `${cfg.baseUrl}/bitmundo_logo.png` }
                    }
                },
                breadcrumbLd(cfg, crumbs)
            ]
        };

        const body = `${breadcrumbHtml(crumbs)}
        <article class="article glass-panel" style="text-align: ${align};">
            <div class="article-wrapper">
                <div class="article-header">
                    ${p.image ? `<img class="article-title-img" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" decoding="async" style="${escapeHtml(p.imageStyle || '')}">` : ''}
                    <h1 class="article-title">${escapeHtml(p.title)}</h1>
                </div>
                <div class="article-content">
                    ${p._contentHtml}
                </div>
                <div class="article-footer">
                    <div class="article-meta">
                        <span>Postado por: <strong class="meta-author">${escapeHtml(p.author || 'Bit.Raiden')}</strong></span>
                        <span class="meta-date">Publicado em: <strong><time datetime="${escapeHtml(p._published)}">${escapeHtml(dateLabel)}</time></strong></span>
                    </div>
                </div>
                <div id="post-reactions"></div>

                <section id="comments-section" class="section" style="margin-top: 3rem;">
                    <h2 id="under">Comentários</h2>
                    <div id="comments-container" class="comments-list">
                        <p style="color: rgba(255,255,255,0.5);">Carregando comentários...</p>
                    </div>
                    <div class="comment-form-box">
                        <h3>Deixe seu comentário</h3>
                        <form id="comment-form">
                            <input type="text" id="comment-user" placeholder="Seu Nome" style="display: none;">
                            <textarea id="comment-text" placeholder="Sua Mensagem" required></textarea>
                            <button type="submit" class="comment-submit-btn">ENVIAR COMENTÁRIO</button>
                        </form>
                    </div>
                </section>
            </div>
        </article>
${related.length ? `
        <section style="margin-top: 2.5rem;">
            <h2 class="section-title">Mais novidades</h2>
            <div class="seo-grid">
${related.map(postCard).join('\n')}
            </div>
            <p style="margin-top: 1.25rem;"><a href="/posts.html">Ver todas as novidades</a> &middot; <a href="/projetos.html">Ver todos os projetos</a></p>
        </section>` : ''}`;

        const html = renderShell(cfg, {
            path: urlPath,
            title: p.title,
            description,
            image: p.image,
            imageAlt: p.title,
            ogType: 'article',
            published: p._published,
            modified: p._modified,
            author: p.author || 'Bit.Raiden',
            jsonLd,
            body,
            bodyAttrs: `data-article-id="${escapeHtml(p.id)}"`,
            bodyEnd: '    <script type="module" src="/scripts/post_loader.js"></script>'
        });

        writeFile(`posts/${p._slug}.html`, html);
        entries.push({
            loc: canonical,
            lastmod: p._modified || p._published,
            changefreq: 'monthly',
            priority: '0.7',
            image: p.image ? { loc: image, title: p.title, caption: truncateClean(p._plain, 120) } : null
        });
    });

    // Archive page
    const archivePath = '/posts.html';
    const archiveDesc = 'Novidades, atualizações de projetos de tradução, tutoriais e artigos técnicos de RomHacking do Raiden (Bit.Raiden).';
    const archiveCrumbs = [{ name: 'Início', href: '/' }, { name: 'Novidades', href: archivePath }];
    const archiveLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                '@id': `${cfg.baseUrl}${archivePath}#collection`,
                url: `${cfg.baseUrl}${archivePath}`,
                name: 'Novidades e Artigos - RomHacking do Raiden',
                description: archiveDesc,
                inLanguage: 'pt-BR',
                mainEntity: {
                    '@type': 'ItemList',
                    itemListElement: posts.slice(0, 50).map((p, i) => ({
                        '@type': 'ListItem',
                        position: i + 1,
                        url: `${cfg.baseUrl}/posts/${p._slug}.html`,
                        name: p.title
                    }))
                }
            },
            breadcrumbLd(cfg, archiveCrumbs)
        ]
    };
    const archiveBody = `${breadcrumbHtml(archiveCrumbs)}
        <section>
            <h1 class="section-title">Novidades e Artigos</h1>
            <p style="color: rgba(255,255,255,.7); max-width: 70ch;">${escapeHtml(archiveDesc)}</p>
            <div class="seo-grid">
${posts.map(postCard).join('\n') || '            <p>Nenhuma publicação ainda.</p>'}
            </div>
        </section>`;
    writeFile('posts.html', renderShell(cfg, {
        path: archivePath,
        title: 'Novidades e Artigos de RomHacking PT-BR',
        description: archiveDesc,
        jsonLd: archiveLd,
        body: archiveBody
    }));
    entries.unshift({
        loc: `${cfg.baseUrl}${archivePath}`,
        lastmod: posts[0] ? posts[0]._modified : undefined,
        changefreq: 'daily',
        priority: '0.8',
        image: null
    });

    console.log(`[SSG] Generated ${posts.length} post pages + /posts.html.`);
    return { posts, entries };
}

// ==========================================
// RSS FEED
// ==========================================

export function buildFeed(posts, cfg) {
    const items = posts.slice(0, 30).map(p => {
        const link = `${cfg.baseUrl}/posts/${p._slug}.html`;
        const pub = p._published ? new Date(p._published + 'T12:00:00Z').toUTCString() : new Date().toUTCString();
        return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      <author>${escapeXml(p.author || 'Bit.Raiden')}</author>
      <description>${escapeXml(truncateClean(p._plain || p.title, 300))}</description>
${p.image ? `      <enclosure url="${escapeXml(toAbsoluteUrl(cfg.baseUrl, p.image))}" type="image/jpeg" length="0" />\n` : ''}    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(cfg.siteName)} - Novidades</title>
    <link>${cfg.baseUrl}/</link>
    <atom:link href="${cfg.baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Atualizações de projetos de tradução, tutoriais e ferramentas de RomHacking.</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
    writeFile('feed.xml', xml);
    console.log(`[SSG] Generated feed.xml with ${Math.min(posts.length, 30)} items.`);
}

// ==========================================
// TOOL PAGES
// ==========================================

function isInternalUrl(cfg, url) {
    if (!url) return true;
    if (url.startsWith('/') || url.startsWith('#')) return true;
    return url.startsWith(cfg.baseUrl);
}

export function buildToolPages(tools = [], cfg) {
    cleanDir('ferramentas');
    const seen = new Set();
    const entries = [];
    const pathById = new Map();
    let count = 0;

    // Tools that already have their own page on this site (raiden_patcher.html etc.)
    // are skipped on purpose: a second thin page would compete with the real one.
    const eligible = tools.filter(t => t && (t.name || '').trim() && !isInternalUrl(cfg, t.url));

    eligible.forEach(t => {
        let slug = toolSlug(t);
        if (seen.has(slug)) slug = `${slug}-${String(t.id || count).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        seen.add(slug);

        const urlPath = `/ferramentas/${slug}.html`;
        pathById.set(t.id, urlPath);
        const canonical = `${cfg.baseUrl}${urlPath}`;
        const descHtml = parseArticleTags(t.description || '');
        const plain = stripHtml(descHtml);
        const target = t.target || 'RomHacking';
        const description = truncateClean(
            plain || `${t.name}: ferramenta de ${target} para modding e tradução de jogos, disponível no ${cfg.siteName}.`, 158);
        const icon = toAbsoluteUrl(cfg.baseUrl, t.icon, '/bitmundo_logo.png');
        const credit = t.credit || t.credits || '';
        const crumbs = [
            { name: 'Início', href: '/' },
            { name: 'Ferramentas', href: '/tools.html' },
            { name: t.name, href: urlPath }
        ];

        const jsonLd = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'SoftwareApplication',
                    '@id': `${canonical}#app`,
                    name: t.name,
                    description,
                    url: canonical,
                    image: icon,
                    applicationCategory: 'UtilityApplication',
                    operatingSystem: t.isOnline ? 'Web' : 'Windows',
                    inLanguage: 'pt-BR',
                    ...(t.version ? { softwareVersion: String(t.version) } : {}),
                    ...(t.isOnline ? {} : { downloadUrl: t.url }),
                    isAccessibleForFree: true,
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
                    ...(credit ? { author: { '@type': 'Person', name: credit } } : {}),
                    publisher: { '@type': 'Organization', name: cfg.siteName, url: cfg.baseUrl }
                },
                breadcrumbLd(cfg, crumbs)
            ]
        };

        const body = `${breadcrumbHtml(crumbs)}
        <article class="glass-panel" style="padding: 1.75rem;">
            <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
                <img src="${escapeHtml(t.icon || '/bitmundo_logo.png')}" alt="${escapeHtml(t.name)}" width="64" height="64" style="object-fit:contain;" />
                <h1 class="section-title" style="margin:0;">${escapeHtml(t.name)}</h1>
            </div>
            <div class="article-content" style="margin-top: 1.25rem;">${descHtml}</div>
            <ul class="seo-meta-list">
                ${t.type ? `<li><strong>Tipo:</strong> ${escapeHtml(t.type)}</li>` : ''}
                <li><strong>Alvo:</strong> ${escapeHtml(target)}</li>
                ${t.version ? `<li><strong>Versão:</strong> ${escapeHtml(t.version)}</li>` : ''}
                ${credit ? `<li><strong>Créditos:</strong> ${escapeHtml(credit)}</li>` : ''}
            </ul>
            <div id="tool-actions">
                <a class="seo-cta" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">${t.isOnline ? 'Rodar online' : `Baixar${t.version ? ' (' + escapeHtml(t.version) + ')' : ''}`}</a>
            </div>
            <p style="margin-top: 1.5rem;"><a href="/tools.html">&larr; Todas as ferramentas</a></p>
        </article>`;

        writeFile(`ferramentas/${slug}.html`, renderShell(cfg, {
            path: urlPath,
            title: `${t.name} - Download e Como Usar (${target})`,
            description,
            image: t.icon,
            imageAlt: t.name,
            jsonLd,
            body
        }));
        entries.push({ loc: canonical, lastmod: toIsoDate(t._updateTime), changefreq: 'monthly', priority: '0.6', image: null });
        count++;
    });

    console.log(`[SSG] Generated ${count} tool pages (${tools.length - eligible.length} skipped: internal tool or nameless).`);
    return { entries, pathById };
}

// ==========================================
// 404
// ==========================================

export function build404(cfg) {
    const body = `        <section class="glass-panel" style="padding: 2rem; text-align:center;">
            <h1 class="section-title">Página não encontrada</h1>
            <p style="color: rgba(255,255,255,.7);">O endereço pode ter mudado. Tente um destes caminhos:</p>
            <p style="margin-top:1rem; display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;">
                <a class="seo-cta" href="/">Início</a>
                <a class="seo-cta" href="/projetos.html">Projetos</a>
                <a class="seo-cta" href="/posts.html">Novidades</a>
                <a class="seo-cta" href="/tools.html">Ferramentas</a>
            </p>
        </section>`;
    writeFile('404.html', renderShell(cfg, {
        path: '/404.html',
        title: 'Página não encontrada',
        description: 'Página não encontrada no RomHacking do Raiden.',
        noindex: true,
        body
    }));
}
