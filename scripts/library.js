var gamesData = [];
var currentLibraryView = 'name';

function parseArticleTags(text) {
    if (!text) return "";
    let html = text;
    // Replace (image style="...")path(/image)
    html = html.replace(/\(image style="([^"]+)"\)([^)]*)\(\/image\)/gi, '<img src="$2" style="$1" class="article-img">');
    // Replace (font-size = "...")text(/font-size)
    html = html.replace(/\(font-size = "([^"]+)"\)([^)]*)\(\/font-size\)/gi, '<span style="font-size: $1;">$2</span>');
    // Replace (color = "...")text(/color)
    html = html.replace(/\(color = "([^"]+)"\)([^)]*)\(\/color\)/gi, '<span style="color: $1;">$2</span>');
    return html.replace(/\n/g, '<br>'); // Preserve line breaks
}

document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();
});

function loadLibrary() {
    fetch('/library.xml')
        .then(response => response.text())
        .then(data => {
            const parser = new DOMParser();
            const xml = parser.parseFromString(data, "application/xml");
            parseGames(xml);
            renderLibrary();
        })
        .catch(err => console.error("Erro ao carregar biblioteca:", err));
}

function parseGames(xml) {
    const games = xml.getElementsByTagName("game");
    gamesData = [];

    Array.from(games).forEach(game => {
        if (game.getAttribute("active") === "false") return;

        const getVal = (tag, parent = game) => {
            const el = parent.getElementsByTagName(tag)[0];
            return el ? el.textContent : "";
        };

        const info = game.getElementsByTagName("info")[0];
        const pub = game.getElementsByTagName("publication")[0];
        const prev = game.getElementsByTagName("previews")[0];
        const hist = game.getElementsByTagName("history")[0];
        const dev = game.getElementsByTagName("development")[0];
        const rom = game.getElementsByTagName("romhacking")[0];
        const walk = game.getElementsByTagName("walkthrough")[0];
        const cheatsEl = game.getElementsByTagName("cheats")[0];
        const mediaEl = game.getElementsByTagName("media")[0];
        const ostEl = game.getElementsByTagName("ost")[0];

        // Parse Media Gallery
        let mediaGallery = [];
        if (mediaEl) {
            const items = mediaEl.getElementsByTagName("item");
            Array.from(items).forEach(m => {
                mediaGallery.push({ type: m.getAttribute("type"), url: m.getAttribute("url") });
            });
        }

        // Parse OST
        let tracklist = [];
        if (ostEl) {
            const tracks = ostEl.getElementsByTagName("track");
            Array.from(tracks).forEach(t => {
                tracklist.push({ title: t.getAttribute("title"), url: t.getAttribute("url") });
            });
        }

        // Parse Cheats
        let cheats = [];
        if (cheatsEl) {
            const codes = cheatsEl.getElementsByTagName("code");
            Array.from(codes).forEach(c => {
                cheats.push({ name: c.getAttribute("name"), code: c.textContent });
            });
        }

        gamesData.push({
            id: game.getAttribute("id"),
            title: getVal("title", info),
            platform: getVal("platform", info),
            genre: getVal("genre", info),
            year: getVal("release_year", info),
            cover: getVal("cover", info),
            publisher: getVal("publisher", pub),
            developer: getVal("developer", pub),
            region: getVal("region", pub),
            summary: getVal("summary", prev),
            video: getVal("video_url", prev),
            lore: getVal("lore", hist),
            impact: getVal("impact", hist),
            dev_details: getVal("details", dev),
            legacy: getVal("legacy", dev),
            translator: getVal("translator", rom),
            status: getVal("status", rom),
            dev_notes: getVal("details_dev", rom),
            hacker_credits: getVal("credits_hacker", rom),
            guide_url: getVal("guide_url", walk),
            tips: getVal("tips", walk),
            cheats: cheats,
            gallery: mediaGallery,
            ost: tracklist
        });
    });
}

