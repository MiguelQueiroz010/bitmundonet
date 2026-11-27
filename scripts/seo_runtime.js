/**
 * Bit.Raiden - SEO/Ads runtime (browser).
 * Loaded on every public page through the global <head> block.
 *
 * 1. Consent banner (Google Consent Mode v2) - only when a Google tag is configured
 *    or the banner is enabled; the choice is kept in localStorage (bm_consent).
 * 2. Conversion-style events: patch/tool downloads and outbound download links.
 *    Safe no-op when no Google tag is configured.
 */
(function () {
  'use strict';

  var cfg = window.__BM_SEO || {};
  var STORAGE_KEY = 'bm_consent';

  function hasGtag() {
    return typeof window.gtag === 'function' && (cfg.ga4 || cfg.ads);
  }

  function readChoice() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
  }

  function applyConsent(granted) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ granted: !!granted, at: Date.now() })); } catch (e) { /* ignore */ }
    if (typeof window.gtag === 'function') {
      var v = granted ? 'granted' : 'denied';
      window.gtag('consent', 'update', {
        ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v
      });
    }
  }

  function removeBanner() {
    var el = document.getElementById('bm-consent-banner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showBanner() {
    if (document.getElementById('bm-consent-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'bm-consent-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Preferências de cookies');
    bar.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:99999',
      'max-width:760px', 'margin:0 auto', 'padding:14px 16px', 'border-radius:12px',
      'background:rgba(8,14,30,0.97)', 'border:1px solid rgba(255,255,255,0.15)',
      'color:#e5e7eb', 'font:14px/1.5 system-ui,sans-serif',
      'box-shadow:0 8px 30px rgba(0,0,0,0.5)', 'display:flex', 'flex-wrap:wrap',
      'gap:10px', 'align-items:center', 'justify-content:space-between'
    ].join(';');

    var text = document.createElement('span');
    text.style.flex = '1 1 320px';
    text.innerHTML = 'Usamos cookies para medir o uso do site e exibir anúncios. ' +
      'Veja a <a href="/privacidade.html" style="color:#7dd3fc;text-decoration:underline">Política de Privacidade</a>.';

    var actions = document.createElement('span');
    actions.style.cssText = 'display:flex;gap:8px';

    function mkBtn(label, primary, granted) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'cursor:pointer;border-radius:8px;padding:8px 14px;font:600 13px system-ui,sans-serif;' +
        (primary
          ? 'background:#38bdf8;color:#04121f;border:1px solid #38bdf8'
          : 'background:transparent;color:#e5e7eb;border:1px solid rgba(255,255,255,0.3)');
      b.addEventListener('click', function () { applyConsent(granted); removeBanner(); });
      return b;
    }

    actions.appendChild(mkBtn('Recusar', false, false));
    actions.appendChild(mkBtn('Aceitar', true, true));
    bar.appendChild(text);
    bar.appendChild(actions);
    document.body.appendChild(bar);
  }

  // Lets the footer/privacy page reopen the choice: window.bmOpenConsent()
  window.bmOpenConsent = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    showBanner();
  };

  function initBanner() {
    if (cfg.banner === false) return;
    if (readChoice()) return;
    showBanner();
  }

  // ---- Events ---------------------------------------------------------

  function currentProjectId() {
    var d = document.body && document.body.getAttribute('data-project-id');
    if (d) return d;
    var m = location.pathname.match(/\/projetos\/([^\/.]+)/);
    return m ? m[1] : '';
  }

  function track(name, params) {
    if (!hasGtag()) return;
    window.gtag('event', name, params || {});
  }

  function trackAdsConversion(label, params) {
    if (!hasGtag() || !cfg.ads || !label) return;
    var p = params || {};
    p.send_to = cfg.ads + '/' + label;
    window.gtag('event', 'conversion', p);
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!a) return;

    var inDownloads = a.classList.contains('download-link') || !!a.closest('#downloads');
    if (inDownloads) {
      var item = a.closest('.dir-item');
      var title = item ? ((item.querySelector('.dir-title span') || {}).textContent || '').trim() : '';
      var params = {
        project_id: currentProjectId(),
        file_version: title,
        link_url: a.href || '',
        page_path: location.pathname
      };
      track('patch_download', params);
      trackAdsConversion(cfg.adsDownloadLabel, { value: 1, currency: 'BRL' });
      return;
    }

    if (a.closest('.toolItem #link') || a.closest('#tool-actions')) {
      track('tool_open', { link_url: a.href || '', page_path: location.pathname });
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBanner);
  } else {
    initBanner();
  }
})();
