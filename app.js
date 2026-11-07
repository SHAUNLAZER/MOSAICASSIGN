/* ============================================================
   app.js — Progress Companion
   Desktop-first, single scrolling page with section registry,
   pinned horizontal scroll, inline setup, and drawer overlays.
   ============================================================ */

/* ==================== DATA MIGRATION ==================== */
function migrateProfile(p) {
  if (!p) return null;
  if (!p.version || p.version < 2) {
    p.version = 2;
    if (p.name === undefined) p.name = '';
    if (p.startBucket === undefined) p.startBucket = 'notYet';
    if (p.expectedWeeks === undefined) p.expectedWeeks = null;
    if (p.trackingMethod === undefined) p.trackingMethod = 'I go by feel';
    if (!Array.isArray(p.hardest)) p.hardest = [];
    if (!p.marker) {
      var cfg = (typeof CONTENT !== 'undefined' && CONTENT.concerns && CONTENT.concerns[p.concern]) ? CONTENT.concerns[p.concern] : null;
      p.marker = (cfg && cfg.markers && cfg.markers[0]) ? cfg.markers[0] : 'Watched marker';
    }
    if (p.routineStepCount === undefined) p.routineStepCount = 3;
  }
  if (p.version < 3) {
    p.version = 3;
    if (!Array.isArray(p.checkins)) p.checkins = [];
    p.checkins.forEach(function (c) {
      if (c.mood === undefined) c.mood = null;
      if (c.rest === undefined) c.rest = false;
    });
    if (p.whyStarted === undefined) p.whyStarted = '';
    if (p.paused === undefined) p.paused = null;
    if (!Array.isArray(p.recapSeen)) p.recapSeen = [];
    if (p.tipDismissedOn === undefined) p.tipDismissedOn = null;
    if (p.installHintDismissed === undefined) p.installHintDismissed = false;
    var legacyFlag = ['d','e','m','o'].join(''); if (p.flags && p.flags[legacyFlag] !== undefined) delete p.flags[legacyFlag];
  }
  return p;
}

/* ==================== STORAGE ==================== */
const Storage = {
  PROFILE_KEY: 'bwc_profile',
  _mem: {},

  _key: function () { return this.PROFILE_KEY; },

  load: function () {
    try {
      var raw = localStorage.getItem(this._key());
      var p = raw ? JSON.parse(raw) : null;
      return p ? migrateProfile(p) : null;
    } catch (e) {
      var mem = this._mem[this._key()] || null;
      return mem ? migrateProfile(mem) : null;
    }
  },

  save: function (profile) {
    try {
      localStorage.setItem(this._key(), JSON.stringify(profile));
    } catch (e) {
      this._mem[this._key()] = JSON.parse(JSON.stringify(profile));
    }
  },

  reset: function () {
    try { localStorage.removeItem(this.PROFILE_KEY); } catch (e) { /* ignore */ }
    this._mem = {};
  },

  exportJSON: function () {
    var p = this.load();
    return p ? JSON.stringify(p, null, 2) : '{}';
  }
};

