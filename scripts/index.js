window.onload = loadpb;

//PROGRESS BAR CONTROL
function loadpb() {
  var elem = document.getElementsByClassName('progress-bar');
  ProgressCounter = elem[0].getAttribute("pcounter");
  var text = document.getElementById("progress_num");
  document.documentElement.style
    .setProperty('--pbar_centage', ProgressCounter);
  document.getElementById("pbc").style.width = ProgressCounter;

  text.innerHTML = "Progresso: " + ProgressCounter;
  showSlides();
}

// Slideshow logic moved to gallery.js
// index.js now keeps only progress bar and XML loader logic.
/* LOAD ARTICLES XML */
var xmlDoc = null;

function readXml(xmlFile) {
  if (typeof window.DOMParser != "undefined") {
    xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", xmlFile, false);
    if (xmlhttp.overrideMimeType) {
      xmlhttp.overrideMimeType('text/xml');
    }
    xmlhttp.send();
    xmlDoc = xmlhttp.responseXML;
  }
  else {
    xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
    xmlDoc.async = "false";
    xmlDoc.load(xmlFile);
  }

  getArticle(xmlDoc);
}
function getArticle(xmlDoc) {
  var articles = xmlDoc.getElementsByTagName("article");
  var container = document.getElementById("cont");
  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];

    if (article.getAttribute("selected") == "true") {
      var title = article.getElementsByTagName("title")[0].textContent;
      var image = article.getElementsByTagName("image")[0].textContent;
      var imageElement = article.getElementsByTagName("image")[0];
      var imageStyle = imageElement.getAttribute("style");
      var content = article.getElementsByTagName("content")[0].textContent;
      var author = article.getElementsByTagName("author")[0].textContent;
      var date = article.getElementsByTagName("date")[0].textContent;

      // Split content by new lines and wrap each line in a <p> tag
      var contentParagraphs = content.split('\n').map(line => `<p>${line}</p>`).join('');
      contentParagraphs = contentParagraphs.replace(/\(color\s*=\s*"(.*?)"\)/g, '<span style="color:$1">');
      contentParagraphs = contentParagraphs.replace("(/color)", '</span>');

      contentParagraphs = contentParagraphs.replace("(strong)", '<strong>');
      contentParagraphs = contentParagraphs.replace("(/strong)", '</strong>');

      contentParagraphs = contentParagraphs.replace(/\(font-size\s*=\s*"(.*?)"\)/g, '<span style="font-size:$1">');
      contentParagraphs = contentParagraphs.replace(/\(\/font-size\)/g, '</span>');

      contentParagraphs = contentParagraphs.replace(/\(image\s*(.*?)\s*=\s*"(.*?)"\)(.*?)\(\/image\)/g, '<img class="resp" $1="$2" src="$3" alt="Image" style="max-width: 100%; height: auto;">');

      var align = article.getElementsByTagName("image")[0].getAttribute("align") || "left";

      // Ensure images within content are in separate paragraphs and apply styles
      contentParagraphs = contentParagraphs.replace(/\(image\s*(.*?)\s*=\s*"(.*?)"\)(.*?)\(\/image\)/g, '<p style="$1"><img class="resp" src="$2" alt="Image" style="max-width: 100%; height: auto;"></p>');

      // --- Advanced Hybrid Video Embedding (YouTube & Streamable) ---
      // Supports: "Description: URL" or "URL : Description"
      // Consumes the colon and places the description as header ABOVE the video.
      const vPattern = /(?:<p>)?\s*(?:([^:<>\n]+):\s*)?(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|streamable\.com\/)([a-zA-Z0-9_-]+))(?:\s*:\s*([^<>\n]+))?\s*(?:<\/p>)?/gi;

      contentParagraphs = contentParagraphs.replace(vPattern, (match, prefix, url, id, suffix) => {
        const isStreamable = url.includes('streamable.com');
        const embedUrl = isStreamable ? `https://streamable.com/e/${id}` : `https://www.youtube.com/embed/${id}`;

        let title = (prefix || suffix || "").trim();
        if (title.length < 3 || title.includes('http')) title = "";

        const titleHtml = title ? `<p style="margin-bottom: 0.8rem; font-weight: 700; color: var(--highlight); font-size: 1.1rem; border-left: 3px solid var(--highlight); padding-left: 12px; text-transform: uppercase;">${title}</p>` : '';

        return `
            <div class="video-container" style="margin-top: 1rem; margin-bottom: 2.5rem; user-select: none; -webkit-user-select: none;">
                ${titleHtml}
                <div class="video-wrapper">
                    <iframe src="${embedUrl}" frameborder="0" allowfullscreen style="outline: none;"></iframe>
                </div>
            </div>`;
      });

      // 3. Convert Standalone Discord Invite links to interactive cards
      const discordPattern = /<p>\s*(https?:\/\/(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9_-]+))\s*<\/p>/gi;
      let discordCardCount = 0;

      contentParagraphs = contentParagraphs.replace(discordPattern, (match, url, code) => {
        discordCardCount++;
        const cardId = `discord-card-${Date.now()}-${discordCardCount}`;

        // Start the async fetch immediately
        updateDiscordBanner(code, cardId);

        return `
            <div id="${cardId}" class="discord-invite-card glass-panel" style="margin: 1.5rem 0; padding: 1.2rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid rgba(88, 101, 242, 0.4); background: rgba(88, 101, 242, 0.1); border-radius: var(--radius-md); flex-wrap: wrap; position: relative; overflow: hidden; transition: all 0.3s ease;">
                <div class="discord-banner-bg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background-size: cover; background-position: center; opacity: 0.2; transition: opacity 0.5s ease;"></div>
                <div style="display: flex; align-items: center; gap: 1rem; min-width: 200px; position: relative; z-index: 1;">
                    <div class="discord-icon-wrapper" style="background: #5865F2; padding: 8px; border-radius: 10px; flex-shrink: 0; box-shadow: 0 0 15px rgba(88, 101, 242, 0.3); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <svg class="discord-logo-svg" width="24" height="24" viewBox="0 0 127.14 96.36" fill="white">
                            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.4,80.21a105.73,105.73,0,0,0,32.17,16.15,77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c3.39-29.09-5.46-52.74-23.74-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
                        </svg>
                    </div>
                    <div>
                        <p class="discord-server-name" style="margin: 0; font-weight: 700; color: #fff; font-size: 1rem; line-height: 1.2;">Comunidade no Discord</p>
                        <p style="margin: 0; font-size: 0.8rem; color: #9ca3af; font-family: monospace;">discord.gg/${code}</p>
                    </div>
                </div>
                <a href="https://discord.gg/${code}" target="_blank" style="background: #248046; color: white !important; padding: 0.7rem 1.4rem; border-radius: 4px; font-weight: 700; text-decoration: none !important; font-size: 0.85rem; transition: all 0.2s; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.2); position: relative; z-index: 1;">ENTRAR NO SERVIDOR</a>
            </div>`;
      });

      // 4. Convert remaining plain text links to hyperlinks (Avoid those already in tags)
      // We look for URLs that are NOT immediately preceded by " or '
      contentParagraphs = contentParagraphs.replace(/(?<!=["'])https?:\/\/[^\s<]+/gi, (match) => {
        // Skip links already processed into specialized cards/iframes
        if (match.includes('/embed/') || match.includes('streamable.com/e/') || match.includes('discord.gg/')) return match;
        return `<a href="${match}" target="_blank">${match}</a>`;
      });

      var articleHTML = `
        <div class="article glass-panel" style="margin-bottom: 3rem; padding: 2.5rem; text-align: ${align}; border: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; flex-direction: column; gap: 2rem;">
            
            <div style="display: flex; align-items: center; gap: 2rem;">
                <img id="titlemage" src="${image}" alt="${title}" style="border-radius: var(--radius-md); ${imageStyle}">
                <h2 style="color: var(--highlight); font-size: 2.0rem; margin: 0; text-transform: none; line-height: 1.2; flex: 1;">${title}</h2>
            </div>

            <div style="display: flex; flex-direction: column; flex: 1;">
              <div class="article-content" style="color: var(--text-main); font-size: 1.15rem; line-height: 1.8;">
                ${contentParagraphs.replace(/<p>/g, '<p style="margin-bottom: 1.5rem;">')}
              </div>
              
              <div style="margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.08); 
                   display: flex; justify-content: space-between; font-size: 0.95rem; color: var(--text-muted);">
                <span>Postado por: <strong style="color: var(--primary);">${author}</strong></span>
                <span>Publicado em: <strong>${date}</strong></span>
              </div>
            </div>
          </div>
        </div>
      `;

      container.innerHTML += articleHTML;

      // Add responsive styles
      var style = document.createElement('style');
      style.innerHTML = `
        @media (max-width: 600px) {
          .article {
        flex-direction: column;
        text-align: center;
          }
          #titlemage {
        width: 100% !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

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
          // Update Server Name
          const nameElem = card.querySelector('.discord-server-name');
          if (nameElem && guild.name) {
            nameElem.textContent = guild.name;
          }

          // Update Icon
          if (guild.icon) {
            const iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
            const iconWrapper = card.querySelector('.discord-icon-wrapper');
            if (iconWrapper) {
              iconWrapper.innerHTML = `<img src="${iconUrl}" alt="${guild.name}" style="width: 100%; height: 100%; object-fit: cover;">`;
              iconWrapper.style.padding = '0'; // Remove padding for the image logo
            }
          }

          // Update Banner if it exists
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
  } catch (error) {
    console.error("Erro ao buscar dados do Discord:", error);
  }
}

/*document.addEventListener("DOMContentLoaded", function () {

  const element = document.getElementById("bible");

  if (element) {

    const r = Math.floor(Math.random() * 256);

    const g = Math.floor(Math.random() * 256);

    const b = Math.floor(Math.random() * 256);

    element.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.9)`;

  }

});*/