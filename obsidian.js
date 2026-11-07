/* obsidian.js — theme preference only; original app owns all motion. */
(function () {
  'use strict';
  var root = document.documentElement;
  var theme = 'dark';
  try { if (localStorage.getItem('companion-theme') === 'light') theme = 'light'; } catch (e) { /* Storage may be unavailable. */ }
  root.dataset.theme = theme;
  function start() {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'theme-toggle';
    button.className = 'btn btn-secondary theme-toggle';
    function update() {
      var light = root.dataset.theme === 'light';
      var label = light ? 'Switch to dark mode' : 'Switch to light mode';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = light
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
    }
    button.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('companion-theme', root.dataset.theme); } catch (e) { /* Theme still works without storage. */ }
      update();
    });
    update();
    document.body.appendChild(button);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
