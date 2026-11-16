// Loaded before main.js: any startup or unhandled error is written into the panel
// instead of leaving it blank, so problems can be reported with the exact text.
(function () {
  function line(text) {
    try { return require('./i18n.js').t('Texture Studio error: {0}', text); } catch (e) { return 'Texture Studio error: ' + text; }
  }
  function report(text) {
    try {
      var el = document.getElementById('message');
      if (!el) return;
      el.textContent = line(text);
      el.className = 'message error';
    } catch (e) { /* nothing else we can do */ }
  }
  window.rpforgeReport = report;
  window.addEventListener('error', function (e) { report((e && (e.message || (e.error && e.error.message))) || 'unknown error'); });
  window.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; report((r && r.message) || String(r)); });
})();
