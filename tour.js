/* ============================================================
   tour.js — Guided feature tour.
   The logo character spotlights each section in turn and says two
   lines about it: what it does, how it helps.
   - The page is locked while the tour runs (no clicks, scrolling or
     typing reach the site underneath).
   - Tap anywhere to go forward; tap the left side (or swipe right,
     or use Back / the left arrow key) to go back.
   - Each step frames the part of the section that matters, so a
     section is never cut off half-way.
   - The last step opens the Guide chat and explains it in place.
   Start or replay it with window.BWTour.start().
   ============================================================ */
(function () {
  'use strict';

  // fit: groups of selectors (inside the section) to frame, tried in order.
  // The first group whose combined box fits on screen wins.
  var STEPS = [
    {
      target: 'companion', full: true, title: 'Overview',
      fit: [['.hero-left', '.hero-right'], ['.hero-headline', '.hero-benefits-grid', '.hero-cta-group'], ['.hero-headline', '.hero-benefits-grid']],
      does: 'Your starting point. It shows what the companion does for you: know what is normal week by week, track the small changes that matter, and get gentle reminders.',
      helps: 'It sets honest expectations from day one, so the quiet early weeks feel normal instead of discouraging.'
    },
    {
      target: 'bodymap', full: true, title: 'Body Map',
      fit: [[':scope > .container'], ['.bm-title', '.bm-sub', '.bm-figure-card'], ['.bm-figure-card']],
      does: 'Tap a part of the body (hair, face, body care, health & fitness, winter care or sun protection) to step into it.',
      helps: 'The ring on the area you track fills as you complete your daily ritual, so you see the month\u2019s progress at a glance.'
    },
    {
      target: 'how', title: 'How It Works',
      fit: [['.how-header', '.how-panels-container'], ['.how-panels-container']],
      does: 'Three simple steps: set a goal (about a minute), check in daily (about 10 seconds), and track small markers week by week.',
      helps: 'It turns a big goal into small, easy habits you can actually keep.'
    },
    {
      target: 'setup', title: 'Your Bathroom Shelf',
      fit: [[':scope > .container'], ['.section-header', '.card'], ['.section-header', '.bee-character-card'], ['.section-header']],
      does: 'Set up your plan with Bee, then keep your Bodywise products on one shelf. Each product shows how often to use it and whether it is a morning or night step.',
      helps: 'Your daily ritual is built only from what you own, so you never see recommendations you don\u2019t need.'
    },
    {
      target: 'today', full: true, title: 'Daily Ritual', needsProfile: true,
      fit: [[':scope > .container'], ['.section-header', '.guide-speech-card', '.ritual-checklist-card'], ['.guide-speech-card', '.ritual-checklist-card'], ['.ritual-checklist-card']],
      does: 'Tick each product as you use it, then submit your day. Partial days still count, and you can take a rest day when you need one.',
      helps: 'Logging takes seconds, and your streak and weekly view grow without guilt on off days.'
    },
    {
      target: 'timeline', full: true, title: 'Your Timeline', needsProfile: true,
      fit: [['.section-header', '#timeline-informatics-card', '.timeline-scrubber-wrapper'], ['#timeline-informatics-card', '.timeline-scrubber-wrapper'], ['#timeline-informatics-card']],
      does: 'A 12-week timeline for your routine. It shows the phase you are in, what is happening beneath the surface and what to expect. Tap any week to look ahead.',
      helps: 'Knowing when first changes usually appear helps you stay patient instead of stopping too early.'
    },
    {
      target: 'mind', full: true, title: 'Mind Space',
      fit: [[':scope > .container'], ['.section-header', '.mind-space-grid'], ['.mind-space-grid'], ['.breathing-card']],
      does: 'A 60-second calm breathing exercise, a daily mindset note you can shuffle, and a quick mood check-in.',
      helps: 'Looking after your mind makes it easier to stay consistent on busy or low-energy days.'
    },
    {
      target: 'results', title: 'Your Results', needsProfile: true,
      fit: [[':scope > .container'], ['.section-header', '.results-consistency-card', '.results-verdict-card'], ['.results-consistency-card', '.results-verdict-card'], ['.results-consistency-card']],
      does: 'See your 28-day consistency, your current streak and a verdict that unlocks after two weekly reviews. Record small markers each week.',
      helps: 'Small, measurable changes show your progress long before big visible results.'
    },
    {
      target: 'nextstep', title: 'What Next?', needsProfile: true,
      fit: [[':scope > .container'], ['.section-header', '.burn-rate-card', '.outcomes-grid'], ['.burn-rate-card', '.outcomes-grid'], ['.burn-rate-card']],
      does: 'A pace meter counts the doses left in your main product, with an estimated empty date and a reorder date 5 days before. Below are three paths: keep going, adjust, or take a closer look.',
      helps: 'You won\u2019t run out mid-routine, and you always know your next move.'
    },
    {
      target: 'guide-floating-btn', title: 'Ask the Guide', chat: true,
      does: 'This is the Guide chat. Pick a topic (biological concerns, habits & motivation, or product & routine hacks) and tap a question for a quick answer.',
      helps: 'You get reassurance the moment a doubt comes up. It offers guidance only, not medical advice.'
    }
  ];

  var FIGURE_PATH = 'M 333 64 L 344 66 L 344 68 L 335 89 L 325 103 L 305 123 L 283 139 L 279 141 L 274 132 L 299 113 L 316 96 L 326 82 L 333 65 Z M 229 81 L 244 82 L 253 90 L 256 97 L 256 105 L 253 113 L 247 119 L 240 122 L 227 121 L 218 114 L 214 104 L 215 95 L 218 89 L 223 84 L 228 82 Z M 240 93 L 232 92 L 227 96 L 227 107 L 233 111 L 240 110 L 245 104 L 245 99 L 241 94 Z M 110 104 L 112 104 L 121 116 L 132 124 L 154 133 L 181 137 L 242 136 L 256 139 L 262 142 L 267 148 L 267 159 L 260 166 L 218 180 L 212 186 L 214 188 L 264 187 L 276 190 L 283 196 L 285 201 L 285 210 L 283 214 L 275 221 L 260 227 L 212 236 L 188 243 L 179 248 L 171 256 L 166 267 L 165 326 L 166 353 L 168 354 L 201 298 L 218 266 L 220 259 L 232 260 L 233 359 L 249 332 L 264 298 L 274 265 L 278 240 L 279 238 L 290 240 L 282 280 L 267 321 L 249 356 L 231 383 L 220 379 L 219 288 L 168 377 L 157 375 L 154 331 L 154 273 L 156 261 L 160 252 L 165 245 L 177 236 L 201 227 L 254 217 L 268 212 L 274 207 L 274 203 L 272 201 L 262 198 L 212 199 L 207 197 L 201 189 L 201 181 L 206 174 L 213 170 L 250 158 L 254 156 L 256 152 L 251 149 L 240 147 L 178 148 L 152 144 L 137 139 L 114 125 L 102 110 L 109 105 Z';

  var root = null, spot = null, card = null, charEl = null, pointerEl = null;
  var steps = [], idx = 0, active = false, rafId = 0, lastFocus = null;
  var inerted = [], openedChat = false, touchX = null, touchY = null;
  var PAD = 10;

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function targetEl(step) { return document.getElementById(step.target); }
  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function hasProfile() {
    try { return !!(window.Storage && window.Storage.load && window.Storage.load()); } catch (e) { return false; }
  }
  function headerBottom() {
    var h = document.getElementById('app-header');
    if (!h) return 0;
    return Math.max(0, h.getBoundingClientRect().bottom);
  }
  function bottomInset() {
    var tab = document.getElementById('tab-bar');
    var inset = 12;
    if (tab && isVisible(tab) && getComputedStyle(tab).position === 'fixed') inset += tab.getBoundingClientRect().height;
    return inset;
  }
  function chatPanel() {
    var ov = document.getElementById('app-drawer');
    if (!ov || !ov.classList.contains('active')) return null;
    return document.getElementById('drawer-panel');
  }

  // Union of the boxes of a selector group (viewport coords) or null.
  function groupRect(el, group) {
    var box = null;
    group.forEach(function (sel) {
      var nodes;
      try { nodes = el.querySelectorAll(sel); } catch (e) { nodes = []; }
      for (var i = 0; i < nodes.length; i++) {
        var r = nodes[i].getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (!box) box = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
        else {
          box.top = Math.min(box.top, r.top); box.left = Math.min(box.left, r.left);
          box.right = Math.max(box.right, r.right); box.bottom = Math.max(box.bottom, r.bottom);
        }
        if (sel.indexOf(':scope') === 0) break;
      }
    });
    return box;
  }

  // Free vertical space for the spotlight (between header and the card).
  function availArea() {
    var hb = headerBottom();
    var cardTop = window.innerHeight - bottomInset() - card.offsetHeight;
    var charSize = charEl.offsetWidth || 64;
    return { top: hb + 12, bottom: cardTop - charSize / 2 - 12 };
  }

  // Pick the framing for a step: the first group that fits, else the last one cropped.
  function frameFor(step) {
    var el = targetEl(step);
    if (!el) return null;
    var av = availArea();
    var room = av.bottom - av.top;
    var groups = (step.fit || []).concat([[':scope']]);
    var best = null;
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g][0] === ':scope' && groups[g].length === 1 ? null : groups[g];
      var r = group ? groupRect(el, group) : el.getBoundingClientRect();
      if (!r) continue;
      var h = r.bottom - r.top + PAD * 2;
      if (h <= room) return { group: group, fits: true };
      if (!best || h < best.h) best = { group: group, fits: false, h: h };
    }
    return best;
  }

  // Element that gets shrunk to fit when a whole section must be shown.
  function scaleEl(step) {
    var el = targetEl(step);
    return el ? (el.querySelector(':scope > .container') || el) : null;
  }
  function clearScale(step) {
    var e = step && step._scaled;
    if (!e) return;
    e.style.transform = ''; e.style.transformOrigin = '';
    setTimeout(function () { if (!e.style.transform) e.style.transition = ''; }, 450);
    step._scaled = null;
  }

  function currentRect(step) {
    if (step._scaled) return step._scaled.getBoundingClientRect();
    var el = targetEl(step);
    if (!el) return null;
    var f = step._frame;
    return f && f.group ? groupRect(el, f.group) : el.getBoundingClientRect();
  }

  function build() {
    root = document.createElement('div');
    root.className = 'bwt-root';
    root.innerHTML =
      '<div class="bwt-catch" aria-hidden="true"><span class="bwt-edge bwt-edge-back"></span><span class="bwt-edge bwt-edge-next"></span></div>' +
      '<div class="bwt-spot" aria-hidden="true"></div>' +
      '<div class="bwt-char" aria-hidden="true">' +
        '<div class="bwt-pointer"><span class="bwt-arrow"></span></div>' +
        '<div class="bwt-hop"><div class="bwt-badge">' +
          '<svg viewBox="0 0 447 447" fill="currentColor" fill-rule="evenodd"><path d="' + FIGURE_PATH + '"/></svg>' +
        '</div></div>' +
      '</div>' +
      '<div class="bwt-card" role="dialog" aria-modal="true" aria-labelledby="bwt-title" aria-describedby="bwt-lines">' +
        '<div class="bwt-bubble">' +
          '<div class="bwt-top">' +
            '<span class="bwt-step" aria-live="polite"></span>' +
            '<button type="button" class="bwt-skip">Skip tour</button>' +
          '</div>' +
          '<h3 class="bwt-title" id="bwt-title"></h3>' +
          '<div class="bwt-lines" id="bwt-lines"></div>' +
          '<div class="bwt-foot">' +
            '<div class="bwt-foot-left"><div class="bwt-dots" aria-hidden="true"></div>' +
            '<span class="bwt-hint">Tap anywhere for next \u00b7 left side to go back</span></div>' +
            '<div class="bwt-nav">' +
              '<button type="button" class="bwt-btn bwt-back">Back</button>' +
              '<button type="button" class="bwt-btn bwt-next">Next</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    spot = root.querySelector('.bwt-spot');
    card = root.querySelector('.bwt-card');
    charEl = root.querySelector('.bwt-char');
    pointerEl = root.querySelector('.bwt-pointer');

    root.querySelector('.bwt-skip').addEventListener('click', function (e) { e.stopPropagation(); stop(); });
    root.querySelector('.bwt-back').addEventListener('click', function (e) { e.stopPropagation(); back(); });
    root.querySelector('.bwt-next').addEventListener('click', function (e) { e.stopPropagation(); next(); });

    // Anywhere outside the card: left quarter goes back, the rest goes forward.
    root.addEventListener('click', function (e) {
      if (!active || card.contains(e.target)) return;
      e.preventDefault();
      if (e.clientX < window.innerWidth * 0.25 && idx > 0) back(); else next();
    });
    root.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; touchX = t.clientX; touchY = t.clientY;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchX, dy = t.clientY - touchY;
      touchX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault(); // swallow the synthetic click
        if (dx > 0) back(); else next();
      }
    });
  }

  function next() { if (idx >= steps.length - 1) stop(); else go(idx + 1); }
  function back() { if (idx > 0) go(idx - 1); }

  // Block page scrolling while the tour runs; the tour scrolls for you.
  function blockScroll(e) { if (active) e.preventDefault(); }

  function onKey(e) {
    if (!active) return;
    var k = e.key;
    var onCardBtn = card && card.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON';
    if (k === 'Escape') { stop(); }
    else if (k === 'ArrowRight' || k === 'PageDown' || k === 'ArrowDown') { next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') { back(); }
    else if ((k === 'Enter' || k === ' ') && onCardBtn) { return; } // let the focused button act
    else if (k === 'Enter' || k === ' ') { next(); }
    else if (k === 'Tab') {
      // Keep focus inside the tour card.
      var items = card.querySelectorAll('button:not([disabled])');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); }
      else if (!card.contains(document.activeElement)) { first.focus(); }
      else return;
    }
    else if (k === 'Home' || k === 'End') { /* swallow */ }
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  function lockPage() {
    inerted = [];
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === root || el.tagName === 'SCRIPT') return;
      if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); inerted.push(el); }
    });
    window.addEventListener('wheel', blockScroll, { passive: false, capture: true });
    window.addEventListener('touchmove', blockScroll, { passive: false, capture: true });
  }
  function unlockPage() {
    inerted.forEach(function (el) { el.removeAttribute('inert'); });
    inerted = [];
    window.removeEventListener('wheel', blockScroll, { capture: true });
    window.removeEventListener('touchmove', blockScroll, { capture: true });
  }

  function openChat() {
    if (chatPanel()) return;
    if (typeof window.openChatbotDrawer === 'function') {
      window.openChatbotDrawer();
      openedChat = true;
      // Drawer.open focuses its panel; keep focus on the tour.
      var n = root.querySelector('.bwt-next');
      try { n.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      // The new drawer node must be locked too.
      var ov = document.getElementById('app-drawer');
      if (ov && !ov.hasAttribute('inert')) { ov.setAttribute('inert', ''); inerted.push(ov); }
    }
  }
  function closeChat() {
    if (openedChat && window.Drawer && window.Drawer.isOpen && window.Drawer.isOpen()) {
      var ov = document.getElementById('app-drawer');
      if (ov) ov.removeAttribute('inert');
      try { window.Drawer.close(); } catch (e) { /* ignore */ }
      if (ov && active) ov.setAttribute('inert', '');
    }
    openedChat = false;
  }

  function renderStep() {
    var s = steps[idx];
    var n = steps.length;
    root.querySelector('.bwt-step').textContent = 'Step ' + (idx + 1) + ' of ' + n;
    root.querySelector('.bwt-title').textContent = s.title;
    var locked = s.needsProfile && !hasProfile();
    root.querySelector('.bwt-lines').innerHTML =
      '<p class="bwt-line"><span class="bwt-tag">What it does</span>' + esc(s.does) + '</p>' +
      '<p class="bwt-line"><span class="bwt-tag">How it helps</span>' + esc(s.helps) +
      (locked ? ' <em class="bwt-note">Unlocks once you finish your quick setup.</em>' : '') + '</p>';
    var dots = '';
    for (var i = 0; i < n; i++) dots += '<span class="bwt-dot' + (i === idx ? ' is-on' : (i < idx ? ' is-done' : '')) + '"></span>';
    root.querySelector('.bwt-dots').innerHTML = dots;
    root.querySelector('.bwt-back').disabled = idx === 0;
    var nx = root.querySelector('.bwt-next');
    nx.textContent = idx === n - 1 ? 'Finish' : 'Next';
    root.querySelector('.bwt-hint').textContent = idx === n - 1
      ? 'Tap anywhere to finish \u00b7 left side to go back'
      : 'Tap anywhere for next \u00b7 left side to go back';
    root.classList.toggle('is-chat', !!s.chat);
    root.classList.toggle('is-first', idx === 0);

    card.classList.remove('is-speaking');
    charEl.classList.remove('is-speaking');
    void card.offsetWidth;
    card.classList.add('is-speaking');
    charEl.classList.add('is-speaking');
    try { nx.focus({ preventScroll: true }); } catch (err) { nx.focus(); }
  }

  // Scroll so the chosen frame sits in the free area (centred when it fits).
  function scrollToStep(step) {
    if (step.chat) return;
    var el = targetEl(step);
    if (!el) return;
    if (step.full) {
      // Show the whole section: shrink it to fit the free space if needed.
      var se = scaleEl(step);
      se.style.transform = ''; 
      var fr = se.getBoundingClientRect();
      var fav = availArea();
      var froom = fav.bottom - fav.top - PAD * 2;
      var fh = fr.bottom - fr.top;
      var k = Math.min(1, froom / fh, (window.innerWidth - 24) / fr.width);
      se.style.transition = reduceMotion() ? '' : 'transform 0.45s cubic-bezier(.22,1,.36,1)';
      se.style.transformOrigin = 'top center';
      se.style.transform = k < 1 ? 'scale(' + k.toFixed(4) + ')' : '';
      step._scaled = se;
      var ftop = fr.top + window.pageYOffset - (fav.top + PAD + (froom - fh * k) / 2);
      window.scrollTo({ top: Math.max(0, ftop), behavior: reduceMotion() ? 'auto' : 'smooth' });
      return;
    }
    step._frame = frameFor(step);
    var r = currentRect(step);
    if (!r) return;
    var av = availArea();
    var h = r.bottom - r.top + PAD * 2;
    var room = av.bottom - av.top;
    var offset = h <= room ? av.top + (room - h) / 2 + PAD : av.top + PAD;
    var top = r.top + window.pageYOffset - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  function go(i) {
    if (i < 0 || i >= steps.length) return;
    var prev = steps[idx];
    if (prev) clearScale(prev);
    idx = i;
    var s = steps[idx];
    if (s.chat) openChat(); else if (prev && prev.chat) closeChat();
    renderStep();
    scrollToStep(s);
    // Re-measure once the page has settled (fonts, freshly rendered sections).
    if (s.full) {
      [450, 1100].forEach(function (ms) {
        setTimeout(function () { if (active && steps[idx] === s) scrollToStep(s); }, ms);
      });
    }
  }

  function placeSpot(x1, y1, x2, y2, radius, cropped) {
    spot.style.opacity = '1';
    spot.style.transform = 'translate(' + Math.round(x1) + 'px,' + Math.round(y1) + 'px)';
    spot.style.width = Math.round(x2 - x1) + 'px';
    spot.style.height = Math.round(y2 - y1) + 'px';
    spot.style.borderRadius = radius + 'px';
    spot.classList.toggle('is-cropped', !!cropped);
  }

  // Keep spotlight, card and arrow on target every frame (covers smooth scroll and resizes).
  function frame() {
    if (!active) return;
    var s = steps[idx];
    var vw = window.innerWidth, vh = window.innerHeight;
    var hb = headerBottom();
    var bi = bottomInset();
    var ch = card.offsetHeight;
    var charSize = charEl.offsetWidth || 64;
    var cardLeft, cardTop, cardW;
    var x1, y1, x2, y2, cropped = false, radius = 20;

    if (s.chat) {
      var panel = chatPanel();
      if (panel) {
        // The explanation sits inside the chat panel, at its bottom edge.
        var pr = panel.getBoundingClientRect();
        cardW = Math.min(pr.width - 24, 620);
        card.style.width = cardW + 'px';
        ch = card.offsetHeight;
        cardLeft = pr.left + (pr.width - cardW) / 2;
        cardTop = Math.min(pr.bottom, vh) - ch - 12;
        x1 = pr.left - 4; y1 = pr.top - 4; x2 = pr.right + 4; y2 = Math.min(pr.bottom, vh) + 4;
        radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 20;
        placeSpot(x1, y1, x2, y2, radius + 4, false);
      } else {
        spot.style.opacity = '0';
        card.style.width = '';
        cardW = card.offsetWidth;
        cardLeft = (vw - cardW) / 2;
        cardTop = vh - bi - ch;
      }
    } else {
      card.style.width = '';
      cardW = card.offsetWidth;
      cardLeft = (vw - cardW) / 2;
      cardTop = vh - bi - ch;
      var r = currentRect(s);
      if (r) {
        var av = availArea();
        x1 = Math.max(8, r.left - PAD); x2 = Math.min(vw - 8, r.right + PAD);
        y1 = r.top - PAD; y2 = r.bottom + PAD;
        if (y1 < av.top) { y1 = av.top; cropped = true; }
        if (y2 > av.bottom) { y2 = av.bottom; cropped = true; }
        if (y2 - y1 < 40) y2 = y1 + 40;
        placeSpot(x1, y1, x2, y2, radius, cropped);
      } else {
        spot.style.opacity = '0';
      }
    }
    card.style.left = Math.round(cardLeft) + 'px';
    card.style.top = Math.round(cardTop) + 'px';

    // Character perches on the card's top-left corner.
    var charX = cardLeft + 10, charY = cardTop - charSize / 2;
    charEl.style.left = Math.round(charX) + 'px';
    charEl.style.top = Math.round(charY) + 'px';

    if (x1 !== undefined && spot.style.opacity === '1') {
      var cx = charX + charSize / 2, cy = charY + charSize / 2;
      var tx = Math.min(Math.max(cx + 80, x1 + 40), x2 - 40);
      var ty = s.chat ? (y1 + 80) : Math.max(y1 + 24, Math.min(cy - 120, y2 - 24));
      var ang = Math.atan2(ty - cy, tx - cx) * 180 / Math.PI;
      pointerEl.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
      charEl.style.setProperty('--bwt-lean', (tx < cx ? -8 : 8) + 'deg');
    }
    rafId = requestAnimationFrame(frame);
  }

  function flyInFromLogo() {
    if (reduceMotion() || !charEl.animate) return;
    var logo = document.querySelector('#brand-logo .guide-avatar-badge');
    var from = logo && isVisible(logo) ? logo.getBoundingClientRect() : null;
    var to = charEl.getBoundingClientRect();
    var kf;
    if (from && to.width) {
      var dx = (from.left + from.width / 2) - (to.left + to.width / 2);
      var dy = (from.top + from.height / 2) - (to.top + to.height / 2);
      var sc = from.width / to.width;
      kf = [
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')', opacity: 0.4 },
        { transform: 'translate(' + dx * 0.4 + 'px,' + (dy * 0.4 - 40) + 'px) scale(1.1)', opacity: 1, offset: 0.6 },
        { transform: 'none', opacity: 1 }
      ];
    } else {
      kf = [{ transform: 'translateX(120vw)', opacity: 0 }, { transform: 'none', opacity: 1 }];
    }
    charEl.animate(kf, { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' });
  }

  var onDone = null;
  function start(opts) {
    opts = opts || {};
    if (active) stop(true);
    onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
    if (window.Drawer && typeof window.Drawer.isOpen === 'function' && window.Drawer.isOpen()) {
      try { window.Drawer.close(); } catch (err) { /* ignore */ }
    }
    steps = STEPS.filter(function (s) {
      if (s.chat) return !opts.skipChat && typeof window.openChatbotDrawer === 'function';
      return isVisible(targetEl(s));
    });
    // Follow the page order so the tour always moves down the page.
    var page = steps.filter(function (s) { return !s.chat; });
    page.sort(function (a, b) {
      return targetEl(a).compareDocumentPosition(targetEl(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    steps = page.concat(steps.filter(function (s) { return s.chat; }));
    if (!steps.length) return;
    if (!root) build();
    lastFocus = document.activeElement;
    active = true;
    idx = 0;
    openedChat = false;
    document.documentElement.classList.add('bwt-on');
    root.classList.add('is-open');
    lockPage();
    document.addEventListener('keydown', onKey, true);
    go(0);
    cancelAnimationFrame(rafId);
    frame();
    flyInFromLogo();
  }

  function stop(silent) {
    if (!active) return;
    closeChat();
    steps.forEach(clearScale);
    active = false;
    if (charEl) { charEl.style.left = ''; charEl.style.top = ''; }
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKey, true);
    unlockPage();
    document.documentElement.classList.remove('bwt-on');
    if (root) root.classList.remove('is-open', 'is-chat');
    try { localStorage.setItem('bwc_tour_seen', 'true'); } catch (err) { /* ignore */ }
    if (!silent && lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    }
    var cb = onDone; onDone = null;
    if (cb) setTimeout(cb, 350);
  }

  // Always-on floating character button to start or replay the tour.
  function buildFab() {
    if (document.getElementById('bwt-fab')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'bwt-fab';
    b.className = 'bwt-fab';
    b.setAttribute('aria-label', 'Start the feature tour');
    b.innerHTML =
      '<span class="bwt-fab-badge" aria-hidden="true">' +
        '<svg viewBox="0 0 447 447" fill="currentColor" fill-rule="evenodd"><path d="' + FIGURE_PATH + '"/></svg>' +
      '</span>' +
      '<span class="bwt-fab-label">Tour</span>';
    b.addEventListener('click', function () { start(); });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildFab);
  else buildFab();

  window.BWTour = { start: start, stop: stop, next: next, back: back, isActive: function () { return active; } };
})();