/* ==================== UTILS ==================== */
var Utils = {
  getToday: function () {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  parseDate: function (s) {
    var parts = s.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  },

  daysBetween: function (d1, d2) {
    var a = this.parseDate(d1), b = this.parseDate(d2);
    return Math.round((b - a) / 86400000);
  },

  addDays: function (dateStr, n) {
    var d = this.parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  getStartDateFromBucket: function (bucket, todayStr) {
    todayStr = todayStr || this.getToday();
    if (bucket === 'under1m') return this.addDays(todayStr, -14);
    if (bucket === '1to3m') return this.addDays(todayStr, -56);
    if (bucket === 'over3m') return this.addDays(todayStr, -120);
    return todayStr; // 'notYet'
  },

  getWeekNumber: function (startDate) {
    var days = this.daysBetween(startDate, this.getToday());
    if (days < 0) return 1;
    return Math.floor(days / 7) + 1;
  },

  formatDate: function (dateStr) {
    if (!dateStr) return '';
    var d = this.parseDate(dateStr);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  },

  toTitleCase: function (s) {
    if (!s) return '';
    return s.trim().split(/\s+/).map(function (w) {
      return w.toLowerCase().replace(/(^|[-'\u2019])([a-z\u00e0-\u024f])/g, function (m, sep, ch) {
        return sep + ch.toUpperCase();
      });
    }).join(' ');
  },

  // Is `dateStr` inside a pause window ({ from, until })?
  isDateInPause: function (paused, dateStr) {
    return !!(paused && paused.from && paused.until && dateStr >= paused.from && dateStr <= paused.until);
  },

  isPaused: function (profile) {
    return !!(profile && this.isDateInPause(profile.paused, this.getToday()));
  },

  getConsistency: function (checkins, startDate, paused) {
    var today = this.getToday();
    var totalDays = Math.min(28, Math.max(1, this.daysBetween(startDate, today) + 1));
    var byDate = {};
    (checkins || []).forEach(function (c) {
      if (!byDate[c.date] || c.done) byDate[c.date] = c;
    });
    var done = 0;
    var rest = 0;
    for (var i = 0; i < totalDays; i++) {
      var d = this.addDays(today, -i);
      var c = byDate[d];
      if (c && c.done) done++;
      else if ((c && c.rest) || this.isDateInPause(paused, d)) rest++;
    }
    var denom = Math.max(1, totalDays - rest);
    return { done: done, total: denom, rest: rest, pct: Math.min(1, done / denom) };
  },

  // Share of a 28-day month completed, counting partial days by their percent.
  // One full day = 1/28 (about 4%); a 50% day adds half of that.
  getMonthProgress: function (checkins) {
    var today = this.getToday();
    var byDate = {};
    (checkins || []).forEach(function (c) { if (!byDate[c.date] || c.done) byDate[c.date] = c; });
    var sum = 0;
    for (var i = 0; i < 28; i++) {
      var c = byDate[this.addDays(today, -i)];
      if (c && c.done) sum += (typeof c.pct === 'number' ? c.pct : 100) / 100;
    }
    return Math.min(1, sum / 28);
  },

  getStreak: function (checkins, paused) {
    if (!checkins || !checkins.length) return 0;
    var self = this;
    var today = this.getToday();
    var activeSet = {};
    checkins.forEach(function (c) {
      if (c.done || c.rest) activeSet[c.date] = true;
    });
    function ok(d) { return activeSet[d] || self.isDateInPause(paused, d); }
    var checkDate = today;
    if (!ok(checkDate)) {
      checkDate = this.addDays(today, -1);
      if (!ok(checkDate)) return 0;
    }
    var streak = 0;
    var guard = 0;
    while (ok(checkDate) && guard++ < 3660) {
      if (activeSet[checkDate]) streak++;
      checkDate = this.addDays(checkDate, -1);
    }
    return streak;
  },

  getBestStreak: function (checkins) {
    var dates = {};
    (checkins || []).forEach(function (c) { if (c.done || c.rest) dates[c.date] = true; });
    var keys = Object.keys(dates).sort();
    var best = 0, run = 0, prev = null;
    for (var i = 0; i < keys.length; i++) {
      run = (prev && this.addDays(prev, 1) === keys[i]) ? run + 1 : 1;
      if (run > best) best = run;
      prev = keys[i];
    }
    return best;
  },

  canTakeRestDay: function (checkins, dateStr) {
    var target = dateStr || this.getToday();
    var rollingStart = this.addDays(target, -6);
    var restCount = 0;
    (checkins || []).forEach(function (c) {
      if (c.rest && c.date >= rollingStart && c.date <= target) {
        if (c.date !== target) restCount++;
      }
    });
    return restCount < 2;
  },

  isRestDayToday: function (profile) {
    if (!profile || !profile.checkins) return false;
    var today = this.getToday();
    return profile.checkins.some(function (c) { return c.date === today && c.rest; });
  },

  getMomentumScore: function (profile) {
    if (!profile) return 0;
    var con = this.getConsistency(profile.checkins, profile.startDate, profile.paused);
    var streak = this.getStreak(profile.checkins, profile.paused);
    var consistencyScore = Math.min(50, Math.round(con.pct * 50));
    var streakScore = Math.min(25, streak * 5);
    var reviewDone = profile.weeklyRatings && profile.weeklyRatings.length > 0;
    var reviewScore = reviewDone ? 25 : 10;
    return Math.min(100, consistencyScore + streakScore + reviewScore);
  },

  getConcernConfig: function (concern) {
    return CONTENT.concerns[concern] || CONTENT.concerns.wellness;
  },

  getFocus: function (profile) {
    if (!profile) return { focus: 'otherwise', action: 'Set up your plan', route: '#/start' };
    var cfg = this.getConcernConfig(profile.concern);
    var tm = profile.trackingMethod || '';
    var hardest = profile.hardest || [];
    var ew = profile.expectedWeeks;

    // 1. Measure focus
    if (tm === "I can't really tell" || tm === "I go by feel" || tm === "I haven't tried" || hardest.indexOf("Can't tell if it's working") >= 0) {
      return { focus: 'measure', action: 'Set your starting point', route: '#/progress' };
    }
    // 2. Patience focus
    if ((ew !== null && ew !== undefined && ew < cfg.earlyWindowWeeks) || hardest.indexOf("Results feel slow") >= 0 || hardest.indexOf("Not knowing how long it takes") >= 0) {
      return { focus: 'patience', action: 'See your timeline', route: '#/expect' };
    }
    // 3. Habit focus
    if (hardest.indexOf("Remembering to use it") >= 0) {
      return { focus: 'habit', action: 'Do your first check-in', route: '#/today' };
    }
    // 4. Choice focus
    if (hardest.indexOf("Choosing the right product") >= 0) {
      return { focus: 'choice', action: 'Review your routine', route: '#/start' };
    }
    // 5. Otherwise
    return { focus: 'otherwise', action: 'Set your starting point', route: '#/progress' };
  },

  
  getDailyMindsetQuote: function (dateStr) {
    if (!CONTENT.mindsetQuotes || !CONTENT.mindsetQuotes.length) {
      return { quote: "Trust the routine.", author: "Daily mindset" };
    }
    var d = this.parseDate(dateStr || this.getToday());
    var dayNum = Math.abs(d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate());
    var idx = dayNum % CONTENT.mindsetQuotes.length;
    return CONTENT.mindsetQuotes[idx];
  },

  getDailyAffirmation: function (dateStr) {
    var affs = (CONTENT.mindSpace && CONTENT.mindSpace.affirmations) || [
      "Progress is happening in quiet cellular cycles."
    ];
    var d = this.parseDate(dateStr || this.getToday());
    var dayNum = Math.abs(d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate());
    var idx = dayNum % affs.length;
    return affs[idx];
  },

  getBurnRate: function (product, checkins, startDate) {
    if (!product) return null;
    var sizeDays = product.sizeDays || 30;
    var openedOn = product.openedOn || startDate || this.getToday();
    var usedCount = 0;
    (checkins || []).forEach(function (c) {
      if (c.done && c.date >= openedOn) usedCount++;
    });
    var usedDoses = Math.min(sizeDays, usedCount);
    var remainingDoses = Math.max(0, sizeDays - usedDoses);
    var estimatedFinish = this.addDays(this.getToday(), remainingDoses);
    var reorderDate = this.addDays(estimatedFinish, -5);
    return {
      totalDoses: sizeDays,
      usedDoses: usedDoses,
      remainingDoses: remainingDoses,
      pctUsed: Math.min(100, Math.round((usedDoses / sizeDays) * 100)),
      estimatedFinish: estimatedFinish,
      reorderDate: reorderDate,
      isLow: remainingDoses <= 5
    };
  },

  getVerdict: function (profile) {
    if (!profile || !profile.baseline) {
      return { type: 'none', label: '', message: '', cssClass: '', reasons: [] };
    }
    var cfg = this.getConcernConfig(profile.concern);
    var ratings = profile.weeklyRatings || [];

    // If any rating exists and latest has unusual flag, it overrides EVERYTHING
    if (ratings.length > 0) {
      var latestEntry = ratings[ratings.length - 1];
      if (latestEntry.unusual) {
        return {
          type: 'closer',
          label: CONTENT.verdictNames.closer,
          message: CONTENT.stageMessages.closerUnusual,
          cssClass: 'verdict-closer',
          reasons: ['Unusual symptom flagged', 'Professional review recommended']
        };
      }
    }

    // Rule 1: fewer than 2 ratings (and no unusual flag)
    if (ratings.length < CONTENT.verdictRules.minRatingsForVerdict) {
      return {
        type: 'checkIn',
        label: CONTENT.verdictNames.checkIn,
        message: CONTENT.stageMessages.checkInAgain,
        cssClass: 'verdict-early',
        reasons: [ratings.length ? 'First weekly review saved' : 'No weekly review yet', 'Two reviews give a first comparison']
      };
    }

    var latest = ratings[ratings.length - 1];
    var weeks = this.getWeekNumber(profile.startDate);
    var con = this.getConsistency(profile.checkins, profile.startDate, profile.paused);

    // Rule 2: too early
    if (weeks < cfg.earlyWindowWeeks) {
      return {
        type: 'tooEarly',
        label: CONTENT.verdictNames.tooEarly,
        message: this.templateStr(CONTENT.stageMessages.tooEarly, { weeks: cfg.earlyWindowWeeks }),
        cssClass: 'verdict-early',
        reasons: ['Week ' + weeks + ' of about ' + cfg.earlyWindowWeeks, 'Follicles and cells adjusting']
      };
    }

    // Rule 3: low consistency
    if (con.pct < CONTENT.verdictRules.consistencyLow) {
      return {
        type: 'consistency',
        label: CONTENT.verdictNames.consistency,
        message: this.templateStr(CONTENT.stageMessages.consistencyFirst, { done: con.done, total: con.total }),
        cssClass: 'verdict-consistency',
        reasons: [con.done + ' of ' + con.total + ' days done', 'Steadier habit gives fair picture']
      };
    }

    // Rule 4: worse than baseline or no change after full window with good consistency
    var avgLatest = (latest.primary + latest.secondary) / 2;
    var avgBaseline = (profile.baseline.primary + profile.baseline.secondary) / 2;
    var isWorse = avgLatest < avgBaseline || latest.primary < profile.baseline.primary;
    var noChange = avgLatest === avgBaseline && weeks >= cfg.fullWindowWeeks && con.pct >= CONTENT.verdictRules.consistencyHigh;
    if (isWorse || noChange) {
      return {
        type: 'closer',
        label: CONTENT.verdictNames.closer,
        message: isWorse ? CONTENT.stageMessages.closerWorse : (weeks >= cfg.fullWindowWeeks ? CONTENT.stageMessages.pastWindow : CONTENT.stageMessages.closerNoProgress),
        cssClass: 'verdict-closer',
        reasons: [isWorse ? 'Rating lower than baseline' : 'No change after ' + cfg.fullWindowWeeks + ' weeks', 'Time to try a different approach']
      };
    }

    // Rule 5: on track
    if (con.pct >= CONTENT.verdictRules.consistencyHigh) {
      return {
        type: 'onTrack',
        label: CONTENT.verdictNames.onTrack,
        message: CONTENT.stageMessages.onTrack,
        cssClass: 'verdict-ontrack',
        reasons: [con.done + ' of ' + con.total + ' days done', 'Ratings steady or improving']
      };
    }

    // Edge: consistency between low and high thresholds — show needs steadier routine (safer)
    return {
      type: 'consistency',
      label: CONTENT.verdictNames.consistency,
      message: this.templateStr(CONTENT.stageMessages.consistencyFirst, { done: con.done, total: con.total }),
      cssClass: 'verdict-consistency',
      reasons: [con.done + ' of ' + con.total + ' days done', 'Aim for 70% or more']
    };
  },

  getDaysLeft: function (product) {
    if (!product.sizeDays || !product.openedOn) return null;
    return product.sizeDays - this.daysBetween(product.openedOn, this.getToday());
  },

  getReorderDate: function (product) {
    if (!product.sizeDays || !product.openedOn) return null;
    return this.addDays(product.openedOn, product.sizeDays - 5);
  },

  getCostPerDay: function (product) {
    if (!product.price || !product.sizeDays) return null;
    return product.price / product.sizeDays;
  },

  getMonthlyCost: function (product) {
    var cpd = this.getCostPerDay(product);
    return cpd !== null ? cpd * 30 : null;
  },

  templateStr: function (str, vars) {
    if (!str) return '';
    return str.replace(/\{(\w+)\}/g, function (m, key) {
      return vars[key] !== undefined ? vars[key] : m;
    });
  },

  isWeeklyRatingDue: function (profile) {
    if (!profile || !profile.baseline) return false;
    if (this.isPaused(profile)) return false;
    var daysSinceStart = this.daysBetween(profile.startDate, this.getToday());
    if (daysSinceStart < 7) return false;
    var ratings = profile.weeklyRatings || [];
    if (!ratings.length) return true;
    var lastDate = ratings[ratings.length - 1].date;
    return this.daysBetween(lastDate, this.getToday()) >= 7;
  },

  isCheckedInToday: function (profile) {
    if (!profile) return false;
    var today = this.getToday();
    return (profile.checkins || []).some(function (c) { return c.date === today && c.done; });
  },

  getCheckinForDate: function (profile, date) {
    if (!profile || !profile.checkins) return null;
    return profile.checkins.find(function (c) { return c.date === date; }) || null;
  },

  productLowStock: function (profile) {
    if (!profile || !profile.products) return null;
    var self = this;
    return profile.products.find(function (p) {
      var dl = self.getDaysLeft(p);
      return dl !== null && dl <= 10;
    }) || null;
  },

  downloadICS: function (title, description, recurrence) {
    function esc(v) {
      return String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }
    var now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Bodywise Progress Companion//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:checkin-' + Date.now() + '@progress-companion',
      'DTSTAMP:' + now,
      'SUMMARY:' + esc(title),
      'DESCRIPTION:' + esc(description),
      'STATUS:CONFIRMED',
      'RRULE:FREQ=' + (recurrence || 'DAILY'),
      'DTSTART:' + Utils.getToday().replace(/-/g, '') + 'T090000',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    try {
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'daily-checkin-reminder.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      UI.toast('Could not create the reminder file.');
    }
  }
};



/* ==================== NAVIGATION ==================== */
// Short route names used by links and content map onto section ids.
var ROUTE_ALIASES = {
  '': 'companion', home: 'companion', welcome: 'companion',
  start: 'setup', expect: 'timeline', progress: 'results', decide: 'nextstep'
};

function normalizeRoute(hash) {
  return String(hash || '').replace(/^#\/*/, '');
}

var Router = {
  navigate: function (hash) {
    var id = normalizeRoute(hash);
    if (id === 'stuck') return openSupportDrawer();
    if (id === 'recap') return openRecapDrawer();
    if (id === 'settings' || id === 'about') return openSettingsDrawer();
    scrollToSection(id);
  },
  resolve: function () {
    var id = normalizeRoute(window.location.hash);
    if (id) this.navigate(id);
  },
  start: function () {
    var self = this;
    window.addEventListener('hashchange', function () { self.resolve(); });
    self.resolve();
  }
};

var Drawer = {
  _prevFocus: null,

  isOpen: function () {
    var overlay = document.getElementById('app-drawer');
    return !!(overlay && overlay.classList.contains('active'));
  },

  open: function (title, contentHTML, onMount) {
    var overlay = document.getElementById('app-drawer');
    var titleEl = document.getElementById('drawer-title');
    var bodyEl = document.getElementById('drawer-body');
    if (!overlay || !bodyEl) return;
    if (!this.isOpen()) this._prevFocus = document.activeElement;

    if (titleEl) titleEl.textContent = title || 'Details';
    bodyEl.innerHTML = contentHTML;
    bodyEl.scrollTop = 0;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');

    var panel = document.getElementById('drawer-panel');
    if (panel) panel.focus();

    if (typeof onMount === 'function') onMount(bodyEl);
  },

  close: function () {
    var overlay = document.getElementById('app-drawer');
    if (!overlay || !this.isOpen()) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    // Drop drawer routes such as #/stuck so the same link works again.
    try {
      var r = normalizeRoute(window.location.hash);
      if (r === 'stuck' || r === 'recap' || r === 'settings' || r === 'about') {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (e) { /* ignore */ }
    var prev = this._prevFocus;
    this._prevFocus = null;
    if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) prev.focus();
  },

  // Escape closes the drawer and Tab stays inside it.
  onKeydown: function (e) {
    if (!this.isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.key !== 'Tab') return;
    var panel = document.getElementById('drawer-panel');
    if (!panel) return;
    var items = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])');
    if (!items.length) { e.preventDefault(); panel.focus(); return; }
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }
};

if (typeof window !== 'undefined') {
  window.Storage = Storage;
  window.Utils = Utils;
  window.Router = Router;
  window.Drawer = Drawer;
}

/* ==================== UI HELPERS ==================== */
var FACES = [
  { val: 1, label: 'Not good', d: 'M 11 23 Q 18 17 25 23' },
  { val: 2, label: 'So-so', d: 'M 12 21 L 24 21' },
  { val: 3, label: 'Okay', d: 'M 12 20 Q 18 24 24 20' },
  { val: 4, label: 'Good', d: 'M 11 19 Q 18 27 25 19' },
  { val: 5, label: 'Great', d: 'M 10 18 Q 18 29 26 18 Z' }
];

var UI = {
  $header: function () { return document.getElementById('app-header'); },
  $content: function () { return document.getElementById('app-content'); },
  $tabBar: function () { return document.getElementById('tab-bar'); },
  $app: function () { return document.getElementById('app'); },
  _toastTimer: null,

  ratingHTML: function (id, label, currentVal) {
    var cur = Number(currentVal) || 0;
    var html = '<div class="field"><label id="' + id + '-label">' + escHTML(label) + '</label>' +
      '<div class="faces-selector" id="' + id + '" role="radiogroup" aria-labelledby="' + id + '-label">';
    FACES.forEach(function (f) {
      var isSel = (f.val === cur);
      html += '<button type="button" class="face-option rating-btn' + (isSel ? ' selected' : '') +
        '" data-value="' + f.val + '" role="radio" aria-checked="' + isSel + '" aria-label="' + f.label + '">';
      html += '<svg class="face-svg" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
      html += '<circle cx="18" cy="18" r="14"/>';
      html += '<circle cx="13" cy="13" r="1.5" fill="currentColor"/>';
      html += '<circle cx="23" cy="13" r="1.5" fill="currentColor"/>';
      html += '<path d="' + f.d + '"/>';
      html += '</svg>';
      html += '<span class="face-label">' + f.label + '</span>';
      html += '</button>';
    });
    html += '</div></div>';
    return html;
  },

  bindRating: function (id, cb) {
    var grp = document.getElementById(id);
    if (!grp) return;
    grp.addEventListener('click', function (e) {
      var btn = e.target.closest('.rating-btn');
      if (!btn) return;
      grp.querySelectorAll('.rating-btn').forEach(function (b) {
        b.classList.remove('selected');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
      cb(+btn.getAttribute('data-value'));
    });
  },

  toast: function (msg) {
    if (!msg) return;
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2800);
  }
};

/* ==================== HELPERS ==================== */
function escHTML(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape, then turn line breaks into <br> (multi-line copy in CONTENT).
function escMultiline(s) {
  return escHTML(s).split(String.fromCharCode(10)).join('<br>');
}

/* ==================== SETUP STATE ==================== */
var startState = {
  step: 0,
  forkChoice: null,
  answers: {
    name: '',
    concern: null,
    concerns: [],
    ownedProducts: [],
    startBucket: 'notYet',
    routineTime: 'both' // not asked: each product follows its own morning/night schedule
  },
  editing: false,
  shelfQueue: [],
  shelfIdx: 0
};

// All concerns a profile tracks (older profiles only stored one).
function getProfileConcerns(profile) {
  if (!profile) return [];
  var list = (profile.concerns && profile.concerns.length) ? profile.concerns.slice() : [];
  if (profile.concern && list.indexOf(profile.concern) < 0) list.unshift(profile.concern);
  return list;
}

// Every checklist step for all concerns the person chose. Ids are prefixed
// with the concern so steps with the same name never collide.
// Looks up the catalog entry (with its group and daily pointer) for a product id.
function getCatalogProduct(concern, pid) {
  var list = (CONTENT.catalog && CONTENT.catalog[concern]) || [];
  for (var i = 0; i < list.length; i++) { if (list[i].id === pid) return list[i]; }
  return null;
}

function getCatalogGroup(concern, groupId) {
  var groups = (CONTENT.catalogGroups && CONTENT.catalogGroups[concern]) || [];
  for (var i = 0; i < groups.length; i++) { if (groups[i].id === groupId) return groups[i]; }
  return null;
}

// Products on the person's shelf that belong to one concern, enriched from the catalog.
function getShelfProductsFor(profile, concern) {
  var out = [];
  (profile && profile.products || []).forEach(function (p) {
    var cat = getCatalogProduct(concern, p.id);
    if (cat) out.push(cat);
  });
  return out;
}

// Shelf picker markup with products split into friendly sub-sections.
function renderGroupedCatalog(concern, renderItem) {
  var catalog = (CONTENT.catalog && CONTENT.catalog[concern]) || [];
  var groups = (CONTENT.catalogGroups && CONTENT.catalogGroups[concern]) || [];
  if (!groups.length) return catalog.map(renderItem).join('');
  var html = '';
  groups.forEach(function (g) {
    var items = catalog.filter(function (p) { return p.group === g.id; });
    if (!items.length) return;
    html += '<div class="shelf-group">' +
      '<div class="shelf-group-head"><span class="shelf-group-title">' + escHTML(g.label) + '</span>' +
      '<span class="shelf-group-hint">' + escHTML(g.hint || '') + ' \u00b7 ' + items.length + '</span></div>' +
      '<div class="shelf-group-items">' + items.map(renderItem).join('') + '</div>' +
    '</div>';
  });
  return html;
}

// One checklist pointer per product on the shelf, placed in its natural AM / PM slot.
function getRitualSteps(profile) {
  var templates = CONTENT.ritualTemplates || {};
  var rTime = (profile && profile.routineTime) || 'morning';
  var concerns = getProfileConcerns(profile);
  if (!concerns.length) concerns = ['wellness'];
  var steps = [];
  concerns.forEach(function (c) {
    var owned = getShelfProductsFor(profile, c);
    if (!owned.length) {
      // No catalog match (older profiles): fall back to the general routine.
      var tpl = templates[c] || templates.wellness || {};
      if (rTime === 'morning' || rTime === 'both') (tpl.am || []).forEach(function (s) { steps.push({ id: c + ':' + s.id, text: s.text, slot: 'AM', concern: c }); });
      if (rTime === 'night' || rTime === 'both') (tpl.pm || []).forEach(function (s) { steps.push({ id: c + ':' + s.id, text: s.text, slot: 'PM', concern: c }); });
      return;
    }
    owned.forEach(function (p) {
      var use = p.use || { slot: 'ANY', freq: 'Daily', how: 'Use as directed on the pack.' };
      var slots;
      if (use.twice && rTime === 'both') slots = ['AM', 'PM'];
      else if (use.slot === 'AM' || use.slot === 'PM') slots = [use.slot];
      else slots = [rTime === 'night' ? 'PM' : 'AM'];
      if (use.twice && rTime === 'night') slots = ['PM'];
      var grp = getCatalogGroup(c, p.group);
      slots.forEach(function (slot) {
        steps.push({
          id: c + ':' + p.id + ':' + slot,
          slot: slot,
          concern: c,
          product: p.name,
          text: use.how,
          freq: use.freq || 'Daily',
          group: grp ? grp.label : ''
        });
      });
    });
  });
  // Morning pointers first, then night, keeping shelf order inside each.
  return steps.filter(function (s) { return s.slot === 'AM'; }).concat(steps.filter(function (s) { return s.slot === 'PM'; }));
}

// Percent of the day logged (0 when not submitted). Older full check-ins count as 100.
function getDayPct(ci) {
  if (!ci || !ci.done) return 0;
  return typeof ci.pct === 'number' ? ci.pct : 100;
}

// Open the bathroom shelf for one concern directly (no name / focus questions).
function openShelfSetupFor(concernId) {
  var profile = Storage.load();
  if (!profile) { scrollToSection('setup'); return; }
  prefillStartState(profile);
  var ans = startState.answers;
  if (concernId && ans.concerns.indexOf(concernId) < 0) ans.concerns.push(concernId);
  startState.forkChoice = 'owned';
  startState.shelfQueue = [concernId || ans.concerns[0]];
  startState.shelfIdx = 0;
  startState.step = 2;
  var el = document.getElementById('setup');
  if (el) renderSetupSection(el);
  scrollToSection('setup');
}
window.openShelfSetupFor = openShelfSetupFor;

// Land on the Bodywise logo (body map) and zoom straight into a region.
function enterBodyMap(concernId) {
  scrollToSection('bodymap');
  if (!window.BodyMap || !window.BodyMap.play) return;
  // Wait for the scroll up to the body map to finish, so the zoom starts
  // from the on-screen figure instead of firing mid-scroll.
  var lastY = -1, still = 0, waited = 0;
  (function waitForScroll() {
    var y = window.pageYOffset;
    still = (y === lastY) ? still + 1 : 0;
    lastY = y;
    waited += 100;
    if ((still < 3 || waited < 400) && waited < 4000) { setTimeout(waitForScroll, 100); return; }
    var sec = document.getElementById('bodymap');
    var svg = sec ? sec.querySelector('.bm-svg') : null;
    window.BodyMap.play(concernId, { sourceSvg: svg });
  })();
}
window.enterBodyMap = enterBodyMap;

// Older versions stored a setup draft under this key.
function clearDraft() {
  try { localStorage.removeItem('bwc_draft'); } catch (e) { /* ignore */ }
}

function prefillStartState(profile) {
  if (!profile) return;
  startState.answers.name = profile.name || '';
  startState.answers.concern = profile.concern || null;
  startState.answers.concerns = getProfileConcerns(profile);
  startState.answers.ownedProducts = (profile.products || []).map(function (p) { return p.id; });
  startState.answers.startBucket = profile.startBucket || 'notYet';
  startState.answers.routineTime = profile.routineTime || 'morning';
  startState.editing = true;
}

// Builds a profile from setup answers. When editing, progress data is kept.
function buildProfile(ans, existing) {
  var concerns = (ans.concerns && ans.concerns.length) ? ans.concerns.slice() : [ans.concern || 'hair'];
  var concern = concerns[0];
  var cfg = Utils.getConcernConfig(concern);
  var prevProducts = existing ? (existing.products || []) : [];
  var owned = [];
  concerns.forEach(function (c) {
    var catalogList = (CONTENT.catalog && CONTENT.catalog[c]) || [];
    var forThis = [];
    (ans.ownedProducts || []).forEach(function (pid) {
      var inCat = catalogList.find(function (x) { return x.id === pid; });
      if (!inCat) return;
      var prev = prevProducts.find(function (p) { return p.id === pid; });
      forThis.push(prev || inCat);
    });
    if (!forThis.length && catalogList.length) forThis.push(catalogList[0]);
    owned = owned.concat(forThis);
  });

  var bucket = ans.startBucket || 'notYet';
  var keepStart = existing && existing.startBucket === bucket && existing.startDate;
  var startDate = keepStart ? existing.startDate : Utils.getStartDateFromBucket(bucket);
  var sameConcern = !!(existing && existing.concern === concern);

  var profile = {
    version: 3,
    name: Utils.toTitleCase(ans.name) || 'Friend',
    concern: concern,
    concerns: concerns,
    startDate: startDate,
    startBucket: bucket,
    routineTime: ans.routineTime || 'morning',
    products: owned,
    marker: (sameConcern && existing.marker) || (cfg.markers && cfg.markers[0]) || 'Observed change',
    checkins: [],
    weeklyRatings: [],
    flags: { seenExpect: true },
    // Neutral starting point. The first weekly review replaces it.
    baseline: { primary: 3, secondary: 3, date: startDate, assumed: true }
  };

  if (existing) {
    profile.checkins = existing.checkins || [];
    profile.paused = existing.paused || null;
    profile.recapSeen = existing.recapSeen || [];
    profile.whyStarted = existing.whyStarted || '';
    if (existing.goalText) profile.goalText = existing.goalText;
    if (sameConcern) {
      profile.weeklyRatings = existing.weeklyRatings || [];
      profile.flags = existing.flags || profile.flags;
      if (existing.baseline) profile.baseline = existing.baseline;
    }
  }
  return profile;
}


function renderDotGrid(profile) {
  var today = Utils.getToday();
  var todayDate = Utils.parseDate(today);
  var dayOfWeek = todayDate.getDay();
  var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  var html = '<div class="bw-dotgrid"><div class="section-title mb-8">This week</div>';
  var weekStart = Utils.addDays(today, mondayOffset);
  html += '<div class="dot-row"><span class="dot-row-label" aria-hidden="true"></span>';
  var dayLabels = ['M','T','W','T','F','S','S'];
  for (var d = 0; d < 7; d++) {
    var date = Utils.addDays(weekStart, d);
    var ci = Utils.getCheckinForDate(profile, date);
    var done = ci && ci.done;
    var isToday = date === today;
    var daysSinceDate = Utils.daysBetween(date, today);
    var editable = daysSinceDate >= 0 && daysSinceDate <= 3 && date >= profile.startDate;
    var isFuture = date > today;
    var pctD = getDayPct(ci);
    var pending = false;
    if (!done && isToday && ci && ci.ritualDone && ci.ritualDone.length) {
      var allIds = getRitualSteps(profile).map(function (s) { return s.id; });
      var nTicked = allIds.filter(function (id) { return ci.ritualDone.indexOf(id) >= 0; }).length;
      if (nTicked) { pctD = Math.round(nTicked / allIds.length * 100); pending = true; }
    }
    var cls = 'dot';
    if (done) cls += pctD < 100 ? ' partial' : ' done';
    else if (pending) cls += ' partial pending';
    if (isToday) cls += ' today';
    if (editable && !isFuture) cls += ' editable';
    html += '<div class="' + cls + '"' + ((done || pending) ? ' style="--pct:' + pctD + '%"' : '') +
      (editable && !isFuture ? ' data-date="' + date + '" tabindex="0" role="button" aria-label="' + dayLabels[d] + ' ' + Utils.formatDate(date) + (done ? ' ' + pctD + ' percent done' : (pending ? ' ' + pctD + ' percent ticked, not submitted' : ' not done')) + '"' : '') +
      ' title="' + dayLabels[d] + (done ? ' · ' + pctD + '%' : (pending ? ' · ' + pctD + '% ticked (submit to save)' : '')) + '">' + dayLabels[d] + '</div>';
  }
  html += '</div>';

  // 4-week grid
  html += '<div class="section-title mt-16 mb-8">Last 4 weeks</div>';
  for (var w = 3; w >= 0; w--) {
    var wStart = Utils.addDays(weekStart, -(w + 1) * 7);
    html += '<div class="dot-row"><span class="dot-row-label" style="font-size:0.7rem;">' + Utils.formatDate(wStart).slice(0, 6) + '</span>';
    for (var dd = 0; dd < 7; dd++) {
      var dt = Utils.addDays(wStart, dd);
      if (dt < profile.startDate || dt > today) {
        html += '<div class="dot" style="opacity:0.3;" title="' + dayLabels[dd] + '"></div>';
      } else {
        var ci2 = Utils.getCheckinForDate(profile, dt);
        var dn = ci2 && ci2.done;
        var daysBack = Utils.daysBetween(dt, today);
        var isBackfillable = daysBack >= 0 && daysBack <= 3;
        var p2 = getDayPct(ci2);
        var dotCls = 'dot' + (dn ? (p2 < 100 ? ' partial' : ' done') : '') + (isBackfillable ? ' editable' : '');
        html += '<div class="' + dotCls + '"' + (dn ? ' style="--pct:' + p2 + '%"' : '') +
          (isBackfillable ? ' data-date="' + dt + '" tabindex="0" role="button" aria-label="' + dayLabels[dd] + ' ' + Utils.formatDate(dt) + (dn ? ' done' : ' not done') + '"' : '') +
          ' title="' + dayLabels[dd] + ' ' + Utils.formatDate(dt) + (dn ? ' · ' + p2 + '%' : '') + '"></div>';
      }
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}


/* ==================== SVG ICONS & AVATARS ==================== */
var GUIDE_CHARACTER_PATH = 'M 333 64 L 344 66 L 344 68 L 335 89 L 325 103 L 305 123 L 283 139 L 279 141 L 274 132 L 299 113 L 316 96 L 326 82 L 333 65 Z M 229 81 L 244 82 L 253 90 L 256 97 L 256 105 L 253 113 L 247 119 L 240 122 L 227 121 L 218 114 L 214 104 L 215 95 L 218 89 L 223 84 L 228 82 Z M 240 93 L 232 92 L 227 96 L 227 107 L 233 111 L 240 110 L 245 104 L 245 99 L 241 94 Z M 110 104 L 112 104 L 121 116 L 132 124 L 154 133 L 181 137 L 242 136 L 256 139 L 262 142 L 267 148 L 267 159 L 260 166 L 218 180 L 212 186 L 214 188 L 264 187 L 276 190 L 283 196 L 285 201 L 285 210 L 283 214 L 275 221 L 260 227 L 212 236 L 188 243 L 179 248 L 171 256 L 166 267 L 165 326 L 166 353 L 168 354 L 201 298 L 218 266 L 220 259 L 232 260 L 233 359 L 249 332 L 264 298 L 274 265 L 278 240 L 279 238 L 290 240 L 282 280 L 267 321 L 249 356 L 231 383 L 220 379 L 219 288 L 168 377 L 157 375 L 154 331 L 154 273 L 156 261 L 160 252 L 165 245 L 177 236 L 201 227 L 254 217 L 268 212 L 274 207 L 274 203 L 272 201 L 262 198 L 212 199 L 207 197 L 201 189 L 201 181 L 206 174 L 213 170 L 250 158 L 254 156 L 256 152 L 251 149 L 240 147 L 178 148 L 152 144 L 137 139 L 114 125 L 102 110 L 109 105 Z';

var ICONS = {
  guideAvatar: '<svg class="guide-avatar-svg" width="22" height="22" viewBox="0 0 447 447" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="' + GUIDE_CHARACTER_PATH + '"/></svg>',
  guideHero: '<svg class="guide-hero-svg" width="56" height="56" viewBox="0 0 447 447" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="' + GUIDE_CHARACTER_PATH + '"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
};

/* ==================== SECTION REGISTRY ==================== */
var SECTIONS = [
  { id: 'companion', navLabel: 'Overview', title: 'Be Bodywise', render: renderHeroSection },
  { id: 'bodymap', navLabel: 'Body map', title: 'Your body map', render: function (c) { if (window.BodyMap) window.BodyMap.renderSection(c); }, dashboard: true },
  { id: 'how', navLabel: '', title: 'How it works', render: renderHowSection },
  { id: 'setup', navLabel: 'Setup', title: 'Your plan', render: renderSetupSection },
  { id: 'today', navLabel: 'Daily Ritual', title: 'Daily ritual', render: renderCheckinSection, dashboard: true },
  { id: 'timeline', navLabel: 'Timeline', title: 'Your timeline', render: renderTimelineSection, dashboard: true },
  { id: 'mind', navLabel: 'Mind Space', title: 'Mind Space', render: renderMindSection, dashboard: true },
  { id: 'results', navLabel: 'Results', title: 'Your results', render: renderResultsSection, dashboard: true },
  { id: 'nextstep', navLabel: 'Next step', title: 'What next?', render: renderNextStepSection, dashboard: true },
  { id: 'closing', navLabel: '', title: '', render: renderClosingSection }
];
if (typeof window !== 'undefined') window.SECTIONS = SECTIONS;

/* ==================== JOURNEY CARD PRIORITY ==================== */
function getPrimaryCard(profile) {
  if (!profile) {
    return '<div class="card"><h3 class="card-title">Know if it\'s working</h3><p class="card-text">Set up your routine.</p><a href="#/start" data-scroll="setup" class="btn btn-primary">Set up my plan</a></div>';
  }
  if (Utils.isWeeklyRatingDue(profile)) {
    return '<div class="card"><h3 class="card-title">Weekly review</h3><p class="card-text">30 seconds. See how you\'re doing.</p><a href="#/progress" data-scroll="results" class="btn btn-primary">Start review</a></div>';
  }
  var refillNeeded = false;
  (profile.products || []).forEach(function (p) {
    var dl = Utils.getDaysLeft(p);
    if (dl !== null && dl <= 10) refillNeeded = true;
  });
  if (refillNeeded) {
    return '<div class="card"><h3 class="card-title">Refill soon</h3><p class="card-text">Plan your next pack.</p><a href="#/decide" data-scroll="decide" class="btn btn-primary">Plan refill</a></div>';
  }
  if (!Utils.isCheckedInToday(profile)) {
    return '<div class="card"><h3 class="card-title">Check in today</h3><p class="card-text">Check off today\'s morning or night steps.</p><a href="#/today" data-scroll="today" class="btn btn-primary">Mark done</a></div>';
  }
  if (profile.flags && !profile.flags.seenExpect) {
    return '<div class="card"><h3 class="card-title">See your timeline</h3><p class="card-text">Know what to expect each week.</p><a href="#/expect" data-scroll="timeline" class="btn btn-primary">View timeline</a></div>';
  }
  return '<div class="card"><h3 class="card-title">All done today</h3><p class="card-text">Your routine is on track.</p><a href="#/progress" data-scroll="results" class="btn btn-primary">See results</a></div>';
}

/* ==================== HEADER & SHELL ==================== */
UI.renderHeader = function () {
  var profile = Storage.load();
  var h = this.$header();
  if (!h) return;

  var ctaLabel = profile ? 'Daily Ritual' : 'Get started';
  var ctaTarget = profile ? 'today' : 'setup';

  var html = '<div class="header-inner">' +
    // Brand Logo with Fluid Line-Art Guide Avatar (Zero duplicate word "Companion")
    '<a href="#" class="header-brand" id="brand-logo" title="Be Bodywise — back to the top (Shift-click to replay intro)">' +
      '<span class="guide-avatar-badge">' + ICONS.guideAvatar + '</span>' +
      '<span class="brand-name"><span class="be-small">be</span>bodywise</span>' +
    '</a>' +

    // Clearly distinct navigation links
    '<nav class="header-nav" aria-label="Main section navigation">' +
      '<a href="#today" class="header-nav-link" data-scroll="today">Daily Ritual</a>' +
      '<a href="#timeline" class="header-nav-link" data-scroll="timeline">Timeline</a>' +
      '<a href="#mind" class="header-nav-link" data-scroll="mind">Mind Space</a>' +
      '<a href="#results" class="header-nav-link" data-scroll="results">Results</a>' +
      '<a href="#companion" class="header-nav-link" data-scroll="companion">About Bodywise</a>' +
    '</nav>' +

    // Header Actions
    '<div class="header-actions">' +
      '<a href="https://bebodywise.com" target="_blank" rel="noopener" class="header-shop-btn header-store-pill" title="Shop Official Bodywise Formulas">' +
        '<span>Shop Official Formulas</span>' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      '</a>' +
      '<button type="button" class="btn btn-primary btn-sm" id="header-cta-btn" data-scroll="' + ctaTarget + '">' + ctaLabel + '</button>' +
      '<button type="button" class="header-menu-btn header-tour-btn" id="header-tour-btn" aria-label="Take the feature tour" title="Take the feature tour">' +
        '<span class="bwt-head-icon">' + ICONS.guideAvatar + '</span>' +
        '<span>Tour</span>' +
      '</button>' +
      '<button type="button" class="header-menu-btn" id="header-menu-btn" aria-label="Menu and settings">' +
        ICONS.menu +
        '<span>Menu</span>' +
      '</button>' +
    '</div>' +
  '</div>';

  h.innerHTML = html;

  // Bind scroll links
  h.querySelectorAll('[data-scroll]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var target = el.getAttribute('data-scroll');
      scrollToSection(target);
    });
  });

  // The logo always returns to the very top of the page.
  var brandEl = h.querySelector('#brand-logo');
  if (brandEl) {
    brandEl.addEventListener('click', function (e) {
      e.preventDefault();
      if (e.shiftKey) return; // Shift-click replays the intro instead.
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (err) { /* ignore */ }
    });
  }

  // Feature tour (start or replay)
  var tourBtn = document.getElementById('header-tour-btn');
  if (tourBtn) {
    tourBtn.addEventListener('click', function () {
      if (window.BWTour) window.BWTour.start();
    });
  }

  // Bind menu drawer
  var menuBtn = document.getElementById('header-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      openSettingsDrawer();
    });
  }
};

/* ==================== SECTION SCROLLING & SCROLLSPY ==================== */
function updateActiveNav(id) {
  if (!id) return;
  var navLinks = document.querySelectorAll('.header-nav-link, #tab-bar a');
  navLinks.forEach(function (link) {
    var target = link.getAttribute('data-scroll');
    if (target === id || (id === 'how' && target === 'companion') || (id === 'companion' && target === 'companion')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  var railButtons = document.querySelectorAll('.rail-step-btn');
  railButtons.forEach(function (btn) {
    var target = btn.getAttribute('data-scroll');
    var node = btn.querySelector('.rail-step-node');
    if (target === id) {
      btn.classList.add('active');
      if (node) {
        node.style.background = 'var(--ob-pink)';
        node.style.borderColor = 'var(--ob-pink)';
        node.style.transform = 'scale(1.25)';
      }
    } else {
      btn.classList.remove('active');
      if (node) {
        node.style.background = 'var(--ob-glass)';
        node.style.borderColor = 'var(--ob-hair)';
        node.style.transform = 'scale(1)';
      }
    }
  });
}

function scrollToSection(id) {
  if (Object.prototype.hasOwnProperty.call(ROUTE_ALIASES, id)) id = ROUTE_ALIASES[id];
  var el = document.getElementById(id);
  if (!el) return;
  var headerOffset = 70;
  var top = el.getBoundingClientRect().top + window.pageYOffset - headerOffset;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
  updateActiveNav(id);
  try {
    history.replaceState(null, '', '#' + id);
  } catch (e) { /* ignore */ }
}

function renderPlaceholder(container, title) {
  var ph = CONTENT.landing.placeholder;
  container.innerHTML = '<div class="container">' +
    '<div class="card placeholder-card text-center">' +
      '<h2 class="section-title">' + escHTML(title) + '</h2>' +
      '<h3 class="card-title">' + escHTML(ph.title) + '</h3>' +
      '<p class="card-text">' + escHTML(ph.text) + '</p>' +
      '<button type="button" class="btn btn-primary" data-scroll="setup">' + escHTML(ph.cta) + '</button>' +
    '</div></div>';
}

function refreshSections(ids) {
  ids.forEach(function (id) {
    var sec = SECTIONS.find(function (s) { return s.id === id; });
    var el = document.getElementById(id);
    if (!sec || !el) return;
    try { sec.render(el); } catch (err) { if (window.console) console.error('Could not refresh ' + id, err); }
  });
  renderDesktopRail();
}

function refreshPrimaryCard() {
  var slot = document.getElementById('hero-primary-card');
  var profile = Storage.load();
  if (slot && profile) slot.innerHTML = getPrimaryCard(profile);
}

var _scrollSpyTicking = false;
function initScrollspy() {
  function checkScroll() {
    _scrollSpyTicking = false;
    var sections = ['bodymap', 'today', 'timeline', 'mind', 'results', 'setup', 'companion', 'how', 'nextstep'];
    var current = null;
    for (var i = 0; i < sections.length; i++) {
      var el = document.getElementById(sections[i]);
      if (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top <= 200 && rect.bottom > 80) {
          current = sections[i];
          break;
        }
      }
    }
    if (current) {
      updateActiveNav(current);
    }
  }

  if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('scroll', onScrollSpyWindow);
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('scroll', onScrollSpyWindow, { passive: true });
  }
  checkScroll();
}

function onScrollSpyWindow() {
  if (!_scrollSpyTicking) {
    _scrollSpyTicking = true;
    var raf = (typeof window !== 'undefined' && window.requestAnimationFrame) || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (cb) { return setTimeout(cb, 16); });
    raf(function () {
      _scrollSpyTicking = false;
      var sections = ['bodymap', 'today', 'timeline', 'mind', 'results', 'setup', 'companion', 'how', 'nextstep'];
      var current = null;
      for (var i = 0; i < sections.length; i++) {
        var el = document.getElementById(sections[i]);
        if (el) {
          var rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom > 80) {
            current = sections[i];
            break;
          }
        }
      }
      if (current) {
        updateActiveNav(current);
      }
    });
  }
}

/* ==================== SECTION BUILDERS & RENDERERS ==================== */

// F5 Progress Forecast Strip helper
function renderForecastStripHTML(cfg, profile) {
  var currentWk = profile ? Utils.getWeekNumber(profile.startDate) : 1;
  var html = '<div class="forecast-strip">';
  for (var w = 1; w <= cfg.fullWindowWeeks; w++) {
    var isCurrent = (w === currentWk);
    var isEarly = (w < cfg.earlyWindowWeeks);
    var isMiddle = (w >= cfg.earlyWindowWeeks && w < cfg.earlyWindowWeeks + 4);
    html += '<div class="forecast-card' + (isCurrent ? ' current-week' : '') + '">';
    if (isCurrent) html += '<span class="forecast-you-are-here">You are here</span>';
    html += '<div class="forecast-week">W' + w + '</div>';
    if (isEarly) {
      html += '<svg class="forecast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>';
      html += '<div class="forecast-label">Adjusting</div>';
    } else if (isMiddle) {
      html += '<svg class="forecast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/></svg>';
      html += '<div class="forecast-label">Early signs</div>';
    } else {
      html += '<svg class="forecast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>';
      html += '<div class="forecast-label">Steadier</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* ---- Section 1: Hero Section (Section 5.1 - Upgraded UI Placards & Benefit Badges) ---- */
function renderHeroSection(container) {
  var profile = Storage.load();
  var c = CONTENT.landing;

  var html = '<div class="container">' +
    '<div class="hero-split">' +
      // Left Column
      '<div class="hero-left">' +
        '<div class="hero-character-reveal">' +
          '<div class="hero-character-glow"></div>' +
          '<div class="hero-character-emblem">' +
            '<svg class="hero-emblem-svg" viewBox="0 0 447 447" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<circle cx="235" cy="102" r="15"/>' +
              '<path class="hero-draw-stroke" d="M 333 64 L 344 66 L 344 68 L 335 89 L 325 103 L 305 123 L 283 139 L 279 141 L 274 132 L 299 113 L 316 96 L 326 82 L 333 65"/>' +
              '<path class="hero-draw-stroke" d="M 284 240 C 275 280, 255 340, 232 381"/>' +
              '<path class="hero-draw-stroke" d="M 110 104 L 112 104 L 121 116 L 132 124 L 154 133 L 181 137 L 242 136 L 256 139 L 262 142 L 267 148 L 267 159 L 260 166 L 218 180 L 212 186 L 214 188 L 264 187 L 276 190 L 283 196 L 285 201 L 285 210 L 283 214 L 275 221 L 260 227 L 212 236 L 188 243 L 179 248 L 171 256 L 166 267 L 165 326 L 166 353 L 168 354 L 201 298 L 218 266 L 220 259 L 232 260 L 233 359 L 249 332 L 264 298 L 274 265 L 278 240 L 279 238 L 290 240 L 282 280 L 267 321 L 249 356 L 231 383 L 220 379 L 219 288 L 168 377 L 157 375 L 154 331 L 154 273 L 156 261 L 160 252 L 165 245 L 177 236 L 201 227 L 254 217 L 268 212 L 274 207 L 274 203 L 272 201 L 262 198 L 212 199 L 207 197 L 201 189 L 201 181 L 206 174 L 213 170 L 250 158 L 254 156 L 256 152 L 251 149 L 240 147 L 178 148 L 152 144 L 137 139 L 114 125 L 102 110 L 109 105 Z"/>' +
            '</svg>' +
          '</div>' +
        '</div>' +
        '<div class="hero-brand-eyebrow">' + escHTML(c.eyebrow || 'BE BODYWISE') + '</div>' +
        '<h1 class="hero-headline">' + escHTML(c.headline || 'Your Personal Progress Companion') + '</h1>' +
        '<p class="hero-subline">' + escHTML(c.subline || 'See real change, even when it is slow.') + '</p>' +
        '<div class="hero-benefits-grid">' +
          '<div class="benefit-pill">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="stroke:var(--ob-pink)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            '<span>' + escHTML(c.benefits[0]) + '</span>' +
          '</div>' +
          '<div class="benefit-pill">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="stroke:var(--ob-pink)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            '<span>' + escHTML(c.benefits[1]) + '</span>' +
          '</div>' +
          '<div class="benefit-pill">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="stroke:var(--ob-pink)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            '<span>' + escHTML(c.benefits[2]) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="hero-cta-group">' +
          '<button type="button" class="btn btn-primary" id="hero-get-started" data-scroll="' + (profile ? 'today' : 'setup') + '">' +
            (profile ? 'Continue your daily ritual →' : escHTML(c.cta) + ' →') +
          '</button>' +
          '<span class="privacy-badge">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            escHTML(c.privacyBadge) +
          '</span>' +
        '</div>' +
      '</div>' +

      // Right Column
      '<div class="hero-right">' +
        '<div class="hero-card">' +
          '<div class="hero-card-header">' +
            '<span class="hero-card-tag">' + (profile ? 'Your Ritual' : 'How change happens') + '</span>' +
            '<span class="hero-card-meta">' + (profile ? Utils.formatDate(Utils.getToday()) : 'Typical pace') + '</span>' +
          '</div>' +
          (profile ? getPrimaryCard(profile) :
            '<div class="journey-line-visual">' +
              '<div class="graph-tooltip-pill" id="hero-graph-tooltip">Hover or tap a milestone to learn more</div>' +
              '<svg class="journey-svg" viewBox="0 0 380 140" fill="none">' +
                '<defs>' +
                  '<linearGradient id="heroCurveGrad" x1="0" y1="0" x2="0" y2="1">' +
                    '<stop offset="0%" style="stop-color:var(--ob-pink)" stop-opacity="0.2"/>' +
                    '<stop offset="100%" style="stop-color:var(--ob-pink)" stop-opacity="0.0"/>' +
                  '</linearGradient>' +
                '</defs>' +
                '<path d="M 20 110 C 100 105, 180 85, 260 55 C 300 40, 340 35, 360 30 L 360 135 L 20 135 Z" fill="url(#heroCurveGrad)"/>' +
                '<path class="signature-line" d="M 20 110 C 100 105, 180 85, 260 55 C 300 40, 340 35, 360 30" style="stroke:var(--ob-pink)" stroke-width="4.5" stroke-linecap="round"/>' +
                '<circle class="milestone-dot graph-interactive-dot active" data-node="1" cx="20" cy="110" r="7" style="fill:var(--ob-pink)"/>' +
                '<circle class="milestone-dot graph-interactive-dot" data-node="4" cx="180" cy="85" r="7" style="fill:var(--ob-pink)"/>' +
                '<circle class="milestone-dot graph-interactive-dot" data-node="12" cx="360" cy="30" r="8" fill="#F26B1D"/>' +
              '</svg>' +
              '<div class="journey-milestones-grid">' +
                '<div class="journey-milestone-node node-navy active" data-node="1">' +
                  '<div class="milestone-node-dot"></div>' +
                  '<div class="milestone-node-info">' +
                    '<span class="milestone-node-time">Week 1</span>' +
                    '<span class="milestone-node-title">Foundation</span>' +
                    '<span class="milestone-node-sub">Habit anchoring</span>' +
                  '</div>' +
                '</div>' +
                '<div class="journey-milestone-node node-blue" data-node="4">' +
                  '<div class="milestone-node-dot"></div>' +
                  '<div class="milestone-node-info">' +
                    '<span class="milestone-node-time">Week 4</span>' +
                    '<span class="milestone-node-title">Early signs</span>' +
                    '<span class="milestone-node-sub">First small shifts</span>' +
                  '</div>' +
                '</div>' +
                '<div class="journey-milestone-node node-coral" data-node="12">' +
                  '<div class="milestone-node-dot"></div>' +
                  '<div class="milestone-node-info">' +
                    '<span class="milestone-node-time">Week 12</span>' +
                    '<span class="milestone-node-title">Real change</span>' +
                    '<span class="milestone-node-sub">Visible results</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>'
          ) +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  container.innerHTML = html;

  // Interactive Graph Hover & Inspection
  var tooltipEl = container.querySelector('#hero-graph-tooltip');
  var nodeInfos = {
    '1': 'Week 1: Build the habit. Your routine settles in.',
    '4': 'Week 4: Early signs. Small changes may start to show.',
    '12': 'Week 12: Real change. Most routines show visible results.'
  };

  container.querySelectorAll('.journey-milestone-node, .graph-interactive-dot').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      var n = this.getAttribute('data-node');
      container.querySelectorAll('.journey-milestone-node, .graph-interactive-dot').forEach(function (item) {
        if (item.getAttribute('data-node') === n) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      if (tooltipEl && nodeInfos[n]) {
        tooltipEl.textContent = nodeInfos[n];
        tooltipEl.classList.add('visible');
      }
    });

    el.addEventListener('mouseleave', function () {
      if (tooltipEl) tooltipEl.classList.remove('visible');
    });
  });

  var getStartedBtn = container.querySelector('#hero-get-started');
  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var target = this.getAttribute('data-scroll');
      scrollToSection(target);
    });
  }
}

