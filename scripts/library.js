import { dbPromise } from './db-context.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { parseArticleTags } from "./utils.js";

var gamesData = [];
var currentLibraryView = 'name';

// parseArticleTags removed - now imported from utils.js

async function loadLibrary() {
    const db = await dbPromise;
    try {
        const querySnapshot = await getDocs(collection(db, "library"));
        gamesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(game => game.active !== false && game.active !== "false");
        renderLibrary();
    } catch (err) {
        console.error("Erro ao carregar biblioteca do Firestore:", err);
        const container = document.getElementById("library-container");
        if (container) container.innerHTML = "<p>Erro ao carregar a biblioteca.</p>";
    }
}

function renderLibrary() {
    const container = document.getElementById("library-container");
    if (!container) return;
    container.innerHTML = "";

    gamesData.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    let groups = {};

    if (currentLibraryView === 'name') {
        gamesData.forEach(game => {
            const letter = (game.title || " ").charAt(0).toUpperCase();
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(game);
        });
    } else if (currentLibraryView === 'platform') {
        gamesData.forEach(game => {
            const plat = game.platform || "Outros";
            if (!groups[plat]) groups[plat] = [];
            groups[plat].push(game);
        });
    } else if (currentLibraryView === 'genre') {
        gamesData.forEach(game => {
            const genre = (game.genre || "Geral").split('/')[0].trim();
            if (!groups[genre]) groups[genre] = [];
            groups[genre].push(game);
        });
    }

    const sortedKeys = Object.keys(groups).sort();
    sortedKeys.forEach(key => {
        const header = document.createElement("h2");
        header.className = "category-header";
        header.textContent = key;
        container.appendChild(header);

        groups[key].forEach(game => {
            const card = document.createElement("div");
            card.className = "game-card animate-fade-in";
            card.onclick = () => openModal(game.id);

            card.innerHTML = `
                <img src="${game.cover || '/media/placeholder.png'}" class="game-cover" alt="${game.title}">
                <div class="game-body">
                    <div class="game-meta">
                        <span class="platform-tag">${game.platform}</span>
                        <span>${game.release_year || game.year || ''}</span>
                    </div>
                    <h2 class="game-title">${game.title}</h2>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">${game.genre}</p>
                </div>
            `;
            container.appendChild(card);
        });
    });
}

function openModal(id) {
    const game = gamesData.find(g => g.id == id);
    if (!game) return;

    const modal = document.getElementById("game-modal");
    const body = document.getElementById("modal-body");

    body.innerHTML = `
        <div class="wiki-header" style="margin-bottom: 2rem;">
            <h1 style="color: #fff; font-size: 2.5rem; margin-bottom: 0.5rem;">${game.title}</h1>
            <p style="color: var(--highlight); font-size: 1.2rem;">${game.platform} | ${game.release_year || game.year || ''}</p>
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
                    ${game.video_url || game.video ? `
                    <div class="wiki-section">
                        <h2>Trailer / GamePlay</h2>
                        <iframe width="100%" height="400" src="${game.video_url || game.video}" frameborder="0" allowfullscreen style="border-radius: 8px;"></iframe>
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
                        <p>${parseArticleTags(game.dev_legacy || game.legacy)}</p>
                    </div>
                </div>

                <div id="tab-media" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Galeria de Mídia</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                            ${(game.media || game.gallery || []).length > 0 ? (game.media || game.gallery).map(m => `
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
                            ${(game.ost || []).length > 0 ? game.ost.map(t => `
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
                        <p>${parseArticleTags(game.details_dev || game.dev_notes)}</p>
                    </div>
                    <div class="wiki-section">
                        <h2>Créditos</h2>
                        <p>${parseArticleTags(game.credits_hacker || game.hacker_credits)}</p>
                    </div>
                </div>

                <div id="tab-extra" class="tab-pane wiki-article">
                    <div class="wiki-section">
                        <h2>Detonado e Dicas</h2>
                        <p>${parseArticleTags(game.guide_tips || game.tips)}</p>
                        ${game.guide_url ? `<a href="${game.guide_url}" target="_blank" class="view-btn" style="display: inline-block; margin-top: 1rem; text-decoration: none; background: var(--primary); color: #fff; padding: 0.8rem 1.5rem; border-radius: 5px;">Acessar Guia Externo</a>` : ''}
                    </div>
                    
                    <div class="wiki-section">
                        <h2 style="color: #4ade80;">Cheats (GameShark / Action Replay)</h2>
                        ${(game.cheats || []).length > 0 ? game.cheats.map(c => `
                            <div style="background: rgba(74, 222, 128, 0.05); padding: 1rem; border-radius: 4px; border-left: 4px solid #4ade80; margin-bottom: 1rem; font-family: monospace;">
                                <strong style="color: #4ade80; display: block; margin-bottom: 0.2rem;">${c.name}</strong> 
                                <code style="color: #fff; font-size: 1.1rem;">${c.value || c.code}</code>
                            </div>
                        `).join('') : '<p>Dados de cheats não cadastrados.</p>'}
                    </div>
                </div>
            </div>

            <aside class="wiki-sidebar">
                <div class="infobox-title">Dados Técnicos</div>
                <table class="infobox-table">
                    <tr><th>Plataforma</th><td>${game.platform}</td></tr>
                    <tr><th>Lançamento</th><td>${game.release_year || game.year || ''}</td></tr>
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

// Global scope hooks
window.switchLibraryView = (mode, btn) => {
    currentLibraryView = mode;
    document.querySelectorAll('.lib-view-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderLibrary();
};

window.closeModal = () => {
    document.getElementById("game-modal").style.display = "none";
    document.body.style.overflow = "auto";
};

window.switchTab = (evt, tabId) => {
    const tabPanes = document.getElementsByClassName("tab-pane");
    for (let i = 0; i < tabPanes.length; i++) tabPanes[i].classList.remove("active");

    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabBtns.length; i++) tabBtns[i].classList.remove("active");

    document.getElementById(tabId).classList.add("active");
    evt.currentTarget.classList.add("active");
};

window.onclick = function (event) {
    const modal = document.getElementById("game-modal");
    if (event.target == modal) window.closeModal();
};

document.addEventListener('DOMContentLoaded', loadLibrary);
