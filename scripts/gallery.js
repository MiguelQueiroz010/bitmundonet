// Fading Slideshow Logic (Restored & Improved)
let slideIndex = 1;
let slideInterval;

document.addEventListener("DOMContentLoaded", function () {
  showSlides(slideIndex);
  startAutoSlide();
});

function startAutoSlide() {
  slideInterval = setInterval(function () {
    plusSlides(1);
  }, 5000); // 5 seconds per slide
}

function plusSlides(n) {
  clearInterval(slideInterval);
  showSlides(slideIndex += n);
  startAutoSlide();
}

function currentSlide(n) {
  clearInterval(slideInterval);
  showSlides(slideIndex = n);
  startAutoSlide();
}

function showSlides(n) {
  let i;
  let slides = document.getElementsByClassName("mySlides");
  let dots = document.getElementsByClassName("dot");

  if (slides.length === 0) return;

  if (n > slides.length) { slideIndex = 1 }
  if (n < 1) { slideIndex = slides.length }

  // Reset all slides
  for (i = 0; i < slides.length; i++) {
    slides[i].classList.remove("active-slide");
    // We use CSS visibility/opacity instead of display:none to prevent layout shift if possible,
    // but if using absolute positioning (as planned), display:none is fine too, 
    // OR simpler: remove the 'active' class which handles the z-index/opacity.
    // For compatibility with the old CSS that might assume display manipulation:
    slides[i].style.display = "none";
  }

  // Reset dots
  if (dots.length > 0) {
    for (i = 0; i < dots.length; i++) {
      dots[i].classList.remove("active");
    }
  }

  // Activate current
  slides[slideIndex - 1].style.display = "block";
  slides[slideIndex - 1].classList.add("active-slide"); // Trigger fade in CSS

  if (dots.length > 0 && dots[slideIndex - 1]) {
    dots[slideIndex - 1].classList.add("active");
  }
}