/* ---- Section 2: How It Works (Section 5.2 - 3 Column Grid & Visible on Load) ---- */
function renderHowSection(container) {
  var panels = (CONTENT.landing && CONTENT.landing.panels) || [
    { step: "1", title: "Set a goal", text: "Choose one focus area and a realistic timeframe.", detail: "About 1 minute." },
    { step: "2", title: "Check in daily", text: "Follow your morning and evening ritual steps.", detail: "10 seconds a day." },
    { step: "3", title: "See your results", text: "Track tangible micro-markers week by week.", detail: "Every week." }
  ];

  var html = '<div class="how-stage">' +
    '<div class="container">' +
      '<div class="how-header">' +
        '<h2 class="how-title">How it works</h2>' +
        '<p class="section-subline">Three simple steps to know if your routine is working.</p>' +
      '</div>' +

      '<div class="how-panels-container">' +
        '<div class="how-panels-row" id="how-panels-row">';

  panels.forEach(function (p, idx) {
    var svgVisual = '';
    if (idx === 0) {
      svgVisual = '<svg width="64" height="64" viewBox="0 0 80 80" fill="none" style="margin-bottom:14px;">' +
        '<circle cx="40" cy="40" r="34" style="stroke:var(--ob-hair)" stroke-width="6"/>' +
        '<path d="M 18 52 C 28 50, 42 38, 62 24" style="stroke:var(--ob-pink)" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="62" cy="24" r="6" fill="#F26B1D"/>' +
        '</svg>';
    } else if (idx === 1) {
      svgVisual = '<svg width="64" height="64" viewBox="0 0 80 80" fill="none" style="margin-bottom:14px;">' +
        '<circle cx="40" cy="40" r="32" style="stroke:var(--ob-pink)" stroke-width="5" stroke-linecap="round" stroke-dasharray="160" stroke-dashoffset="30"/>' +
        '<circle cx="40" cy="40" r="22" style="stroke:var(--ob-pink)" stroke-width="5" stroke-linecap="round" stroke-dasharray="110" stroke-dashoffset="20"/>' +
        '<circle cx="40" cy="40" r="12" style="stroke:var(--ob-pink)" stroke-width="5" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="0"/>' +
        '</svg>';
    } else {
      svgVisual = '<svg width="64" height="64" viewBox="0 0 80 80" fill="none" style="margin-bottom:14px;">' +
        '<rect x="10" y="16" width="60" height="48" rx="8" style="fill:var(--ob-glass-hi)"/>' +
        '<path d="M 14 54 C 28 50, 44 36, 66 26 L 66 38 C 44 48, 28 58, 14 60 Z" style="fill:var(--ob-glass-hi)"/>' +
        '<path d="M 14 56 C 28 52, 44 38, 66 28" style="stroke:var(--ob-pink)" stroke-width="3.5" stroke-linecap="round"/>' +
        '<circle cx="44" cy="38" r="4" fill="#F26B1D"/>' +
        '</svg>';
    }

    html += '<div class="how-panel" data-panel="' + idx + '">' +
      svgVisual +
      '<div class="badge badge-blue mb-8">Step ' + escHTML(p.step) + '</div>' +
      '<h3 class="card-title" style="font-size:1.25rem;margin-bottom:8px;">' + escHTML(p.title) + '</h3>' +
      '<p class="card-text" style="font-size:0.95rem;margin-bottom:10px;">' + escHTML(p.text) + '</p>' +
      '<p class="muted" style="font-size:0.84rem;">' + escHTML(p.detail) + '</p>' +
      '</div>';
  });

  html += '</div></div>' +
    '</div></div>';

  container.innerHTML = html;
}

// How often a shelf product is used, from its catalog entry.
function shelfUseFreq(p) {
  var cats = Object.keys(CONTENT.catalog || {});
  for (var i = 0; i < cats.length; i++) {
    var cat = getCatalogProduct(cats[i], p.id);
    if (cat && cat.use) return cat.use.freq + (cat.use.slot === 'AM' ? ' · Morning' : (cat.use.slot === 'PM' ? ' · Night' : ''));
  }
  return p.frequency || 'Daily';
}

/* ---- Section 3: Smart Fork & Bathroom Shelf Setup (with Living Guide Persona) ---- */
function renderSetupSection(container) {
  var profile = Storage.load();

  if (profile && !startState.editing) {
    var concernCfg = Utils.getConcernConfig(profile.concern);
    var pCount = (profile.products || []).length;
    var html = '<div class="container">' +
      '<div class="section-header text-center">' +
        '<h2 class="section-title">Bathroom Shelf</h2>' +
        '<p class="section-subline">' + escHTML(getProfileConcerns(profile).map(function (c) { return Utils.getConcernConfig(c).label; }).join(' + ')) + ' routine · ' + pCount + ' active formula' + (pCount === 1 ? '' : 's') + '</p>' +
        '<p class="official-shelf-sublink" style="font-size:0.88rem;color:var(--ob-pink);margin-top:6px;">' +
          'Need to refill or explore actives? <a href="https://bebodywise.com" target="_blank" rel="noopener" class="store-link-accent" style="color:var(--ob-pink);font-weight:600;text-decoration:underline;">View full ingredients on Be Bodywise ↗</a>' +
        '</p>' +
      '</div>' +

      '<div class="card" style="max-width:620px;margin:0 auto;padding:28px 24px;">' +
        '<div class="shelf-active-list" style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">' +
          (profile.products || []).map(function (p) {
            var daysLeft = Utils.getDaysLeft(p);
            var cycleStr = (daysLeft !== null) ? (daysLeft > 0 ? (daysLeft + ' days left') : 'Refill due') : '30-day cycle';
            return '<div class="shelf-active-item" style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--ob-glass-hi);border:1px solid var(--ob-hair);border-radius:12px;">' +
              '<div class="shelf-item-icon" style="width:36px;height:36px;border-radius:8px;background:var(--ob-glass-hi);display:flex;align-items:center;justify-content:center;color:var(--ob-pink);flex-shrink:0;">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
              '</div>' +
              '<div class="shelf-item-details" style="flex:1;">' +
                '<div class="shelf-item-name" style="font-weight:600;color:var(--ob-head);font-size:0.95rem;">' + escHTML(p.name || 'Bodywise formula') + '</div>' +
                '<div class="shelf-item-meta" style="font-size:0.8rem;color:var(--ob-body);">' + escHTML(shelfUseFreq(p)) + ' · Started ' + Utils.formatDate(p.openedOn || profile.startDate) + '</div>' +
              '</div>' +
              '<span class="shelf-cycle-pill">' + cycleStr + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px;">' +
          '<button type="button" class="btn btn-primary btn-sm" id="btn-go-today">Daily ritual ↓</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="btn-edit-plan">Update shelf formulas</button>' +
        '</div>' +
        '<div class="shelf-refill-row">' +
          '<a href="https://bebodywise.com" target="_blank" rel="noopener" class="btn btn-secondary btn-sm shelf-refill-btn">Refill on Be Bodywise &rarr;</a>' +
        '</div>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    var goTodayBtn = container.querySelector('#btn-go-today');
    if (goTodayBtn) goTodayBtn.addEventListener('click', function () { scrollToSection('today'); });

    var editPlanBtn = container.querySelector('#btn-edit-plan');
    if (editPlanBtn) {
      editPlanBtn.addEventListener('click', function () {
        prefillStartState(profile);
        startState.forkChoice = 'owned';
        startState.step = 1;
        renderSetupSection(container);
      });
    }
    return;
  }

  // If no forkChoice yet: Render Screen 1 "Do you already have a Bodywise product?"
  if (!startState.forkChoice) {
    renderSmartForkScreen(container);
    return;
  }

  // If forkChoice is exploring: Render Curated Discovery Catalog
  if (startState.forkChoice === 'exploring') {
    renderDiscoveryCatalog(container);
    return;
  }

  // If forkChoice is owned: Render Bathroom Shelf Setup
  renderBathroomShelfSetup(container);
}

function renderSmartForkScreen(container) {
  var fork = CONTENT.fork;
  var html = '<div class="container">' +
    '<div class="section-header text-center">' +
      '<h2 class="section-title">Start your routine</h2>' +
      '<p class="section-subline">' + escHTML(fork.why) + '</p>' +
    '</div>' +

    '<div class="card" style="max-width:620px;margin:0 auto;padding:32px 24px;">' +
      '<div class="guide-speech-card">' +
        '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
        '<div class="guide-speech-body">' +
          '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
          '<div class="guide-speech-text">Welcome! Let\'s personalize your companion. Do you already have your Bodywise formulas?</div>' +
        '</div>' +
      '</div>' +

      '<h3 class="card-title text-center mb-16" style="font-size:1.15rem;">' + escHTML(fork.question) + '</h3>' +

      '<div class="fork-options-grid">' +
        '<button type="button" class="fork-card-btn" data-fork="owned">' +
          '<div class="fork-btn-title">' + escHTML(fork.options[0].title) + '</div>' +
          '<div class="fork-btn-desc">' + escHTML(fork.options[0].sub) + '</div>' +
        '</button>' +

        '<button type="button" class="fork-card-btn" data-fork="exploring">' +
          '<div class="fork-btn-title">' + escHTML(fork.options[1].title) + '</div>' +
          '<div class="fork-btn-desc">' + escHTML(fork.options[1].sub) + '</div>' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  container.innerHTML = html;

  container.querySelectorAll('[data-fork]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      startState.forkChoice = this.getAttribute('data-fork');
      startState.step = 0;
      renderSetupSection(container);
    });
  });
}

// 2. Curated Product Discovery
function renderDiscoveryCatalog(container) {
  var discList = CONTENT.discovery || [];
  var html = '<div class="container">' +
    '<div class="section-header text-center">' +
      '<h2 class="section-title">Explore Bodywise routines</h2>' +
      '<p class="section-subline">Browse science-backed formulas on the official store.</p>' +
    '</div>' +

    '<div style="max-width:880px;margin:0 auto;">' +
      '<div class="guide-speech-card" style="margin-bottom:20px;">' +
        '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
        '<div class="guide-speech-body">' +
          '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
          '<div class="guide-speech-text">Find your formula on our official store. When your order arrives, we will set up your bathroom shelf!</div>' +
        '</div>' +
      '</div>' +

      '<div class="discovery-grid mb-24">';

  discList.forEach(function (item) {
    html += '<div class="discovery-card">' +
      '<div class="badge badge-blue mb-8">' + escHTML(item.concern) + '</div>' +
      '<h3 class="card-title" style="font-size:1.15rem;margin-bottom:6px;">' + escHTML(item.product) + '</h3>' +
      '<p class="card-text mb-16" style="font-size:0.88rem;color:var(--text-secondary);">' + escHTML(item.benefit) + '</p>' +
      '<a href="' + escHTML(item.url) + '" target="_blank" rel="noopener" class="outbound-link-btn">' +
        'View formula on Bodywise \u2197' +
      '</a>' +
    '</div>';
  });

  html += '</div>' +
      '<div class="card text-center" style="padding:24px;background:var(--ob-glass-hi);border:1.5px solid var(--ob-hair);">' +
        '<h4 style="font-size:1.05rem;font-weight:700;color:var(--deep-navy);margin-bottom:6px;">Already placed an order?</h4>' +
        '<p class="card-text mb-14" style="font-size:0.9rem;">If your product is on the way, you can build your bathroom shelf now.</p>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
          '<button type="button" class="btn btn-primary" id="btn-ordered-setup">I have ordered, start setup \u2192</button>' +
          '<button type="button" class="btn btn-secondary" id="btn-back-fork">Back</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  container.innerHTML = html;

  var orderedBtn = container.querySelector('#btn-ordered-setup');
  if (orderedBtn) {
    orderedBtn.addEventListener('click', function () {
      startState.forkChoice = 'owned';
      startState.step = 0;
      renderSetupSection(container);
    });
  }

  var backBtn = container.querySelector('#btn-back-fork');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      startState.forkChoice = null;
      renderSetupSection(container);
    });
  }
}

// 3. Bathroom Shelf Setup with Living Guide Speech Bubbles
function renderBathroomShelfSetup(container) {
  var ans = startState.answers;
  ans.ownedProducts = ans.ownedProducts || [];
  ans.concerns = ans.concerns || (ans.concern ? [ans.concern] : []);
  var step = startState.step || 0;
  // Updating an existing plan never asks for the name again.
  if (step === 0 && startState.editing) { step = 1; startState.step = 1; }
  var speech = CONTENT.guide.setupSpeech;

  // Step 0: Name
  if (step === 0) {
    var html = '<div class="container">' +
      '<div class="card" style="max-width:540px;margin:0 auto;padding:32px 24px;">' +
        '<div class="guide-speech-card">' +
          '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
          '<div class="guide-speech-body">' +
            '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
            '<div class="guide-speech-text">' + escHTML(speech.step1) + '</div>' +
          '</div>' +
        '</div>' +
        '<h2 class="section-title mb-4">Your first name</h2>' +
        '<p class="muted mb-16" style="font-size:0.86rem;">To personalize your daily shelf space.</p>' +
        '<div class="field"><label for="user-name">Your first name</label>' +
          '<input type="text" id="user-name" placeholder="e.g. Priya" value="' + escHTML(ans.name) + '" autofocus>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:24px;">' +
          '<button type="button" class="btn btn-primary" id="shelf-next-name">Next step \u2192</button>' +
        '</div>' +
      '</div></div>';

    container.innerHTML = html;

    var input = document.getElementById('user-name');
    if (input) {
      input.addEventListener('focus', function () { this.classList.add('focus-ring-active'); });
      input.addEventListener('blur', function () { this.classList.remove('focus-ring-active'); });
      input.addEventListener('input', function () { ans.name = Utils.toTitleCase(this.value); });
    }

    document.getElementById('shelf-next-name').addEventListener('click', function () {
      if (!ans.name) ans.name = 'Friend';
      startState.step = 1;
      renderBathroomShelfSetup(container);
    });
    return;
  }

  // Step 1: Concern Selection
  if (step === 1) {
    var html = '<div class="container">' +
      '<div class="card" style="max-width:580px;margin:0 auto;padding:32px 24px;">' +
        '<div class="guide-speech-card">' +
          '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
          '<div class="guide-speech-body">' +
            '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
            '<div class="guide-speech-text">' + escHTML(speech.step2) + '</div>' +
          '</div>' +
        '</div>' +
        '<h2 class="section-title mb-4">' + (startState.editing ? 'Choose the focus area' : 'Choose your focus area') + '</h2>' +
        '<p class="muted mb-16" style="font-size:0.86rem;">Pick one or more. We tailor your routine steps to each.</p>' +
        '<div class="chip-group" role="group">';

    CONTENT.quiz.concerns.forEach(function (opt) {
      var sel = ans.concerns.indexOf(opt.value) >= 0;
      html += '<button type="button" class="chip' + (sel ? ' selected focus-ring-active' : '') + '" data-concern="' + opt.value + '">' +
        escHTML(opt.label) +
      '</button>';
    });

    html += '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:24px;">' +
          '<button type="button" class="btn btn-secondary" id="shelf-back-concern">Back</button>' +
          '<button type="button" class="btn btn-primary" id="shelf-next-concern"' + (ans.concerns.length ? '' : ' disabled') + '>Next step \u2192</button>' +
        '</div>' +
      '</div></div>';

    container.innerHTML = html;

    container.querySelectorAll('[data-concern]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var v = this.getAttribute('data-concern');
        var i = ans.concerns.indexOf(v);
        if (i >= 0) ans.concerns.splice(i, 1); else ans.concerns.push(v);
        ans.concern = ans.concerns[0] || null;
        this.classList.toggle('selected', i < 0);
        this.classList.toggle('focus-ring-active', i < 0);
        document.getElementById('shelf-next-concern').disabled = !ans.concerns.length;
      });
    });

    document.getElementById('shelf-back-concern').addEventListener('click', function () {
      if (startState.editing) {
        // Cancel the update and return to the saved shelf.
        startState.editing = false;
        startState.step = 0;
        renderSetupSection(container);
        return;
      }
      startState.step = 0;
      renderBathroomShelfSetup(container);
    });

    document.getElementById('shelf-next-concern').addEventListener('click', function () {
      if (ans.concerns.length) {
        startState.shelfQueue = ans.concerns.slice();
        startState.shelfIdx = 0;
        startState.step = 2;
        renderBathroomShelfSetup(container);
      }
    });
    return;
  }

  // Step 2: Check off Owned Products
  if (step === 2) {
    var queue = (startState.shelfQueue && startState.shelfQueue.length) ? startState.shelfQueue : ans.concerns;
    var qIdx = Math.min(startState.shelfIdx || 0, queue.length - 1);
    var shelfConcern = queue[qIdx];
    var catalog = CONTENT.catalog[shelfConcern] || [];
    var hasForThis = catalog.some(function (p) { return ans.ownedProducts.indexOf(p.id) >= 0; });
    var shelfLabel = Utils.getConcernConfig(shelfConcern).label || shelfConcern;
    var html = '<div class="container">' +
      '<div class="card" style="max-width:640px;margin:0 auto;padding:32px 24px;">' +
        '<div class="guide-speech-card">' +
          '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
          '<div class="guide-speech-body">' +
            '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
            '<div class="guide-speech-text">' + escHTML(speech.step3) + '</div>' +
          '</div>' +
        '</div>' +
        '<h2 class="section-title mb-4">Your bathroom shelf' + (queue.length > 1 ? ' \u00b7 ' + escHTML(shelfLabel) + ' (' + (qIdx + 1) + ' of ' + queue.length + ')' : ' \u00b7 ' + escHTML(shelfLabel)) + '</h2>' +
        '<p class="muted mb-16" style="font-size:0.86rem;">Select every ' + escHTML(String(shelfLabel).toLowerCase()) + ' formula you currently have with you.</p>' +
        '<div class="shelf-products-grid shelf-products-grouped">';

    html += renderGroupedCatalog(shelfConcern, function (p) {
      var isChecked = ans.ownedProducts.indexOf(p.id) >= 0;
      return '<div class="shelf-product-item' + (isChecked ? ' selected focus-ring-active' : '') + '" data-prod-id="' + p.id + '">' +
        '<div class="shelf-checkbox">' + (isChecked ? ICONS.check : '') + '</div>' +
        '<span style="font-size:0.92rem;font-weight:600;color:var(--deep-navy);">' + escHTML(p.name) + '</span>' +
      '</div>';
    });

    html += '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:24px;">' +
          '<button type="button" class="btn btn-secondary" id="shelf-back-concern">Back</button>' +
          '<button type="button" class="btn btn-primary" id="shelf-next-products"' + (hasForThis ? '' : ' disabled') + '>Next step \u2192</button>' +
        '</div>' +
      '</div></div>';

    container.innerHTML = html;

    container.querySelectorAll('.shelf-product-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var pid = this.getAttribute('data-prod-id');
        var idx = ans.ownedProducts.indexOf(pid);
        if (idx >= 0) {
          ans.ownedProducts.splice(idx, 1);
        } else {
          ans.ownedProducts.push(pid);
        }
        renderBathroomShelfSetup(container);
      });
    });

    document.getElementById('shelf-back-concern').addEventListener('click', function () {
      if (qIdx > 0) { startState.shelfIdx = qIdx - 1; }
      else { startState.step = 1; }
      renderBathroomShelfSetup(container);
    });

    document.getElementById('shelf-next-products').addEventListener('click', function () {
      if (!hasForThis) return;
      if (qIdx < queue.length - 1) { startState.shelfIdx = qIdx + 1; }
      else { startState.step = 3; }
      renderBathroomShelfSetup(container);
    });
    return;
  }

  // Step 3: Start Date -> "Build my daily routine"
  if (step === 3) {
    var html = '<div class="container">' +
      '<div class="card" style="max-width:580px;margin:0 auto;padding:32px 24px;">' +
        '<div class="guide-speech-card">' +
          '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
          '<div class="guide-speech-body">' +
            '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
            '<div class="guide-speech-text">' + escHTML(speech.step4) + '</div>' +
          '</div>' +
        '</div>' +
        '<h2 class="section-title mb-16">When did you start?</h2>' +
        '<div class="chip-group mb-24">' +
          '<button type="button" class="chip' + (ans.startBucket === 'notYet' ? ' selected focus-ring-active' : '') + '" data-bucket="notYet">Starting today</button>' +
          '<button type="button" class="chip' + (ans.startBucket === 'under1m' ? ' selected focus-ring-active' : '') + '" data-bucket="under1m">Past 2 weeks</button>' +
          '<button type="button" class="chip' + (ans.startBucket === '1to3m' ? ' selected focus-ring-active' : '') + '" data-bucket="1to3m">1 to 2 months ago</button>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;margin-top:24px;">' +
          '<button type="button" class="btn btn-secondary" id="shelf-back-products">Back</button>' +
          '<button type="button" class="btn btn-primary" id="btn-save-shelf">Build my daily routine \u2192</button>' +
        '</div>' +
      '</div></div>';

    container.innerHTML = html;

    document.getElementById('shelf-back-products').addEventListener('click', function () {
      startState.step = 2;
      var q = (startState.shelfQueue && startState.shelfQueue.length) ? startState.shelfQueue : ans.concerns;
      startState.shelfIdx = Math.max(0, q.length - 1);
      renderBathroomShelfSetup(container);
    });

    container.querySelectorAll('[data-time]').forEach(function (b) {
      b.addEventListener('click', function () {
        ans.routineTime = b.getAttribute('data-time');
        renderBathroomShelfSetup(container);
      });
    });

    container.querySelectorAll('[data-bucket]').forEach(function (b) {
      b.addEventListener('click', function () {
        ans.startBucket = b.getAttribute('data-bucket');
        renderBathroomShelfSetup(container);
      });
    });

    document.getElementById('btn-save-shelf').addEventListener('click', function () {
      var profile = buildProfile(ans, startState.editing ? Storage.load() : null);

      Storage.save(profile);
      clearDraft();
      startState.editing = false;

      // Completion badge with animated character
      var cardEl = container.querySelector('.card');
      if (cardEl) {
        var badge = document.createElement('div');
        badge.className = 'guide-completion-badge';
        var badgeText = (CONTENT.guide && CONTENT.guide.routineReady) ? CONTENT.guide.routineReady.replace(/\n/g, ' ') : 'Your routine is ready.';
        badge.innerHTML = '<div class="guide-avatar-circle" style="width:36px;height:36px;">' + ICONS.guideAvatar + '</div>' +
          '<span>' + escHTML(badgeText) + '</span>';
        cardEl.insertBefore(badge, cardEl.firstChild);
      }

      // Complete all section DOM updates, smoothly transition to #today
      var landOn = (startState.shelfQueue && startState.shelfQueue.length)
        ? startState.shelfQueue[startState.shelfQueue.length - 1] : profile.concern;
      setTimeout(function () {
        renderAllSections();
        enterBodyMap(landOn);

        var floatBtn = document.getElementById('guide-floating-btn');
        if (floatBtn) {
          floatBtn.classList.add('guide-docked-badge');
          var existingChip = floatBtn.querySelector('.guide-floating-speech-chip');
          if (existingChip) existingChip.remove();
          var chip = document.createElement('span');
          chip.className = 'guide-floating-speech-chip';
          chip.textContent = (CONTENT.guide && CONTENT.guide.tapDoubts) || 'Tap me anytime you have doubts.';
          floatBtn.appendChild(chip);
          setTimeout(function () {
            if (chip && chip.parentNode) chip.remove();
          }, 5000);
        }

        var todaySec = document.getElementById('today');
        if (todaySec) {
          todaySec.classList.add('fade-in-entry');
          setTimeout(function () { todaySec.classList.remove('fade-in-entry'); }, 1200);
        }
      }, 350);
      UI.toast('Bathroom shelf ready. Daily ritual generated.');
    });
  }
}