function renderLibrary() {
    const container = document.getElementById("library-container");
    container.innerHTML = "";

    // Sort by name by default
    gamesData.sort((a, b) => a.title.localeCompare(b.title));

    let groups = {};

    if (currentLibraryView === 'name') {
        // Group by Alphabet
        gamesData.forEach(game => {
            const letter = game.title.charAt(0).toUpperCase();
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(game);
        });
    } else if (currentLibraryView === 'platform') {
        // Group by Platform
        gamesData.forEach(game => {
            const plat = game.platform || "Outros";
            if (!groups[plat]) groups[plat] = [];
            groups[plat].push(game);
        });
    } else if (currentLibraryView === 'genre') {
        // Group by Genre
        gamesData.forEach(game => {
            const genre = game.genre.split('/')[0].trim() || "Geral";
            if (!groups[genre]) groups[genre] = [];
            groups[genre].push(game);
        });
    }

    const sortedKeys = Object.keys(groups).sort();

    sortedKeys.forEach(key => {
        // Add Header
        const header = document.createElement("h2");
        header.className = "category-header";
        header.textContent = key;
        container.appendChild(header);

        // Add Cards
        groups[key].forEach(game => {
            const card = document.createElement("div");
            card.className = "game-card animate-fade-in";
            card.onclick = () => openModal(game.id);

            card.innerHTML = `
                <img src="${game.cover || '/media/placeholder.png'}" class="game-cover" alt="${game.title}">
                <div class="game-body">
                    <div class="game-meta">
                        <span class="platform-tag">${game.platform}</span>
                        <span>${game.year}</span>
                    </div>
                    <h2 class="game-title">${game.title}</h2>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">${game.genre}</p>
                </div>
            `;
            container.appendChild(card);
        });
    });
}

function switchLibraryView(mode, btn) {
    currentLibraryView = mode;

    // Update active class
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    renderLibrary();
}

