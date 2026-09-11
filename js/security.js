/* Security & compliance helpers.
   Loaded FIRST (before js/sites.js and friends) so the console guard is in
   place before any app code runs. All handlers are attached here instead of
   inline attributes, which lets index.html ship a strict CSP (script-src 'self').
   This file performs no network requests and collects no data. */

(function () {
  // --- 1. Debug mode ---------------------------------------------------------
  // Console noise is muted in production. Re-enable permanently with
  // localStorage 'r34_debug' = '1' or per-session with ?debug=1 in the URL.
  // Errors and warnings are never muted - only verbose logs are.
  var debugEnabled = false;
  try {
    debugEnabled = location.search.indexOf('debug=1') !== -1 || localStorage.getItem('r34_debug') === '1';
  } catch (_) { /* storage unavailable */ }
  if (!debugEnabled) {
    ['log', 'debug', 'info'].forEach(function (level) {
      if (window.console && typeof window.console[level] === 'function') {
        window.console[level] = function () {};
      }
    });
  }
  window.IS_DEBUG = debugEnabled;

  // --- 2. Cookie / storage consent banner -----------------------------------
  // The app is intentionally offline-first: everything lives in localStorage /
  // IndexedDB on this device, nothing is uploaded. The banner informs users and
  // records their choice (as 'r34_consent') so it never shows again.
  function setConsent(value) {
    try { localStorage.setItem('r34_consent', value); } catch (_) { /* ignored */ }
  }
  function getConsent() {
    try { return localStorage.getItem('r34_consent'); } catch (_) { return null; }
  }
  function hideBanner() {
    var banner = document.getElementById('consent-banner');
    if (banner) banner.style.display = 'none';
  }
  function showBanner() {
    var banner = document.getElementById('consent-banner');
    if (banner) banner.style.display = 'flex';
  }

  function initConsentBanner() {
    if (getConsent()) { hideBanner(); return; }
    showBanner();
    var accept = document.getElementById('consent-accept');
    var decline = document.getElementById('consent-decline');
    if (accept) accept.addEventListener('click', function () { setConsent('accepted'); hideBanner(); });
    if (decline) decline.addEventListener('click', function () { setConsent('declined'); hideBanner(); });
  }

  // --- 3. Modal wiring (replaces previous inline onclick handlers) ----------
  function initReportModal() {
    var modal = document.getElementById('report-modal');
    if (!modal) return;
    function close() { modal.style.display = 'none'; }
    function open() { modal.style.display = 'flex'; }
    var closeBtn = document.getElementById('report-close');
    var cancelBtn = document.getElementById('report-cancel');
    var submitBtn = document.getElementById('report-submit');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (submitBtn) submitBtn.addEventListener('click', function () {
      close();
      if (typeof triggerToastNotification === 'function') {
        triggerToastNotification('Report submitted successfully. Thank you!');
      }
    });
    // Clicking the backdrop closes the modal.
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
  }

  function initProfileButton() {
    var profileBtn = document.getElementById('search-btn');
    var vaultNav = document.getElementById('nav-vault');
    if (!profileBtn || !vaultNav) return;
    profileBtn.addEventListener('click', function () { vaultNav.click(); });
  }

  function initFooterYear() {
    var el = document.getElementById('footer-year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  // --- 4. Boot --------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initConsentBanner();
      initReportModal();
      initProfileButton();
      initFooterYear();
    });
  } else {
    initConsentBanner();
    initReportModal();
    initProfileButton();
    initFooterYear();
  }
}());