// Override renderStart for direct compatibility
function renderStart() {
  var setupSec = document.getElementById('setup');
  if (setupSec) {
    renderSetupSection(setupSec);
    scrollToSection('setup');
  }
}

/* ---- Section 4: Daily Ritual (with Guide Greeting & Independent Step Toggles) ---- */
function renderCheckinSection(container) {
  var profile = Storage.load();
  if (!profile) { renderPlaceholder(container, 'Daily ritual'); return; }

  var t = CONTENT.checkin;
  var today = Utils.getToday();
  var isCheckedIn = Utils.isCheckedInToday(profile);
  var isRest = Utils.isRestDayToday(profile) && !isCheckedIn;
  var isPaused = Utils.isPaused(profile);
  var checkinToday = Utils.getCheckinForDate(profile, today) || { ritualDone: [] };
  var ritualDone = checkinToday.ritualDone || [];
  var streak = Utils.getStreak(profile.checkins, profile.paused);

  // Time-of-day greeting
  var hour = new Date().getHours();
  var timeSlot = (hour < 12) ? 'morning' : ((hour < 17) ? 'afternoon' : 'evening');
  var greetingText = Utils.templateStr(CONTENT.guide.greetings[timeSlot], {
    name: profile.name || 'friend',
    streak: Math.max(1, streak)
  });

  var steps = getRitualSteps(profile);
  var concerns = getProfileConcerns(profile);
  if (!concerns.length) concerns = ['wellness'];
  var activeTab = concerns.indexOf(window.__ritualTab) >= 0 ? window.__ritualTab : concerns[0];
  var allStepIds = steps.map(function (s) { return s.id; });
  var doneCount = allStepIds.filter(function (id) { return ritualDone.indexOf(id) >= 0; }).length;
  var dayPct = allStepIds.length ? Math.round(doneCount / allStepIds.length * 100) : 0;
  var isSubmitted = !!checkinToday.done;
  var isLocked = isSubmitted && !checkinToday.editing;
  var savedPct = getDayPct(checkinToday);
  var canRest = Utils.canTakeRestDay(profile.checkins);

  var html = '<div class="container">' +
    '<div class="section-header">' +
      '<h2 class="section-title section-title-caps">DAILY RITUAL</h2>' +
      '<p class="section-subline">' + Utils.formatDate(today) + ' · Day ' + (Utils.daysBetween(profile.startDate, today) + 1) + '</p>' +
    '</div>';

  if (isPaused) {
    html += '<div class="callout pause-banner mb-24">' +
      '<strong>' + escHTML(CONTENT.support.pauseHeading) + '</strong> · ' + escHTML(CONTENT.support.pauseBody) +
      ' Ends ' + Utils.formatDate(profile.paused.until) + '. ' +
      '<button type="button" class="btn-link" id="btn-resume">' + escHTML(CONTENT.support.resumeBtn) + '</button>' +
    '</div>';
  }

  html +=
    '<div class="guide-speech-card">' +
      '<div class="guide-avatar-circle">' + ICONS.guideAvatar + '</div>' +
      '<div class="guide-speech-body">' +
        '<div class="guide-speech-title">' + escHTML(CONTENT.guide.avatarTitle) + '</div>' +
        '<div class="guide-speech-text">' + escMultiline(greetingText) + '</div>' +
      '</div>' +
    '</div>' +


    '<div class="checkin-grid">' +
      '<div class="checkin-left-col">' +
        '<div class="card ritual-checklist-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<div><h3 class="card-title" style="margin-bottom:2px;">Your products today</h3></div>' +
            '<span class="badge badge-blue">' + doneCount + '/' + allStepIds.length + ' done</span>' +
          '</div>' +
          '<div class="choice-tabs" role="tablist" aria-label="Your chosen areas">';
  concerns.forEach(function (c) {
    var cSteps = steps.filter(function (st) { return st.concern === c; });
    var cDone = cSteps.filter(function (st) { return ritualDone.indexOf(st.id) >= 0; }).length;
    html += '<button type="button" role="tab" class="choice-tab' + (c === activeTab ? ' is-active' : '') + '" data-choice-tab="' + escHTML(c) + '" aria-selected="' + (c === activeTab) + '">' +
      escHTML(Utils.getConcernConfig(c).label || c) + ' <span class="choice-tab-count">' + cDone + '/' + cSteps.length + '</span></button>';
  });
  html += '</div>' +
          '<p class="card-text mb-14" style="font-size:0.86rem;color:var(--text-secondary);">' +
            (isLocked ? 'Today is submitted. Tap Edit if you need to change it.' : 'Tick each product as you use it. Partial days count.') +
          '</p>';

  var lastSlotByConcern = {};
  steps.forEach(function (step) {
    var isStepDone = ritualDone.indexOf(step.id) >= 0;
    var hiddenAttr = (step.concern !== activeTab ? ' hidden' : '');
    if (lastSlotByConcern[step.concern] !== step.slot) {
      lastSlotByConcern[step.concern] = step.slot;
      html += '<div class="ritual-slot-head" data-concern="' + escHTML(step.concern) + '"' + hiddenAttr + '>' +
        '<span class="ritual-slot-pill ritual-slot-' + step.slot.toLowerCase() + '">' + step.slot + '</span>' +
        '<span>' + (step.slot === 'AM' ? 'Morning' : 'Night') + '</span></div>';
    }
    var body = step.product
      ? '<span class="ritual-step-product">' + escHTML(step.product) + '</span>' +
        '<span class="ritual-step-how">' + escHTML(firstSentence(step.text)) + '</span>' +
        '<span class="ritual-step-freq">' + escHTML(step.freq) + '</span>'
      : '<span class="ritual-step-how"><strong>' + step.slot + ':</strong> ' + escHTML(step.text) + '</span>';
    html += '<div class="ritual-step-item' + (isStepDone ? ' checked' : '') + (isLocked ? ' locked' : '') + '" data-step-id="' + escHTML(step.id) + '" data-concern="' + escHTML(step.concern) + '"' + hiddenAttr + ' role="checkbox" aria-checked="' + isStepDone + '" aria-disabled="' + isLocked + '" tabindex="0">' +
      '<div class="ritual-checkbox">' + (isStepDone ? ICONS.check : '') + '</div>' +
      '<span class="ritual-step-text">' + body + '</span>' +
    '</div>';
  });

  html += '<div class="day-progress" aria-label="Today\'s progress">' +
      '<div class="day-progress-head"><span>Today\'s progress</span><strong>' + (isLocked ? savedPct : dayPct) + '%</strong></div>' +
      '<div class="day-progress-track"><div class="day-progress-fill" style="width:' + (isLocked ? savedPct : dayPct) + '%"></div></div>' +
    '</div>';
  if (isLocked) {
    html += '<div class="day-submit-row"><span class="day-submitted-note">' + ICONS.check + ' Submitted: ' + savedPct + '% done today</span>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="btn-edit-day">Edit</button></div>';
  } else {
    html += '<div class="day-submit-row">' +
      '<button type="button" class="btn btn-primary" id="btn-submit-day"' + (doneCount ? '' : ' disabled') + '>' +
        (checkinToday.editing ? 'Save changes (' + dayPct + '%)' : 'Submit ' + dayPct + '% for today') + '</button>' +
      (checkinToday.editing ? '<button type="button" class="btn-text-link" id="btn-cancel-edit">Cancel</button>' : '') +
    '</div>';
  }

  var ringFull = isCheckedIn || isRest;
  var ringColor = isRest && !isCheckedIn ? 'var(--ob-soft)' : 'var(--ob-pink)';
  var ringInner;
  if (isCheckedIn) {
    ringInner = '<path class="ring-check" d="M 60 92 L 80 112 L 122 70" style="stroke:var(--ob-pink)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  } else if (isRest) {
    ringInner = '<text x="90" y="86" text-anchor="middle" font-family="Figtree, sans-serif" font-size="14" font-weight="600" style="fill:var(--ob-body)">REST</text><text x="90" y="108" text-anchor="middle" font-family="Figtree, sans-serif" font-size="17" font-weight="700" style="fill:var(--ob-head)">DAY</text>';
  } else {
    ringInner = '<text x="90" y="86" text-anchor="middle" font-family="Figtree, sans-serif" font-size="14" font-weight="600" style="fill:var(--ob-body)">TAP TO</text><text x="90" y="108" text-anchor="middle" font-family="Figtree, sans-serif" font-size="17" font-weight="700" style="fill:var(--ob-head)">COMPLETE</text>';
  }

  var statusHeading = isCheckedIn ? 'Ritual complete today' : (isRest ? t.restDayTaken : 'Daily status');
  var statusText = isCheckedIn
    ? savedPct + '% logged today. Your streak is ' + streak + (streak === 1 ? ' day.' : ' days.')
    : (isRest ? t.restDaySub : 'Complete your ritual to log today.');

  var restControl = '';
  if (isRest) {
    restControl = '<button type="button" class="btn-text-link" id="btn-undo-rest">' + escHTML(t.undo) + '</button>';
  } else if (!isCheckedIn) {
    restControl = canRest
      ? '<button type="button" class="btn-text-link" id="btn-rest">' + escHTML(t.takeRestDay) + '</button>'
      : '<p class="muted">' + escHTML(t.restLimitNotice) + '</p>';
  }

  html += (isLocked ? '' : '<button type="button" class="btn-mark-all-done" id="btn-mark-all-done">' +
      ICONS.check +
      '<span>Tick every step</span>' +
    '</button>') +
  '</div></div>' +

      '<div class="checkin-right-col">' +
        '<div class="card text-center" style="padding:28px 20px;">' +
          '<div class="ring-container mb-16" style="display:flex;justify-content:center;">' +
            '<svg class="checkin-ring' + (isCheckedIn ? ' done pulse' : '') + '" width="140" height="140" viewBox="0 0 180 180" id="ring-btn" role="button" tabindex="0" aria-pressed="' + isCheckedIn + '" aria-label="Toggle today\'s check-in" style="cursor:pointer;">' +
              '<circle cx="90" cy="90" r="76" style="stroke:var(--ob-hair)" stroke-width="12" fill="none"/>' +
              '<circle class="ring-track" cx="90" cy="90" r="76" style="stroke:' + ringColor + ';transition:stroke-dashoffset 0.6s var(--ease-out);" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="477.5" stroke-dashoffset="' + (ringFull ? '0' : '477.5') + '"/>' +
              ringInner +
            '</svg>' +
          '</div>' +
          '<h3 class="card-title mb-6">' + escHTML(statusHeading) + '</h3>' +
          '<p class="card-text mb-8" style="font-size:0.9rem;">' + escHTML(statusText) + '</p>' +
          '<div class="mb-16">' + restControl + '</div>' +
          '<div class="dot-row-container mb-12">' +
            renderDotGrid(profile) +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  container.innerHTML = html;

  // Runs `mutator` on a fresh copy of the stored profile (never a stale one),
  // saves, then redraws everything that depends on check-ins.
  function updateDay(date, mutator, toastMsg, focusSel) {
    var p = Storage.load();
    if (!p) return;
    p.checkins = p.checkins || [];
    var ci = Utils.getCheckinForDate(p, date);
    if (!ci) {
      ci = { date: date, done: false, rest: false, mood: null, ritualDone: [] };
      p.checkins.push(ci);
    }
    ci.ritualDone = ci.ritualDone || [];
    mutator(ci);
    Storage.save(p);
    renderCheckinSection(container);
    refreshPrimaryCard();
    refreshSections(['bodymap', 'results', 'nextstep']);
    if (focusSel) {
      var f = container.querySelector(focusSel);
      if (f && f.focus) f.focus();
    }
    if (toastMsg) UI.toast(typeof toastMsg === 'function' ? toastMsg(ci) : toastMsg);
  }

  function toggleDay(date, msgFn, focusSel) {
    updateDay(date, function (ci) {
      if (ci.done) {
        ci.done = false;
        ci.pct = 0;
        ci.ritualDone = [];
      } else {
        ci.done = true;
        ci.rest = false;
        ci.pct = 100;
        ci.ritualDone = allStepIds.slice();
      }
      ci.editing = false;
    }, msgFn, focusSel);
  }

  function onActivate(el, fn) {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
  }

  var resumeBtn = container.querySelector('#btn-resume');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', function () {
      var p = Storage.load();
      if (!p) return;
      p.paused = null;
      Storage.save(p);
      renderCheckinSection(container);
      refreshSections(['results', 'nextstep']);
      UI.toast('Routine resumed');
    });
  }

  container.querySelectorAll('.ritual-step-item').forEach(function (item) {
    onActivate(item, function () {
      if (isLocked) { UI.toast('Tap Edit to change today'); return; }
      var stepId = item.getAttribute('data-step-id');
      updateDay(today, function (ci) {
        var i = ci.ritualDone.indexOf(stepId);
        if (i >= 0) ci.ritualDone.splice(i, 1);
        else ci.ritualDone.push(stepId);
        if (ci.ritualDone.length) ci.rest = false;
      }, null, '[data-step-id="' + stepId + '"]');
    });
  });

  container.querySelectorAll('[data-choice-tab]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var c = tab.getAttribute('data-choice-tab');
      window.__ritualTab = c;
      container.querySelectorAll('[data-choice-tab]').forEach(function (b) {
        var on = b === tab;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      container.querySelectorAll('.ritual-step-item, .ritual-slot-head').forEach(function (it) {
        it.hidden = it.getAttribute('data-concern') !== c;
      });
    });
  });

  var submitBtn = container.querySelector('#btn-submit-day');
  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      updateDay(today, function (ci) {
        var n = allStepIds.filter(function (id) { return ci.ritualDone.indexOf(id) >= 0; }).length;
        ci.pct = allStepIds.length ? Math.round(n / allStepIds.length * 100) : 0;
        ci.done = ci.pct > 0;
        ci.savedDone = ci.ritualDone.slice();
        ci.editing = false;
        if (ci.done) ci.rest = false;
      }, function (ci) { return ci.pct + '% saved for today'; }, '#btn-edit-day');
    });
  }
  var editBtn = container.querySelector('#btn-edit-day');
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      updateDay(today, function (ci) { ci.editing = true; }, null, '#btn-submit-day');
    });
  }
  var cancelEditBtn = container.querySelector('#btn-cancel-edit');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', function () {
      updateDay(today, function (ci) {
        ci.editing = false;
        if (ci.savedDone) ci.ritualDone = ci.savedDone.slice();
      }, null, '#btn-edit-day');
    });
  }

  var markAllBtn = container.querySelector('#btn-mark-all-done');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', function () {
      updateDay(today, function (ci) {
        ci.ritualDone = allStepIds.slice();
        ci.rest = false;
      }, 'All steps ticked. Submit to save today.', '#btn-submit-day');
    });
  }

  var ringBtn = container.querySelector('#ring-btn');
  if (ringBtn) {
    onActivate(ringBtn, function () {
      toggleDay(today, function (ci) {
        return ci.done ? 'Ritual recorded for today' : 'Check-in undone';
      }, '#ring-btn');
    });
  }

  var restBtn = container.querySelector('#btn-rest');
  if (restBtn) {
    restBtn.addEventListener('click', function () {
      updateDay(today, function (ci) {
        ci.rest = true;
        ci.done = false;
        ci.ritualDone = [];
      }, t.restDayTaken);
    });
  }

  var undoRestBtn = container.querySelector('#btn-undo-rest');
  if (undoRestBtn) {
    undoRestBtn.addEventListener('click', function () {
      updateDay(today, function (ci) { ci.rest = false; }, 'Rest day removed');
    });
  }

  // The last few days can be filled in or corrected from the calendar dots.
  container.querySelectorAll('.dot[data-date]').forEach(function (dot) {
    var date = dot.getAttribute('data-date');
    onActivate(dot, function () {
      toggleDay(date, function (ci) {
        return (ci.done ? 'Marked done for ' : 'Cleared ') + Utils.formatDate(date);
      }, '.dot[data-date="' + date + '"]');
    });
  });
}


// Keeps only the first sentence so short cards stay easy to scan.
function firstSentence(text) {
  var t = String(text || '').trim();
  var m = t.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : t;
}

function getMilestoneForWeek(cfg, w) {
  var list = (cfg && cfg.milestones) || [];
  for (var i = 0; i < list.length; i++) {
    var ms = list[i];
    var fw = ms.fromWeek || 1;
    var tw = ms.toWeek || fw;
    if (w >= fw && w <= tw) return ms;
  }
  if (list.length > 0 && w >= list[list.length - 1].toWeek) {
    return list[list.length - 1];
  }
  return list[0] || { fromWeek: 1, toWeek: 2, title: 'Adjusting', beneath: 'Cellular adjustments underway.', expect: 'Normal pace of progress.' };
}

