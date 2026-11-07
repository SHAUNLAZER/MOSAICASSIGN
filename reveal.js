/* Scroll-reveal: sections and cards fade up as they enter the screen. */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var SEL = '#app-content .section-header, #app-content .card, #app-content .results-bento-card, #app-content .milestone, #app-content .guide-speech-card, #app-content .wya-stat, #app-content .gtk-tile, #app-content .stat-card, #app-content .bm-svg, #app-content .metric, #site-footer > *, footer > *';
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('sr-in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  function scan() {
    var els = document.querySelectorAll(SEL);
    var groups = new Map();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains('sr') || el.closest('.drawer-panel, #intro-stage')) continue;
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) { el.classList.add('sr', 'sr-in'); continue; }
      var p = el.parentNode, n = groups.get(p) || 0; groups.set(p, n + 1);
      el.style.setProperty('--sr-delay', Math.min(n, 5) * 80 + 'ms');
      el.classList.add('sr');
      io.observe(el);
    }
  }
  var t = null;
  function queue() { if (t) return; t = setTimeout(function () { t = null; scan(); }, 60); }
  function start() {
    scan();
    var root = document.getElementById('app') || document.body;
    new MutationObserver(queue).observe(root, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
