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

let slideIndex = 0;


function showSlides() {
  let i;
  let slides = document.getElementsByClassName("mySlides");
  let dots = document.getElementsByClassName("dot");
  for (i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  slideIndex++;
  if (slideIndex > slides.length) { slideIndex = 1 }
  for (i = 0; i < dots.length; i++) {
    dots[i].className = dots[i].className.replace(" active", "");
  }
  slides[slideIndex - 1].style.display = "flex";
  dots[slideIndex - 1].className += " active";
  setTimeout(showSlides, 4000); // Change image every 2 seconds
}
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

      // Convert plain text links to hyperlinks
      contentParagraphs = contentParagraphs.replace(/<p>(.*?)<\/p>/g, (match, p1) => {
        return `<p>${p1.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>')}</p>`;
      });

      var articleHTML = `
        <div class="article" style="display: flex; align-items: center; font-family: Arial, sans-serif; border: 1px solid; border-image: linear-gradient(to right, red, yellow) 1; text-align: ${align};">
          <img id="titlemage" src="${image}" alt="${title}" style="margin-right: 20px; ${imageStyle}">
          <div style="display: flex; flex-direction: column;">
        <h2 style="
        border-image: none;
        border-color: blue;
        font-size: 24px; font-weight: bold;">${title}</h2>
        ${contentParagraphs.replace(/<p>/g, '<p style="margin: 5px 0;">')}
        <p style="margin: 5px 0; font-size: 14px; color: gray;">Author: ${author}</p>
        <p style="margin: 5px 0;font-size: 14px; color: gray;">Date: ${date}</p>
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

document.addEventListener("DOMContentLoaded", function() {

  const element = document.getElementById("bible");

  if (element) {

    const r = Math.floor(Math.random() * 256);

    const g = Math.floor(Math.random() * 256);

    const b = Math.floor(Math.random() * 256);

    element.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.8)`;

  }

});