/* ---- Section 5: Timeline (Upgraded Timeline Placards with Beneath & Expect Bullets) ---- */
function renderTimelineSection(container) {
  var profile = Storage.load();

  if (!profile) {
    // Preview only: nothing is saved until the person completes setup.
    profile = { concern: 'hair', startDate: Utils.getToday(), checkins: [], weeklyRatings: [], products: [] };
  }

  var cfg = Utils.getConcernConfig(profile.concern);
  var currentWk = Utils.getWeekNumber(profile.startDate);
  var weeksLeft = cfg.earlyWindowWeeks - currentWk;
  var etaText = (weeksLeft > 0)
    ? ('First changes usually from week ' + cfg.earlyWindowWeeks + '. About ' + weeksLeft + ' weeks to go.')
    : ('Past week ' + cfg.earlyWindowWeeks + '. Deeper changes build with continued routine.');

  var initialMs = getMilestoneForWeek(cfg, currentWk);
  var initFromW = initialMs.fromWeek || 1;
  var initToW = initialMs.toWeek || initFromW;
  var initDur = (initFromW === initToW) ? ('Week ' + initFromW) : ('Weeks ' + initFromW + '–' + initToW);
  var initBeneath = initialMs.beneath || (initialMs.text ? initialMs.text.split('.')[0] + '.' : 'Cellular adjustments underway.');
  var initExpect = initialMs.expect || (initialMs.text && initialMs.text.indexOf('.') !== -1 ? initialMs.text.substring(initialMs.text.indexOf('.') + 1).trim() : (initialMs.text || 'Normal pace of progress.'));

  // What each product on the shelf is doing in a given week.
  var shelfForTimeline = getShelfProductsFor(profile, profile.concern);
  function shelfPhaseHTML(w) {
    var phase = w < cfg.earlyWindowWeeks ? 'early' : (w < cfg.earlyWindowWeeks + 4 && w < cfg.fullWindowWeeks ? 'mid' : 'late');
    return shelfForTimeline.map(function (p) {
      var g = getCatalogGroup(profile.concern, p.group);
      var note = g && g.phases ? g.phases[phase] : '';
      return '<li><strong>' + escHTML(p.name) + '</strong><span>' + escHTML(firstSentence(note)) + '</span></li>';
    }).join('');
  }

  var html = '<div class="container">' +
    '<div class="section-header text-center">' +
      '<h2 class="section-title">Your timeline</h2>' +
      '<p class="section-subline">Week ' + currentWk + ' of ' + cfg.fullWindowWeeks + ' · ' + escHTML(cfg.label) + ' routine</p>' +
    '</div>' +

    '<div class="timeline-interactive-stage">' +
      // The Dynamic Floating Informatics Card (Hovering above the week track - Image 2)
      '<div class="timeline-informatics-card timeline-placard current current-placard" id="timeline-informatics-card">' +
        '<div class="placard-header">' +
          '<div class="placard-meta-row">' +
            '<span class="placard-duration milestone-badge" id="info-duration">' + initDur + '</span>' +
            '<span class="placard-status-badge milestone-badge-tag current" id="info-status">' +
              '<span class="status-pulse-dot"></span> Current' +
            '</span>' +
            '<span class="placard-you-are-here" id="info-you-are-here">You are here</span>' +
          '</div>' +
        '</div>' +
        '<h3 class="placard-title milestone-title" id="info-title">' + escHTML(initialMs.title) + '</h3>' +
        '<div class="placard-bullets milestone-content">' +
          '<div class="placard-bullet placard-bullet-beneath">' +
            '<span class="placard-bullet-label">Beneath the surface</span>' +
            '<span class="placard-bullet-text" id="info-beneath">' + escHTML(firstSentence(initBeneath)) + '</span>' +
          '</div>' +
          '<div class="placard-bullet placard-bullet-expect">' +
            '<span class="placard-bullet-label">What to expect</span>' +
            '<span class="placard-bullet-text" id="info-expect">' + escHTML(firstSentence(initExpect)) + '</span>' +
          '</div>' +
          (shelfForTimeline.length ?
          '<div class="placard-bullet placard-bullet-shelf">' +
            '<span class="placard-bullet-label">Your products</span>' +
            '<ul class="placard-shelf-list" id="info-shelf">' + shelfPhaseHTML(currentWk) + '</ul>' +
          '</div>' : '') +
        '</div>' +
        '<div class="informatics-pointer-arrow" id="informatics-pointer"></div>' +
      '</div>' +

      // 12-Week Interactive Scrubber Track (Image 3)
      '<div class="timeline-scrubber-wrapper">' +
        '<div class="timeline-scrubber-track" id="timeline-scrubber-track">';

  for (var w = 1; w <= cfg.fullWindowWeeks; w++) {
    var isCur = (w === currentWk);
    var isEarly = (w < cfg.earlyWindowWeeks);
    var isMid = (w >= cfg.earlyWindowWeeks && w < cfg.earlyWindowWeeks + 4);
    var phaseName = isEarly ? 'Adjusting' : (isMid ? 'Early signs' : 'Steadier');

    html += '<div class="interactive-week-card' + (isCur ? ' is-current scrub-active' : '') + '" data-week="' + w + '">' +
      (isCur ? '<span class="scrub-current-tag">You are here</span>' : '') +
      '<span class="scrub-week-pill">W' + w + '</span>';

    if (isEarly) {
      html += '<svg class="scrub-week-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>';
    } else if (isMid) {
      html += '<svg class="scrub-week-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/></svg>';
    } else {
      html += '<svg class="scrub-week-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>';
    }

    html += '<span class="scrub-week-label">' + phaseName + '</span>' +
    '</div>';
  }

  html += '</div></div>' +
      '<div style="max-width:680px;width:100%;margin-top:10px;">' +
        '<p class="status-line mb-16 text-center" style="font-weight:600;">' + etaText + '</p>' +
        '<div class="card text-center" style="padding:20px 24px;">' +
          '<h3 class="card-title" style="font-size:1.05rem;margin-bottom:6px;">Why your pace is perfect</h3>' +
          '<p class="card-text" style="font-size:0.9rem;">' + escHTML(cfg.why) + '</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  container.innerHTML = html;

  var trackEl = container.querySelector('#timeline-scrubber-track');
  var cardEl = container.querySelector('#timeline-informatics-card');
  var durEl = container.querySelector('#info-duration');
  var statusEl = container.querySelector('#info-status');
  var yahEl = container.querySelector('#info-you-are-here');
  var titleEl = container.querySelector('#info-title');
  var beneathEl = container.querySelector('#info-beneath');
  var expectEl = container.querySelector('#info-expect');
  var arrowEl = container.querySelector('#informatics-pointer');

  function updateScrubberToWeek(targetW, activeCardEl) {
    var ms = getMilestoneForWeek(cfg, targetW);
    var fw = ms.fromWeek || 1;
    var tw = ms.toWeek || fw;
    var durLabel = (fw === tw) ? ('Week ' + fw) : ('Weeks ' + fw + '–' + tw);
    var isPass = (currentWk > tw);
    var isCur = (currentWk >= fw && currentWk <= tw);
    var statusClass = isPass ? 'completed' : (isCur ? 'current' : 'upcoming');
    var statusText = isPass ? 'Completed' : (isCur ? 'Current' : 'Upcoming');

    var bText = ms.beneath || (ms.text ? ms.text.split('.')[0] + '.' : 'Cellular adjustments underway.');
    var eText = ms.expect || (ms.text && ms.text.indexOf('.') !== -1 ? ms.text.substring(ms.text.indexOf('.') + 1).trim() : (ms.text || 'Normal pace of progress.'));

    if (durEl) durEl.textContent = durLabel;
    if (statusEl) {
      statusEl.className = 'placard-status-badge milestone-badge-tag ' + statusClass;
      statusEl.innerHTML = (isCur ? '<span class="status-pulse-dot"></span> ' : '') + statusText;
    }
    if (yahEl) {
      yahEl.style.visibility = (targetW === currentWk) ? 'visible' : 'hidden';
    }
    if (titleEl) titleEl.textContent = ms.title;
    if (beneathEl) beneathEl.textContent = firstSentence(bText);
    if (expectEl) expectEl.textContent = firstSentence(eText);
    var shelfEl = container.querySelector('#info-shelf');
    if (shelfEl) shelfEl.innerHTML = shelfPhaseHTML(targetW);

    if (activeCardEl && arrowEl && trackEl && cardEl) {
      var trackRect = trackEl.getBoundingClientRect();
      var cardRect = cardEl.getBoundingClientRect();
      var activeRect = activeCardEl.getBoundingClientRect();
      var centerRelative = (activeRect.left + activeRect.width / 2) - cardRect.left;
      var clampCenter = Math.max(24, Math.min(cardRect.width - 24, centerRelative));
      arrowEl.style.left = clampCenter + 'px';
    }

    container.querySelectorAll('.interactive-week-card').forEach(function (c) {
      if (parseInt(c.getAttribute('data-week'), 10) === targetW) {
        c.classList.add('scrub-active');
      } else {
        c.classList.remove('scrub-active');
      }
    });
  }

  // Initial arrow alignment
  var currentCardEl = container.querySelector('.interactive-week-card[data-week="' + currentWk + '"]');
  if (currentCardEl) {
    setTimeout(function () {
      updateScrubberToWeek(currentWk, currentCardEl);
    }, 50);
  }

  // Horizontal drag and scroll listeners
  var wrapperEl = container.querySelector('.timeline-scrubber-wrapper');
  if (wrapperEl) {
    wrapperEl.addEventListener('scroll', function () {
      var curActive = container.querySelector('.interactive-week-card.scrub-active');
      if (curActive && arrowEl && cardEl) {
        var cardRect = cardEl.getBoundingClientRect();
        var activeRect = curActive.getBoundingClientRect();
        var centerRelative = (activeRect.left + activeRect.width / 2) - cardRect.left;
        var clampCenter = Math.max(24, Math.min(cardRect.width - 24, centerRelative));
        arrowEl.style.left = clampCenter + 'px';
      }
    }, { passive: true });

    var isDragDown = false;
    var startDragX = 0;
    var startScrollLeft = 0;
    wrapperEl.addEventListener('mousedown', function (e) {
      isDragDown = true;
      startDragX = e.pageX - wrapperEl.offsetLeft;
      startScrollLeft = wrapperEl.scrollLeft;
    });
    window.addEventListener('mouseup', function () { isDragDown = false; });
    wrapperEl.addEventListener('mousemove', function (e) {
      if (!isDragDown) return;
      var x = e.pageX - wrapperEl.offsetLeft;
      var walk = (x - startDragX) * 1.5;
      wrapperEl.scrollLeft = startScrollLeft - walk;
    });
  }

  // Scrub listeners on cards
  container.querySelectorAll('.interactive-week-card').forEach(function (card) {
    card.addEventListener('mouseenter', function () {
      var w = parseInt(this.getAttribute('data-week'), 10);
      updateScrubberToWeek(w, this);
    });

    card.addEventListener('click', function () {
      var w = parseInt(this.getAttribute('data-week'), 10);
      updateScrubberToWeek(w, this);
    });
  });

  if (trackEl) {
    trackEl.addEventListener('mouseleave', function () {
      var curCard = container.querySelector('.interactive-week-card[data-week="' + currentWk + '"]');
      if (curCard) updateScrubberToWeek(currentWk, curCard);
    });
  }
}


// Records that Mind Space was used today so the left checklist ticks it off.
function isMindVisitedToday(profile) {
  if (!profile) return false;
  var ci = Utils.getCheckinForDate(profile, Utils.getToday());
  return !!(ci && (ci.mood || ci.mindVisited));
}
function markMindVisited() {
  var p = Storage.load();
  if (!p) return;
  if (isMindVisitedToday(p)) return;
  if (!Array.isArray(p.checkins)) p.checkins = [];
  var today = Utils.getToday();
  var ci = Utils.getCheckinForDate(p, today);
  if (!ci) {
    ci = { date: today, done: false, rest: false, mood: null, ritualDone: [] };
    p.checkins.push(ci);
  }
  ci.mindVisited = true;
  Storage.save(p);
  try { renderDesktopRail(); } catch (e) { /* rail is optional */ }
}
window.markMindVisited = markMindVisited;

/* ---- Section 6: Mind Space (Breathing Pacer, Affirmation & Emotional Weather) ---- */
function renderMindSection(container) {
  var profile = Storage.load();
  var mind = CONTENT.mindSpace || {};
  var today = Utils.getToday();
  var ci = profile ? Utils.getCheckinForDate(profile, today) : null;
  var currentMood = (ci && ci.mood) || null;
  var mindset = Utils.getDailyMindsetQuote(today);

  var html = '<div class="container">' +
    '<div class="section-header text-center">' +
      '<h2 class="section-title">' + escHTML(mind.title || 'Mind Space') + '</h2>' +
      '<p class="section-subline">' + escHTML(mind.subline) + '</p>' +
    '</div>' +

    '<div class="mind-space-grid">' +
      // 1. 60-Second Calm Breathing Pacer
      '<div class="breathing-card">' +
        '<div class="badge badge-blue mb-8">Nervous system reset</div>' +
        '<h3 class="card-title" style="font-size:1.2rem;margin-bottom:4px;">' + escHTML(mind.breathing.title) + '</h3>' +
        '<p class="card-text mb-16" style="font-size:0.88rem;color:var(--text-secondary);">' + escHTML(mind.breathing.hint) + '</p>' +

        '<div class="breathing-circle-wrapper bw-pacer">' +
          '<div class="breathing-circle-track"></div>' +
          '<div class="breathing-circle-core" id="breathing-core" role="button" tabindex="0" title="Tap circle to start or pause breathing">' +
            '<span class="breathing-fill" aria-hidden="true"></span>' +
            '<span id="breathing-label" class="breathing-label">Tap to start</span>' +
          '</div>' +
        '</div>' +
        '<p class="breathing-hint" id="breathing-hint">Tap circle to start / pause</p>' +
      '</div>' +

      // 2. Daily mindset (tap to shuffle)
      '<div class="mindset-card mind-mindset bw-mindset" id="daily-mindset-card" role="button" tabindex="0" title="Show another quote">' +
        '<div class="bw-mindset-top">' +
          '<div class="mindset-badge">Daily mindset</div>' +
          '<span class="mindset-card-shuffle-hint">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>' +
            'Tap to shuffle</span>' +
        '</div>' +
        '<div class="bw-mindset-body">' +
          '<div class="bw-mindset-mark bw-mindset-mark-open" aria-hidden="true">\u201C</div>' +
          '<div class="mindset-quote" id="mindset-quote-text" style="transition:opacity 0.2s ease;">' + escHTML(mindset.quote) + '</div>' +
          '<div class="bw-mindset-mark bw-mindset-mark-close" aria-hidden="true">\u201D</div>' +
        '</div>' +
        '<div class="mindset-author bw-mindset-theme" style="transition:opacity 0.2s ease;"><span class="bw-mindset-theme-label">Theme</span><span id="mindset-author-text">' + escHTML(mindset.author) + '</span></div>' +
      '</div>' +
    '</div>' +

    // 3. Emotional Weather Check-in
    '<div class="weather-selector-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<h3 class="card-title" style="font-size:1.1rem;margin-bottom:4px;">' + escHTML(mind.weather.title) + '</h3>' +
          '<p class="card-text" style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:0;">' + escHTML(mind.weather.subline) + '</p>' +
        '</div>' +
        '<span class="badge badge-blue" id="mood-status-badge">' + (currentMood ? 'Logged: ' + escHTML(currentMood) : 'Not logged today') + '</span>' +
      '</div>' +
      '<div class="mood-selector-grid">';

  (mind.weather.moods || []).forEach(function (m) {
    var isSel = (currentMood === m.label);
    html += '<button type="button" class="mood-chip-btn' + (isSel ? ' selected focus-ring-active' : '') + '" data-mood="' + escHTML(m.label) + '">' +
      '<span>' + escHTML(m.label) + '</span>' +
      '<span style="font-size:0.75rem;font-weight:400;color:var(--text-secondary);">' + escHTML(m.note) + '</span>' +
    '</button>';
  });

  html += '</div></div>' +
  '</div>';

  container.innerHTML = html;

  // Spending a few seconds in Mind Space counts as going through it today.
  if (profile && !isMindVisitedToday(profile) && 'IntersectionObserver' in window) {
    var mindDwell = null;
    var mindObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var seen = en.isIntersecting && (en.intersectionRatio >= 0.45 || en.intersectionRect.height >= window.innerHeight * 0.6);
        if (seen) {
          if (!mindDwell) mindDwell = setTimeout(function () { markMindVisited(); mindObs.disconnect(); }, 2500);
        } else if (mindDwell) { clearTimeout(mindDwell); mindDwell = null; }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 1] });
    mindObs.observe(container);
  }

  var mindsetCardEl = container.querySelector('#daily-mindset-card');
  if (mindsetCardEl) {
    var quotes = CONTENT.mindsetQuotes || [];
    var quoteIdx = Math.max(0, quotes.indexOf(mindset));
    var shuffle = function () {
      if (quotes.length < 2) return;
      quoteIdx = (quoteIdx + 1) % quotes.length;
      var nextQ = quotes[quoteIdx];
      var qText = container.querySelector('#mindset-quote-text');
      var qAuth = container.querySelector('#mindset-author-text');
      var qTheme = container.querySelector('.bw-mindset-theme');
      qText.style.opacity = '0'; if (qTheme) qTheme.style.opacity = '0';
      setTimeout(function () {
        qText.textContent = nextQ.quote; qAuth.textContent = nextQ.author;
        qText.style.opacity = '1'; if (qTheme) qTheme.style.opacity = '1';
      }, 150);
    };
    mindsetCardEl.addEventListener('click', function () { shuffle(); markMindVisited(); });
    mindsetCardEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shuffle(); }
    });
  }

  // Breathing pacer controller: in 5.5s / hold 5.5s / out 5.5s, repeated for 60 seconds.
  var isBreathingActive = false;
  var breathTimer = null;
  var tickTimer = null;
  var secondsLeft = 60;
  var phaseIdx = 0;
  var coreEl = container.querySelector('#breathing-core');
  var labelEl = container.querySelector('#breathing-label');
  var hintEl = container.querySelector('#breathing-hint');
  var PHASES = [
    { cls: 'inhaling', text: mind.breathing.inhale || 'Breathe in' },
    { cls: 'holding', text: mind.breathing.hold || 'Hold' },
    { cls: 'exhaling', text: mind.breathing.exhale || 'Breathe out' }
  ];

  function setHint() {
    if (!hintEl) return;
    hintEl.textContent = isBreathingActive
      ? secondsLeft + 's left · tap circle to pause'
      : (secondsLeft < 60 && secondsLeft > 0 ? 'Paused at ' + secondsLeft + 's · tap circle to resume' : 'Tap circle to start / pause');
  }

  function stopTimers() {
    clearTimeout(breathTimer); breathTimer = null;
    clearInterval(tickTimer); tickTimer = null;
  }

  function finish() {
    isBreathingActive = false;
    stopTimers();
    secondsLeft = 60; phaseIdx = 0;
    if (coreEl) { coreEl.className = 'breathing-circle-core'; coreEl.setAttribute('aria-pressed', 'false'); }
    if (labelEl) labelEl.textContent = 'Well done';
    if (hintEl) hintEl.textContent = '60 seconds complete · tap to go again';
    markMindVisited();
  }

  function runPhase() {
    if (!isBreathingActive || !document.body.contains(coreEl)) { isBreathingActive = false; stopTimers(); return; }
    var ph = PHASES[phaseIdx % 3];
    labelEl.textContent = ph.text;
    // Restart the CSS animation even when the class repeats.
    coreEl.className = 'breathing-circle-core';
    void coreEl.offsetWidth;
    coreEl.className = 'breathing-circle-core is-running ' + ph.cls;
    breathTimer = setTimeout(function () {
      phaseIdx++;
      if (secondsLeft <= 0) { finish(); return; }
      runPhase();
    }, 5500);
  }

  function toggleBreathing() {
    isBreathingActive = !isBreathingActive;
    if (coreEl) coreEl.setAttribute('aria-pressed', String(isBreathingActive));
    if (isBreathingActive) {
      if (secondsLeft <= 0) secondsLeft = 60;
      tickTimer = setInterval(function () {
        if (!document.body.contains(coreEl)) { isBreathingActive = false; stopTimers(); return; }
        secondsLeft = Math.max(0, secondsLeft - 1);
        setHint();
      }, 1000);
      runPhase();
    } else {
      stopTimers();
      if (coreEl) coreEl.className = 'breathing-circle-core';
      if (labelEl) labelEl.textContent = 'Paused';
    }
    setHint();
  }

  if (coreEl) {
    coreEl.setAttribute('aria-pressed', 'false');
    coreEl.addEventListener('click', toggleBreathing);
    coreEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleBreathing();
      }
    });
  }

  // Emotional weather mood chip handler
  container.querySelectorAll('[data-mood]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var moodVal = this.getAttribute('data-mood');
      var freshProf = Storage.load();
      if (freshProf) {
        if (!Array.isArray(freshProf.checkins)) freshProf.checkins = [];
        var c = Utils.getCheckinForDate(freshProf, Utils.getToday());
        if (!c) {
          c = { date: Utils.getToday(), done: false, rest: false, mood: moodVal, ritualDone: [] };
          freshProf.checkins.push(c);
        } else {
          c.mood = moodVal;
        }
        Storage.save(freshProf);
        try { renderDesktopRail(); } catch (e) { /* rail is optional */ }
      }
      container.querySelectorAll('[data-mood]').forEach(function (b) { b.classList.remove('selected', 'focus-ring-active'); });
      this.classList.add('selected', 'focus-ring-active');
      var badge = document.getElementById('mood-status-badge');
      if (badge) badge.textContent = 'Logged: ' + moodVal;
      UI.toast(mind.weather.loggedNotice);
    });
  });
}

