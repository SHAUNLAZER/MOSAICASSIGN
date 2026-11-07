/* ============================================================
   bodymap.js — Body map + zoom transition for Progress Companion
   The Bodywise logo figure becomes the navigation. Each concern is
   a region on the body. Tapping one zooms into that region, fades
   to a clean screen, then hands over to the tracker.
   Vanilla JS, no dependencies, works offline.
   Loaded BEFORE app.js; reads app globals (Storage, Utils, CONTENT,
   scrollToSection, escHTML) lazily at call time.
   ============================================================ */

(function (root) {
  'use strict';

  // The logo figure, in a 447 x 447 box (same shape as icon.svg).
  var FIGURE_PATH = 'M 333 64 L 344 66 L 344 68 L 335 89 L 325 103 L 305 123 L 283 139 L 279 141 L 274 132 L 299 113 L 316 96 L 326 82 L 333 65 Z M 229 81 L 244 82 L 253 90 L 256 97 L 256 105 L 253 113 L 247 119 L 240 122 L 227 121 L 218 114 L 214 104 L 215 95 L 218 89 L 223 84 L 228 82 Z M 240 93 L 232 92 L 227 96 L 227 107 L 233 111 L 240 110 L 245 104 L 245 99 L 241 94 Z M 110 104 L 112 104 L 121 116 L 132 124 L 154 133 L 181 137 L 242 136 L 256 139 L 262 142 L 267 148 L 267 159 L 260 166 L 218 180 L 212 186 L 214 188 L 264 187 L 276 190 L 283 196 L 285 201 L 285 210 L 283 214 L 275 221 L 260 227 L 212 236 L 188 243 L 179 248 L 171 256 L 166 267 L 165 326 L 166 353 L 168 354 L 201 298 L 218 266 L 220 259 L 232 260 L 233 359 L 249 332 L 264 298 L 274 265 L 278 240 L 279 238 L 290 240 L 282 280 L 267 321 L 249 356 L 231 383 L 220 379 L 219 288 L 168 377 L 157 375 L 154 331 L 154 273 L 156 261 L 160 252 L 165 245 L 177 236 L 201 227 L 254 217 L 268 212 L 274 207 L 274 203 L 272 201 L 262 198 L 212 199 L 207 197 L 201 189 L 201 181 L 206 174 L 213 170 L 250 158 L 254 156 L 256 152 L 251 149 L 240 147 L 178 148 L 152 144 L 137 139 L 114 125 L 102 110 L 109 105 Z';

  // One entry per concern: where its pin sits on the figure (x, y) and the
  // square window (cx, cy, size) the camera zooms into. Sizes are in figure units.
  // label: [x, y, text-anchor] for the name drawn beside the pin.
  var REGIONS = [
    { id: 'hair',     label: 'Hair',               pin: [236, 87],  zoom: [236, 98, 96],   tag: [220, 84, 'end'] },
    { id: 'skin',     label: 'Face',               pin: [236, 113], zoom: [236, 106, 70],  tag: [254, 120, 'start'] },
    { id: 'bodyskin', label: 'Body Care',          pin: [160, 140], zoom: [165, 142, 130], tag: [150, 164, 'middle'] },
    { id: 'wellness', label: 'Health & Fitness',   pin: [279, 207], zoom: [262, 207, 130], tag: [294, 211, 'start'] },
    { id: 'pcos',     label: 'Winter Care',        pin: [182, 240], zoom: [188, 250, 120], tag: [168, 236, 'end'] },
    { id: 'period',   label: 'Sun Protection',     pin: [272, 292], zoom: [262, 292, 130], tag: [288, 296, 'start'] }
  ];
  var FULL_BOX = [0, 0, 447, 447];

  /* ---------- pure helpers (unit-tested) ---------- */

  function getRegion(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return REGIONS[REGIONS.length - 1]; // unknown concern falls back to wellness
  }

  // The viewBox [x, y, w, h] that frames a region.
  function getZoomBox(id) {
    var z = getRegion(id).zoom;
    return [z[0] - z[2] / 2, z[1] - z[2] / 2, z[2], z[2]];
  }

  function ease(t) { // easeInOutCubic
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpBox(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
  }

  // What a region should show for this profile. Only the concern the user is
  // tracking has live data; the others are "not tracking yet".
  function getRegionState(profile, id) {
    var U = root.Utils;
    var out = { id: id, active: false, pct: 0, streak: 0, day: 0, week: 0, checkedIn: false };
    var tracked = (profile && profile.concerns && profile.concerns.length) ? profile.concerns : (profile ? [profile.concern] : []);
    if (!profile || tracked.indexOf(id) < 0 || !U) return out;
    out.active = true;
    out.pct = U.getMonthProgress ? U.getMonthProgress(profile.checkins || []) : U.getConsistency(profile.checkins || [], profile.startDate, profile.paused).pct;
    out.streak = U.getStreak(profile.checkins || [], profile.paused);
    out.day = Math.max(1, U.daysBetween(profile.startDate, U.getToday()) + 1);
    out.week = U.getWeekNumber(profile.startDate);
    out.checkedIn = U.isCheckedInToday(profile);
    return out;
  }

  /* ---------- DOM helpers ---------- */

  function esc(s) {
    if (typeof root.escHTML === 'function') return root.escHTML(s);
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function labelFor(id) {
    var q = root.CONTENT && root.CONTENT.quiz && root.CONTENT.quiz.concerns;
    if (q) for (var i = 0; i < q.length; i++) if (q[i].value === id) return q[i].label;
    return getRegion(id).label;
  }

  // Small months still show movement: 0.9% reads as "1%", never "0%".
  function fmtPct(p) {
    var v = p * 100;
    if (v > 0 && v < 1) return '1%';
    return Math.round(v) + '%';
  }

  var PIN_SCALE = 0.8; // pins drawn 20% smaller so they sit inside the figure
  var RING_R = 12;
  var RING_C = 2 * Math.PI * RING_R;

  function pinHTML(region, st, interactive) {
    var x = region.pin[0], y = region.pin[1];
    var cls = 'bm-pin' + (st.active ? ' is-active' : '');
    var dash = (RING_C * st.pct).toFixed(2);
    var attrs = interactive
      ? ' role="button" tabindex="0" data-region="' + region.id + '" aria-label="' +
        esc(labelFor(region.id)) + (st.active ? ', tracking, ' + fmtPct(st.pct) + ' of this month done' : ', not tracking') + '"'
      : ' aria-hidden="true"';
    return '<g class="' + cls + '" transform="translate(' + x + ' ' + y + ') scale(' + PIN_SCALE + ')"' + attrs + '>' +
      '<circle class="bm-pin-hit" r="20"/>' +
      (st.active ? '<circle class="bm-pin-pulse" r="12"/>' : '') +
      '<circle class="bm-pin-track" r="' + RING_R + '"/>' +
      (st.active
        ? '<circle class="bm-pin-ring" r="' + RING_R + '" transform="rotate(-90)" stroke-dasharray="' + dash + ' ' + RING_C.toFixed(2) + '"/>'
        : '') +
      '<circle class="bm-pin-dot" r="' + (st.active ? 5.5 : 4) + '"/>' +
    '</g>';
  }

  function figureSVG(cls, profile, interactive, onlyRegion) {
    var pins = '';
    REGIONS.forEach(function (r) {
      if (onlyRegion && onlyRegion !== r.id) return;
      var st = getRegionState(profile, r.id);
      pins += pinHTML(r, st, interactive);
      if (interactive && r.tag) {
        pins += '<text class="bm-tag' + (st.active ? ' is-active' : '') + '" x="' + r.tag[0] + '" y="' + r.tag[1] + '" text-anchor="' + r.tag[2] + '" aria-hidden="true">' + esc(labelFor(r.id)) + '</text>';
      }
    });
    return '<svg class="' + cls + '" viewBox="' + FULL_BOX.join(' ') + '" xmlns="http://www.w3.org/2000/svg"' +
      (interactive ? ' role="group" aria-label="Body map"' : ' aria-hidden="true"') + '>' +
      '<path class="bm-figure" fill-rule="evenodd" d="' + FIGURE_PATH + '"/>' + pins + '</svg>';
  }

  /* ---------- the map section ---------- */

  function renderSection(container) {
    var profile = root.Storage ? root.Storage.load() : null;
    if (!profile) { container.innerHTML = ''; return; }
    var active = getRegionState(profile, profile.concern);
    var legend = '';
    REGIONS.forEach(function (r) {
      var st = getRegionState(profile, r.id);
      legend += '<li><button type="button" class="bm-legend-item' + (st.active ? ' is-active' : '') +
        '" data-region="' + r.id + '">' +
        '<span class="bm-legend-dot"></span>' +
        '<span class="bm-legend-label">' + esc(labelFor(r.id)) + '</span>' +
        '<span class="bm-legend-meta">' + (st.active ? fmtPct(st.pct) + ' of this month' : 'Not tracking') + '</span>' +
      '</button></li>';
    });

    container.innerHTML =
      '<div class="container"><div class="bm-wrap">' +
        '<div class="bm-copy">' +
          '<div class="bm-eyebrow">YOUR BODY MAP</div>' +
          '<h2 class="bm-title">Tap a part of the body to step into it.</h2>' +
          '<p class="bm-sub">The ring on a region fills as you complete your daily ritual. Each fully logged day adds about 4% of the month; partial days add their share.</p>' +
          '<ul class="bm-legend">' + legend + '</ul>' +
        '</div>' +
        '<div class="bm-figure-card" id="bm-figure-card">' +
          figureSVG('bm-svg', profile, true) +
        '</div>' +
      '</div></div>';

    var svg = container.querySelector('.bm-svg');
    function openFrom(id, trigger) {
      play(id, { sourceSvg: svg, trigger: trigger });
    }
    container.querySelectorAll('[data-region]').forEach(function (el) {
      el.addEventListener('click', function () { openFrom(el.getAttribute('data-region'), el); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFrom(el.getAttribute('data-region'), el); }
      });
    });
  }

  /* ---------- the zoom transition ---------- */

  var stageEl = null;
  var rafId = null;
  var closing = false;

  function cleanScreenHTML(profile, id) {
    var st = getRegionState(profile, id);
    var cfg = (root.Utils && root.Utils.getConcernConfig) ? root.Utils.getConcernConfig(id) : {};
    var label = labelFor(id);
    if (st.active) {
      var pct = fmtPct(st.pct).replace('%', '');
      return '<div class="bm-clean-card" role="document">' +
        '<div class="bm-eyebrow">' + esc(label.toUpperCase()) + '</div>' +
        '<div class="bm-big-ring" aria-hidden="true">' +
          '<svg viewBox="0 0 120 120"><circle class="bm-big-track" cx="60" cy="60" r="52"/>' +
          '<circle class="bm-big-fill" cx="60" cy="60" r="52" transform="rotate(-90 60 60)" ' +
            'stroke-dasharray="' + (2 * Math.PI * 52 * st.pct).toFixed(1) + ' ' + (2 * Math.PI * 52).toFixed(1) + '"/></svg>' +
          '<div class="bm-big-num">' + pct + '<span>%</span></div>' +
        '</div>' +
        '<h2 class="bm-clean-title">Day ' + st.day + ' &middot; Week ' + st.week + '</h2>' +
        '<p class="bm-clean-sub">' + (st.streak > 0 ? st.streak + '-day streak. ' : '') +
          (st.checkedIn ? 'You have checked in today.' : 'Today’s check-in is waiting.') + '</p>' +
        '<div class="bm-actions">' +
          '<button type="button" class="btn btn-primary" data-bm-go="' + (st.checkedIn ? 'results' : 'today') + '">' +
            (st.checkedIn ? 'See your results' : 'Open today’s check-in') + ' &rarr;</button>' +
          '<button type="button" class="btn btn-secondary" data-bm-back>Back to body</button>' +
        '</div></div>';
    }
    var early = cfg && cfg.earlyWindowWeeks, full = cfg && cfg.fullWindowWeeks;
    return '<div class="bm-clean-card" role="document">' +
      '<div class="bm-eyebrow">' + esc(label.toUpperCase()) + '</div>' +
      '<h2 class="bm-clean-title">You are not tracking this yet</h2>' +
      '<p class="bm-clean-sub">' + (early && full
        ? 'Changes here typically start showing around week ' + early + ' and settle by week ' + full + '.'
        : 'Set up a routine to start tracking this area.') + '</p>' +
      '<div class="bm-actions">' +
        '<button type="button" class="btn btn-primary" data-bm-go="setup" data-bm-concern="' + esc(id) + '">Track ' + esc(label.toLowerCase()) + ' too &rarr;</button>' +
        '<button type="button" class="btn btn-secondary" data-bm-back>Back to body</button>' +
      '</div></div>';
  }

  function close(afterFn) {
    if (!stageEl || closing) return;
    closing = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    var el = stageEl;
    var trigger = el._trigger;
    el.classList.add('is-leaving');
    root.document.removeEventListener('keydown', el._onKey, true);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (stageEl === el) stageEl = null;
      closing = false;
      root.document.body.classList.remove('bm-open');
      if (trigger && trigger.focus && root.document.body.contains(trigger)) { try { trigger.focus(); } catch (e) {} }
      if (typeof afterFn === 'function') afterFn();
    }, reducedMotion() ? 0 : 280);
  }

  /**
   * Play the zoom for a concern, then show the clean screen.
   * opts.sourceSvg  - the on-page map SVG to zoom out of (optional)
   * opts.trigger    - element to refocus afterwards (optional)
   * opts.onDone     - run after the stage closes via the primary action
   */
  function play(id, opts) {
    opts = opts || {};
    var doc = root.document;
    if (!doc || stageEl) return;
    var profile = root.Storage ? root.Storage.load() : null;
    var vw = root.innerWidth || 390, vh = root.innerHeight || 700;

    var from;
    if (opts.sourceSvg && opts.sourceSvg.getBoundingClientRect) {
      var r = opts.sourceSvg.getBoundingClientRect();
      from = { left: r.left, top: r.top, width: r.width, height: r.height };
    } else {
      var s = Math.min(vw, vh) * 0.7;
      from = { left: (vw - s) / 2, top: (vh - s) / 2, width: s, height: s };
    }
    var to = { left: 0, top: 0, width: vw, height: vh };

    var stage = doc.createElement('div');
    stage.id = 'bodymap-stage';
    stage.className = 'bm-stage';
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', labelFor(id));
    stage._trigger = opts.trigger || null;
    stage.innerHTML =
      figureSVG('bm-zoom-svg', profile, false, id) +
      '<div class="bm-clean" aria-live="polite">' + cleanScreenHTML(profile, id) + '</div>';
    doc.body.appendChild(stage);
    doc.body.classList.add('bm-open');
    stageEl = stage;
    closing = false;

    var svg = stage.querySelector('.bm-zoom-svg');
    var cleanBtns = stage.querySelectorAll('.bm-clean .btn');
    var skipBtn = stage.querySelector('.bm-skip');
    var showingClean = false;

    function frame(t) {
      var e = ease(t);
      var box = lerpBox(FULL_BOX, getZoomBox(id), e);
      svg.setAttribute('viewBox', box.join(' '));
      svg.style.left = lerp(from.left, to.left, e) + 'px';
      svg.style.top = lerp(from.top, to.top, e) + 'px';
      svg.style.width = lerp(from.width, to.width, e) + 'px';
      svg.style.height = lerp(from.height, to.height, e) + 'px';
      stage.style.setProperty('--bm-bg', String(Math.min(1, t * 1.6).toFixed(3)));
    }

    function showClean() {
      if (showingClean) return;
      showingClean = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      stage.classList.add('show-clean');
      if (skipBtn) skipBtn.style.display = 'none';
      if (cleanBtns[0]) setTimeout(function () { try { cleanBtns[0].focus(); } catch (e) {} }, reducedMotion() ? 0 : 350);
    }

    stage.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-bm-skip]')) { showClean(); return; }
      if (t.closest('[data-bm-back]')) { close(); return; }
      var go = t.closest('[data-bm-go]');
      if (go) {
        var target = go.getAttribute('data-bm-go');
        var trackId = go.getAttribute('data-bm-concern');
        close(function () {
          if (target === 'setup' && trackId && typeof root.openShelfSetupFor === 'function') root.openShelfSetupFor(trackId);
          else if (typeof root.scrollToSection === 'function') root.scrollToSection(target);
          if (typeof opts.onDone === 'function') opts.onDone(target);
        });
        return;
      }
      if (!showingClean && !t.closest('.bm-clean')) showClean(); // tap to skip the zoom
    });

    stage._onKey = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var items = stage.querySelectorAll('button');
      var vis = [];
      for (var i = 0; i < items.length; i++) if (items[i].offsetParent !== null) vis.push(items[i]);
      if (!vis.length) { e.preventDefault(); return; }
      var first = vis[0], last = vis[vis.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (vis.indexOf(doc.activeElement) < 0) { e.preventDefault(); first.focus(); }
    };
    doc.addEventListener('keydown', stage._onKey, true);

    if (skipBtn) try { skipBtn.focus(); } catch (e) {}

    if (reducedMotion()) {
      frame(1);
      stage.style.setProperty('--bm-bg', '1');
      showClean();
      return;
    }

    frame(0);
    var DURATION = 950, start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var t = (ts - start) / DURATION;
      if (t >= 1) { frame(1); showClean(); return; }
      frame(t);
      if (t > 0.72 && !stage.classList.contains('fading')) stage.classList.add('fading');
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  var BodyMap = {
    REGIONS: REGIONS,
    FULL_BOX: FULL_BOX,
    getRegion: getRegion,
    getZoomBox: getZoomBox,
    getRegionState: getRegionState,
    ease: ease,
    lerpBox: lerpBox,
    renderSection: renderSection,
    play: play,
    close: close
  };

  root.BodyMap = BodyMap;
  if (typeof module !== 'undefined' && module.exports) module.exports = BodyMap;
})(typeof window !== 'undefined' ? window : globalThis);
