/**
 * BitMundo Unified AJAX Router (PJAX Engine)
 * Seamlessly loads all site pages via AJAX without full browser reloads.
 */

(function () {
  'use strict';

  // Create progress bar element
  function createProgressBar() {
    let bar = document.getElementById('pjax-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pjax-progress-bar';
      document.body.appendChild(bar);
    }
    return bar;
  }

  function setProgress(percentage) {
    const bar = createProgressBar();
    bar.classList.add('active');
    bar.style.width = percentage + '%';
    if (percentage >= 100) {
      setTimeout(() => {
        bar.style.opacity = '0';
        setTimeout(() => {
          bar.classList.remove('active');
          bar.style.width = '0%';
          bar.style.opacity = '1';
        }, 400);
      }, 200);
    }
  }

  // Get canonical container to swap across all pages
  function getContainer(doc = document) {
    return doc.querySelector('#project-container') ||
           doc.querySelector('main.container') ||
           doc.querySelector('.container') ||
           doc.querySelector('main');
  }


  // Check if link is an internal page link
  function isInternalPageLink(urlStr, targetAttr) {
    if (!urlStr || targetAttr === '_blank') return false;
    if (urlStr.startsWith('#') || urlStr.startsWith('javascript:') || urlStr.startsWith('mailto:') || urlStr.startsWith('tel:')) return false;

    try {
      const url = new URL(urlStr, window.location.origin);
      if (url.origin !== window.location.origin) return false;

      // Ignore static assets / media / downloads
      const ignoreExts = ['.zip', '.rar', '.7z', '.bin', '.pkg', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.mp3', '.wav', '.pdf', '.xml', '.txt', '.swf'];
      const pathLower = url.pathname.toLowerCase();
      if (ignoreExts.some(ext => pathLower.endsWith(ext))) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  // Update active navbar item highlight
  function updateActiveNavbar(currentPathname) {
    const currentPath = currentPathname === '/' ? '/index.html' : currentPathname;
    const navLinks = document.querySelectorAll('.nav-item, #dropdown .nav-item');

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;

      const linkPath = href === '/' ? '/index.html' : href.split('?')[0];
      if (currentPath === linkPath || (currentPath === '/index.html' && linkPath === '/')) {
        link.classList.add('active');
        link.style.color = 'var(--primary)';
        link.style.background = 'rgba(255,255,255,0.1)';
      } else {
        link.classList.remove('active');
        link.style.color = '';
        link.style.background = '';
      }
    });
  }

  // Close mobile dropdown if active
  function closeMobileDropdown() {
    const dropdownMenu = document.getElementById("dropdown");
    if (dropdownMenu && dropdownMenu.classList.contains("active")) {
      if (typeof window.dropdown === 'function') {
        window.dropdown();
      } else {
        dropdownMenu.classList.remove("active");
        document.body.style.overflow = "auto";
      }
    }
  }

  // Re-execute inline scripts inside swapped container
  function executeContainerScripts(container) {
    if (!container) return;
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  // Sync page-specific <style> and <link rel="stylesheet"> from newDoc head
  function syncHeadStyles(newDoc) {
    if (!newDoc || !newDoc.head) return;

    // 1. Sync <link rel="stylesheet">
    const newLinks = newDoc.querySelectorAll('head link[rel="stylesheet"]');
    newLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !document.querySelector(`head link[href="${href}"]`)) {
        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.href = href;
        document.head.appendChild(newLink);
      }
    });

    // 2. Sync <style> elements
    const newStyles = newDoc.querySelectorAll('head style');
    newStyles.forEach(style => {
      const cssText = style.textContent || '';
      if (!cssText.trim()) return;

      let exists = false;
      document.querySelectorAll('head style').forEach(existingStyle => {
        if (existingStyle.textContent.trim() === cssText.trim()) {
          exists = true;
        }
      });

      if (!exists) {
        const newStyleElement = document.createElement('style');
        newStyleElement.textContent = cssText;
        document.head.appendChild(newStyleElement);
      }
    });
  }

  // Sync body-level modals (e.g. #game-modal)
  function syncBodyModals(newDoc) {
    const modalsToSync = ['game-modal'];
    modalsToSync.forEach(id => {
      const newModal = newDoc.getElementById(id);
      let curModal = document.getElementById(id);
      if (newModal) {
        if (!curModal) {
          document.body.appendChild(newModal.cloneNode(true));
        } else {
          curModal.innerHTML = newModal.innerHTML;
        }
      }
    });
  }

  // Trigger page-specific initializers dynamically
  async function triggerPageInit(urlPath) {
    let pathname = '/';
    try {
      pathname = new URL(urlPath || window.location.href, window.location.origin).pathname.toLowerCase();
    } catch (e) {
      pathname = (urlPath || '/').split('?')[0].toLowerCase();
    }

    try {
      if (pathname === '/' || pathname === '/index.html') {
        if (typeof window.initIndexPage !== 'function') {
          await import('/scripts/index.js');
        }
        if (typeof window.initIndexPage === 'function') {
          window.initIndexPage();
        }
      } else if (pathname === '/projetos.html' || pathname === '/project_view.html') {
        if (typeof window.initProjectsPage !== 'function') {
          await import('/scripts/projects_loader.js');
        }
        if (typeof window.initProjectsPage === 'function') {
          window.initProjectsPage();
        }
      } else if (pathname === '/library.html') {
        if (typeof window.initLibraryPage !== 'function') {
          await import('/scripts/library.js');
        }
        if (typeof window.initLibraryPage === 'function') {
          window.initLibraryPage();
        }
      } else if (pathname === '/tools.html') {
        if (typeof window.initToolsPage !== 'function') {
          await import('/scripts/tools.js');
        }
        if (typeof window.initToolsPage === 'function') {
          window.initToolsPage();
        }
      }
    } catch (err) {
      console.error('Error auto-importing page script for route:', pathname, err);
    }

    if (typeof window.w3IncludeHTML === 'function') {
      window.w3IncludeHTML();
    }

    updateActiveNavbar(pathname);
  }

  let isNavigating = false;

  async function navigate(url, pushHistory = true) {
    if (isNavigating) return;

    const targetUrl = new URL(url, window.location.origin).href;

    isNavigating = true;
    setProgress(30);

    const currentContainer = getContainer();

    if (currentContainer) {
      currentContainer.classList.add('pjax-container');
      currentContainer.classList.add('pjax-fade-out');
    }

    try {
      const response = await fetch(targetUrl, {
        headers: { 'X-PJAX': 'true' }
      });

      if (!response.ok) {
        window.location.href = targetUrl;
        return;
      }

      setProgress(70);

      const html = await response.text();
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, 'text/html');

      if (newDoc.title) {
        document.title = newDoc.title;
      }

      // Sync head stylesheets and page styles
      syncHeadStyles(newDoc);

      const newContainer = getContainer(newDoc);

      if (currentContainer && newContainer) {
        currentContainer.innerHTML = newContainer.innerHTML;
        currentContainer.className = newContainer.className;
        currentContainer.id = newContainer.id;

        Array.from(newContainer.attributes).forEach(attr => {
          currentContainer.setAttribute(attr.name, attr.value);
        });

        currentContainer.classList.add('pjax-container');
        currentContainer.classList.remove('pjax-fade-out');
        currentContainer.classList.add('pjax-fade-in');

        syncBodyModals(newDoc);
        executeContainerScripts(currentContainer);

        setTimeout(() => {
          currentContainer.classList.remove('pjax-fade-in');
        }, 300);
      } else {
        // Fallback if structure differs
        document.body.innerHTML = newDoc.body.innerHTML;
      }

      if (pushHistory) {
        history.pushState({ pjax: true, url: targetUrl }, newDoc.title || document.title, targetUrl);
      }

      window.scrollTo({ top: 0, behavior: 'instant' });
      closeMobileDropdown();
      setProgress(100);

      await triggerPageInit(targetUrl);

    } catch (err) {
      console.error('AJAX Router fetch error, falling back to location reload:', err);
      window.location.href = targetUrl;
    } finally {
      isNavigating = false;
    }
  }

  // Event listener for global clicks on links
  document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    const target = anchor.getAttribute('target');

    if (isInternalPageLink(href, target)) {
      e.preventDefault();
      navigate(href, true);
    }
  });

  // Handle browser back/forward buttons
  window.addEventListener('popstate', function (e) {
    navigate(window.location.href, false);
  });

  // Export Router globally
  window.AJAXRouter = {
    navigate: navigate,
    updateActiveNavbar: updateActiveNavbar,
    triggerPageInit: triggerPageInit
  };

  // Initial active navbar state check on load
  document.addEventListener('DOMContentLoaded', () => {
    updateActiveNavbar(window.location.pathname);
  });

})();