/* ---- Section 7: Tangible Micro-markers (Results) ---- */
function renderResultsSection(container) {
  var profile = Storage.load();
  if (!profile) { renderPlaceholder(container, 'Your results'); return; }

  var verdict = Utils.getVerdict(profile);
  if (verdict.type === 'none') {
    verdict = {
      type: 'checkIn', label: CONTENT.verdictNames.checkIn, message: CONTENT.stageMessages.checkInAgain,
      cssClass: 'verdict-early', reasons: []
    };
  }
  var currentWk = Utils.getWeekNumber(profile.startDate);
  var cfg = Utils.getConcernConfig(profile.concern);
  var con = Utils.getConsistency(profile.checkins, profile.startDate, profile.paused);
  var consistencyPct = Math.round(con.pct * 100);
  var streakDays = Utils.getStreak(profile.checkins, profile.paused);
  var markersList = (CONTENT.microMarkers && CONTENT.microMarkers[profile.concern]) || [];
  var ratings = profile.weeklyRatings || [];
  var reviewDue = Utils.isWeeklyRatingDue(profile);
  var weekLabel = currentWk > cfg.fullWindowWeeks ? 'Week ' + currentWk : 'Week ' + currentWk + ' of ' + cfg.fullWindowWeeks;

  // Timeline fill: week 1 starts at 0%, the last week of the window at 100%.
  var daysElapsed = Math.max(0, Utils.daysBetween(profile.startDate, Utils.getToday()));
  var spanWeeks = Math.max(1, cfg.fullWindowWeeks - 1);
  function weekPos(w) { return Math.max(0, Math.min(100, (w - 1) / spanWeeks * 100)); }
  var fillPct = Math.max(0, Math.min(100, (daysElapsed / 7) / spanWeeks * 100));
  var horizonHTML = '<div class="results-horizon" aria-label="Week ' + currentWk + ' of ' + cfg.fullWindowWeeks + '">' +
      '<div class="results-horizon-track">' +
        '<div class="results-horizon-fill" style="width:' + fillPct.toFixed(1) + '%;"></div>' +
        '<span class="results-horizon-tick" style="left:0%"></span>' +
        '<span class="results-horizon-tick" style="left:' + weekPos(cfg.earlyWindowWeeks).toFixed(1) + '%"></span>' +
        '<span class="results-horizon-tick" style="left:100%"></span>' +
        '<span class="results-horizon-you" style="left:' + fillPct.toFixed(1) + '%" title="You are here: week ' + currentWk + '"></span>' +
      '</div>' +
      '<div class="results-horizon-labels">' +
        '<span style="left:0%">Week 1</span>' +
        '<span style="left:' + weekPos(cfg.earlyWindowWeeks).toFixed(1) + '%">Week ' + cfg.earlyWindowWeeks + ' (early shifts)</span>' +
        '<span style="left:100%">Week ' + cfg.fullWindowWeeks + ' (real change)</span>' +
      '</div>' +
    '</div>';

  var phaseName = currentWk < cfg.earlyWindowWeeks ? 'Adjusting phase' : (currentWk < cfg.earlyWindowWeeks + 4 ? 'Early signs phase' : 'Steadier phase');
  var nowMs = getMilestoneForWeek(cfg, currentWk);
  var toEarly = cfg.earlyWindowWeeks - currentWk;
  var toFull = cfg.fullWindowWeeks - currentWk;
  var nextLine = toEarly > 0
    ? 'First visible shifts usually show from week ' + cfg.earlyWindowWeeks + ' — about ' + toEarly + (toEarly === 1 ? ' week' : ' weeks') + ' away.'
    : (toFull > 0
      ? 'You are in the early-shift window. Real change settles by week ' + cfg.fullWindowWeeks + ' — ' + toFull + (toFull === 1 ? ' week' : ' weeks') + ' to go.'
      : 'You have completed the full ' + cfg.fullWindowWeeks + '-week window. Compare your reviews to judge the routine.');
  var whereYouAreHTML =
    '<div class="wya-grid">' +
      '<div class="wya-stat"><span class="wya-num">' + currentWk + '</span><span class="wya-lbl">of ' + cfg.fullWindowWeeks + ' weeks</span></div>' +
      '<div class="wya-stat"><span class="wya-num">' + (daysElapsed + 1) + '</span><span class="wya-lbl">days in</span></div>' +
      '<div class="wya-stat"><span class="wya-num">' + con.done + '</span><span class="wya-lbl">days logged (28d)</span></div>' +
      '<div class="wya-stat"><span class="wya-num">' + ratings.length + '</span><span class="wya-lbl">weekly reviews</span></div>' +
    '</div>' +
    '<p class="wya-line"><strong>' + escHTML(phaseName) + ':</strong> ' + escHTML(nowMs.title || '') + '. ' + escHTML(nowMs.beneath || '') + '</p>' +
    '<p class="wya-line">' + escHTML(nextLine) + '</p>' +
    '<p class="wya-line">' + (ratings.length < 2
      ? 'Your verdict unlocks after two weekly reviews (' + ratings.length + ' of 2 done).'
      : 'Your verdict compares your latest review with your starting point.') + '</p>';

  // Dial calculations (radius = 38, circumference = 238.76)
  var circ = 238.76;
  var dashoffset = circ - (circ * (consistencyPct / 100));

  var html = '<div class="container">' +
    '<div class="section-header">' +
      '<h2 class="section-title">Your progress and results</h2>' +
      '<p class="section-subline">' + weekLabel + ' &middot; ' + escHTML(cfg.label) + ' routine</p>' +
    '</div>' +

    '<div class="results-bento-grid">' +
      // Card 1: 28-day consistency dial
      '<div class="results-bento-card results-bento-span-5 results-consistency-card">' +
        '<div class="badge badge-blue mb-12">Consistency</div>' +
        '<div class="results-score-dial-wrap">' +
          '<svg class="results-score-dial-svg" viewBox="0 0 100 100" aria-hidden="true">' +
            '<circle class="results-score-dial-bg" cx="50" cy="50" r="38" />' +
            '<circle class="results-score-dial-val" cx="50" cy="50" r="38" stroke-dasharray="' + circ + '" stroke-dashoffset="' + dashoffset + '" />' +
          '</svg>' +
          '<div>' +
            '<div class="results-big-num">' + consistencyPct + '%</div>' +
            '<div class="results-big-sub">' + escHTML(CONTENT.rings.consistency) + '</div>' +
            '<div style="margin-top:8px;">' +
              '<span class="results-delta-pill ' + (consistencyPct >= 70 ? 'positive' : 'neutral') + '">' +
                (consistencyPct >= 70 ? '&#9650; Steady pace' : '&#9644; Building momentum') +
              '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="results-streak-row">' +
          '<span>Current streak:</span>' +
          '<strong>' + streakDays + (streakDays === 1 ? ' day' : ' days') + '</strong>' +
        '</div>' +
      '</div>' +

      // Card 2: verdict
      '<div class="results-bento-card results-bento-span-7 results-verdict-card ' + escHTML(verdict.cssClass) + '">' +
        '<div class="results-verdict-head">' +
          '<h3 class="card-title" style="font-size:1.2rem;margin:0;">' + escHTML(verdict.label) + '</h3>' +
          '<button type="button" class="where-you-are-btn" id="btn-where-you-are" aria-expanded="false" aria-controls="where-you-are-panel">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
            '<span>Where you are</span>' +
          '</button>' +
        '</div>' +
        '<p class="card-text mb-12" style="font-size:0.92rem;line-height:1.5;margin-top:6px;">' + escHTML(verdict.message) + '</p>' +
        '<div class="where-you-are-panel" id="where-you-are-panel" hidden>' + whereYouAreHTML + '</div>' +
        horizonHTML +
        '<ul class="results-reasons">' +
          verdict.reasons.map(function (r) { return '<li>' + escHTML(r) + '</li>'; }).join('') +
        '</ul>' +
      '</div>' +

      // Card 3: markers and weekly reviews
      '<div class="results-bento-card results-bento-span-12">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">' +
          '<div>' +
            '<h3 class="card-title" style="font-size:1.1rem;margin-bottom:2px;">Markers to watch</h3>' +
            '<p class="card-text results-muted" style="font-size:0.86rem;">Tap a marker to record it for week ' + currentWk + '</p>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-secondary btn-sm" id="btn-open-recap">Week recap</button>' +
            (reviewDue ? '<button type="button" class="btn btn-primary btn-sm" id="btn-log-micromarkers">Full weekly review &rarr;</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="marker-btn-grid">';

  var thisWeekEntry = ratings.filter(function (r) { return r.week === currentWk; })[0] || null;
  markersList.forEach(function (m) {
    var rec = thisWeekEntry && thisWeekEntry.markers ? thisWeekEntry.markers[m.id] : undefined;
    var recOpt = null;
    if (rec !== undefined) recOpt = (m.options || []).filter(function (o) { return o.score === rec; })[0] || null;
    html += '<button type="button" class="marker-btn' + (recOpt ? ' is-recorded' : '') + '" data-marker-id="' + escHTML(m.id) + '">' +
      '<span class="marker-btn-main">' +
        '<span class="marker-btn-name">' + escHTML(m.name) + '</span>' +
        '<span class="marker-btn-hint">' + escHTML(m.hint) + '</span>' +
      '</span>' +
      '<span class="marker-btn-status">' + (recOpt ? ICONS.check + ' ' + escHTML(recOpt.label) : 'Record &rarr;') + '</span>' +
    '</button>';
  });

  html += '</div>';

  html += '<div class="review-history" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--ob-hair);">' +
    '<h4 style="font-size:0.95rem;font-weight:700;color:var(--ob-head);margin-bottom:8px;">Your weekly reviews</h4>';
  if (ratings.length) {
    html += '<ul style="margin:0;padding-left:18px;font-size:0.86rem;color:var(--ob-body);">';
    ratings.forEach(function (r) {
      html += '<li>Week ' + r.week + ': marker ' + r.primary + '/5' + (r.secondary && !r.secondaryAssumed ? ', overall ' + r.secondary + '/5' : '') + (r.unusual ? ' (flagged something unusual)' : '') + '</li>';
    });
    html += '</ul>';
  } else {
    html += '<p class="muted">No reviews yet. Your first one sets your starting point.</p>';
  }
  html += '</div></div>';

  // Good to know: this week's expectation, a rotating tip, and what each product is doing now.
  var tips = cfg.adjustTips || [];
  var weekTip = tips.length ? tips[(Math.max(1, currentWk) - 1) % tips.length] : 'Judge a routine over several weeks of steady use, not a few days.';
  var phaseKey = currentWk < cfg.earlyWindowWeeks ? 'early' : (currentWk < cfg.earlyWindowWeeks + 4 && currentWk < cfg.fullWindowWeeks ? 'mid' : 'late');
  var gtkShelf = getShelfProductsFor(profile, profile.concern).slice(0, 4);
  var markerNames = (cfg.markers || []).slice(0, 3);
  html +=
      '<div class="results-bento-card results-bento-span-12 gtk-card">' +
        '<div class="badge badge-blue mb-10">Good to know</div>' +
        '<h3 class="card-title" style="font-size:1.1rem;margin-bottom:6px;">Week ' + currentWk + ': ' + escHTML(nowMs.title || 'Quiet, compounding care') + '</h3>' +
        '<p class="card-text mb-14" style="font-size:0.9rem;line-height:1.5;">' + escHTML(nowMs.expect || 'Surface changes follow weeks of quiet work underneath. Daily care adds up before the mirror shows it.') + '</p>' +
        '<div class="gtk-grid">' +
          '<div class="gtk-tile">' +
            '<div class="gtk-tile-title">Tip for week ' + currentWk + '</div>' +
            '<div class="gtk-tile-text">' + escHTML(weekTip) + '.</div>' +
          '</div>' +
          '<div class="gtk-tile">' +
            '<div class="gtk-tile-title">Watch for this week</div>' +
            '<ul class="gtk-list">' + markerNames.map(function (m) { return '<li>' + escHTML(m) + '</li>'; }).join('') + '</ul>' +
          '</div>' +
          '<div class="gtk-tile">' +
            '<div class="gtk-tile-title">Be kind to yourself</div>' +
            '<div class="gtk-tile-text">' + escHTML(cfg.why || 'Every day of care counts, even the imperfect ones.') + '</div>' +
          '</div>' +
        '</div>' +
        (gtkShelf.length ?
        '<div class="gtk-shelf">' +
          '<div class="gtk-tile-title">What your products are doing now</div>' +
          '<ul class="gtk-shelf-list">' + gtkShelf.map(function (p) {
            var g = getCatalogGroup(profile.concern, p.group);
            return '<li><strong>' + escHTML(p.name) + '</strong><span>' + escHTML(g && g.phases ? g.phases[phaseKey] : '') + '</span></li>';
          }).join('') + '</ul>' +
        '</div>' : '') +
      '</div>' +

    '</div>' +
    '<p class="disclaimer text-center">' + escHTML(CONTENT.disclaimers.calm) + ' ' + escHTML(CONTENT.disclaimers.data) + '.</p>' +
  '</div>';

  container.innerHTML = html;

  var logBtn = container.querySelector('#btn-log-micromarkers');
  if (logBtn) logBtn.addEventListener('click', function () { openWeeklyReviewDrawer(); });
  container.querySelectorAll('[data-marker-id]').forEach(function (btn) {
    btn.addEventListener('click', function () { openMarkerDrawer(btn.getAttribute('data-marker-id')); });
  });
  var wyaBtn = container.querySelector('#btn-where-you-are');
  var wyaPanel = container.querySelector('#where-you-are-panel');
  if (wyaBtn && wyaPanel) {
    wyaBtn.addEventListener('click', function () {
      var open = wyaPanel.hidden;
      wyaPanel.hidden = !open;
      wyaBtn.setAttribute('aria-expanded', String(open));
      wyaBtn.classList.toggle('is-open', open);
    });
  }
  var recapBtn = container.querySelector('#btn-open-recap');
  if (recapBtn) recapBtn.addEventListener('click', function () { openRecapDrawer(); });
}


/* ---- Section 8: Next Step & Bottle Burn-Rate ---- */
function renderNextStepSection(container) {
  var profile = Storage.load();
  if (!profile) { renderPlaceholder(container, 'What next?'); return; }

  var verdict = Utils.getVerdict(profile);
  var primaryProduct = (profile.products && profile.products[0]) || { name: 'Main formula', sizeDays: 30 };
  var burnRate = Utils.getBurnRate(primaryProduct, profile.checkins, profile.startDate);
  var keepType = (verdict.type === 'onTrack' || verdict.type === 'tooEarly' || verdict.type === 'checkIn');

  var html = '<div class="container">' +
    '<div class="section-header">' +
      '<h2 class="section-title">What next?</h2>' +
      '<p class="section-subline">Guidance and pack pace for your routine.</p>' +
    '</div>' +

    (burnRate ? (
      '<div class="card burn-rate-card mb-24">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<div>' +
            '<h3 class="card-title" style="margin-bottom:2px;">' + escHTML(primaryProduct.name) + ' pace meter</h3>' +
            '<p class="card-text" style="font-size:0.86rem;color:var(--text-secondary);margin-bottom:0;">' +
              'Used ' + burnRate.usedDoses + ' of ' + burnRate.totalDoses + ' doses (' + burnRate.remainingDoses + ' remaining)' +
            '</p>' +
          '</div>' +
          (burnRate.isLow ? '<span class="badge" style="background:var(--danger-bg);color:var(--danger-text);font-weight:700;">Reorder soon</span>' : '<span class="badge badge-blue">Stock healthy</span>') +
        '</div>' +
        '<div class="burn-rate-meter" role="img" aria-label="' + burnRate.pctUsed + ' percent used">' +
          '<div class="burn-rate-fill" style="width:' + burnRate.pctUsed + '%;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:0.82rem;color:var(--text-secondary);margin-top:8px;">' +
          '<span>Estimated empty: ' + Utils.formatDate(burnRate.estimatedFinish) + '</span>' +
          '<span>Reorder date: ' + Utils.formatDate(burnRate.reorderDate) + ' (5 days prior)</span>' +
        '</div>' +
      '</div>'
    ) : '') +

    '<div class="outcomes-grid mb-32">' +
      '<div class="card' + (keepType ? ' active-outcome' : '') + '" style="border-top:4px solid var(--verdict-ontrack-border);">' +
        '<h3 class="card-title" style="color:var(--verdict-ontrack-text);">1. Keep going</h3>' +
        '<p class="card-text" style="font-size:0.9rem;">Your routine needs time to show. Keep your daily steps steady.</p>' +
      '</div>' +

      '<div class="card' + (verdict.type === 'consistency' ? ' active-outcome' : '') + '" style="border-top:4px solid var(--verdict-consistency-border);">' +
        '<h3 class="card-title" style="color:var(--verdict-consistency-text);">2. Adjust routine</h3>' +
        '<p class="card-text" style="font-size:0.9rem;">Pair your steps with a morning or bedtime habit to keep a steady rhythm.</p>' +
      '</div>' +

      '<div class="card' + (verdict.type === 'closer' ? ' active-outcome' : '') + '" style="border-top:4px solid var(--verdict-closer-border);">' +
        '<h3 class="card-title" style="color:var(--verdict-closer-text);">3. Closer look</h3>' +
        '<p class="card-text" style="font-size:0.9rem;">If nothing changes after the full window, try a new approach or ask a health professional.</p>' +
      '</div>' +
    '</div>' +

    '<div class="card text-center" style="padding:28px 20px;">' +
      '<h3 class="card-title mb-6">Feeling stuck with your routine?</h3>' +
      '<p class="card-text mb-16">Doubt, slow progress, or missed days? Explore kind re-engagement options.</p>' +
      '<button type="button" class="btn btn-secondary" id="btn-open-support">Feeling stuck? Explore options</button>' +
    '</div>' +
  '</div>';

  container.innerHTML = html;

  var suppBtn = container.querySelector('#btn-open-support');
  if (suppBtn) suppBtn.addEventListener('click', function () { openSupportDrawer(); });
}

/* ---- Section 9: Closing Section ---- */
function renderClosingSection(container) {
  var c = CONTENT.closing || { title: "Small steps, every day", text: "Real change takes time. Your body is doing the quiet work." };
  var html = '<div class="container">' +
    '<div class="closing-card">' +
      '<h2 style="font-size:1.45rem;font-weight:700;color:var(--deep-navy);margin-bottom:8px;">' + escHTML(c.title) + '</h2>' +
      '<p style="font-size:0.98rem;color:var(--text-secondary);">' + escHTML(c.text) + '</p>' +
    '</div>' +
  '</div>';
  container.innerHTML = html;
}

/* ==================== DRAWERS (OFFLINE CHATBOT & MENU RESET) ==================== */

// 1. Offline Reassurance Chatbot Drawer
function openChatbotDrawer(initialTopicId) {
  var chatData = CONTENT.chatbot || {};
  var categories = chatData.categories || [
    {
      id: 'bio',
      label: 'Biological Concerns',
      questions: (chatData.topics || []).slice(0, 3)
    },
    {
      id: 'habits',
      label: 'Habits & Motivation Drops',
      questions: (chatData.topics || []).slice(1, 4)
    },
    {
      id: 'hacks',
      label: 'Product & Routine Hacks',
      questions: (chatData.topics || []).slice(2, 5)
    }
  ];

  var currentCatId = 'bio';
  if (initialTopicId) {
    categories.forEach(function (cat) {
      if ((cat.questions || []).some(function (q) { return q.id === initialTopicId; })) {
        currentCatId = cat.id;
      }
    });
  }

  function renderCategoryOptionsHTML(catId) {
    var cat = categories.find(function (c) { return c.id === catId; }) || categories[0];
    var html = '<div class="chat-batch-header">' +
      '<span class="chat-batch-title">' + escHTML(cat.label) + '</span>' +
      '<span class="chat-batch-badge">3 targeted questions</span>' +
    '</div>' +
    '<div class="chat-quick-chips">';

    (cat.questions || []).forEach(function (t) {
      html += '<button type="button" class="chat-chip-btn" data-topic-id="' + t.id + '">' +
        '<div style="font-weight:700;color:var(--text-primary);font-size:0.88rem;margin-bottom:3px;">' + escHTML(t.shortTitle || t.chip || t.question) + '</div>' +
        '<div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.35;">' + escHTML(t.question) + '</div>' +
      '</button>';
    });

    html += '</div>';
    return html;
  }

  var html = '<div class="chatbot-header-card">' +
    '<div class="chatbot-hero-avatar">' + (ICONS.guideHero || ICONS.guideAvatar) + '</div>' +
    '<div class="chatbot-hero-meta">' +
      '<h4 class="chatbot-hero-title">' + escHTML(CONTENT.guide.avatarTitle || 'The Bodywise Guide') + '</h4>' +
      '<span class="chatbot-hero-badge"><span class="chatbot-status-pulse"></span> Instant reassurance &middot; Offline</span>' +
    '</div>' +
  '</div>' +

  // Category Switcher Tabs
  '<div class="chat-category-tabs">' +
    categories.map(function (c) {
      return '<button type="button" class="chat-tab-btn' + (c.id === currentCatId ? ' active' : '') + '" data-cat-id="' + c.id + '">' +
        escHTML(c.label) +
      '</button>';
    }).join('') +
  '</div>' +

  '<div class="chatbot-conversation" id="chat-messages">' +
    '<div class="chat-msg guide">' +
      '<div class="guide-avatar-circle" style="width:34px;height:34px;">' + ICONS.guideAvatar + '</div>' +
      '<div class="chat-bubble">' + (chatData.welcome ? escHTML(chatData.welcome).split(String.fromCharCode(10)).join('<br>') : 'Wellness takes time, and doubts are normal.') + '</div>' +
    '</div>' +
  '</div>' +

  '<div id="chat-options-area">' +
    renderCategoryOptionsHTML(currentCatId) +
  '</div>';

  Drawer.open(chatData.title || 'Ask the Guide', html, function (panelEl) {
    function bindCategoryTabs() {
      panelEl.querySelectorAll('[data-cat-id]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          currentCatId = this.getAttribute('data-cat-id');
          panelEl.querySelectorAll('[data-cat-id]').forEach(function (t) { t.classList.remove('active'); });
          this.classList.add('active');

          var optsEl = panelEl.querySelector('#chat-options-area');
          if (optsEl) {
            optsEl.innerHTML = renderCategoryOptionsHTML(currentCatId);
            bindQuestionChips();
          }
        });
      });
    }

    function bindQuestionChips() {
      panelEl.querySelectorAll('[data-topic-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var tid = this.getAttribute('data-topic-id');
          showTopicAnswer(tid);
        });
      });
    }

    function showTopicAnswer(topicId) {
      var topic = (chatData.topics || []).find(function (t) { return t.id === topicId; });
      if (!topic) {
        categories.forEach(function (cat) {
          (cat.questions || []).forEach(function (q) {
            if (q.id === topicId) topic = q;
          });
        });
      }
      if (!topic) return;

      var msgsEl = panelEl.querySelector('#chat-messages');
      var optsEl = panelEl.querySelector('#chat-options-area');

      // Append User Question Bubble
      var userMsg = document.createElement('div');
      userMsg.className = 'chat-msg user';
      userMsg.innerHTML = '<div class="chat-bubble">' + escHTML(topic.question) + '</div>';
      msgsEl.appendChild(userMsg);
      msgsEl.scrollTop = msgsEl.scrollHeight;

      // Append Guide 3-Part Answer
      setTimeout(function () {
        var guideMsg = document.createElement('div');
        guideMsg.className = 'chat-msg guide fade-in-entry';

        var reassHtml = topic.reassurance ? escHTML(topic.reassurance).split(String.fromCharCode(10)).join('<br>') : escHTML(topic.answer).split(String.fromCharCode(10)).join('<br>');
        var scienceHtml = topic.science ? escHTML(topic.science).split(String.fromCharCode(10)).join('<br>') : 'Active compounds require 28 to 90 days to harmonize with normal cellular renewal.';
        var actionHtml = topic.action ? escHTML(topic.action).split(String.fromCharCode(10)).join('<br>') : 'Stay consistent with your daily steps and observe subtle micro-markers.';

        guideMsg.innerHTML = '<div class="guide-avatar-circle" style="width:34px;height:34px;flex-shrink:0;">' + ICONS.guideAvatar + '</div>' +
          '<div class="chat-structured-answer" style="flex:1;">' +
            '<div class="answer-card answer-reassurance">' +
              '<div class="answer-card-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
                '<span>Direct Reassurance</span>' +
              '</div>' +
              '<p class="answer-card-text">' + reassHtml + '</p>' +
            '</div>' +

            '<div class="answer-card answer-science">' +
              '<div class="answer-card-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="stroke:var(--ob-pink)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
                '<span>The Science (Biology)</span>' +
              '</div>' +
              '<p class="answer-card-text">' + scienceHtml + '</p>' +
            '</div>' +

            '<div class="answer-card answer-action">' +
              '<div class="answer-card-header">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
                '<span>Your Action Today</span>' +
              '</div>' +
              '<p class="answer-card-text">' + actionHtml + '</p>' +
            '</div>' +
          '</div>';

        msgsEl.appendChild(guideMsg);
        msgsEl.scrollTop = msgsEl.scrollHeight;

        // Render follow up options
        optsEl.innerHTML = '<div class="chat-followups" style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">' +
          '<button type="button" class="btn btn-primary btn-block" id="btn-chat-more">' + escHTML(chatData.anotherQuestion || 'Ask another question') + '</button>' +
          '<div style="display:flex;gap:12px;justify-content:center;font-size:0.85rem;margin-top:4px;">' +
            '<a href="#today" class="chat-shortcut-link" data-close-drawer="true" style="color:var(--primary-blue);font-weight:600;text-decoration:none;">Daily ritual</a>' +
            '<span style="color:var(--border-subtle);">&middot;</span>' +
            '<a href="#mind" class="chat-shortcut-link" data-close-drawer="true" style="color:var(--primary-blue);font-weight:600;text-decoration:none;">Mind Space</a>' +
            '<span style="color:var(--border-subtle);">&middot;</span>' +
            '<a href="#timeline" class="chat-shortcut-link" data-close-drawer="true" style="color:var(--primary-blue);font-weight:600;text-decoration:none;">Timeline</a>' +
          '</div>' +
        '</div>';

        var moreBtn = optsEl.querySelector('#btn-chat-more');
        if (moreBtn) {
          moreBtn.addEventListener('click', function () {
            optsEl.innerHTML = renderCategoryOptionsHTML(currentCatId);
            bindQuestionChips();
          });
        }

        optsEl.querySelectorAll('[data-close-drawer="true"]').forEach(function (link) {
          link.addEventListener('click', function (e) {
            e.preventDefault();
            var target = link.getAttribute('href').replace(/^#/, '');
            Drawer.close();
            scrollToSection(target);
          });
        });
      }, 160);
    }

    bindCategoryTabs();
    bindQuestionChips();

    if (initialTopicId) {
      showTopicAnswer(initialTopicId);
    }
  });
}

// 2. Settings & Menu Drawer with In-Drawer Reset Confirmation
/* ---- Weekly review drawer ---- */
function openWeeklyReviewDrawer() {
  var profile = Storage.load();
  if (!profile) { Router.navigate('#/start'); return; }
  var currentWk = Utils.getWeekNumber(profile.startDate);
  var cfg = Utils.getConcernConfig(profile.concern);
  var markersList = (CONTENT.microMarkers && CONTENT.microMarkers[profile.concern]) || [];
  var existing = (profile.weeklyRatings || []).find(function (r) { return r.week === currentWk; }) || null;
  var needsFirst = !!(profile.baseline && profile.baseline.assumed && !(profile.weeklyRatings || []).length);

  var html = '<form id="weekly-review-form" novalidate>' +
    '<p class="card-text mb-16" style="font-size:0.92rem;">' +
      (needsFirst
        ? 'Your first review sets your starting point. Later reviews are compared with it.'
        : 'Check the signs below for week ' + currentWk + '. They feed your verdict.') +
    '</p>';

  markersList.forEach(function (m) {
    html += '<div class="field mb-16">' +
      '<label style="font-weight:700;color:var(--deep-navy);">' + escHTML(m.name) + '</label>' +
      '<p class="muted mb-8" style="font-size:0.82rem;">' + escHTML(m.hint) + '</p>' +
      '<div class="chip-group" data-marker-field="' + escHTML(m.id) + '" role="radiogroup" aria-label="' + escHTML(m.name) + '">';
    var prevScore = existing && existing.markers ? existing.markers[m.id] : undefined;
    m.options.forEach(function (opt) {
      var on = prevScore === opt.score;
      html += '<button type="button" class="chip' + (on ? ' selected' : '') + '" role="radio" aria-checked="' + on + '" data-score="' + opt.score + '">' + escHTML(opt.label) + '</button>';
    });
    html += '</div></div>';
  });

  if (!markersList.length) {
    html += UI.ratingHTML('weekly-primary', 'How is ' + (profile.marker || 'your marker').toLowerCase() + ' going, 1 to 5?', existing ? existing.primary : 0);
  }
  html += UI.ratingHTML('weekly-secondary', 'How do you feel overall, 1 to 5?', existing ? existing.secondary : 0);

  html += '<div class="field"><label id="unusual-label">Anything unusual or worrying this week?</label>' +
    '<div class="chip-group" id="unusual-group" role="radiogroup" aria-labelledby="unusual-label">' +
      '<button type="button" class="chip' + (existing && existing.unusual === true ? ' selected' : '') + '" role="radio" data-value="yes">Yes</button>' +
      '<button type="button" class="chip' + (existing && existing.unusual === false ? ' selected' : '') + '" role="radio" data-value="no">No</button>' +
    '</div></div>';

  html += '<button type="submit" class="btn btn-primary btn-full mt-16" id="save-weekly" disabled>' + (existing ? 'Update week ' + currentWk + ' review' : 'Save review') + '</button>' +
    '</form>';

  Drawer.open('Weekly review · Week ' + currentWk, html, function (panelEl) {
    var primaryRating = existing ? existing.primary : 0;
    var secondaryRating = existing ? existing.secondary : 0;
    var unusual = existing ? existing.unusual : null;
    var picked = {};
    if (existing && existing.markers) Object.keys(existing.markers).forEach(function (k) { picked[k] = existing.markers[k]; });

    function currentPrimary() {
      if (!markersList.length) return primaryRating;
      var scores = Object.keys(picked).map(function (k) { return picked[k]; });
      if (scores.length < markersList.length) return 0;
      var avg = scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
      return Math.max(1, Math.min(5, Math.round(avg)));
    }

    function checkReady() {
      var btn = panelEl.querySelector('#save-weekly');
      if (btn) btn.disabled = !(currentPrimary() > 0 && secondaryRating > 0 && unusual !== null);
    }

    panelEl.querySelectorAll('[data-marker-field]').forEach(function (cg) {
      cg.querySelectorAll('.chip').forEach(function (c) {
        c.addEventListener('click', function () {
          cg.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('selected'); x.setAttribute('aria-checked', 'false'); });
          c.classList.add('selected');
          c.setAttribute('aria-checked', 'true');
          picked[cg.getAttribute('data-marker-field')] = Number(c.getAttribute('data-score'));
          checkReady();
        });
      });
    });

    if (!markersList.length) UI.bindRating('weekly-primary', function (v) { primaryRating = v; checkReady(); });
    UI.bindRating('weekly-secondary', function (v) { secondaryRating = v; checkReady(); });

    panelEl.querySelectorAll('#unusual-group .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        panelEl.querySelectorAll('#unusual-group .chip').forEach(function (c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
        unusual = chip.getAttribute('data-value') === 'yes';
        checkReady();
      });
    });

    checkReady();

    var form = panelEl.querySelector('#weekly-review-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var primary = currentPrimary();
      if (!(primary > 0 && secondaryRating > 0 && unusual !== null)) return;

      var fresh = Storage.load();
      if (!fresh) return;
      var list = fresh.weeklyRatings || [];
      var entry = { week: currentWk, date: Utils.getToday(), primary: primary, secondary: secondaryRating, unusual: unusual, markers: picked };

      // The first real review replaces the neutral placeholder starting point.
      if (fresh.baseline && fresh.baseline.assumed && !list.length) {
        fresh.baseline = { primary: primary, secondary: secondaryRating, date: Utils.getToday(), note: '' };
      }
      var idx = list.findIndex(function (r) { return r.week === currentWk; });
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      list.sort(function (a, b) { return a.week - b.week; });
      fresh.weeklyRatings = list;
      Storage.save(fresh);

      Drawer.close();
      refreshSections(['results', 'nextstep']);
      refreshPrimaryCard();
      UI.toast('Weekly review saved. Verdict updated.');
    });
  });
}

