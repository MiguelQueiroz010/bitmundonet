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
  var articles = xmlDoc.getElementsByTagName("article");
  var container = document.getElementsByClassName("container")[0];
 console.log(articles);
  for (var i = 0; i < articles.length; i++) {
    var article = articles[i];
    
    if (article.getAttribute("selected") == "true") {
      var title = article.getElementsByTagName("title")[0].textContent;
      var image = article.getElementsByTagName("image")[0].textContent;
      var content = article.getElementsByTagName("content")[0].textContent;
      var author = article.getElementsByTagName("author")[0].textContent;
      var date = article.getElementsByTagName("date")[0].textContent;

      // Split content by new lines and wrap each line in a <p> tag
      var contentParagraphs = content.split('\n').map(line => `<p>${line}</p>`).join('');

      var articleHTML = `
        <div class="article" style="display: flex; align-items: center; font-family: Arial, sans-serif;">
          <img src="${image}" alt="${title}" style="margin-right: 20px; width: 150px; height: auto;">
          <div>
        <h2 style="font-size: 24px; font-weight: bold;">${title}</h2>
        ${contentParagraphs}
        <p style="font-size: 14px; color: gray;">Author: ${author}</p>
        <p style="font-size: 14px; color: gray;">Date: ${date}</p>
          </div>
        </div>
      `;

      container.innerHTML += articleHTML;
    }
  }

}