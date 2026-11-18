/**
 * Bit.Raiden - Static Site Generator & SEO Automation (SSG)
 * 
 * Fetches projects and articles from Firestore via REST API
 * and pre-renders static HTML for:
 * 1. Individual project pages (/projetos/[id].html and /projetos/[id]/index.html)
 * 2. Project catalog (/projetos.html)
 * 3. Homepage highlights and articles (/index.html)
 * 4. Sitemap (/sitemap.xml) and robots.txt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArticleTags, renderTopics } from './utils.js';
import { updateAllSeoTags } from './update_seo_tags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASE_URL = 'https://bitraiden.org';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/bitraiden-site/databases/(default)/documents';

// ==========================================
// 1. FIRESTORE REST API UNMARSHALER
// ==========================================

function unmarshalFirestoreValue(val) {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return parseFloat(val.doubleValue);
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) {
        return (val.arrayValue.values || []).map(unmarshalFirestoreValue);
    }
    if ('mapValue' in val) {
        const res = {};
        for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
            res[k] = unmarshalFirestoreValue(v);
        }
        return res;
    }
    return null;
}

function unmarshalDoc(doc) {
    const id = doc.name.split('/').pop();
    const res = {
        id,
        _createTime: doc.createTime,
        _updateTime: doc.updateTime
    };
    if (doc.fields) {
        for (const [k, v] of Object.entries(doc.fields)) {
            res[k] = unmarshalFirestoreValue(v);
        }
    }
    return res;
}

async function fetchCollection(colName) {
    try {
        const url = `${FIRESTORE_BASE}/${colName}?pageSize=100`;
        const resp = await fetch(url);
        if (!resp.ok) {
            console.warn(`[SSG] Failed to fetch collection ${colName}: ${resp.status}`);
            return [];
        }
        const data = await resp.json();
        if (!data.documents) return [];
        return data.documents.map(unmarshalDoc);
    } catch (e) {
        console.error(`[SSG] Error fetching ${colName}:`, e.message);
        return [];
    }
}

// ==========================================
// 2. EMBED & ESCAPE UTILITIES
// ==========================================

function getEmbedUrl(url) {
    if (!url) return null;
    url = url.trim();
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
        const videoId = ytMatch[1];
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0&enablejsapi=1`;
    }
    const stMatch = url.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([a-zA-Z0-9]+)/);
    if (stMatch && stMatch[1]) {
        return `https://streamable.com/e/${stMatch[1]}?autoplay=1&muted=0&loop=1&controls=0`;
    }
    return null;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

// ==========================================
// 3. GENERATE INDIVIDUAL PROJECT PAGES
// ==========================================

function toAbsoluteUrl(url) {
    if (!url) return `${BASE_URL}/bitmundo_logo.png`;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildProjectHtml(project, allProjects, templateHtml) {
    const id = project.id;
    const title = project.title || 'Projeto';
    const subtitle = project.subtitle || '';
    const platform = project.platform || 'PlayStation 2';
    const rawCover = project.cover || project.thumbnail || '/bitmundo_logo.png';
    const cover = toAbsoluteUrl(rawCover);
    const rawThumb = project.thumbnail || project.cover || '/bitmundo_logo.png';
    const thumbnail = toAbsoluteUrl(rawThumb);
    const globalProgress = (project.progress && project.progress.global) || '0%';
    const percentInt = parseInt(globalProgress, 10) || 0;
    const descRaw = project.description || '';
    const descParsed = parseArticleTags(descRaw);
    const plainDesc = stripHtml(descParsed || subtitle || `${title} para ${platform}`).slice(0, 160);

    const pageTitle = `${title} (${platform}) PT-BR - RomHacking do Raiden`;
    const canonicalUrl = `${BASE_URL}/projetos/${id}.html`;

    // 1. Pre-render Video or Head
    const video = project.video || '';
    const embedUrl = getEmbedUrl(video);
    let videoHeadMarkup = '';
    if (embedUrl) {
        videoHeadMarkup = `
            <iframe id="project-video-iframe" 
                    src="${embedUrl}" 
                    frameborder="0" 
                    allow="autoplay; fullscreen; picture-in-picture" 
                    allowfullscreen 
                    style="pointer-events: none;">
            </iframe>
            <video id="project-video-player" preload="auto" loop muted playsinline style="display: none;">
                <source id="video-source" src="" type="video/mp4" />
            </video>
        `;
    } else if (video) {
        videoHeadMarkup = `
            <video id="project-video-player" preload="auto" autoplay loop muted playsinline>
                <source id="video-source" src="${escapeHtml(video)}" type="video/mp4" />
            </video>
        `;
    } else {
        videoHeadMarkup = `
            <video id="project-video-player" preload="auto" autoplay loop muted playsinline>
                <source id="video-source" src="" type="video/mp4" />
            </video>
        `;
    }

    // 2. Pre-render Live Video
    const liveVideo = project.live_video;
    let livesMarkup = '';
    if (liveVideo) {
        livesMarkup = `
            <section id="lives-section" class="section" style="margin-bottom: 4rem;">
                <h2 id="under">Vídeos e Lives</h2>
                <div id="lives-container">
                    <div class="lives-gallery">
                        <div class="video-card">
                            <iframe src="${escapeHtml(liveVideo)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                        </div>
                    </div>
                </div>
            </section>
        `;
    } else {
        livesMarkup = `
            <section id="lives-section" class="section" style="display: none; margin-bottom: 4rem;">
                <h2 id="under">Vídeos e Lives</h2>
                <div id="lives-container"></div>
            </section>
        `;
    }

    // 3. Pre-render Gallery
    const galleryItems = project.gallery || [];
    let galleryMarkup = '';
    if (galleryItems.length > 0) {
        const slides = galleryItems.map((item, idx) => `
            <div class="mySlides fade ${idx === 0 ? 'first' : ''}">
                <a class="spotlight" href="${escapeHtml(item.src)}" data-description="${escapeHtml(item.caption || '')}">
                    <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.caption || title)}">
                </a>
            </div>
        `).join('');
        const dots = galleryItems.map((_, idx) => `
            <span class="dot ${idx === 0 ? 'active' : ''}" onclick="currentSlide(${idx + 1})"></span>
        `).join('');

        galleryMarkup = `
            <section class="section">
                <h2 id="under">Imagens</h2>
                <div id="gallery" data-fit="cover">
                    <div id="gallery_container" class="slideshow-container">
                        ${slides}
                        <a class="prev" onclick="plusSlides(-1)">&#10094;</a>
                        <a class="next" onclick="plusSlides(1)">&#10095;</a>
                    </div>
                    <div id="gallery-dots" style="text-align: center; margin-top: 1.5rem;">
                        ${dots}
                    </div>
                </div>
            </section>
        `;
    } else {
        galleryMarkup = `
            <section class="section" style="display: none;">
                <h2 id="under">Imagens</h2>
                <div id="gallery" data-fit="cover">
                    <div id="gallery_container" class="slideshow-container"></div>
                    <div id="gallery-dots" style="text-align: center; margin-top: 1.5rem;"></div>
                </div>
            </section>
        `;
    }

    // 4. Pre-render Credits
    const creditItems = project.credits || [];
    let creditsMarkup = '';
    if (creditItems.length > 0) {
        creditsMarkup = `
            <div id="credits" class="meta-section">
                <h2 id="under">Equipe</h2>
                <div id="credits-list">
                    ${creditItems.map(item => `
                        <div class="credit-item">
                            <span class="credit-name">${escapeHtml(item.name)}</span>
                            <span class="credit-role">${escapeHtml(item.role)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else {
        creditsMarkup = `
            <div id="credits" class="meta-section" style="display: none;">
                <h2 id="under">Equipe</h2>
                <div id="credits-list"></div>
            </div>
        `;
    }

    // 5. Pre-render Progress
    const progressItems = (project.progress && project.progress.items) || [];
    let progressMarkup = '';
    if (progressItems.length > 0) {
        progressMarkup = `
            <div id="progress" class="meta-section">
                <h2 id="under">Progresso</h2>
                <div id="progress-list">
                    ${progressItems.map(item => {
                        const valInt = parseInt(item.value, 10) || 0;
                        return `
                            <div class="progress-item-wrapper">
                                <div class="progress-label">
                                    <span class="label-text">${escapeHtml(item.label)}</span>
                                    <span class="label-value">${escapeHtml(item.value)}</span>
                                </div>
                                <div class="progress-bar-container">
                                    <div class="progress-bar-fill" style="width: ${valInt}%;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    } else {
        progressMarkup = `
            <div id="progress" class="meta-section" style="display: none;">
                <h2 id="under">Progresso</h2>
                <div id="progress-list"></div>
            </div>
        `;
    }

    // 6. Pre-render Downloads
    const downloadItems = project.downloads || [];
    let downloadsMarkup = '';
    if (downloadItems.length > 0) {
        downloadsMarkup = `
            <section id="downloads" class="section" style="margin-top: 4rem;">
                <h2 id="under">Downloads</h2>
                <div id="downloads-container" class="modern-directory">
                    ${downloadItems.map(item => {
                        const version = item.version || 'v1.0';
                        const type = item.type || 'Patch';
                        const maintenance = item.maintenance === true || item.maintenance === "true";
                        const url = item.url || '#';
                        const changelog = item.changelog || '';
                        const soundUrl = item.sound_url || '';

                        let downloadBtn = '';
                        if (maintenance) {
                            downloadBtn = `
                                <div class="maintenance">
                                    <span>EM MANUTENÇÃO</span>
                                    <p style="font-size: 0.8rem; margin-top: 5px; color: rgba(239, 68, 68, 0.7);">
                                        Este arquivo está sendo atualizado.
                                    </p>
                                </div>
                            `;
                        } else if (soundUrl) {
                            const escapedSound = soundUrl.replace(/'/g, "\\'");
                            downloadBtn = `
                                <div class="prank-container">
                                    <a href="#" class="download-link" onclick="
                                        event.preventDefault();
                                        const container = this.closest('.prank-container');
                                        if (container.classList.contains('prank-running')) return;
                                        let gif = container.querySelector('.prank-gif');
                                        if (!gif) {
                                            gif = document.createElement('img');
                                            gif.src = '/raiden_fly.gif';
                                            gif.className = 'prank-gif';
                                            container.appendChild(gif);
                                        }
                                        var a = new Audio('${escapedSound}');
                                        a.play().catch(function(){});
                                        container.classList.add('prank-running');
                                        setTimeout(() => {
                                            const rect = container.getBoundingClientRect();
                                            container.classList.remove('prank-running');
                                            container.style.position = 'fixed';
                                            container.style.left = rect.left + 'px';
                                            container.style.top = rect.top + 'px';
                                            container.style.width = rect.width + 'px';
                                            container.style.margin = '0';
                                            container.classList.add('snap-disintegrate');
                                            setTimeout(() => container.remove(), 1500);
                                        }, 1200);
                                    ">
                                        EFETUAR DOWNLOAD
                                    </a>
                                </div>
                            `;
                        } else {
                            downloadBtn = `
                                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="download-link">
                                    EFETUAR DOWNLOAD
                                </a>
                            `;
                        }

                        return `
                            <div class="dir-item open">
                                <div class="dir-header" onclick="toggleFolder(this)">
                                    <div class="dir-title">
                                        <span>${escapeHtml(version)} (${escapeHtml(type)})</span>
                                    </div>
                                    <img src="/elements/light_down_arrow.png" class="dir-arrow" alt="Arrow">
                                </div>
                                <div class="dir-content">
                                    ${changelog ? `
                                        <div class="changelog-box">
                                            <h4>Alterações / Informações</h4>
                                            <div class="changelog-content" style="font-size: 0.9rem; line-height: 1.6;">
                                                ${parseArticleTags(changelog)}
                                            </div>
                                        </div>
                                    ` : ''}
                                    ${downloadBtn}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    } else {
        downloadsMarkup = `
            <section id="downloads" class="section" style="display: none; margin-top: 4rem;">
                <h2 id="under">Downloads</h2>
                <div id="downloads-container" class="modern-directory"></div>
            </section>
        `;
    }

    // 7. Pre-render Other Projects Suggestions
    const otherProjects = allProjects.filter(p => p.id !== id).slice(0, 4);
    const otherProjectsMarkup = `
        <section id="other-projects-section" class="section" style="margin-top: 4rem;">
            <h2 id="under">Outros Projetos</h2>
            <div id="other-projects-container" class="other-projects-grid">
                ${otherProjects.map(p => `
                    <a href="/projetos/${p.id}.html" class="other-project-card" style="text-decoration: none; color: inherit;">
                        <img src="${escapeHtml(p.thumbnail || p.cover || '')}" alt="${escapeHtml(p.title || '')}" class="other-project-thumb" loading="lazy">
                        <div>
                            <h3 class="other-project-title">${escapeHtml(p.title || '')}</h3>
                            <span class="other-project-platform">${escapeHtml(p.platform || '')}</span>
                        </div>
                    </a>
                `).join('')}
            </div>
        </section>
    `;

    // 8. Schema.org JSON-LD (Rich Snippets for Google)
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "VideoGame",
                "@id": `${canonicalUrl}#game`,
                "name": title,
                "description": plainDesc,
                "image": cover,
                "gamePlatform": platform,
                "inLanguage": "pt-BR",
                "genre": ["RomHacking", "Tradução de Jogos", "Action"],
                "author": {
                    "@type": "Person",
                    "name": "Raiden",
                    "url": BASE_URL
                },
                "publisher": {
                    "@type": "Organization",
                    "name": "RomHacking do Raiden",
                    "url": BASE_URL,
                    "logo": {
                        "@type": "ImageObject",
                        "url": `${BASE_URL}/bitmundo_logo.png`
                    }
                }
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "RomHacking do Raiden",
                        "item": BASE_URL
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": "Projetos",
                        "item": `${BASE_URL}/projetos.html`
                    },
                    {
                        "@type": "ListItem",
                        "position": 3,
                        "name": title,
                        "item": canonicalUrl
                    }
                ]
            },
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": `Como funciona a tradução de ${title} para ${platform}?`,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": `A tradução de ${title} é um projeto desenvolvido por Raiden para ${platform}, com textos em português do Brasil e patch disponível para aplicação direta na ISO do jogo no RomHacking do Raiden.`
                        }
                    },
                    {
                        "@type": "Question",
                        "name": `Onde baixar o patch de tradução de ${title}?`,
                        "acceptedAnswer": {
                            "@type": "Answer",
                            "text": `Você pode fazer o download do patch oficial de tradução diretamente na seção de Downloads desta página no RomHacking do Raiden.`
                        }
                    }
                ]
            }
        ]
    };

    // 9. Build Full HTML Document
    let html = templateHtml;

    // Replace Title
    html = html.replace(/<title id="page-title">.*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);

    // Replace Meta Tags & Inject SEO
    const seoTags = `
    <meta name="description" id="meta-desc" content="${escapeHtml(plainDesc)}" />
    <meta name="keywords" id="meta-key" content="${escapeHtml(title)}, tradução, ${escapeHtml(platform)}, romhacking, patch pt-br, romhacking do raiden, bitraiden" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <meta name="author" content="Raiden" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta name="theme-color" content="#020814" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="RomHacking do Raiden" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(plainDesc)}" />
    <meta property="og:image" content="${escapeHtml(cover)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(cover)}" />
    <meta property="og:image:alt" content="Capa do projeto ${escapeHtml(title)}" />

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@BitRaiden" />
    <meta name="twitter:creator" content="@BitRaiden" />
    <meta name="twitter:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(plainDesc)}" />
    <meta name="twitter:image" content="${escapeHtml(cover)}" />
    <meta name="twitter:image:alt" content="Capa do projeto ${escapeHtml(title)}" />

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
    </script>
    `;

    html = html.replace(/<meta name="description" id="meta-desc"[^>]*\/?>[\s\S]*?<meta name="keywords" id="meta-key"[^>]*\/?>/i, seoTags);

    // Replace Head video
    html = html.replace(/<video id="project-video-player"[\s\S]*?<\/video>/i, videoHeadMarkup);

    // Replace Project Head Content
    const headContentReplacement = `
            <div class="hero-content">
                <img id="project-cover" src="${escapeHtml(cover)}" alt="Capa de ${escapeHtml(title)}" />
                <div class="info-glass">
                    <div id="project-platform" class="hero-platform">${escapeHtml(platform)}</div>
                    <h1 id="project-title-display">${escapeHtml(title)}</h1>

                    <div class="hero-progress-container">
                        <div class="progress-info">
                            <span>Progresso Geral</span>
                            <span id="global-percent-text">${percentInt}%</span>
                        </div>
                        <div class="hero-progress-bg">
                            <div id="global-progress-fill" class="hero-progress-fill" style="width: ${percentInt}%;"></div>
                        </div>
                    </div>

                    <p id="project-summary">${escapeHtml(subtitle)}</p>
                </div>
            </div>
    `;
    html = html.replace(/<div class="hero-content">[\s\S]*?<\/div>\s*<\/div>\s*<\/header>/i, `${headContentReplacement}\n        </header>`);

    // Replace Sections inside <main id="body">
    // 1. Lives
    html = html.replace(/<section id="lives-section"[\s\S]*?<\/section>/i, livesMarkup);

    // 2. Description
    const descSectionReplacement = `
            <section class="section">
                <h2 id="under">Sobre o Projeto</h2>
                <div id="project-description">${descParsed}</div>
            </section>
    `;
    html = html.replace(/<section class="section">\s*<h2 id="under">Sobre o Projeto<\/h2>\s*<div id="project-description"><\/div>\s*<\/section>/i, descSectionReplacement);

    // 3. Gallery
    html = html.replace(/<section class="section">\s*<h2 id="under">Imagens<\/h2>[\s\S]*?<\/section>/i, galleryMarkup);

    // 4. Metadata Grid (Credits & Progress)
    const metaGridReplacement = `
            <div class="project-meta-grid"
                style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 3rem; margin-top: 4rem;">
                ${creditsMarkup}
                ${progressMarkup}
            </div>
    `;
    html = html.replace(/<div class="project-meta-grid"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i, metaGridReplacement);

    // 5. Downloads
    html = html.replace(/<section id="downloads"[\s\S]*?<\/section>/i, downloadsMarkup);

    // 6. Other Projects
    html = html.replace(/<section id="other-projects-section"[\s\S]*?<\/section>/i, otherProjectsMarkup);

    // 7. Inject current project id into body dataset for comments and reactions
    html = html.replace('<body', `<body data-project-id="${id}"`);

    return html;
}

// ==========================================
// 4. PRE-RENDER CATALOG (projetos.html)
// ==========================================

function updateProjetosCatalog(projects) {
    const filePath = path.join(ROOT_DIR, 'projetos.html');
    if (!fs.existsSync(filePath)) return;
    let html = fs.readFileSync(filePath, 'utf-8');

    // Fix canonical and OG URLs
    html = html.replace(/https:\/\/bitmundo\.net\/projetos\.html/g, `${BASE_URL}/projetos.html`);
    html = html.replace(/https:\/\/i\.postimg\.cc\/fyRzwH4X\/bitmundo-logo\.png/g, `${BASE_URL}/bitmundo_logo.png`);

    // Group by platform
    const platforms = {};
    projects.forEach(p => {
        const platform = p.platform || 'Outros';
        if (!platforms[platform]) platforms[platform] = [];
        platforms[platform].push(p);
    });

    let catalogHtml = '';
    for (const platform in platforms) {
        catalogHtml += `
            <section class="platform-section">
                <h2 class="platform-title">${escapeHtml(platform)}</h2>
                <div class="projects-grid">
                    ${platforms[platform].map(p => {
                        const status = p.status || 'Mod';
                        const statusClass = status === 'Completo' ? 'status-complete' :
                            status === 'Em Progresso' ? 'status-wip' : 'status-mod';
                        return `
                            <a href="/projetos/${p.id}.html" class="project-card" style="text-decoration: none; color: inherit;">
                                <span class="project-status ${statusClass}">${escapeHtml(status)}</span>
                                <img src="${escapeHtml(p.thumbnail || p.cover || '')}" alt="${escapeHtml(p.title || '')}" class="project-image" loading="lazy">
                                <div class="project-overlay">
                                    <img src="${escapeHtml(p.logo || '')}" alt="Logo" class="project-logo" loading="lazy">
                                    <div class="project-card-info">
                                        <h2 class="project-title">${escapeHtml(p.title || '')}</h2>
                                        <p>${escapeHtml(p.subtitle || '')}</p>
                                    </div>
                                </div>
                            </a>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    }

    // Replace count
    html = html.replace(/<div class="platform-count">.*?<\/div>/i, `<div class="platform-count">Total de ${projects.length} projetos encontrados</div>`);

    // Replace #projects-container contents
    const containerRegex = /<div id="projects-container">[\s\S]*?<\/div>\s*(?=<script type="module" src="\/scripts\/projects_loader\.js">)/i;
    html = html.replace(containerRegex, `<div id="projects-container">\n${catalogHtml}\n        </div>\n        `);

    fs.writeFileSync(filePath, html, 'utf-8');
    console.log(`[SSG] Updated projetos.html with ${projects.length} pre-rendered projects across ${Object.keys(platforms).length} platforms.`);
}

// ==========================================
// 5. UPDATE HOMEPAGE (index.html) SEO
// ==========================================

function updateHomepage() {
    const filePath = path.join(ROOT_DIR, 'index.html');
    if (!fs.existsSync(filePath)) return;
    let html = fs.readFileSync(filePath, 'utf-8');

    // Fix domain references and assets
    html = html.replace(/https:\/\/bitmundo\.net\//g, `${BASE_URL}/`);
    html = html.replace(/https:\/\/i\.postimg\.cc\/fyRzwH4X\/bitmundo-logo\.png/g, `${BASE_URL}/bitmundo_logo.png`);

    fs.writeFileSync(filePath, html, 'utf-8');
    console.log(`[SSG] Updated index.html with canonical domain and SEO tags.`);
}

// ==========================================
// 6. GENERATE SITEMAP & UPDATE ROBOTS.TXT
// ==========================================

function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generateSitemap(projects, articles) {
    const today = new Date().toISOString().split('T')[0];

    const corePages = [
        { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'daily' },
        { loc: `${BASE_URL}/projetos.html`, priority: '0.9', changefreq: 'daily' },
        { loc: `${BASE_URL}/raiden_patcher.html`, priority: '0.9', changefreq: 'weekly' },
        { loc: `${BASE_URL}/hog_extractor.html`, priority: '0.8', changefreq: 'weekly' },
        { loc: `${BASE_URL}/tools/Fully/AFS_STATION.html`, priority: '0.8', changefreq: 'weekly' },
        { loc: `${BASE_URL}/tools/Fully/TTxT-standalone.html`, priority: '0.8', changefreq: 'weekly' },
        { loc: `${BASE_URL}/tools.html`, priority: '0.8', changefreq: 'weekly' },
        { loc: `${BASE_URL}/library.html`, priority: '0.7', changefreq: 'weekly' },
        { loc: `${BASE_URL}/about.html`, priority: '0.6', changefreq: 'monthly' },
        { loc: `${BASE_URL}/privacidade.html`, priority: '0.3', changefreq: 'monthly' }
    ];

    const projectUrls = projects.map(p => {
        let lastmod = today;
        if (p._updateTime) {
            lastmod = p._updateTime.split('T')[0];
        }
        const imgUrl = toAbsoluteUrl(p.cover || p.thumbnail);
        const title = p.title || 'Projeto';
        const platform = p.platform || 'PS2';
        const caption = p.subtitle || p.title || '';

        return {
            loc: `${BASE_URL}/projetos/${p.id}.html`,
            lastmod,
            priority: '0.9',
            changefreq: 'weekly',
            image: {
                loc: imgUrl,
                title: `${title} (${platform}) PT-BR - RomHacking do Raiden`,
                caption: caption
            }
        };
    });

    const allUrls = [...corePages, ...projectUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${allUrls.map(u => {
    let imgBlock = '';
    if (u.image) {
        imgBlock = `\n    <image:image>\n      <image:loc>${escapeXml(u.image.loc)}</image:loc>\n      <image:title>${escapeXml(u.image.title)}</image:title>\n      <image:caption>${escapeXml(u.image.caption)}</image:caption>\n    </image:image>`;
    }
    return `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod || today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${imgBlock}\n  </url>`;
}).join('\n')}
</urlset>`;

    fs.writeFileSync(path.join(ROOT_DIR, 'sitemap.xml'), xml, 'utf-8');
    console.log(`[SSG] Generated sitemap.xml with ${allUrls.length} indexed URLs and rich Google Image metadata.`);

    // Update robots.txt
    const robotsPath = path.join(ROOT_DIR, 'robots.txt');
    const robotsContent = `# Robots.txt - Bit.Raiden (https://bitraiden.org)
User-agent: *
Allow: /
Disallow: /admin_login.html
Disallow: /admin_dashboard.html
Disallow: /tool_view.html
Disallow: /archive/

# Google Search Bots & AdSense
User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /

User-agent: Mediapartners-Google
Allow: /

User-agent: AdsBot-Google
Allow: /

User-agent: AdsBot-Google-Mobile
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
    fs.writeFileSync(robotsPath, robotsContent, 'utf-8');
    console.log(`[SSG] Updated robots.txt pointing to ${BASE_URL}/sitemap.xml.`);
}

// ==========================================
// 7. FIX DOMAIN REFERENCES IN OTHER PAGES
// ==========================================

function fixDomainReferences() {
    const files = ['library.html', 'tools.html', 'about.html'];
    files.forEach(f => {
        const fp = path.join(ROOT_DIR, f);
        if (fs.existsSync(fp)) {
            let content = fs.readFileSync(fp, 'utf-8');
            let updated = content
                .replace(/https:\/\/bitmundo\.net\//g, `${BASE_URL}/`)
                .replace(/https:\/\/i\.postimg\.cc\/fyRzwH4X\/bitmundo-logo\.png/g, `${BASE_URL}/bitmundo_logo.png`);
            if (updated !== content) {
                fs.writeFileSync(fp, updated, 'utf-8');
                console.log(`[SSG] Fixed canonical/OG domain in ${f}.`);
            }
        }
    });
}

// ==========================================
// 8. MAIN EXECUTION
// ==========================================

async function main() {
    console.log('==============================================');
    console.log(' Bit.Raiden SSG & SEO Builder Starting...     ');
    console.log(' Target Domain: ' + BASE_URL);
    console.log('==============================================');

    console.log('[SSG] Fetching projects and articles from Firestore...');
    const [projects, articles] = await Promise.all([
        fetchCollection('projects'),
        fetchCollection('articles')
    ]);

    console.log(`[SSG] Fetched ${projects.length} projects and ${articles.length} articles.`);

    if (projects.length === 0) {
        console.error('[SSG] Aborting: No projects fetched from Firestore.');
        process.exit(1);
    }

    // Read template
    const templatePath = path.join(ROOT_DIR, 'project_view.html');
    const templateHtml = fs.readFileSync(templatePath, 'utf-8');

    // Create target directories
    const projetosDir = path.join(ROOT_DIR, 'projetos');
    const projectsDir = path.join(ROOT_DIR, 'projects');
    if (!fs.existsSync(projetosDir)) fs.mkdirSync(projetosDir, { recursive: true });
    if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });

    // Generate project pages
    for (const p of projects) {
        const projectHtml = buildProjectHtml(p, projects, templateHtml);

        // 1. /projetos/[id].html
        const fileHtml = path.join(projetosDir, `${p.id}.html`);
        fs.writeFileSync(fileHtml, projectHtml, 'utf-8');

        // 2. /projetos/[id]/index.html (clean URL)
        const cleanDir = path.join(projetosDir, p.id);
        if (!fs.existsSync(cleanDir)) fs.mkdirSync(cleanDir, { recursive: true });
        fs.writeFileSync(path.join(cleanDir, 'index.html'), projectHtml, 'utf-8');

        // 3. /projects/[id].html (English alias)
        fs.writeFileSync(path.join(projectsDir, `${p.id}.html`), projectHtml, 'utf-8');

        console.log(`[SSG] Generated: /projetos/${p.id}.html`);
    }

    // Update Catalog (projetos.html)
    updateProjetosCatalog(projects);

    // Update Homepage (index.html)
    updateHomepage();

    // Generate Sitemap & Update robots.txt
    generateSitemap(projects, articles);

    // Fix remaining domains
    fixDomainReferences();

    // Verify & update static meta tags and schemas across all standalone tools and pages
    updateAllSeoTags();

    console.log('==============================================');
    console.log(' SSG & SEO Build Complete!                    ');
    console.log('==============================================');
}

main().catch(err => {
    console.error('[SSG] Fatal error:', err);
    process.exit(1);
});
