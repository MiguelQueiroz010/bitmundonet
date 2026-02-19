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

  // 2. Seamless Logic (Sticky Strip)
  const navStrip = document.querySelector(".nav-bar-strip");

  if (navbar && head && navStrip) {
    // When the scroll passes the banner height (threshold), we fix the strip
    if (scrollPos > threshold && !isFixed) {
      isFixed = true;

      // Fix the strip to the top
      navStrip.style.position = "fixed";
      navStrip.style.top = "0";
      navStrip.style.left = "0";
      navStrip.style.width = "100%";
      navStrip.style.zIndex = "1000";
      navStrip.style.boxShadow = "0 4px 20px rgba(0,0,0,0.5)"; // Add shadow for visibility

      // Add padding to the parent container to prevent content jump
      // transform the navbar container into a placeholder of the same height as the strip
      navbar.style.paddingBottom = navStripHeight + "px";

      document.body.classList.add("nav-scrolled");

    } else if (scrollPos <= threshold && isFixed) {
      isFixed = false;

      // Reset strip to normal flow
      navStrip.style.position = "relative";
      navStrip.style.top = "auto";
      navStrip.style.left = "auto";
      navStrip.style.width = "100%";
      navStrip.style.boxShadow = "none";

      // Remove placeholder padding
      navbar.style.paddingBottom = "0";

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
  const navStrip = document.querySelector(".nav-bar-strip");

  if (!dropdownMenu) return;

  const isActive = dropdownMenu.classList.contains("active");

  if (navStrip) {
    navStrip.style.transition = "opacity 0.3s ease, visibility 0.3s ease";
  }

  if (isActive) {
    // Closing
    dropdownMenu.classList.remove("active");
    document.body.style.overflow = "auto";
    if (mobileToggle) mobileToggle.style.display = "block";
    if (youtubeGallery) youtubeGallery.style.display = "inline";

    // Restore Navbar
    if (navStrip) {
      navStrip.style.opacity = "1";
      navStrip.style.visibility = "visible";
    }
    // Restore dropdown position
    dropdownMenu.style.top = "";
    dropdownMenu.style.height = "";
    dropdownMenu.style.paddingTop = "";
  }
  else {
    // Opening
    dropdownMenu.classList.add("active");
    document.body.style.overflow = "hidden";
    if (mobileToggle) mobileToggle.style.display = "none";
    if (youtubeGallery) youtubeGallery.style.display = "none";

    // Hide Navbar
    if (navStrip) {
      navStrip.style.opacity = "0";
      navStrip.style.visibility = "hidden";
    }
    // Expand dropdown to cover screen
    dropdownMenu.style.top = "0";
    dropdownMenu.style.height = "100vh";
    // Add safer padding for the close button
    dropdownMenu.style.paddingTop = "2rem";
  }
}