function openModal(id) {
    const game = gamesData.find(g => g.id == id);
    if (!game) return;

    const modal = document.getElementById("game-modal");
    const body = document.getElementById("modal-body");

    body.innerHTML = `
        <div class="wiki-header" style="margin-bottom: 2rem;">
            <h1 style="color: #fff; font-size: 2.5rem; margin-bottom: 0.5rem;">${game.title}</h1>
            <p style="color: var(--highlight); font-size: 1.2rem;">${game.platform} | ${game.year}</p>
        </div>

        <div class="wiki-container">
            <div class="wiki-main">
                <div class="wiki-banner-wrapper">
                    <div class="scanlines"></div>
                    <img src="${game.cover}" class="wiki-banner" alt="Banner">
                </div>
                
                <div class="detail-tabs">
                    <button class="tab-btn active" onclick="switchTab(event, 'tab-info')">Artigo</button>
                    <button class="tab-btn" onclick="switchTab(event, 'tab-hist')">História</button>
                    <button class="tab-btn" onclick="switchTab(event, 'tab-dev')">Desenvolvimento</button>
                    <button class="tab-btn" onclick="switchTab(event, 'tab-media')">Galeria</button>
                    <button class="tab-btn" onclick="switchTab(event, 'tab-ost')">OST</button>
                    <button class="tab-btn" onclick="switchTab(event, 'tab-rom')">RomHacking</button>
                    <button class="tab-btn" onclick="switchTab(event, 'tab-extra')">Guia & Cheats</button>
                </div>

                <div id="tab-info" class="tab-pane active wiki-article">
                    <div class="wiki-section">
                        <h2>Introdução</h2>
                        <p>${parseArticleTags(game.summary)}</p>
                    </div>
                    ${game.video ? `
                    <div class="wiki-section">
                        <h2>Trailer / GamePlay</h2>
                        <iframe width="100%" height="400" src="${game.video}" frameborder="0" allowfullscreen style="border-radius: 8px;"></iframe>
                    </div>` : ''}
                </div>

                <div id="tab-hist" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Enredo e Contexto</h2>
                        <p>${parseArticleTags(game.lore)}</p>
                    </div>
                    <div class="wiki-section">
                        <h2>Impacto Cultural</h2>
                        <p>${parseArticleTags(game.impact)}</p>
                    </div>
                </div>

                <div id="tab-dev" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Processo Criativo</h2>
                        <p>${parseArticleTags(game.dev_details)}</p>
                    </div>
                    <div class="wiki-section">
                        <h2>Legado Tecnológico</h2>
                        <p>${parseArticleTags(game.legacy)}</p>
                    </div>
                </div>

                <div id="tab-media" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Galeria de Mídia</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                            ${game.gallery.length > 0 ? game.gallery.map(m => `
                                <div style="text-align: center; background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px;">
                                    <img src="${m.url}" style="width: 100%; height: 150px; object-fit: contain; margin-bottom: 0.5rem; border-radius: 4px;">
                                    <p style="font-size: 0.8rem; color: var(--highlight);">${m.type}</p>
                                </div>
                            `).join('') : '<p>Dados de mídia não cadastrados.</p>'}
                        </div>
                    </div>
                </div>

                <div id="tab-ost" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Trilha Sonora (OST)</h2>
                        <div style="display: flex; flex-direction: column; gap: 1rem;">
                            ${game.ost.length > 0 ? game.ost.map(t => `
                                <div style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                                    <span style="font-weight: 600;">${t.title}</span>
                                    <audio controls style="height: 30px;">
                                        <source src="${t.url}" type="audio/mpeg">
                                        Seu navegador não suporta áudio.
                                    </audio>
                                </div>
                            `).join('') : '<p>Dados de trilha sonora não cadastrados.</p>'}
                        </div>
                    </div>
                </div>

                <div id="tab-rom" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Detalhes da Tradução</h2>
                        <p>Este projeto foi liderado por <strong>${game.translator}</strong> e encontra-se no status: <span style="color: ${game.status === 'Completo' ? '#4ade80' : 'var(--highlight)'}">${game.status}</span>.</p>
                        <p>${parseArticleTags(game.dev_notes)}</p>
                    </div>
                    <div class="wiki-section">
                        <h2>Créditos</h2>
                        <p>${parseArticleTags(game.hacker_credits)}</p>
                    </div>
                </div>

                <div id="tab-extra" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Detonado e Dicas</h2>
                        <p>${parseArticleTags(game.tips)}</p>
                        ${game.guide_url ? `<a href="${game.guide_url}" target="_blank" class="view-btn" style="display: inline-block; margin-top: 1rem; text-decoration: none; background: var(--primary); color: #fff; padding: 0.8rem 1.5rem; border-radius: 5px;">Acessar Guia Externo</a>` : ''}
                    </div>
                    
                    <div class="wiki-section">
                        <h2 style="color: #4ade80;">Cheats (GameShark / Action Replay)</h2>
                        ${game.cheats.length > 0 ? game.cheats.map(c => `
                            <div style="background: rgba(74, 222, 128, 0.05); padding: 1rem; border-radius: 4px; border-left: 4px solid #4ade80; margin-bottom: 1rem; font-family: monospace;">
                                <strong style="color: #4ade80; display: block; margin-bottom: 0.2rem;">${c.name}</strong> 
                                <code style="color: #fff; font-size: 1.1rem;">${c.code}</code>
                            </div>
                        `).join('') : '<p>Dados de cheats não cadastrados.</p>'}
                    </div>
                </div>
            </div>

            <aside class="wiki-sidebar">
                <div class="infobox-title">Dados Técnicos</div>
                <table class="infobox-table">
                    <tr><th>Plataforma</th><td>${game.platform}</td></tr>
                    <tr><th>Lançamento</th><td>${game.year}</td></tr>
                    <tr><th>Gênero</th><td>${game.genre}</td></tr>
                    <tr><th>Editora</th><td>${game.publisher}</td></tr>
                    <tr><th>Dev</th><td>${game.developer}</td></tr>
                    <tr><th>Região</th><td>${game.region}</td></tr>
                    <tr><th>Status BR</th><td>${game.status}</td></tr>
                    <tr><th>Tradutor</th><td>${game.translator}</td></tr>
                </table>
                
                <div style="margin-top: 1.5rem; text-align: center;">
                    <img src="${game.cover}" style="width: 100%; max-height: 250px; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3); padding: 5px;">
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Capa Original</p>
                </div>
            </aside>
        </div>
    `;

    modal.style.display = "block";
    document.body.style.overflow = "hidden";
}

function closeModal() {
    document.getElementById("game-modal").style.display = "none";
    document.body.style.overflow = "auto";
}

function switchTab(evt, tabId) {
    const tabPanes = document.getElementsByClassName("tab-pane");
    for (let i = 0; i < tabPanes.length; i++) {
        tabPanes[i].classList.remove("active");
    }

    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabBtns.length; i++) {
        tabBtns[i].classList.remove("active");
    }

    document.getElementById(tabId).classList.add("active");
    evt.currentTarget.classList.add("active");
}

window.onclick = function (event) {
    const modal = document.getElementById("game-modal");
    if (event.target == modal) {
        closeModal();
    }
}
