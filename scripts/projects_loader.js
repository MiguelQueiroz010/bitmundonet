import { dbPromise } from './db-context.js';
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { parseArticleTags } from "./utils.js";
import { initReactions } from "./reactions_manager.js";

/**
 * Projects Loader Script (Firestore Version)
 */

async function loadProjects() {
    const db = await dbPromise;
    try {
        const querySnapshot = await getDocs(collection(db, "projects"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error loading projects from Firestore:", error);
        return [];
    }
}

async function loadProjectById(id) {
    const db = await dbPromise;
    try {
        const docRef = doc(db, "projects", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
    } catch (error) {
        console.error("Error loading project by ID:", error);
    }
    return null;
}

function renderProjectCard(p) {
    const id = p.id;
    const title = p.title || "";
    const subtitle = p.subtitle || "";
    const thumbnail = p.thumbnail || "";
    const logo = p.logo || "";
    const status = p.status || "Mod";

    const statusClass = status === 'Completo' ? 'status-complete' :
        status === 'Em Progresso' ? 'status-wip' : 'status-mod';

    return `
        <div class="project-card" onclick="location.href='/project_view.html?id=${id}'">
            <span class="project-status ${statusClass}">${status}</span>
            <img src="${thumbnail}" alt="${title}" class="project-image">
            <div class="project-overlay">
                <img src="${logo}" alt="Logo" class="project-logo">
                <div class="project-card-info">
                    <h2 class="project-title">${title}</h2>
                    <p>${subtitle}</p>
                </div>
            </div>
        </div>
    `;
}

async function initListing() {
    const container = document.getElementById('projects-container');
    if (!container) return;

    const projects = await loadProjects();

    // Group by platform
    const platforms = {};
    projects.forEach(p => {
        const platform = p.platform || "Outros";
        if (!platforms[platform]) platforms[platform] = [];
        platforms[platform].push(p);
    });

    let html = '';
    for (const platform in platforms) {
        html += `
            <section class="platform-section">
                <h2 class="platform-title">${platform}</h2>
                <div class="projects-grid">
                    ${platforms[platform].map(p => renderProjectCard(p)).join('')}
                </div>
            </section>
        `;
    }

    container.innerHTML = html;

    const countEl = document.querySelector('.platform-count');
    if (countEl) {
        countEl.textContent = `Total de ${projects.length} projetos encontrados`;
    }
}

async function initDetail() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');
    if (!projectId) return;

    console.log("Initializing project detail for:", projectId);
    const project = await loadProjectById(projectId);

    if (!project) {
        console.error("Project not found:", projectId);
        document.body.innerHTML = `<div style="padding: 5rem; text-align: center;">
            <h1>Projeto não encontrado</h1>
            <p>Verifique se o ID "${projectId}" está correto no banco de dados.</p>
            <a href="/" style="color: var(--primary);">Voltar para Início</a>
        </div>`;
        return;
    }

    const title = project.title || "";
    const summary = project.subtitle || "";
    const desc = project.description || "";
    const video = project.video || "";
    const cover = project.cover || "";
    const platform = project.platform || "Outros";
    const globalProgress = project.progress?.global || "0%";

    // Fill Page Info
    document.title = `${title} - BitMundo`;
    const titleDisplay = document.getElementById('project-title-display');
    if (titleDisplay) titleDisplay.innerHTML = title;

    const summaryEl = document.getElementById('project-summary');
    if (summaryEl) summaryEl.textContent = summary;

    const descEl = document.getElementById('project-description');
    if (descEl) descEl.innerHTML = parseArticleTags(desc);

    const platEl = document.getElementById('project-platform');
    if (platEl) platEl.textContent = platform;

    // Animate Global Progress
    const percentInt = parseInt(globalProgress) || 0;
    const progressFill = document.getElementById('global-progress-fill');
    const percentText = document.getElementById('global-percent-text');

    if (progressFill && percentText) {
        setTimeout(() => {
            progressFill.style.width = `${percentInt}%`;
            animateValue(percentText, 0, percentInt, 2000);
        }, 500);
    }

    const videoPlayer = document.getElementById('project-video-player');
    const heroHead = document.getElementById('project-head');

    if (video && heroHead) {
        const embedUrl = getEmbedUrl(video);
        if (embedUrl) {
            // It's a YouTube or Streamable video
            heroHead.insertAdjacentHTML('afterbegin', `
                <iframe id="project-video-iframe" 
                        src="${embedUrl}" 
                        frameborder="0" 
                        allow="autoplay; fullscreen; picture-in-picture" 
                        allowfullscreen 
                        style="pointer-events: none;">
                </iframe>
            `);
            if (videoPlayer) videoPlayer.remove();

            // Keep control button visible
            const toggleBtn = document.getElementById('video-toggle');
            if (toggleBtn) toggleBtn.style.display = 'flex';
        } else {
            // Normal MP4 video
            const videoSource = document.getElementById('video-source');
            if (videoSource) videoSource.src = video;
            if (videoPlayer) {
                videoPlayer.load();
                videoPlayer.muted = false;
                videoPlayer.volume = 0.3;
                videoPlayer.play().catch(e => console.warn("Autoplay blocked:", e));
            }
        }
    }

    const coverEl = document.getElementById('project-cover');
    if (coverEl) coverEl.src = cover;

    // Live Video Section (YouTube)
    const liveVideoUrl = project.live_video;
    const livesSection = document.getElementById('lives-section');
    if (liveVideoUrl && livesSection) {
        livesSection.style.display = 'block';
        document.getElementById('lives-container').innerHTML = `
            <div class="lives-gallery">
                <div class="video-card">
                    <iframe src="${liveVideoUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            </div>
        `;
    } else if (livesSection) {
        livesSection.style.display = 'none';
    }

    // Gallery
    const galleryItems = project.gallery || [];
    const galleryContainer = document.getElementById('gallery_container');
    const dotContainer = document.getElementById('gallery-dots');

    if (galleryItems.length > 0 && galleryContainer) {
        let galleryHtml = '';
        let dotsHtml = '';
        galleryItems.forEach((item, idx) => {
            const src = item.src;
            const caption = item.caption || "";
            galleryHtml += `
                <div class="mySlides fade ${idx === 0 ? 'first' : ''}">
                    <a class="spotlight" href="${src}" data-description="${caption}">
                        <img src="${src}" alt="${caption}">
                    </a>
                </div>
            `;
            dotsHtml += `<span class="dot ${idx === 0 ? 'active' : ''}" onclick="currentSlide(${idx + 1})"></span>`;
        });
        galleryHtml += `
            <a class="prev" onclick="plusSlides(-1)">&#10094;</a>
            <a class="next" onclick="plusSlides(1)">&#10095;</a>
        `;
        galleryContainer.innerHTML = galleryHtml;
        if (dotContainer) dotContainer.innerHTML = dotsHtml;
    } else {
        const gallerySection = document.getElementById('gallery');
        if (gallerySection) gallerySection.style.display = 'none';
    }

    // Credits
    const creditItems = project.credits || [];
    const creditsList = document.getElementById('credits-list');
    if (creditItems.length > 0 && creditsList) {
        creditsList.innerHTML = creditItems.map(item => `
            <div class="credit-item">
                <span class="credit-name">${item.name}</span>
                <span class="credit-role">${item.role}</span>
            </div>
        `).join('');
    } else {
        const creditsSection = document.getElementById('credits');
        if (creditsSection) creditsSection.style.display = 'none';
    }

    // Progress (Detailed Bars)
    const progressItems = project.progress?.items || [];
    const progressList = document.getElementById('progress-list');
    if (progressItems.length > 0 && progressList) {
        progressList.innerHTML = progressItems.map(item => {
            const label = item.label;
            const valueText = item.value;
            const percent = parseInt(valueText) || 0;
            return `
                <div class="progress-item-wrapper">
                    <div class="progress-label">
                        <span class="label-text">${label}</span>
                        <span class="label-value">${valueText}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        const progressSection = document.getElementById('progress');
        if (progressSection) progressSection.style.display = 'none';
    }

    // Downloads
    const downloadItems = project.downloads || [];
    const downloadContainer = document.getElementById('downloads-container');
    if (downloadItems.length > 0 && downloadContainer) {
        downloadContainer.innerHTML = downloadItems.map(item => {
            const version = item.version;
            const type = item.type;
            const maintenance = item.maintenance === true || item.maintenance === "true";
            const url = item.url;
            const changelog = item.changelog || "";

            return `
                <div class="dir-item">
                    <div class="dir-header" onclick="toggleFolder(this)">
                        <div class="dir-title">
                            <span>${version} (${type})</span>
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
                        ${maintenance ? `
                            <div class="maintenance">
                                <span>EM MANUTENÇÃO</span>
                                <p style="font-size: 0.8rem; margin-top: 5px; color: rgba(239, 68, 68, 0.7);">
                                    Este arquivo está sendo atualizado.
                                </p>
                            </div>
                        ` : `
                            <a href="${url}" target="_blank" class="download-link">
                                EFETUAR DOWNLOAD
                            </a>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        const downloadsSection = document.getElementById('downloads');
        if (downloadsSection) downloadsSection.style.display = 'none';
    }

    // Initialize Gallery Hooks
    if (typeof window.initGallery === 'function') {
        window.initGallery();
    }

    // Initialize Reactions
    if (document.getElementById('project-reactions')) {
        initReactions(projectId, 'project-reactions');
    }
}

/**
 * Helper to get embed URL for YouTube and Streamable
 */
function getEmbedUrl(url) {
    if (!url) return null;
    url = url.trim();

    // YouTube
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
        const videoId = ytMatch[1];
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0&enablejsapi=1`;
    }

    // Streamable
    const stMatch = url.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([a-zA-Z0-9]+)/);
    if (stMatch && stMatch[1]) {
        return `https://streamable.com/e/${stMatch[1]}?autoplay=1&muted=0&loop=1&controls=0`;
    }

    return null;
}

/**
 * Helper to animate numerical values
 */
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start) + "%";
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

/**
 * View Switcher for the Projects Listing
 */
function setProjectView(view) {
    const grids = document.querySelectorAll('.projects-grid');
    const gridBtn = document.getElementById('grid-view');
    const listBtn = document.getElementById('list-view');

    if (view === 'list') {
        grids.forEach(grid => grid.classList.add('list-mode'));
        if (gridBtn) gridBtn.classList.remove('active');
        if (listBtn) listBtn.classList.add('active');
        localStorage.setItem('projectsView', 'list');
    } else {
        grids.forEach(grid => grid.classList.remove('list-mode'));
        if (gridBtn) gridBtn.classList.add('active');
        if (listBtn) listBtn.classList.remove('active');
        localStorage.setItem('projectsView', 'grid');
    }
}

// Expose setProjectView to the global scope for HTML onclick
window.setProjectView = setProjectView;

// Initializer Boot
function boot() {
    if (document.getElementById('projects-container')) {
        initListing().then(() => {
            const savedView = localStorage.getItem('projectsView');
            if (savedView === 'list') window.setProjectView('list');
        });
    } else if (document.getElementById('project-container') || document.getElementById('project-head')) {
        initDetail();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// Exports for other modules if needed
export { loadProjects, loadProjectById, renderProjectCard };
