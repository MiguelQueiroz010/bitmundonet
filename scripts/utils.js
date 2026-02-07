/**
 * Shared Utilities for BitMundo
 * Centralized content parsing and formatting.
 */

/**
 * Standardized Article Tag Parser
 * Handles custom tags for images, videos, Discord, and formatting.
 */
export function parseArticleTags(text) {
    if (!text) return "";
    let html = text;

    // 1. YouTube & Streamable Video Embedding
    const vPattern = /(?:([^:<>\n]+):\s*)?(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|streamable\.com\/)([a-zA-Z0-9_-]+))(?:\s*:\s*([^<>\n]+))?/gi;
    html = html.replace(vPattern, (match, prefix, url, id, suffix) => {
        const isStreamable = url.includes('streamable.com');
        const embedUrl = isStreamable ? `https://streamable.com/e/${id}` : `https://www.youtube.com/embed/${id}`;
        let vTitle = (prefix || suffix || "").trim();
        if (vTitle.length < 3 || vTitle.includes('http')) vTitle = "";
        const titleHtml = vTitle ? `<p style="margin-bottom: 0.8rem; font-weight: 700; color: var(--highlight); font-size: 1.1rem; border-left: 3px solid var(--highlight); padding-left: 12px; text-transform: uppercase;">${vTitle}</p>` : '';
        return `
            <div class="video-container" style="margin-top: 1rem; margin-bottom: 2.5rem; user-select: none;">
                ${titleHtml}
                <div class="video-wrapper">
                    <iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                </div>
            </div>`;
    });

    // 2. Discord Invites
    const discordPattern = /(https?:\/\/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9_-]+))/gi;
    html = html.replace(discordPattern, (match, url, code) => {
        const cardId = `discord-card-${Math.random().toString(36).substr(2, 9)}`;
        // Note: updateDiscordBanner must be globally available if used
        if (typeof window.updateDiscordBanner === 'function') setTimeout(() => window.updateDiscordBanner(code, cardId), 100);
        return `
            <div id="${cardId}" class="discord-invite-card glass-panel" style="margin: 1.5rem 0; padding: 1.2rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid rgba(88, 101, 242, 0.4); background: rgba(88, 101, 242, 0.1); border-radius: var(--radius-md); flex-wrap: wrap; position: relative; overflow: hidden; transition: all 0.3s ease;">
                <div class="discord-banner-bg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background-size: cover; background-position: center; opacity: 0.2;"></div>
                <div style="display: flex; align-items: center; gap: 1rem; min-width: 200px; position: relative; z-index: 1;">
                    <div class="discord-icon-wrapper" style="background: #1139ebff; padding: 8px; border-radius: 10px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <svg width="24" height="24" viewBox="0 0 127.14 96.36" fill="white"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.4,80.21a105.73,105.73,0,0,0,32.17,16.15,77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c3.39-29.09-5.46-52.74-23.74-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
                    </div>
                    <div>
                        <p class="discord-server-name" style="margin: 0; font-weight: 700; color: #fff; font-size: 1rem; line-height: 1.2;">Comunidade no Discord</p>
                        <p style="margin: 0; font-size: 0.8rem; color: #9ca3af; font-family: monospace;">discord.gg/${code}</p>
                    </div>
                </div>
                <a href="https://discord.gg/${code}" target="_blank" style="background: #248046; color: #fff !important; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 700; text-decoration: none !important; font-size: 0.8rem; transition: background 0.2s ease; position: relative; z-index: 1; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: none !important;">ENTRAR NO SERVIDOR</a>
            </div>`;
    });

    // 3. Image Tags Support
    // Style 1: (image style="..." = "url")caption(/image)
    html = html.replace(/\(image style="([^"]+)"\s*=\s*"([^"]+)"\)(.*?)\(\/image\)/gi,
        '<div style="$1; margin: 1.5rem 0;"><img class="resp" src="$2" alt="Image" style="max-width: 100%; height: auto; border-radius: var(--radius-md);"><p style="font-size: 0.85rem; color: rgba(255,255,255,0.5); font-style: italic; margin-top: 0.5rem; text-align: center;">$3</p></div>');

    // Style 2: (image style="...")url(/image)
    html = html.replace(/\(image style="([^"]+)"\)([^)]*)\(\/image\)/gi,
        '<div style="$1; margin: 1.5rem 0;"><img class="resp" src="$2" alt="Image" style="max-width: 100%; height: auto; border-radius: var(--radius-md);"></div>');

    // 4. Flexible Formatting Tags (Independent Open/Close)
    // Support toggle style: (color="red")Text(color="blue")More Text(/color)
    html = html.replace(/\(color\s*=\s*"([^"]+)"\)/gi, '<span style="color: $1;">');
    html = html.replace(/\(\/color\)/gi, '</span>');
    html = html.replace(/\(font-size\s*=\s*"([^"]+)"\)/gi, '<span style="font-size: $1;">');
    html = html.replace(/\(\/font-size\)/gi, '</span>');
    html = html.replace(/\(strong\)/gi, '<strong>');
    html = html.replace(/\(\/strong\)/gi, '</strong>');

    // 5. Handle Line Breaks
    return html.split('\n\n').map(p => {
        if (p.trim().startsWith('<div') || p.trim().startsWith('<blockquote')) return p;
        return `<p style="margin-bottom: 1.5rem;">${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
}

/**
 * Render structured topics into HTML
 * @param {Array} topics - Array of {title, content} objects
 */
export function renderTopics(topics) {
    if (!topics || !Array.isArray(topics)) return "";
    return topics.map(topic => {
        const titleHtml = (topic.title && topic.title.trim())
            ? `<h3 class="topic-title" style="color: var(--highlight); margin-top: 2.5rem; margin-bottom: 1.2rem; font-size: 1.4rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-left: 4px solid var(--highlight); padding-left: 15px;">${topic.title}</h3>`
            : '';
        const contentHtml = parseArticleTags(topic.content || "");
        return `<section class="article-topic" style="margin-bottom: 2rem;">${titleHtml}${contentHtml}</section>`;
    }).join('');
}
/**
 * Character Sanitizer (Fixes Mojibake: UTF-8 read as Latin-1)
 * @param {string} str - The string to sanitize
 */
export function sanitizeString(str) {
    if (!str) return "";
    try {
        // Common Mojibake patterns for Portuguese
        const fixes = {
            'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
            'Ã ': 'à', 'Ã¨': 'è', 'Ã¬': 'ì', 'Ã²': 'ò', 'Ã¹': 'ù',
            'Ã¢': 'â', 'Ãª': 'ê', 'Ã®': 'î', 'Ã´': 'ô', 'Ã»': 'û',
            'Ã£': 'ã', 'Ãµ': 'õ', 'Ã±': 'ñ',
            'Ã§': 'ç', 'Ã': 'Á', 'Ã‰': 'É', 'Ã ': 'Í', 'Ã“': 'Ó', 'Ãš': 'Ú',
            'Ã‚': 'Â', 'ÃŠ': 'Ê', 'ÃŽ': 'Î', 'Ã”': 'Ô', 'Ã›': 'Û',
            'Ãƒ': 'Ã', 'Ã•': 'Õ', 'Ã‡': 'Ç',
            'Âº': 'º', 'Âª': 'ª', 'Â°': '°',
            'â€“': '–', 'â€”': '—', 'â€œ': '“', 'â€': '”', 'â€˜': '‘', 'â€™': '’'
        };

        let cleaned = str;
        // First, check if it's already "double encoded" or just needs simple replacement
        Object.keys(fixes).forEach(key => {
            cleaned = cleaned.split(key).join(fixes[key]);
        });
        return cleaned;
    } catch (e) {
        return str;
    }
}
