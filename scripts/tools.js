import { dbPromise } from './db-context.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { parseArticleTags } from "./utils.js";

var toolArray = [];
var currentView = 'name';

async function loadTools() {
    const db = await dbPromise;
    try {
        const querySnapshot = await getDocs(collection(db, "tools"));
        toolArray = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTools();
    } catch (error) {
        console.error("Error loading tools from Firestore:", error);
        const container = document.getElementById("alphabet-list");
        if (container) container.innerHTML = "<li><p>Erro ao carregar ferramentas.</p></li>";
    }
}

function renderTools() {
    var toolList = document.getElementById("alphabet-list");
    if (!toolList) return;
    toolList.innerHTML = "";

    toolArray.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    var groups = {};

    if (currentView === 'name') {
        toolArray.forEach(tool => {
            var letter = (tool.name || " ").charAt(0).toUpperCase();
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(tool);
        });
    } else if (currentView === 'target') {
        toolArray.forEach(tool => {
            var cat = tool.target || "Geral";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(tool);
        });
    } else if (currentView === 'type') {
        toolArray.forEach(tool => {
            var type = tool.type || "Outros";
            if (!groups[type]) groups[type] = [];
            groups[type].push(tool);
        });
    }

    var sortedKeys = Object.keys(groups).sort();
    sortedKeys.forEach(key => {
        var section = document.createElement("li");
        section.innerHTML = `<h3>${key}</h3>`;
        toolList.appendChild(section);

        groups[key].forEach(tool => {
            var toolItem = document.createElement("div");
            toolItem.className = "toolItem";
            toolItem.innerHTML = `
                <a style="cursor: pointer;" onclick="toggleFolder(this)">
                    <picture class="hide_folder_wrapper">
                        <img class="folder-arrow" src="../../elements/light_down_arrow.png" style="width: 20px; height: 20px; transition: transform 0.3s; filter: brightness(0) invert(1);" />
                    </picture>
                    <img src="${tool.icon || '/media/placeholder.png'}" style="width: 48px; height: 48px; object-fit: contain;" />
                    <h2>${tool.name}</h2>
                </a>
                <div class="info-panel" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); color: var(--text-muted);">
                    <div style="font-size: 0.95rem; line-height: 1.6;">
                        ${parseArticleTags(tool.description || '')}
                        ${tool.extra ? `<p><a target="_blank" href="${tool.extra}">${tool.extra}</a></p>` : ''}
                    </div>
                        <br><br>
                        <strong>Tipo:</strong> ${tool.type || ''}
                        <br><br>
                        <strong>Alvo:</strong> <span style="color:var(--highlight)">${tool.target || ''}</span>
                        <br><br>
                        <strong>Créditos:</strong> <span style="color:#4ade80">${tool.credit || tool.credits || ''}</span>
                    </p>
                    <div id="link" style="margin-top: 1.5rem;">
                        <a href="${tool.url}" target="_blank" style="display: inline-flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                            <img src="/media/download.png" style="width: 48px; height: 48px;">
                            <span style="font-size: 0.9rem;">Download (${tool.version || ''})</span>
                        </a>
                    </div>
                </div>
            `;
            section.appendChild(toolItem);
        });
    });
}

// Global scope hooks
window.toggleFolder = (el) => {
    var info = el.nextElementSibling;
    var arrow = el.querySelector('.folder-arrow');
    if (!info) return;
    if (info.style.display === "none") {
        info.style.display = "block";
        if (arrow) arrow.style.transform = "scaleY(-1)";
    } else {
        info.style.display = "none";
        if (arrow) arrow.style.transform = "scaleY(1)";
    }
};

window.switchView = (mode) => {
    currentView = mode;
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(mode)) btn.classList.add('active');
    });
    renderTools();
};

document.addEventListener('DOMContentLoaded', loadTools);