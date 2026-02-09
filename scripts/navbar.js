// Navbar Scroll Logic (Seamless Fixed/Relative)
window.addEventListener('scroll', scrollFunction);

let bannerThreshold = 0;
let isFixed = false;

function scrollFunction() {
  const scrollPos = window.scrollY || document.documentElement.scrollTop;
  const navbar = document.getElementById("navbar");
  const head = document.getElementById("head");
  const backToTop = document.getElementById("back-to-top");

  if (head && head.offsetHeight > 0) {
    bannerThreshold = head.offsetHeight;
  }

  const threshold = bannerThreshold || 400;
  const navStripHeight = 70;

  // 1. Back-to-Top Button Synchronized
  if (backToTop) {
    if (scrollPos > threshold) {
      backToTop.classList.add("show");
      backToTop.style.opacity = "1";
      backToTop.style.visibility = "visible";
      backToTop.style.transform = "translateY(0) scale(1)";
    } else {
      backToTop.classList.remove("show");
      backToTop.style.opacity = "0";
      backToTop.style.visibility = "hidden";
      backToTop.style.transform = "translateY(30px) scale(0.7)";
    }
  }

  // 2. Seamless Logic (Padding-based jump compensation)
  if (navbar && head) {
    if (scrollPos > threshold && !isFixed) {
      isFixed = true;
      navbar.style.position = "fixed";
      navbar.style.top = "0";
      head.style.display = "none";
      document.body.style.paddingTop = navStripHeight + "px";
      document.body.classList.add("nav-scrolled");
    } else if (scrollPos < 10 && isFixed) { // Increased margin for stability
      isFixed = false;
      navbar.style.position = "relative";
      head.style.display = "block";
      document.body.style.paddingTop = "0";
      document.body.classList.remove("nav-scrolled");
    }
  }
}

// Initial check on load
window.addEventListener('load', scrollFunction);

// Global Click Handler for Back-to-Top
document.addEventListener('click', (e) => {
  if (e.target.closest('#back-to-top')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Admin Icon Click Handler
document.addEventListener('click', (e) => {
  if (e.target.closest('#admin-icon')) {
    window.location.href = '/admin_login.html';
  }
});




function dropdown() {
  const dropdownMenu = document.getElementById("dropdown");
  const mobileToggle = document.getElementById("mobile_dropdown");
  const mobileLogo = document.getElementById("mobile_logo");
  const youtubeGallery = document.getElementById("youtube-galleryM");

  if (!dropdownMenu) return;

  const isActive = dropdownMenu.classList.contains("active");

  if (isActive) {
    // Closing
    dropdownMenu.classList.remove("active");
    document.body.style.overflow = "auto";
    if (mobileToggle) mobileToggle.style.display = "block";
    if (youtubeGallery) youtubeGallery.style.display = "inline";
  }
  else {
    // Opening
    dropdownMenu.classList.add("active");
    document.body.style.overflow = "hidden";
    if (mobileToggle) mobileToggle.style.display = "none";
    if (youtubeGallery) youtubeGallery.style.display = "none";
  }
}