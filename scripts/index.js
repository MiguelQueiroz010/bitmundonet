import { dbPromise } from './db-context.js';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { parseArticleTags, renderTopics } from "./utils.js";

window.onload = loadpb;

// PROGRESS BAR CONTROL
function loadpb() {
  var elem = document.getElementsByClassName('progress-bar');
  if (!elem.length) return;

  const ProgressCounter = elem[0].getAttribute("pcounter") || "0%";
  var text = document.getElementById("progress_num");
  document.documentElement.style.setProperty('--pbar_centage', ProgressCounter);
  var pbc = document.getElementById("pbc");
  if (pbc) pbc.style.width = ProgressCounter;

  if (text) text.innerHTML = "Progresso: " + ProgressCounter;
  if (typeof showSlides === 'function') showSlides();
}

let lastVisibleDoc = null;
const articlesPerPage = 10;

/**
 * LOAD ARTICLES FROM FIRESTORE
 */
export async function loadArticlesFromFirestore(isLoadMore = false) {
  const db = await dbPromise;
  const container = document.getElementById("cont");
  const loadMoreBtn = document.getElementById("load-more-container");
  if (!container) return;

  try {
    // If not load more, clear container and reset lastVisible
    if (!isLoadMore) {
      container.innerHTML = `<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.5);">Carregando publicações...</div>`;
      lastVisibleDoc = null;
    }

    // Query strategy:
    // 1. Order by sortDate (ISO YYYY-MM-DD) descending
    // 2. Limit to articlesPerPage
    // 3. Start after previous last visible doc if loading more
    let q;
    if (isLoadMore && lastVisibleDoc) {
      q = query(
        collection(db, "articles"),
        where("selected", "==", true),
        orderBy("sortDate", "desc"),
        startAfter(lastVisibleDoc),
        limit(articlesPerPage)
      );
    } else {
      q = query(
        collection(db, "articles"),
        where("selected", "==", true),
        orderBy("sortDate", "desc"),
        limit(articlesPerPage)
      );
    }

    const querySnapshot = await getDocs(q);

    if (!isLoadMore) container.innerHTML = ""; // Clear loader after fetch

    if (querySnapshot.empty && !isLoadMore) {
      console.log("Modern query empty, using legacy fallback.");
      return loadArticlesLegacyFallback();
    }

    // Save last visible doc for next pagination
    lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

    // Show/Hide Load More button
    if (loadMoreBtn) {
      loadMoreBtn.style.display = (querySnapshot.docs.length === articlesPerPage) ? "block" : "none";
    }

    querySnapshot.forEach((doc) => {
      renderArticle({ ...doc.data(), id: doc.id }, container);
    });

  } catch (error) {
    console.error("Erro ao carregar artigos do Firestore:", error);
    if (error.message.includes("index")) {
      // Fallback for missing index during migration
      loadArticlesLegacyFallback();
    } else {
      container.innerHTML = "<p>Erro ao carregar publicações.</p>";
    }
  }
}

/**
 * Fallback for articles without sortDate or if index is missing
 */
async function loadArticlesLegacyFallback() {
  const db = await dbPromise;
  const container = document.getElementById("cont");
  const q = query(collection(db, "articles"), where("selected", "==", true), limit(50));
  const querySnapshot = await getDocs(q);
  container.innerHTML = "";

  const docs = [];
  querySnapshot.forEach(d => docs.push({ ...d.data(), id: d.id }));

  // Client-side Sort
  docs.sort((a, b) => {
    const parse = (d) => {
      if (!d) return 0;
      const parts = d.includes('/') ? d.split('/') : d.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(d).getTime();
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
      }
      return new Date(d).getTime();
    };
    return parse(b.date) - parse(a.date);
  });

  docs.slice(0, 10).forEach(article => renderArticle(article, container));
  document.getElementById("load-more-container").style.display = "none"; // Disable pagination in fallback
}

window.loadMoreArticles = () => loadArticlesFromFirestore(true);

/**
 * Standardized Article Tag Parser
 */
// parseArticleTags removed - now imported from utils.js