/* ---- Single marker drawer (tap a marker card in Results) ---- */
function openMarkerDrawer(markerId) {
  var profile = Storage.load();
  if (!profile) return;
  var currentWk = Utils.getWeekNumber(profile.startDate);
  var markersList = (CONTENT.microMarkers && CONTENT.microMarkers[profile.concern]) || [];
  var m = markersList.filter(function (x) { return x.id === markerId; })[0];
  if (!m) { openWeeklyReviewDrawer(); return; }
  var existing = (profile.weeklyRatings || []).filter(function (r) { return r.week === currentWk; })[0] || null;
  var prevScore = existing && existing.markers ? existing.markers[m.id] : undefined;

  var html = '<form id="marker-form" novalidate>' +
    '<p class="card-text mb-8" style="font-size:0.92rem;">' + escHTML(m.hint) + '</p>' +
    '<p class="muted mb-16" style="font-size:0.84rem;">What did you notice this week (week ' + currentWk + ')?</p>' +
    '<div class="chip-group marker-choice-group" role="radiogroup" aria-label="' + escHTML(m.name) + '">';
  m.options.forEach(function (opt) {
    var on = prevScore === opt.score;
    html += '<button type="button" class="chip' + (on ? ' selected' : '') + '" role="radio" aria-checked="' + on + '" data-score="' + opt.score + '">' + escHTML(opt.label) + '</button>';
  });
  html += '</div>' +
    '<div class="field mt-16"><label id="marker-unusual-label">Anything unusual or worrying?</label>' +
      '<div class="chip-group" id="marker-unusual" role="radiogroup" aria-labelledby="marker-unusual-label">' +
        '<button type="button" class="chip' + (existing && existing.unusual === true ? ' selected' : '') + '" role="radio" data-value="yes">Yes</button>' +
        '<button type="button" class="chip' + (!existing || existing.unusual !== true ? ' selected' : '') + '" role="radio" data-value="no">No</button>' +
      '</div></div>' +
    '<button type="submit" class="btn btn-primary btn-full mt-16" id="save-marker"' + (prevScore === undefined ? ' disabled' : '') + '>Save review</button>' +
  '</form>';

  Drawer.open(m.name + ' · Week ' + currentWk, html, function (panelEl) {
    var score = prevScore;
    var unusual = existing ? existing.unusual === true : false;
    var saveBtn = panelEl.querySelector('#save-marker');
    panelEl.querySelectorAll('.marker-choice-group .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        panelEl.querySelectorAll('.marker-choice-group .chip').forEach(function (x) { x.classList.remove('selected'); x.setAttribute('aria-checked', 'false'); });
        c.classList.add('selected'); c.setAttribute('aria-checked', 'true');
        score = Number(c.getAttribute('data-score'));
        if (saveBtn) saveBtn.disabled = false;
      });
    });
    panelEl.querySelectorAll('#marker-unusual .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        panelEl.querySelectorAll('#marker-unusual .chip').forEach(function (x) { x.classList.remove('selected'); });
        c.classList.add('selected');
        unusual = c.getAttribute('data-value') === 'yes';
      });
    });
    var form = panelEl.querySelector('#marker-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (score === undefined) return;
      var fresh = Storage.load();
      if (!fresh) return;
      var list = fresh.weeklyRatings || [];
      var idx = list.findIndex(function (r) { return r.week === currentWk; });
      var entry = idx >= 0 ? list[idx] : { week: currentWk, date: Utils.getToday(), secondary: 0, unusual: false, markers: {} };
      entry.markers = entry.markers || {};
      entry.markers[m.id] = score;
      entry.date = Utils.getToday();
      entry.unusual = unusual;
      var vals = Object.keys(entry.markers).map(function (k) { return entry.markers[k]; });
      entry.primary = Math.max(1, Math.min(5, Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length)));
      if (!entry.secondary || entry.secondaryAssumed) { entry.secondary = entry.primary; entry.secondaryAssumed = true; }
      if (fresh.baseline && fresh.baseline.assumed && !(list.length - (idx >= 0 ? 1 : 0))) {
        fresh.baseline = { primary: entry.primary, secondary: entry.secondary, date: Utils.getToday(), note: '' };
      }
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      list.sort(function (a, b) { return a.week - b.week; });
      fresh.weeklyRatings = list;
      Storage.save(fresh);
      Drawer.close();
      refreshSections(['results', 'nextstep']);
      refreshPrimaryCard();
      UI.toast(m.name + ' saved for week ' + currentWk);
    });
  });
}

/* ---- Support drawer (Feeling stuck?) ---- */
function buildSummaryText(profile) {
  var cfg = Utils.getConcernConfig(profile.concern);
  var con = Utils.getConsistency(profile.checkins, profile.startDate, profile.paused);
  var lines = ['Progress summary', 'Focus area: ' + cfg.label];
  if (profile.goalText) lines.push('Goal: ' + profile.goalText);
  lines.push('Watched marker: ' + (profile.marker || 'Not set'));
  lines.push('Started: ' + Utils.formatDate(profile.startDate) + ' (week ' + Utils.getWeekNumber(profile.startDate) + ')');
  lines.push('Consistency (last 28 days): ' + con.done + ' of ' + con.total + ' days (' + Math.round(con.pct * 100) + '%)');
  (profile.weeklyRatings || []).forEach(function (r) {
    lines.push('Week ' + r.week + ': marker ' + r.primary + '/5, overall ' + r.secondary + '/5' + (r.unusual ? ' (unusual flagged)' : ''));
  });
  if (profile.products && profile.products.length) {
    lines.push('Products: ' + profile.products.map(function (p) { return p.name; }).join(', '));
  }
  lines.push('', CONTENT.disclaimers.calm);
  return lines.join('\n');
}

function copyText(text, okMsg) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    UI.toast(ok ? okMsg : 'Could not copy. Select the text and copy it.');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { UI.toast(okMsg); }, fallback);
  } else {
    fallback();
  }
}

function openSupportDrawer() {
  var S = CONTENT.support;
  var profile = Storage.load();

  if (!profile) {
    var ph = CONTENT.landing.placeholder;
    Drawer.open(S.title, '<p class="card-text mb-16">' + escHTML(ph.text) + '</p>' +
      '<button type="button" class="btn btn-primary" id="support-setup">' + escHTML(ph.cta) + '</button>',
      function (panelEl) {
        panelEl.querySelector('#support-setup').addEventListener('click', function () {
          Drawer.close();
          scrollToSection('setup');
        });
      });
    return;
  }

  var cfg = Utils.getConcernConfig(profile.concern);
  var html = '<h3 class="card-title" style="font-size:1rem;">' + escHTML(S.step1Title) + '</h3>' +
    '<p class="muted mb-12">' + escHTML(S.step1Subtitle) + '</p>' +
    '<div class="chip-group" id="stuck-reasons" role="radiogroup" aria-label="' + escHTML(S.step1Title) + '">';
  S.reasons.forEach(function (r) {
    html += '<button type="button" class="chip" role="radio" aria-checked="false" data-id="' + escHTML(r.id) + '">' + escHTML(r.label) + '</button>';
  });
  html += '</div>' +
    '<div id="tailored-card" class="card mb-16" style="display:none;" aria-live="polite">' +
      '<h3 class="card-title" id="tailored-title" style="font-size:1rem;"></h3>' +
      '<p class="card-text mb-14" id="tailored-body"></p>' +
      '<div id="tailored-action-wrap"></div>' +
    '</div>' +
    '<div id="stuck-choices" class="card">' +
      '<h3 class="card-title" style="font-size:1rem;">' + escHTML(S.choicesTitle) + '</h3>' +
      '<p class="muted mb-14">No pressure, no guilt. You decide what works.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button type="button" class="btn btn-primary btn-full" id="btn-stuck-keep">' + escHTML(S.choices.keepGoing) + '</button>' +
        '<button type="button" class="btn btn-secondary btn-full" id="btn-stuck-pause">' + escHTML(S.choices.pauseForNow) + ' (2 weeks)</button>' +
        '<button type="button" class="btn-text-link" id="btn-stuck-done" style="text-align:center;">' + escHTML(S.choices.imDone) + '</button>' +
      '</div>' +
    '</div>';

  Drawer.open(S.title, html, function (panelEl) {
    function pauseRoutine() {
      var p = Storage.load();
      if (!p) return;
      var today = Utils.getToday();
      p.paused = { from: today, until: Utils.addDays(today, 13) };
      Storage.save(p);
      Drawer.close();
      refreshSections(['today', 'results', 'nextstep']);
      refreshPrimaryCard();
      UI.toast('Routine paused for 2 weeks');
    }

    panelEl.querySelectorAll('#stuck-reasons .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        panelEl.querySelectorAll('#stuck-reasons .chip').forEach(function (b) { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
        chip.classList.add('selected');
        chip.setAttribute('aria-checked', 'true');

        var item = S.tailored[chip.getAttribute('data-id')] || S.tailored.other;
        panelEl.querySelector('#tailored-title').textContent = item.title;
        panelEl.querySelector('#tailored-body').textContent = Utils.templateStr(item.body, { week: cfg.earlyWindowWeeks });

        var wrap = panelEl.querySelector('#tailored-action-wrap');
        var btnClass = item.isPause ? 'btn btn-secondary' : 'btn btn-primary';
        wrap.innerHTML = '<button type="button" class="' + btnClass + '" id="btn-tailored-action">' + escHTML(item.action) + '</button>';
        wrap.querySelector('#btn-tailored-action').addEventListener('click', function () {
          if (item.isReminder) {
            Utils.downloadICS('Daily check-in', 'Open Progress Companion and log today\'s routine.', 'DAILY');
          } else if (item.isPause) {
            pauseRoutine();
          } else {
            Drawer.close();
            Router.navigate(item.route || '#/home');
          }
        });

        var card = panelEl.querySelector('#tailored-card');
        card.style.display = 'block';
        if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
      });
    });

    panelEl.querySelector('#btn-stuck-keep').addEventListener('click', function () { Drawer.close(); });
    panelEl.querySelector('#btn-stuck-pause').addEventListener('click', pauseRoutine);
    panelEl.querySelector('#btn-stuck-done').addEventListener('click', function () {
      var summary = buildSummaryText(Storage.load() || profile);
      panelEl.innerHTML = '<h3 class="card-title" style="font-size:1.1rem;">' + escHTML(S.doneHeading) + '</h3>' +
        '<p class="card-text mb-14">' + escHTML(S.doneBody) + '</p>' +
        '<pre class="summary-pre">' + escHTML(summary) + '</pre>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">' +
          '<button type="button" class="btn btn-primary btn-sm" id="btn-copy-summary">Copy summary</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" id="btn-summary-back">Back</button>' +
        '</div>';
      panelEl.querySelector('#btn-copy-summary').addEventListener('click', function () { copyText(summary, 'Summary copied'); });
      panelEl.querySelector('#btn-summary-back').addEventListener('click', function () { openSupportDrawer(); });
    });
  });
}

/* ---- Week recap drawer ---- */
// Where a rating sits against the typical range for a week (linear between points).
function getBandStatus(cfg, week, rating) {
  var band = cfg && cfg.typicalBand;
  if (!band || !band.length || !rating) return null;
  var low, high;
  if (week <= band[0].week) {
    low = band[0].low; high = band[0].high;
  } else if (week >= band[band.length - 1].week) {
    low = band[band.length - 1].low; high = band[band.length - 1].high;
  } else {
    for (var i = 1; i < band.length; i++) {
      if (week <= band[i].week) {
        var a = band[i - 1], b = band[i];
        var f = (week - a.week) / (b.week - a.week);
        low = a.low + (b.low - a.low) * f;
        high = a.high + (b.high - a.high) * f;
        break;
      }
    }
  }
  return rating < low ? 'below' : (rating > high ? 'above' : 'inside');
}

function openRecapDrawer() {
  var R = CONTENT.recap;
  var profile = Storage.load();
  if (!profile) {
    var ph = CONTENT.landing.placeholder;
    Drawer.open(R.title, '<p class="card-text mb-16">' + escHTML(ph.text) + '</p>' +
      '<button type="button" class="btn btn-primary" id="recap-setup">' + escHTML(ph.cta) + '</button>',
      function (panelEl) {
        panelEl.querySelector('#recap-setup').addEventListener('click', function () {
          Drawer.close();
          scrollToSection('setup');
        });
      });
    return;
  }

  var cfg = Utils.getConcernConfig(profile.concern);
  var week = Utils.getWeekNumber(profile.startDate);
  var con = Utils.getConsistency(profile.checkins, profile.startDate, profile.paused);
  var best = Utils.getBestStreak(profile.checkins);
  var weekStart = Utils.addDays(Utils.getToday(), -6);
  var count = (profile.checkins || []).filter(function (c) { return c.done && c.date >= weekStart; }).length;
  var ratings = profile.weeklyRatings || [];
  var startRating = profile.baseline ? profile.baseline.primary : null;
  var currentRating = ratings.length ? ratings[ratings.length - 1].primary : startRating;

  var slides = [];
  slides.push({
    stat: String(count), theme: 'navy',
    title: Utils.templateStr(R.slide1Heading, { week: week }),
    body: count ? Utils.templateStr(R.slide1Sub, { count: count }) : R.slide1FreshSub
  });
  slides.push({
    stat: Math.round(con.pct * 100) + '%', theme: 'navy',
    title: R.consistencyTitle,
    body: Utils.templateStr(R.consistencySub, { pct: Math.round(con.pct * 100), streak: best })
  });
  if (startRating !== null) {
    slides.push({
      stat: startRating + ' → ' + currentRating, theme: 'cream',
      title: R.markerTitle,
      body: Utils.templateStr(R.markerSub, { startRating: startRating, currentRating: currentRating })
    });
  }
  var status = getBandStatus(cfg, week, currentRating);
  if (status) {
    var statusText = CONTENT.typicalBandStatus[status];
    slides.push({
      stat: 'W' + week, theme: 'navy',
      title: R.typicalTitle,
      body: Utils.templateStr(R.typicalSub, { status: statusText.charAt(0).toLowerCase() + statusText.slice(1), week: week })
    });
  }
  slides.push({
    stat: 'Next', theme: 'cream',
    title: R.nextTitle,
    body: Utils.templateStr(R.nextSub, { milestone: getMilestoneForWeek(cfg, week + 1).title })
  });

  Drawer.open(R.title, '<div id="recap-host"></div>', function (panelEl) {
    var host = panelEl.querySelector('#recap-host');
    function draw(idx) {
      var s = slides[idx];
      var h = '<div class="recap-card' + (s.theme === 'cream' ? ' theme-cream' : '') + '" style="margin:0 auto;">' +
        '<div class="recap-progress-bars">';
      for (var i = 0; i < slides.length; i++) h += '<div class="recap-segment' + (i <= idx ? ' active' : '') + '"></div>';
      h += '</div><div class="recap-content" aria-live="polite">' +
        '<div class="recap-big-stat">' + escHTML(s.stat) + '</div>' +
        '<h3 class="recap-title">' + escHTML(s.title) + '</h3>' +
        '<p class="recap-body">' + escHTML(s.body) + '</p>' +
      '</div><div class="recap-nav-btn-row">' +
        (idx > 0 ? '<button type="button" class="btn btn-sm btn-secondary" id="recap-prev">Back</button>' : '<span></span>') +
        (idx < slides.length - 1
          ? '<button type="button" class="btn btn-sm btn-primary" id="recap-next">Next</button>'
          : '<button type="button" class="btn btn-sm btn-primary" id="recap-finish">' + escHTML(R.close) + '</button>') +
      '</div></div>';
      host.innerHTML = h;
      var prev = host.querySelector('#recap-prev');
      var next = host.querySelector('#recap-next');
      var fin = host.querySelector('#recap-finish');
      if (prev) prev.addEventListener('click', function () { draw(idx - 1); });
      if (next) next.addEventListener('click', function () { draw(idx + 1); });
      if (fin) fin.addEventListener('click', function () { Drawer.close(); });
      var focusEl = next || fin;
      if (focusEl) focusEl.focus();
    }
    draw(0);
  });
}

/* ---- Settings & menu drawer ---- */
function openSettingsDrawer() {
  var html = '<div class="card mb-16">' +
    '<h3 class="card-title" style="font-size:1rem;margin-bottom:8px;">Brand intro</h3>' +
    '<p class="card-text mb-12" style="font-size:0.88rem;">Watch the short handwritten logo story again.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-secondary btn-sm" id="btn-replay-intro">Replay brand intro</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="btn-replay-bee">Guide walkthrough (BEE)</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="btn-start-tour">Feature tour</button>' +
    '</div>' +
  '</div>' +

  '<div class="card mb-16">' +
    '<h3 class="card-title" style="font-size:1rem;margin-bottom:8px;">Data and backup</h3>' +
    '<p class="card-text mb-12" style="font-size:0.88rem;">' + escHTML(CONTENT.checkin.backupNote) + '.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-secondary btn-sm" id="btn-export-json">' + escHTML(CONTENT.checkin.backupBtn) + '</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="btn-restore-json">' + escHTML(CONTENT.checkin.restoreBtn) + '</button>' +
      '<input type="file" id="restore-file" accept="application/json,.json" hidden>' +
    '</div>' +
  '</div>' +

  '<div class="card mb-16 danger-card" style="border:1.5px solid var(--danger-border);">' +
    '<h3 class="card-title" style="font-size:1rem;color:var(--danger-text);margin-bottom:6px;">Start fresh</h3>' +
    '<p class="card-text mb-12" style="font-size:0.86rem;color:var(--ob-body);">' +
      'Clear your current routine and begin again as a new visitor.' +
    '</p>' +
    '<div id="reset-action-area">' +
      '<button type="button" class="btn btn-sm" id="btn-trigger-reset" style="background:#2687DC;color:#FFFFFF;border:none;">Reset all data and start fresh</button>' +
    '</div>' +
  '</div>' +

  '<div class="card">' +
    '<h3 class="card-title" style="font-size:1rem;margin-bottom:8px;">About Bodywise Companion</h3>' +
    '<p class="card-text" style="font-size:0.88rem;margin-bottom:8px;">Built for quiet daily consistency and objective marker tracking.</p>' +
    '<p class="muted" style="font-size:0.8rem;">Version ' + escHTML(CONTENT.version) + ' · Private and offline capable.</p>' +
  '</div>';

  Drawer.open('Settings and options', html, function (panelEl) {
    var replayBtn = panelEl.querySelector('#btn-replay-intro');
    if (replayBtn) {
      replayBtn.addEventListener('click', function () {
        Drawer.close();
        if (typeof window.replayIntro === 'function') window.replayIntro();
      });
    }

    var tourStartBtn = panelEl.querySelector('#btn-start-tour');
    if (tourStartBtn) {
      tourStartBtn.addEventListener('click', function () {
        Drawer.close();
        if (window.BWTour) setTimeout(function () { window.BWTour.start(); }, 250);
      });
    }

    var replayBeeBtn = panelEl.querySelector('#btn-replay-bee');
    if (replayBeeBtn) {
      replayBeeBtn.addEventListener('click', function () {
        Drawer.close();
        if (typeof window.replayIntroWithBee === 'function') window.replayIntroWithBee();
      });
    }

    var exportBtn = panelEl.querySelector('#btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!Storage.load()) { UI.toast('Nothing to back up yet.'); return; }
        try {
          var blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'bodywise-companion-backup-' + Utils.getToday() + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (err) {
          UI.toast('Could not create the backup file.');
        }
      });
    }

    var restoreBtn = panelEl.querySelector('#btn-restore-json');
    var restoreFile = panelEl.querySelector('#restore-file');
    if (restoreBtn && restoreFile) {
      restoreBtn.addEventListener('click', function () { restoreFile.click(); });
      restoreFile.addEventListener('change', function () {
        var file = restoreFile.files && restoreFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var data;
          try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
          var valid = data && typeof data === 'object' && !Array.isArray(data) &&
            CONTENT.concerns[data.concern] && /^\d{4}-\d{2}-\d{2}$/.test(String(data.startDate || ''));
          if (!valid) { UI.toast(CONTENT.checkin.restoreError); return; }
          if (!window.confirm(CONTENT.checkin.restoreConfirm + '.')) return;
          data = migrateProfile(data);
          if (!Array.isArray(data.checkins)) data.checkins = [];
          if (!Array.isArray(data.weeklyRatings)) data.weeklyRatings = [];
          if (!Array.isArray(data.products)) data.products = [];
          if (!data.flags || typeof data.flags !== 'object') data.flags = { seenExpect: true };
          Storage.save(data);
          Drawer.close();
          renderAllSections();
          UI.toast(CONTENT.checkin.restoreSuccess);
        };
        reader.onerror = function () { UI.toast(CONTENT.checkin.restoreError); };
        reader.readAsText(file);
      });
    }

    var triggerResetBtn = panelEl.querySelector('#btn-trigger-reset');
    var resetArea = panelEl.querySelector('#reset-action-area');
    if (triggerResetBtn && resetArea) {
      triggerResetBtn.addEventListener('click', function () {
        resetArea.innerHTML = '<div style="background:var(--ob-glass-hi);border:1px solid var(--danger-border);border-radius:8px;padding:12px;margin-top:6px;">' +
          '<p style="font-size:0.84rem;font-weight:600;color:var(--danger-text);margin-bottom:10px;">This permanently deletes your routine and history. Continue?</p>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="btn btn-sm" id="btn-confirm-reset" style="background:#2687DC;color:#FFFFFF;border:none;">Yes, clear all data</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-reset">Cancel</button>' +
          '</div>' +
        '</div>';

        panelEl.querySelector('#btn-cancel-reset').addEventListener('click', function () { openSettingsDrawer(); });

        panelEl.querySelector('#btn-confirm-reset').addEventListener('click', function () {
          Storage.reset();
          try { sessionStorage.removeItem('bwc_intro_seen'); } catch (e) { /* ignore */ }
          clearDraft();
          Drawer.close();
          try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
          window.location.reload();
        });
      });
    }
  });
}

function openAboutDrawer() {
  openSettingsDrawer();
}



/* ---- Weekly Review Drawer ---- */


/* ---- Desktop Rail ---- */
function renderDesktopRail() {
  var profile = Storage.load();
  var railEl = document.getElementById('desktop-rail');
  if (!railEl) return;
  if (!profile) {
    railEl.style.display = 'none';
    document.body.classList.remove('has-profile');
    return;
  }
  document.body.classList.add('has-profile');
  railEl.style.display = 'block';

  var isCiDone = Utils.isCheckedInToday(profile);
  var isRevDue = Utils.isWeeklyRatingDue(profile);

  // Requirement 4: Desktop Rail Navigation Order
  var steps = [
    { id: 'bodymap', label: 'Body map', done: true },
    { id: 'today', label: 'Daily ritual', done: isCiDone },
    { id: 'timeline', label: 'Timeline', done: true },
    { id: 'mind', label: 'Mind Space', done: isMindVisitedToday(profile) },
    { id: 'results', label: 'Results', done: !isRevDue },
    { id: 'setup', label: 'Bathroom shelf', done: true },
    { id: 'nextstep', label: 'Next step', done: false }
  ];

  var html = '<div class="rail-stepper">' +
    '<div class="rail-track-line"></div>' +
    '<ul class="rail-stepper-list rail-list">';

  steps.forEach(function (s) {
    var nodeClass = s.done ? 'completed' : 'upcoming';
    html += '<li class="rail-step-item">' +
      '<button type="button" class="rail-step-btn rail-btn' + (s.done ? ' done' : '') + '" data-scroll="' + s.id + '">' +
        '<span class="rail-step-node rail-dot ' + nodeClass + '">' +
          (s.done ? ICONS.check : '<span class="node-inner-dot"></span>') +
        '</span>' +
        '<span class="rail-step-label rail-label">' + escHTML(s.label) + '</span>' +
      '</button>' +
    '</li>';
  });
  html += '</ul></div>';

  railEl.innerHTML = html;

  railEl.querySelectorAll('[data-scroll]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var target = el.getAttribute('data-scroll');
      scrollToSection(target);
    });
  });
}

