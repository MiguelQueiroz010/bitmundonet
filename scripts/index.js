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
  if (slideIndex > slides.length) {slideIndex = 1}    
  for (i = 0; i < dots.length; i++) {
    dots[i].className = dots[i].className.replace(" active", "");
  }
  slides[slideIndex-1].style.display = "flex";  
  dots[slideIndex-1].className += " active";
  setTimeout(showSlides, 4000); // Change image every 2 seconds
}