import { initComments } from "./comments_loader.js";
import { initReactions } from "./reactions_manager.js";

function renderArticle(a, container) {
  const title = a.title || "";
  const image = a.image || "";
  const content = a.content || "";
  const author = a.author || "Bit.Raiden";
  let date = a.date || "";
  const articleId = a.id || Math.random().toString(36).substr(2, 9);

  // Handle potential ISO date or Firestore Timestamp
  if (date && date.includes('-') && date.length >= 10) {
    const dateObj = new Date(date);
    if (!isNaN(dateObj.getTime())) {
      date = dateObj.toLocaleDateString('pt-BR');
    }
  }
  const align = a.align || "left";
  const imageStyle = a.imageStyle || "";

  // Use the standardized parser (structured topics or legacy content)
  const contentHtml = (a.topics && Array.isArray(a.topics))
    ? renderTopics(a.topics)
    : parseArticleTags(content);

  const articleDiv = document.createElement('div');
  articleDiv.className = 'article glass-panel';
  // Standardized via CSS class .article
  articleDiv.style.textAlign = align;

  articleDiv.innerHTML = `
    <div class="article-wrapper">
        <div class="article-header">
            ${image ? `<img id="titlemage" class="article-title-img" src="${image}" alt="${title}" style="${imageStyle}">` : ''}
            <h2 class="article-title">${title}</h2>
        </div>
        <div class="article-content">
            ${contentHtml}
        </div>
        <div id="reactions-container-${articleId}"></div>
        <div class="article-footer">
            <div class="article-meta">
                <span>Postado por: <strong class="meta-author">${author}</strong></span>
                <span class="meta-date">Publicado em: <strong>${date}</strong></span>
            </div>
            <button class="toggle-comments-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                COMENTAR
            </button>
        </div>
        
        <!-- Comments Section (Visible by default) -->
        <div class="comments-section comments-section-embedded">
            <div id="comments-container-${articleId}" class="comments-list">
                <p style="color: rgba(255,255,255,0.3); text-align: center;">Carregando comentários...</p>
            </div>
            
            <!-- Comment Form (Hidden by default, shown via toggle) -->
            <div class="comment-form-box" style="display: none;">
                <h3 class="comment-form-title">Deixe seu comentário</h3>
                <form id="comment-form-${articleId}">
                    <textarea placeholder="Escreva seu comentário aqui..." required></textarea>
                    <div class="comment-form-actions">
                        <button type="submit" class="comment-submit-btn">ENVIAR COMENTÁRIO</button>
                        <button type="button" class="comment-cancel-btn">CANCELAR</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
  `;

  container.appendChild(articleDiv);

  // Interaction Logic
  const toggleBtn = articleDiv.querySelector('.toggle-comments-btn');
  const textarea = articleDiv.querySelector('textarea');
  const commentFormBox = articleDiv.querySelector('.comment-form-box');

  toggleBtn.onclick = () => {
    const isHidden = commentFormBox.style.display === 'none';
    commentFormBox.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      textarea.focus();
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const cancelBtn = articleDiv.querySelector('.comment-cancel-btn');
  cancelBtn.onclick = () => {
    commentFormBox.style.display = 'none';
  };

  // Auto-init comments
  initComments(articleId, `comments-container-${articleId}`, `comment-form-${articleId}`);

  // Initialize Reactions
  initReactions(articleId, `reactions-container-${articleId}`);
}

// Expose to window for the manual trigger in HTML if needed
window.readXml = (dummy) => loadArticlesFromFirestore();

async function updateDiscordBanner(code, cardId) {
  try {
    const response = await fetch(`https://discord.com/api/v9/invites/${code}`);
    if (!response.ok) return;
    const data = await response.json();
    const guild = data.guild;
    if (guild) {
      setTimeout(() => {
        const card = document.getElementById(cardId);
        if (card) {
          const nameElem = card.querySelector('.discord-server-name');
          if (nameElem && guild.name) nameElem.textContent = guild.name;
          if (guild.icon) {
            const iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
            const iconWrapper = card.querySelector('.discord-icon-wrapper');
            if (iconWrapper) {
              iconWrapper.innerHTML = `<img src="${iconUrl}" alt="${guild.name}" style="width: 100%; height: 100%; object-fit: cover;">`;
              iconWrapper.style.padding = '0';
            }
          }
          if (guild.banner) {
            const bannerUrl = `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.jpg?size=1024`;
            const bg = card.querySelector('.discord-banner-bg');
            if (bg) {
              bg.style.backgroundImage = `url('${bannerUrl}')`;
              bg.style.opacity = '0.4';
              card.style.border = '1px solid rgba(88, 101, 242, 0.6)';
            }
          }
        }
      }, 100);
    }
  } catch (error) { console.error("Discord API Error:", error); }
}

// Expose for utils.js
window.updateDiscordBanner = updateDiscordBanner;

// Load Recent Projects for Gallery
export async function loadRecentGallery() {
  const db = await dbPromise;
  const container = document.getElementById("gallery");
  if (!container) return;

  try {
    // Fetch a larger batch (unfiltered) to ensure we get both 'migrated' and 'updated' projects
    // We cannot sort by 'updatedAt' in the query because it excludes docs without that field.
    const q = query(collection(db, "projects"), limit(20));
    const querySnapshot = await getDocs(q);

    const rawData = [];
    querySnapshot.forEach((doc) => {
      rawData.push({ ...doc.data(), id: doc.id });
    });

    if (rawData.length === 0) {
      console.warn("No projects found in DB for gallery.");
      return;
    }

    // Sort Client-Side: Prioritize recently Updated -> recently Migrated
    const slidesData = rawData.sort((a, b) => {
      const tA = new Date(a.updatedAt || a.migratedAt || 0).getTime();
      const tB = new Date(b.updatedAt || b.migratedAt || 0).getTime();
      return tB - tA;
    }).slice(0, 5);

    let slidesHtml = '';
    let dotsHtml = '';

    slidesData.forEach((p, index) => {
      const activeClass = index === 0 ? 'first' : '';
      const displayStyle = index === 0 ? 'display: block;' : 'display: none;';

      slidesHtml += `
            <div class="mySlides fade ${activeClass}" style="${displayStyle}">
                <div class="slide-content-wrapper">
                    <a href="project_view.html?id=${p.id}">
                        <img src="${p.cover || p.thumbnail}" alt="${p.title}" loading="lazy" style="width: 100%;">
                        <div class="slide-caption-overlay">
                            <div class="caption-content">
                                <h2>${p.title}</h2>
                              ${p.status === 'Completo' ?
          `<span class="status-badge">Projeto Completo</span>` :
          `<div class="progress-container">
               <div class="progress-bar" style="width: ${p.progress?.global || '0%'};"></div>
               <span class="percentage-text">${p.progress?.global || '0%'} Completo</span>
           </div>`}
                            </div>
                        </div>
                    </a>
                </div>
            </div>`;

      dotsHtml += `<span class="dot ${index === 0 ? 'active' : ''}" onclick="currentSlide(${index + 1})"></span>`;
    });

    // Inject HTML (without script tags)
    container.innerHTML = `
         ${slidesHtml}
         
         <a class="prev" onclick="plusSlides(-1)">&#10094;</a>
         <a class="next" onclick="plusSlides(1)">&#10095;</a>
         
         <div class="dots-container">
            ${dotsHtml}
         </div>
    `;

    // Initialize Gallery Logic
    if (typeof window.showSlides === 'function') {
      window.slideIndex = 1;
      window.showSlides(1);
      if (typeof window.startAutoSlide === 'function') window.startAutoSlide();
    } else {
      // Fallback: Dynamically load gallery.js if missing
      const script = document.createElement('script');
      script.src = '/scripts/gallery.js';
      script.onload = () => {
        if (window.initGallery) window.initGallery();
      };
      document.body.appendChild(script);
    }

  } catch (error) {
    console.warn("Erro ao carregar galeria:", error);
  }
}

// Add to onload chain
const originalOnload = window.onload;
window.onload = function () {
  if (originalOnload) originalOnload();
  loadRecentGallery();
};
