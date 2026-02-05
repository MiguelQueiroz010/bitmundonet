/**
 * Projects Loader Script (Minimalist / Structured Data Version)
 */

async function loadProjects() {
    try {
        const response = await fetch('/projects.xml');
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        return Array.from(xmlDoc.getElementsByTagName("project"));
    } catch (error) {
        console.error("Error loading projects.xml:", error);
        return [];
    }
}

function renderProjectCard(project) {
    const id = project.getAttribute("id");
    const title = project.getElementsByTagName("title")[0].textContent;
    const subtitle = project.getElementsByTagName("subtitle")[0]?.textContent || "";
    const thumbnail = project.getElementsByTagName("thumbnail")[0]?.textContent || "";
    const logo = project.getElementsByTagName("logo")[0]?.textContent || "";
    const status = project.getElementsByTagName("status")[0]?.textContent || "Mod";

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
    projects.forEach(project => {
        const platformTag = project.getElementsByTagName("platform")[0];
        const platform = platformTag ? platformTag.textContent : "Outros";
        if (!platforms[platform]) platforms[platform] = [];
        platforms[platform].push(project);
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

    const projects = await loadProjects();
    const project = projects.find(p => p.getAttribute("id") === projectId);

    if (!project) {
        document.body.innerHTML = "<h1>Projeto não encontrado</h1>";
        return;
    }

    const title = project.getElementsByTagName("title")[0].textContent;
    const summary = project.getElementsByTagName("subtitle")[0]?.textContent || "";
    const desc = project.getElementsByTagName("description")[0]?.textContent || "";
    const video = project.getElementsByTagName("video")[0]?.textContent || "";
    const cover = project.getElementsByTagName("cover")[0]?.textContent || "";
    const platform = project.getElementsByTagName("platform")[0]?.textContent || "Outros";
    const globalProgress = project.getElementsByTagName("global_progress")[0]?.textContent || "0%";

    // Fill Page Info
    document.title = `${title} - BitMundo`;
    document.getElementById('project-title-display').innerHTML = title;
    document.getElementById('project-summary').textContent = summary;
    document.getElementById('project-description').innerHTML = desc;
    document.getElementById('project-platform').textContent = platform;

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

    const videoSource = document.getElementById('video-source');
    if (videoSource) videoSource.src = video;
    const videoPlayer = document.getElementById('project-video-player');
    if (videoPlayer) {
        videoPlayer.load();
        videoPlayer.muted = false; // Restore audio as requested
        videoPlayer.volume = 0.5;
    }

    document.getElementById('project-cover').src = cover;

    // Live Video Section (New)
    const liveVideoUrl = project.getElementsByTagName("live_video")[0]?.textContent;
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
    const galleryItems = Array.from(project.getElementsByTagName("gallery_item"));
    const galleryContainer = document.getElementById('gallery_container');
    const dotContainer = document.getElementById('gallery-dots');

    if (galleryItems.length > 0) {
        let galleryHtml = '';
        let dotsHtml = '';
        galleryItems.forEach((item, idx) => {
            const src = item.getAttribute("src");
            const caption = item.getAttribute("caption") || "";
            galleryHtml += `
                <div class="mySlides fade ${idx === 0 ? 'first' : ''}">
                    <a class="spotlight" href="${src}" data-description="${caption}">
                        <img src="${src}" alt="${caption}" style="width: 100%;">
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
        dotContainer.innerHTML = dotsHtml;
    } else {
        document.getElementById('gallery').style.display = 'none';
    }

    // Credits
    const creditItems = Array.from(project.getElementsByTagName("credit_item"));
    const creditsList = document.getElementById('credits-list');
    if (creditItems.length > 0) {
        creditsList.innerHTML = creditItems.map(item => `
            <div class="credit-item">
                <span class="credit-name">${item.getAttribute("name")}</span>
                <span class="credit-role">${item.textContent}</span>
            </div>
        `).join('');
    } else {
        document.getElementById('credits').style.display = 'none';
    }

    // Progress (Masterful Bars)
    const progressItems = Array.from(project.getElementsByTagName("progress_item"));
    const progressList = document.getElementById('progress-list');
    if (progressItems.length > 0) {
        progressList.innerHTML = progressItems.map(item => {
            const label = item.getAttribute("label");
            const valueText = item.textContent;
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
        document.getElementById('progress').style.display = 'none';
    }

    // Downloads
    const downloadItems = Array.from(project.getElementsByTagName("download_item"));
    const downloadContainer = document.getElementById('downloads-container');
    if (downloadItems.length > 0) {
        downloadContainer.innerHTML = downloadItems.map(item => {
            const version = item.getAttribute("version");
            const type = item.getAttribute("type");
            const maintenance = item.getAttribute("maintenance") === "true";
            const url = item.getAttribute("url");
            const changelog = item.getElementsByTagName("changelog")[0]?.textContent || "";

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
                                <p>${changelog}</p>
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

    // Initialize Gallery
    if (typeof initGallery === 'function') {
        initGallery();
    }
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

window.onload = () => {
    if (document.getElementById('projects-container')) {
        initListing().then(() => {
            const savedView = localStorage.getItem('projectsView');
            if (savedView === 'list') {
                setProjectView('list');
            }
        });
    } else if (document.getElementById('project-container')) {
        initDetail();
    }
};
