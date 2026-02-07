import { dbPromise } from './db-context.js';
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { parseArticleTags, renderTopics } from "./utils.js";

window.onload = loadpb;

// PROGRESS BAR CONTROL
function loadpb() {
  var elem = document.getElementsByClassName('progress-bar');
  if (!elem.length) return;

  const ProgressCounter = elem[0].getAttribute("pcounter") || "0%";
  var text = document.getElementById("progress_num");
  document.documentElement.style.setProperty('--pbar_centage', ProgressCounter);
  document.getElementById("pbc").style.width = ProgressCounter;

  if (text) text.innerHTML = "Progresso: " + ProgressCounter;
  if (typeof showSlides === 'function') showSlides();
}

/**
 * LOAD ARTICLES FROM FIRESTORE
 */
export async function loadArticlesFromFirestore() {
  const db = await dbPromise;
  const container = document.getElementById("cont");
  if (!container) return;

  try {
    // We removed orderBy from the query to avoid requiring a manual index in Firestore.
    // Instead, we fetch and sort on the client-side.
    const q = query(
      collection(db, "articles"),
      where("selected", "==", true),
      orderBy("__name__", "desc"),
      limit(10)
    );

    const querySnapshot = await getDocs(q);
    container.innerHTML = ""; // Clear loader

    querySnapshot.forEach((doc) => {
      renderArticle({ ...doc.data(), id: doc.id }, container);
    });
  } catch (error) {
    console.error("Erro ao carregar artigos do Firestore:", error);
    container.innerHTML = "<p>Erro ao carregar publicações.</p>";
  }
}

/**
 * Standardized Article Tag Parser
 */
// parseArticleTags removed - now imported from utils.js

function renderArticle(a, container) {
  const title = a.title || "";
  const image = a.image || "";
  const content = a.content || "";
  const author = a.author || "Bit.Raiden";
  let date = a.date || "";

  // Handle potential ISO date or Firestore Timestamp
  if (date && date.includes('-') && date.length >= 10) {
    // Basic check for YYYY-MM-DD
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

  var articleHTML = `
    <div class="article glass-panel" style="margin-bottom: 3rem; padding: 2.5rem; text-align: ${align}; border: 1px solid rgba(255,255,255,0.05);">
        <div style="display: flex; flex-direction: column; gap: 2rem;">
            <div style="display: flex; align-items: center; gap: 2rem;">
                ${image ? `<img id="titlemage" src="${image}" alt="${title}" style="border-radius: var(--radius-md); ${imageStyle}">` : ''}
                <h2 style="color: var(--highlight); font-size: 2.0rem; margin: 0; text-transform: none; line-height: 1.2; flex: 1;">${title}</h2>
            </div>
            <div class="article-content" style="color: var(--text-main); font-size: 1.15rem; line-height: 1.8;">
                ${contentHtml}
            </div>
            <div style="margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; font-size: 0.95rem; color: var(--text-muted);">
                <span>Postado por: <strong style="color: var(--primary);">${author}</strong></span>
                <span>Publicado em: <strong>${date}</strong></span>
            </div>
        </div>
    </div>
  `;

  container.innerHTML += articleHTML;
}

// Expose to window for the manual trigger in HTML if needed, 
// though we usually call it in a module script block.
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