/* ---- Site Footer ---- */
function renderSiteFooter() {
  var footEl = document.getElementById('site-footer');
  if (!footEl) return;
  var f = CONTENT.footer || { line: "Built for quiet daily consistency.", privacy: "Private. Saved only on your device." };
  footEl.innerHTML = '<div class="container">' +
    '<p style="margin-bottom:4px;">' + escHTML(f.line) + '</p>' +
    '<p class="muted" style="font-size:0.8rem;">' + escHTML(f.privacy) + '</p>' +
  '</div>';
}

/* ==================== ROOT RENDERING ==================== */
function renderAllSections() {
  var contentEl = document.getElementById('app-content');
  if (!contentEl) return;

  try { UI.renderHeader(); } catch (err) { if (window.console) console.error('Header failed', err); }

  var profile = Storage.load();

  var structureHtml = '<div id="desktop-rail" aria-label="Quick jump rail"></div>' +
    '<div class="sections-wrapper">';

  // With a routine the daily ritual leads; the setup shelf moves to the end.
  var sectionOrder = profile
    ? ['bodymap', 'today', 'timeline', 'mind', 'results', 'nextstep', 'setup', 'companion', 'how', 'closing']
    : ['companion', 'how', 'setup', 'today', 'timeline', 'mind', 'results', 'nextstep', 'closing'];

  sectionOrder.forEach(function (secId) {
    structureHtml += '<section id="' + secId + '" class="app-section section-' + secId + '"></section>';
  });
  structureHtml += '<footer id="site-footer" class="site-footer"></footer>';
  structureHtml += '</div>';

  structureHtml += '<div id="app-drawer" class="drawer-overlay" aria-hidden="true">' +
    '<div id="drawer-backdrop" class="drawer-backdrop"></div>' +
    '<div id="drawer-panel" class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">' +
      '<div class="drawer-header">' +
        '<h2 class="drawer-title" id="drawer-title"></h2>' +
        '<button type="button" class="drawer-close-btn" id="drawer-close" aria-label="Close panel">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="drawer-body" id="drawer-body"></div>' +
    '</div>' +
  '</div>';

  contentEl.innerHTML = structureHtml;

  var drawerClose = document.getElementById('drawer-close');
  var drawerBackdrop = document.getElementById('drawer-backdrop');
  if (drawerClose) drawerClose.addEventListener('click', function () { Drawer.close(); });
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', function () { Drawer.close(); });

  // One failing section must never take the rest of the page down.
  SECTIONS.forEach(function (sec) {
    var secContainer = contentEl.querySelector('#' + sec.id);
    if (!secContainer || typeof sec.render !== 'function') return;
    try {
      sec.render(secContainer);
    } catch (err) {
      if (window.console) console.error('Section "' + sec.id + '" failed to render', err);
      secContainer.innerHTML = '<div class="container"><div class="card"><p class="card-text">This section could not load. Reload the page to try again.</p></div></div>';
    }
  });

  try { renderDesktopRail(); } catch (err) { if (window.console) console.error(err); }
  try { renderSiteFooter(); } catch (err) { if (window.console) console.error(err); }
  try { initScrollspy(); } catch (err) { if (window.console) console.error(err); }
}

/* ==================== CINEMATIC BRAND INTRO CONTROLLER ==================== */
function initIntroAnimation() {
  var introEl = document.getElementById('intro-stage');
  if (!introEl) return;

  var skipBtn = document.getElementById('intro-skip-btn');
  var brandLogo = document.getElementById('brand-logo');
  var headerIcon = brandLogo ? (brandLogo.querySelector('.guide-avatar-badge') || brandLogo) : null;
  var figure = document.getElementById('intro-final-figure');
  var wordmark = document.getElementById('intro-wordmark');
  var lettersEl = document.getElementById('intro-letters');
  var canvasEl = document.getElementById('intro-canvas');
  var beeStageEl = document.getElementById('bee-onboarding-stage');

  var beeState = {
    step: 0,
    name: '',
    concerns: [],
    shelfIdx: 0,
    ownedProducts: [],
    routineTime: 'both', // not asked: each product follows its own morning/night schedule
    startBucket: 'notYet'
  };

  // Head finishes drawing at 7.7s; wait 1s more so the full logo is seen.
  var INTRO_DONE_MS = 8700;
  var introTimer = null;
  var glideTimer = null;
  var landTimer = null;
  var isGliding = false;

  function clearTimers() {
    if (introTimer) clearTimeout(introTimer);
    if (glideTimer) clearTimeout(glideTimer);
    if (landTimer) clearTimeout(landTimer);
  }

  function dismissIntro() {
    clearTimers();
    try { sessionStorage.setItem('bwc_intro_seen', 'true'); } catch (e) {}
    if (headerIcon) {
      headerIcon.style.opacity = '1';
    }
    introEl.classList.remove('playing', 'fading');
    introEl.classList.add('dismissed');
    introEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    var tourSeen = false;
    try { tourSeen = localStorage.getItem('bwc_tour_seen') === 'true'; } catch (e) { /* ignore */ }
    if (!tourSeen) {
      setTimeout(function () {
        if (window.BWTour && typeof window.BWTour.start === 'function' && !window.BWTour.isActive()) window.BWTour.start();
      }, 600);
    }
  }

  function startGlide(onDone) {
    if (isGliding || !introEl || introEl.classList.contains('dismissed')) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    isGliding = true;
    clearTimers();

    var targetEl = headerIcon || (brandLogo ? brandLogo.querySelector('.guide-avatar-badge') : null) || brandLogo;

    if (targetEl && figure) {
      var targetRect = targetEl.getBoundingClientRect();
      var figRect = figure.getBoundingClientRect();

      if (figRect.width > 0 && targetRect.width > 0) {
        var figCenterX = figRect.left + figRect.width / 2;
        var figCenterY = figRect.top + figRect.height / 2;
        var targetCenterX = targetRect.left + targetRect.width / 2;
        var targetCenterY = targetRect.top + targetRect.height / 2;

        var dx = targetCenterX - figCenterX;
        var dy = targetCenterY - figCenterY;
        var scale = targetRect.height / figRect.height;

        targetEl.style.opacity = '0';
        targetEl.style.transition = 'opacity 0.15s ease';

        figure.style.transition = 'transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)';
        figure.style.transformOrigin = 'center center';
        figure.style.transform = 'translate(' + dx.toFixed(2) + 'px, ' + dy.toFixed(2) + 'px) scale(' + scale.toFixed(4) + ')';

        introEl.classList.add('fading');
        if (wordmark) {
          wordmark.style.transition = 'opacity 0.5s ease';
          wordmark.style.opacity = '0';
        }
        if (beeStageEl) {
          beeStageEl.style.transition = 'opacity 0.5s ease';
          beeStageEl.style.opacity = '0';
        }
        introEl.style.transition = 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1)';
        introEl.style.opacity = '0';
      } else {
        introEl.classList.add('fading');
        introEl.style.transition = 'opacity 0.6s ease';
        introEl.style.opacity = '0';
      }
    } else {
      introEl.classList.add('fading');
      introEl.style.transition = 'opacity 0.6s ease';
      introEl.style.opacity = '0';
    }

    landTimer = setTimeout(function () {
      if (targetEl) targetEl.style.opacity = '1';
      dismissIntro();
      if (typeof onDone === 'function') onDone();
    }, 950);
  }

  function renderBeeOnboarding() {
    if (!beeStageEl) return;
    if (lettersEl) lettersEl.style.display = 'none';
    if (wordmark) wordmark.style.display = 'none';
    if (canvasEl) {
      canvasEl.style.transition = 'transform 0.5s ease';
      canvasEl.style.transform = 'scale(0.65) translateY(-30px)';
    }

    beeStageEl.style.display = 'flex';
    beeStageEl.style.opacity = '1';

    var step = beeState.step;
    var stepHtml = '';

    if (step === 0) {
      // Step 0: Name Greeting
      stepHtml = '<div class="bee-character-card">' +
        '<div class="bee-avatar-hero">' + (ICONS.guideHero || ICONS.guideAvatar) + '</div>' +
        '<div class="bee-speech-bubble">' +
          '<h3 class="bee-greeting-title">Hi! My name is BEE! What\'s yours?</h3>' +
          '<p class="bee-greeting-sub">I will walk you through your wellness routine step by step.</p>' +
        '</div>' +
        '<div class="bee-input-group">' +
          '<input type="text" class="bee-input-name" id="bee-name-input" placeholder="Type your first name..." value="' + escHTML(beeState.name) + '" maxlength="30" autofocus />' +
          '<button type="button" class="btn btn-primary" id="bee-name-submit">Continue &rarr;</button>' +
        '</div>' +
      '</div>';
    } else if (step === 1) {
      // Step 1: Concern Focus
      stepHtml = '<div class="bee-character-card">' +
        '<div class="bee-steps-indicator">' +
          '<span class="bee-step-dot active"></span>' +
          '<span class="bee-step-dot"></span>' +
          '<span class="bee-step-dot"></span>' +
          '<span class="bee-step-dot"></span>' +
        '</div>' +
        '<div class="bee-avatar-hero">' + (ICONS.guideHero || ICONS.guideAvatar) + '</div>' +
        '<div class="bee-speech-bubble">' +
          '<h3 class="bee-greeting-title">Nice to meet you, ' + escHTML(beeState.name) + '!</h3>' +
          '<p class="bee-greeting-sub">What would you like to focus on? Pick one or more.</p>' +
        '</div>' +
        '<div class="bee-options-grid">' +
          CONTENT.quiz.concerns.map(function (c) {
            var isSel = beeState.concerns.indexOf(c.value) >= 0;
            return '<button type="button" class="bee-choice-btn' + (isSel ? ' selected' : '') + '" data-concern="' + c.value + '" aria-pressed="' + isSel + '">' +
              '<span class="bee-choice-title">' + escHTML(c.label) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;width:100%;margin-top:10px;">' +
          '<button type="button" class="btn btn-secondary btn-sm" id="bee-prev">Back</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="bee-next-focus"' + (beeState.concerns.length ? '' : ' disabled') + '>Next step &rarr;</button>' +
        '</div>' +
      '</div>';
    } else if (step === 2) {
      // Step 2: Owned Formulas Checklist
      var beeQ = beeState.concerns;
      var beeIdx = Math.min(beeState.shelfIdx, beeQ.length - 1);
      var beeConcern = beeQ[beeIdx];
      var beeLabel = Utils.getConcernConfig(beeConcern).label || beeConcern;
      var catalog = (CONTENT.catalog && CONTENT.catalog[beeConcern]) || [];
      stepHtml = '<div class="bee-character-card">' +
        '<div class="bee-steps-indicator">' +
          '<span class="bee-step-dot"></span>' +
          '<span class="bee-step-dot active"></span>' +
          '<span class="bee-step-dot"></span>' +
          '<span class="bee-step-dot"></span>' +
        '</div>' +
        '<div class="bee-avatar-hero">' + (ICONS.guideHero || ICONS.guideAvatar) + '</div>' +
        '<div class="bee-speech-bubble">' +
          '<h3 class="bee-greeting-title">Do you already have ' + escHTML(String(beeLabel).toLowerCase()) + ' formulas at home?</h3>' +
          '<p class="bee-greeting-sub">' + (beeQ.length > 1 ? escHTML(beeLabel) + ' \u00b7 ' + (beeIdx + 1) + ' of ' + beeQ.length + '. ' : '') + 'Select every product you currently have with you.</p>' +
        '</div>' +
        '<div class="bee-shelf-grouped" style="display:flex;flex-direction:column;gap:8px;width:100%;text-align:left;max-height:none;overflow:visible;padding:2px;">' +
          renderGroupedCatalog(beeConcern, function (p) {
            var isChk = (beeState.ownedProducts.indexOf(p.id) >= 0);
            return '<div class="shelf-product-item bee-shelf-item' + (isChk ? ' selected' : '') + '" data-prod-id="' + p.id + '" role="checkbox" aria-checked="' + isChk + '" tabindex="0">' +
              '<div class="shelf-checkbox">' + (isChk ? ICONS.check : '') + '</div>' +
              '<span class="bee-shelf-name">' + escHTML(p.name) + '</span>' +
            '</div>';
          }) +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;width:100%;margin-top:10px;">' +
          '<button type="button" class="btn btn-secondary btn-sm" id="bee-prev">Back</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="bee-next-shelf">Next step &rarr;</button>' +
        '</div>' +
      '</div>';
    } else if (step === 3) {
      // Step 3: Routine Timing & Start Date
      stepHtml = '<div class="bee-character-card">' +
        '<div class="bee-steps-indicator">' +
          '<span class="bee-step-dot"></span>' +
          '<span class="bee-step-dot"></span>' +
          '<span class="bee-step-dot active"></span>' +
          '<span class="bee-step-dot"></span>' +
        '</div>' +
        '<div class="bee-avatar-hero">' + (ICONS.guideHero || ICONS.guideAvatar) + '</div>' +
        '<div class="bee-speech-bubble">' +
          '<h3 class="bee-greeting-title">When did you start?</h3>' +
          '<p class="bee-greeting-sub">Realistic routines build quiet daily momentum.</p>' +
        '</div>' +
        '<div style="width:100%;text-align:left;">' +
          '<div class="chip-group" style="display:flex;gap:8px;">' +
            '<button type="button" class="chip' + (beeState.startBucket === 'notYet' ? ' selected focus-ring-active' : '') + '" data-bucket="notYet">Starting today</button>' +
            '<button type="button" class="chip' + (beeState.startBucket === 'under1m' ? ' selected focus-ring-active' : '') + '" data-bucket="under1m">Past 2 weeks</button>' +
            '<button type="button" class="chip' + (beeState.startBucket === '1to3m' ? ' selected focus-ring-active' : '') + '" data-bucket="1to3m">1 to 2 months ago</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;width:100%;margin-top:14px;">' +
          '<button type="button" class="btn btn-secondary btn-sm" id="bee-prev">Back</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="bee-finish-routine">Submit &amp; build my routine &rarr;</button>' +
        '</div>' +
      '</div>';
    } else if (step === 4) {
      // Step 4: Celebration & Enter Companion
      stepHtml = '<div class="bee-character-card">' +
        '<div class="bee-avatar-hero" style="width:96px;height:96px;">' + (ICONS.guideHero || ICONS.guideAvatar) + '</div>' +
        '<div class="bee-speech-bubble">' +
          '<h3 class="bee-greeting-title">Your routine is ready, ' + escHTML(beeState.name) + '!</h3>' +
          '<p class="bee-greeting-sub">Your personal companion is saved privately on your device. I\'ll be right beside you every step.</p>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" id="bee-enter-app" style="width:100%;padding:14px 20px;font-size:1.05rem;">Enter My Companion &rarr;</button>' +
      '</div>';
    }

    beeStageEl.innerHTML = stepHtml;

    // Prevent clicks inside the questionnaire card from bubbling to background
    beeStageEl.onclick = function (e) {
      e.stopPropagation();
    };

    // Bindings for each step
    if (step === 0) {
      var nameInput = beeStageEl.querySelector('#bee-name-input');
      var nameBtn = beeStageEl.querySelector('#bee-name-submit');
      function submitName() {
        var val = (nameInput.value || '').trim();
        beeState.name = val ? Utils.toTitleCase(val) : 'Friend';
        beeState.step = 1;
        renderBeeOnboarding();
      }
      if (nameBtn) nameBtn.addEventListener('click', submitName);
      if (nameInput) {
        nameInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') submitName();
        });
      }
    } else if (step === 1) {
      beeStageEl.querySelectorAll('[data-concern]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = this.getAttribute('data-concern');
          var i = beeState.concerns.indexOf(v);
          if (i >= 0) beeState.concerns.splice(i, 1); else beeState.concerns.push(v);
          this.classList.toggle('selected', i < 0);
          this.setAttribute('aria-pressed', String(i < 0));
          var nb = beeStageEl.querySelector('#bee-next-focus');
          if (nb) nb.disabled = !beeState.concerns.length;
        });
      });
      var nextFocusBtn = beeStageEl.querySelector('#bee-next-focus');
      if (nextFocusBtn) {
        nextFocusBtn.addEventListener('click', function () {
          if (!beeState.concerns.length) return;
          beeState.shelfIdx = 0;
          beeState.step = 2;
          renderBeeOnboarding();
        });
      }
      var backBtn1 = beeStageEl.querySelector('#bee-prev');
      if (backBtn1) {
        backBtn1.addEventListener('click', function () {
          beeState.step = 0;
          renderBeeOnboarding();
        });
      }
    } else if (step === 2) {
      beeStageEl.querySelectorAll('.shelf-product-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var pid = this.getAttribute('data-prod-id');
          var idx = beeState.ownedProducts.indexOf(pid);
          if (idx >= 0) {
            beeState.ownedProducts.splice(idx, 1);
          } else {
            beeState.ownedProducts.push(pid);
          }
          renderBeeOnboarding();
        });
      });
      var nextShelfBtn = beeStageEl.querySelector('#bee-next-shelf');
      if (nextShelfBtn) {
        nextShelfBtn.addEventListener('click', function () {
          if (beeState.shelfIdx < beeState.concerns.length - 1) beeState.shelfIdx++;
          else beeState.step = 3;
          renderBeeOnboarding();
        });
      }
      var backBtn2 = beeStageEl.querySelector('#bee-prev');
      if (backBtn2) {
        backBtn2.addEventListener('click', function () {
          if (beeState.shelfIdx > 0) beeState.shelfIdx--;
          else beeState.step = 1;
          renderBeeOnboarding();
        });
      }
    } else if (step === 3) {
      beeStageEl.querySelectorAll('[data-time]').forEach(function (b) {
        b.addEventListener('click', function () {
          beeState.routineTime = this.getAttribute('data-time');
          renderBeeOnboarding();
        });
      });
      beeStageEl.querySelectorAll('[data-bucket]').forEach(function (b) {
        b.addEventListener('click', function () {
          beeState.startBucket = this.getAttribute('data-bucket');
          renderBeeOnboarding();
        });
      });
      var finishBtn = beeStageEl.querySelector('#bee-finish-routine');
      if (finishBtn) {
        finishBtn.addEventListener('click', function () {
          var profile = buildProfile({
            name: beeState.name, concerns: beeState.concerns, ownedProducts: beeState.ownedProducts,
            startBucket: beeState.startBucket, routineTime: beeState.routineTime
          }, null);
          Storage.save(profile);
          renderAllSections();
          startGlide(function () {
            // After setup, the feature tour starts right away.
            window.scrollTo(0, 0);
            var goMap = function () { enterBodyMap(profile.concerns && profile.concerns[0]); };
            if (window.BWTour && !window.BWTour.isActive()) window.BWTour.start({ onDone: goMap });
            else goMap();
            UI.toast('Welcome, ' + profile.name + '! Your routine is ready.');
          });
        });
      }
      var backBtn3 = beeStageEl.querySelector('#bee-prev');
      if (backBtn3) {
        backBtn3.addEventListener('click', function () {
          beeState.step = 2;
          beeState.shelfIdx = Math.max(0, beeState.concerns.length - 1);
          renderBeeOnboarding();
        });
      }
    } else if (step === 4) {
      var enterBtn = beeStageEl.querySelector('#bee-enter-app');
      if (enterBtn) {
        enterBtn.addEventListener('click', function () {
          var profile = buildProfile({
            name: beeState.name, concerns: beeState.concerns.length ? beeState.concerns : ['hair'], ownedProducts: beeState.ownedProducts,
            startBucket: beeState.startBucket, routineTime: beeState.routineTime
          }, null);

          Storage.save(profile);
          renderAllSections();

          startGlide(function () {
            // After setup, the feature tour starts right away.
            window.scrollTo(0, 0);
            var goMap = function () { enterBodyMap(profile.concerns && profile.concerns[0]); };
            if (window.BWTour && !window.BWTour.isActive()) window.BWTour.start({ onDone: goMap });
            else goMap();
            UI.toast('Welcome, ' + profile.name + '! Your routine is ready.');
          });
        });
      }
    }
  }

  function play() {
    clearTimers();
    isGliding = false;
    if (headerIcon) {
      headerIcon.style.opacity = '';
      headerIcon.style.transition = '';
    }
    if (figure) {
      figure.style.transform = '';
      figure.style.transition = '';
    }
    if (wordmark) {
      wordmark.style.opacity = '';
      wordmark.style.transition = '';
      wordmark.style.display = '';
    }
    if (lettersEl) {
      lettersEl.style.display = '';
    }
    if (beeStageEl) {
      beeStageEl.style.display = 'none';
      beeStageEl.style.opacity = '';
    }
    introEl.style.opacity = '';
    introEl.style.transition = '';

    introEl.classList.remove('dismissed', 'fading', 'playing');
    void introEl.offsetWidth; // restart CSS animations
    introEl.classList.add('playing');
    introEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    var prof = Storage.load();
    if (!prof) {
      // First visit: play brand intro animation (7.4s) then BEE character steps forward for questionnaire
      introTimer = setTimeout(function () {
        renderBeeOnboarding();
      }, INTRO_DONE_MS);
    } else {
      // Returning user: play intro then glide into header logo
      glideTimer = setTimeout(function () {
        startGlide();
      }, INTRO_DONE_MS);
    }
  }

  window.replayIntro = function () {
    try { sessionStorage.removeItem('bwc_intro_seen'); } catch (e) {}
    beeState.step = 0;
    beeState.concerns = [];
    beeState.shelfIdx = 0;
    play();
  };

  window.replayIntroWithBee = function () {
    try { sessionStorage.removeItem('bwc_intro_seen'); } catch (e) {}
    beeState.step = 0;
    beeState.concerns = [];
    beeState.shelfIdx = 0;
    clearTimers();
    isGliding = false;
    if (headerIcon) {
      headerIcon.style.opacity = '';
      headerIcon.style.transition = '';
    }
    if (figure) {
      figure.style.transform = '';
      figure.style.transition = '';
    }
    if (wordmark) {
      wordmark.style.opacity = '';
      wordmark.style.transition = '';
      wordmark.style.display = '';
    }
    if (lettersEl) {
      lettersEl.style.display = '';
    }
    if (beeStageEl) {
      beeStageEl.style.display = 'none';
      beeStageEl.style.opacity = '';
    }
    introEl.style.opacity = '';
    introEl.style.transition = '';

    introEl.classList.remove('dismissed', 'fading', 'playing');
    void introEl.offsetWidth;
    introEl.classList.add('playing');
    introEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    introTimer = setTimeout(function () {
      renderBeeOnboarding();
    }, INTRO_DONE_MS);
  };

  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      dismissIntro();
    });
  }

  if (brandLogo) {
    brandLogo.addEventListener('click', function (e) {
      if (e.shiftKey) {
        e.preventDefault();
        window.replayIntro();
      }
    });
  }

  // Play the B + W brand intro (and BEE setup for new visitors) on load.
  // The feature tour starts once the intro is dismissed, the first time only.
  play();
}

/* ==================== INIT ==================== */
function init() {
  // The intro overlay must be controllable even if rendering hits a problem.
  try {
    renderAllSections();
  } catch (err) {
    if (window.console) console.error('Render failed', err);
  }
  try {
    initIntroAnimation();
  } catch (err) {
    if (window.console) console.error('Intro failed', err);
    var stage = document.getElementById('intro-stage');
    if (stage) stage.style.display = 'none';
  }

  // Delegated navigation: any [data-scroll] element outside the header works.
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-scroll]') : null;
    if (!el || el.closest('#app-header') || el.closest('#desktop-rail')) return;
    var target = el.getAttribute('data-scroll');
    if (!target) return;
    e.preventDefault();
    if (Drawer.isOpen()) Drawer.close();
    scrollToSection(target);
  });

  document.addEventListener('keydown', function (e) { Drawer.onKeydown(e); });

  var guideBtn = document.getElementById('guide-floating-btn');
  if (guideBtn) guideBtn.addEventListener('click', function () { openChatbotDrawer(); });

  Router.start();

  var currentRenderedDate = Utils.getToday();
  function checkMidnightRollover() {
    var nowToday = Utils.getToday();
    if (nowToday === currentRenderedDate) return;
    currentRenderedDate = nowToday;
    var prof = Storage.load();
    if (!prof) return;
    var dayN = Utils.daysBetween(prof.startDate, currentRenderedDate) + 1;
    UI.toast('New day. Day ' + dayN + '.');
    refreshSections(['today', 'timeline', 'mind', 'results', 'nextstep']);
    refreshPrimaryCard();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkMidnightRollover();
  });
  window.addEventListener('focus', checkMidnightRollover);
  var rolloverTimer = setInterval(checkMidnightRollover, 60000);
  if (rolloverTimer && typeof rolloverTimer.unref === 'function') rolloverTimer.unref();

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.deferredPrompt = e;
  });

  if ('serviceWorker' in navigator && location.protocol && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
