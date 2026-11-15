/* Kickoff Simulator (prototype, 11-12). Runs entirely in the browser: no server, no tracking, no cost.
   Scenarios are data files (see /sim/*.json). Flow: Start -> Briefing -> Meeting -> Results, one step at a time. */
(function () {
  'use strict';
  var root = document.getElementById('sim');
  if (!root) return;

  var SCENARIOS = JSON.parse(root.getAttribute('data-scenarios') || '[]');
  var LENGTHS = [15, 30, 45];   // 11-12: 60 min dropped, too long for a kickoff
  // 11-12: meeting length sets a question budget (main questions + follow-ups) instead of a minutes clock.
  // 15 = very hard (can't reach every best-fit fact), 30 = like a real meeting (~20 min of questions + overhead), 45 = every question (23 + 10).
  var BUDGET = { 15: { q: 4, f: 2 }, 30: { q: 10, f: 5 }, 45: { q: 23, f: 10 } };
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  var S = null;            // the scenario for this play (BASE + one variant)
  var BASE = null, lastVariant = null;
  var st = null;           // game state
  var FULL = root.getAttribute('data-full') === 'on';
  // Hiring Challenge (11-14): a curated set of challenges (10 at launch). Each finished attempt moves this browser on to the next one, then it cycles.
  var WEEKLY = JSON.parse(root.getAttribute('data-weekly') || '[]');
  var NCH = Math.max(1, WEEKLY.length);   // how many challenges are published
  var memNext = 1;   // used when the browser won't let us save progress (private mode)
  function weekNo() {
    var m = /[?&](?:challenge|week)=(\d+)/.exec(location.search);   // preview/testing: ?challenge=N
    if (m) return ((Math.max(1, +m[1]) - 1) % NCH) + 1;
    var r = loadRec();
    return r.next || memNext;
  }
  function weekEntry(n) { return WEEKLY[(n - 1) % NCH]; }   // challenge n = the nth published file
  // Progress lives only in this browser (localStorage). Nothing is sent anywhere.
  var STORE = 'mts-hiring-challenge';
  function loadRec() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function saveRec(r) { try { localStorage.setItem(STORE, JSON.stringify(r)); } catch (e) { /* private mode: no streak */ } }
  function recordPlay(n, res) {   // called once per finished attempt: save the result and move on to the next challenge
    var r = loadRec(); r.results = r.results || {};
    r.results[n] = res; r.done = (r.done || 0) + 1;
    r.next = (n % NCH) + 1; memNext = r.next;
    saveRec(r); return r;
  }   // 11-13: Full practice parked for later (resources_pages.SIM_FULL)
  var choice = { id: (SCENARIOS.filter(function (s) { return s.ready; })[0] || {}).id, minutes: 30, mode: 'quick' };

  // Minutes can be half-minutes (main questions take about 1½ min): show 28½ rather than 28.5
  function fmt(m) { var w = Math.floor(m + 1e-9), half = m - w >= 0.5 - 1e-9; return (w || !half ? String(w) : '') + (half ? '½' : ''); }

  // ---------- tiny DOM helper (text only, never innerHTML with data) ----------
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { el.addEventListener(ev, attrs.on[ev]); });
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function add(c) { if (Array.isArray(c)) c.forEach(add); else if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  // Accessibility (11-12): a re-render within the same step keeps keyboard focus on the control you used (data-k)
  // and doesn't scroll; a new step moves focus to its heading. Answers are announced through one persistent live region.
  var curLabel = null, nextFocus = null;
  var live = h('p', { 'class': 'sim-vh', 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.parentNode.insertBefore(live, root.nextSibling);
  function announce(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 60); }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function screen(kids, label) {
    var a = document.activeElement, key = nextFocus || (a && a.getAttribute && a.getAttribute('data-k'));
    var same = label === curLabel, first = curLabel === null;   // first screen: don't scroll, so the page top (and any banner) stays in view
    nextFocus = null; curLabel = label;
    root.innerHTML = '';
    var wrap = h('div', { 'class': 'sim-screen', role: 'region', 'aria-label': label }, kids);
    root.appendChild(wrap);
    var target = same && key ? wrap.querySelector('[data-k="' + key + '"]') : null;
    if (target && target.disabled) target = wrap.querySelector('.sim-tabs [aria-pressed="true"]');   // e.g. arrow at the last topic
    if (target) {
      target.focus({ preventScroll: true });
      if (key === 'tip') { var tb = target.closest('.sim-tip'); if (tb) tb.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); }
      return;
    }
    var focus = wrap.querySelector('h2');
    if (focus && !first) { focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true }); }
    if (!same && !first) root.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  function progress(step) {
    var names = ['Set up', 'Briefing', 'Meeting', 'Choose', 'Debrief'];
    return h('ol', { 'class': 'sim-steps', 'aria-label': 'Progress' }, names.map(function (n, i) {
      return h('li', { 'class': i < step ? 'done' : i === step ? 'now' : '', 'aria-current': i === step ? 'step' : false, text: n });
    }));
  }

  // ---------- 1. Set up ----------
  function renderStart() {
    if (!FULL) choice.mode = 'quick';
    var quick = choice.mode === 'quick';
    function usable(s) { return quick ? !!s.quick : s.ready; }
    if (!SCENARIOS.some(function (s) { return s.id === choice.id && usable(s); })) {
      choice.id = (SCENARIOS.filter(usable)[0] || {}).id;
    }
    var modes = h('div', { 'class': 'sim-seg sim-modes', role: 'group', 'aria-label': 'Choose a version' }, [
      ['quick', 'Quick challenge', 'About 5 minutes'], ['full', 'Full practice', 'About 20 minutes']].map(function (m) {
      var on = choice.mode === m[0];
      return h('button', { type: 'button', 'data-k': 'mode-' + m[0], 'aria-pressed': on ? 'true' : 'false', 'class': on ? 'on' : '',
        on: { click: function () { choice.mode = m[0]; renderStart(); } } },
        [h('span', { 'class': 'sim-len', text: m[1] }), h('span', { 'class': 'sim-lvl', text: m[2] })]);
    }));
    var roles = h('div', { 'class': 'sim-roles', role: 'group', 'aria-label': 'Choose a role' }, SCENARIOS.map(function (s) {
      var on = s.id === choice.id, ok = usable(s);
      return h('button', {
        type: 'button', 'class': 'sim-role' + (on ? ' on' : '') + (ok ? '' : ' soon'), 'data-k': 'role-' + s.id,
        'aria-pressed': on ? 'true' : 'false', disabled: !ok,
        on: { click: function () { choice.id = s.id; renderStart(); } }
      }, [h('span', { 'class': 'sim-fam', text: s.family }), h('strong', { text: quick && s.plain ? s.plain : s.title }),
          h('span', { 'class': 'sim-sub', text: ok ? (quick && s.quickline ? s.quickline : s.line) : (quick ? 'Quick version coming soon' : 'Coming soon') })]);
    }));
    if (quick) {
      var n = weekNo(), wk = weekEntry(n), rec = loadRec(), done = rec.done || 0, last = rec.results && rec.results[n];
      var lastFit = last ? (last.fit || (last.right ? 'best' : 'no')) : null;
      if (!wk) { screen([h('h2', { text: 'Can you pick the right hire?' }), h('p', { text: 'The challenge is on its way. Please check back soon.' })], 'Set up'); return; }
      function step(a, b) { return h('li', {}, [h('strong', { text: a }), ' ' + b]); }
      screen([
        h('div', { 'class': 'sim-hero' }, [
          h('p', { 'class': 'sim-eyebrow', text: 'Hiring challenge ' + n + ' of ' + NCH }),
          h('h2', { text: 'Can you pick the right hire?' }),
          h('p', { 'class': 'sim-lede', text: 'Many hires go off track in the first conversation, before anyone has asked the right questions. This is your chance to practice that conversation.' }),
          h('div', { 'class': 'sim-thisweek' }, [
            h('div', {}, [h('p', { 'class': 'sim-label', text: 'Your hiring manager' }),
              h('p', { 'class': 'sim-tw-name' }, [h('strong', { text: wk.who }), ', ' + wk.job]),
              h('p', { text: wk.teaser }),
              h('p', { 'class': 'sim-tw-role' }, [h('strong', { text: 'The role: ' }), wk.title])])])]),
        h('h3', { text: 'What you’ll do' }),
        h('ol', { 'class': 'sim-what' }, [
          step('Read the brief.', 'A short note from ' + wk.who + ' and the old job ad.'),
          step('Have the conversation.', wk.who + ' shares their first thoughts about the role, one at a time. Each time, choose the question you’d ask next. ' + wk.who + ' reacts to how you ask it.'),
          step('Pick the hire.', 'Decide what ' + wk.who + ' really needs, then choose from 4 candidates.'),
          step('See how you did.', 'Find out which questions work best and why. Then try the next challenge, with a new role and a new hiring manager.')]),
        h('ul', { 'class': 'sim-chips', 'aria-label': 'About this challenge' }, ['About 5 minutes', NCH + ' different challenges', 'No sign-up, nothing tracked'].map(function (t) { return h('li', { text: t }); })),
        last ? h('p', { 'class': 'sim-streak' }, [h('strong', { text: 'You’ve played this one before.' }),
          ' Last time: best question at ' + last.good + ' of ' + last.total + ' moments, ' +
          (lastFit === 'best' ? 'and the right hire.' : lastFit === 'close' ? 'and close on the hire.' : 'and a different hire.') + ' See if you can do better.'])
          : done ? h('p', { 'class': 'sim-streak' }, [h('strong', { text: 'Challenges completed: ' + done + '.' }), ' This one is new for you.']) : null,
        FULL ? h('h3', { text: 'Choose a version' }) : null, FULL ? modes : null,
        h('div', { 'class': 'sim-actions' }, [h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: loadQuick }, text: (last ? 'Play challenge ' : 'Start challenge ') + n + (last ? ' again' : '') })]),
        h('p', { 'class': 'sim-hint sim-fict', text: 'Everyone in the challenge is made up.' })
      ], 'Set up');
      return;
    }
    var lengths = h('div', { 'class': 'sim-seg', role: 'group', 'aria-label': 'Meeting length' }, LENGTHS.map(function (m) {
      return h('button', {
        type: 'button', 'data-k': 'len-' + m, 'aria-pressed': m === choice.minutes ? 'true' : 'false', 'class': m === choice.minutes ? 'on' : '',
        on: { click: function () { choice.minutes = m; renderStart(); } }, text: m + ' min'
      });
    }));
    screen([
      progress(0),
      h('h2', { text: 'Can you pick the right hire?' }),
      h('p', { 'class': 'sim-lede', text: 'Run a kickoff meeting with a fictional hiring manager. Ask the right questions, then choose from six candidate profiles. Only one is the best fit.' }),
      h('h3', { text: '1. Choose a version' }), modes,
      h('h3', { text: '2. Choose a role' }), roles,
      h('h3', { text: '3. How long is your meeting?' }),
      h('p', { 'class': 'sim-hint', text: 'Pick the length you get. It sets how many questions you can ask, so you won’t be able to ask everything. Choose wisely.' }),
      lengths,
      h('p', { 'class': 'sim-budgetline' }, [
        'A ' + choice.minutes + '-minute meeting gives you ',
        h('strong', { text: plural(BUDGET[choice.minutes].q, 'question', 'questions') }), ' and ',
        h('strong', { text: plural(BUDGET[choice.minutes].f, 'follow-up', 'follow-ups') }), '.'
      ]),
      h('div', { 'class': 'sim-actions' }, [h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: load }, text: 'Continue' })])
    ], 'Set up');
  }

  function load() {
    var meta = SCENARIOS.filter(function (s) { return s.id === choice.id; })[0];
    if (!meta) return;
    fetch(meta.file).then(function (r) { return r.json(); }).then(function (data) {
      BASE = data; S = data; renderBriefing();
    }).catch(function () {
      screen([h('h2', { text: 'Something went wrong' }), h('p', { text: 'The scenario didn’t load. Please refresh and try again.' })], 'Error');
    });
  }

  // ---------- 2. Briefing ----------
  function emailDoc() {   // 11-12 roadmap #3: the brief arrives the way it does in real life
    var e = S.intake_email;
    return h('div', { 'class': 'sim-email', role: 'group', 'aria-label': 'Email from ' + S.manager.first }, [
      h('dl', { 'class': 'sim-email-h' }, [
        h('dt', { text: 'From' }), h('dd', { text: e.from }),
        h('dt', { text: 'To' }), h('dd', { text: 'You' }),
        h('dt', { text: 'Subject' }), h('dd', { text: e.subject })
      ]),
      h('div', { 'class': 'sim-email-b' }, e.body.map(function (para) {
        return h('p', {}, para.replace('{minutes}', String(choice.minutes)).split('\n').reduce(function (a, line, i) { if (i) a.push(h('br')); a.push(line); return a; }, []));
      }))
    ]);
  }
  function postingDoc() {   // full posting if the scenario has one, else the one-line version
    var p = S.posting_full;
    if (!p) return h('blockquote', { 'class': 'sim-posting', text: S.posting });
    return h('div', { 'class': 'sim-posting' }, [
      h('p', { 'class': 'sim-post-title', text: p.title }),
      h('p', { 'class': 'sim-post-meta', text: p.meta })
    ].concat(p.sections.map(function (s) {
      return h('div', { 'class': 'sim-post-sec' }, [h('p', { 'class': 'sim-post-h', text: s.heading }),
        s.text ? h('p', { text: s.text }) : h('ul', {}, s.items.map(function (i) { return h('li', { text: i }); }))]);
    })));
  }
  // 11-12: candidates as professional profiles ("show, don't tell"). Generic look, no third-party branding.
  var AVA = ['#2C4C2A', '#2E4A66', '#7A3E10', '#5B3A6E', '#1F5E5B', '#6A4A0C'];
  function ava(c, big) {
    var i = S.candidates.map(function (x) { return x.id; }).indexOf(c.id);
    return h('span', { 'class': 'sim-pava' + (big ? ' big' : ''), 'aria-hidden': 'true', style: 'background:' + AVA[(i < 0 ? 0 : i) % AVA.length], text: c.name.charAt(0) });
  }
  function expBlock(e) {
    return h('li', { 'class': 'sim-pexp' }, [
      h('p', { 'class': 'sim-pexp-t', text: e.title }),
      h('p', { 'class': 'sim-pexp-c', text: e.company + ' · ' + e.dates }),
      e.points.length ? h('ul', {}, e.points.map(function (x) { return h('li', { text: x }); })) : null]);
  }
  function screenNotes(c) {
    var pr = c.profile;
    return h('div', { 'class': 'sim-pnotes' }, [
      h('p', { 'class': 'sim-pnotes-h', text: 'Your screening notes' }),
      h('dl', {}, [
        h('dt', { text: 'Looking for' }), h('dd', { text: pr.ask }),
        h('dt', { text: 'Work set-up' }), h('dd', { text: pr.work }),
        c.screen_note ? h('dt', { text: 'Phone screen' }) : null,
        c.screen_note ? h('dd', { text: c.screen_note.replace(/^Phone screen:\s*/, '').replace(/^./, function (x) { return x.toUpperCase(); }) }) : null])]);
  }
  function profileHead(c, big, tag) {
    var pr = c.profile;
    return h('div', { 'class': 'sim-phead' }, [h('div', { 'class': 'sim-pbanner', 'aria-hidden': 'true' }), ava(c, big),
      h(tag || 'p', { 'class': 'sim-pname', text: c.name }),
      h('p', { 'class': 'sim-pheadline', text: pr.headline }),
      h('p', { 'class': 'sim-ploc', text: pr.location + ' · Fictional profile' })]);
  }
  function profileRest(c, skipFirst) {
    var pr = c.profile;
    return [
      h('div', { 'class': 'sim-psec' }, [h('p', { 'class': 'sim-psec-h', text: 'About' }), h('p', { text: pr.about })]),
      h('div', { 'class': 'sim-psec' }, [h('p', { 'class': 'sim-psec-h', text: skipFirst ? 'Earlier experience' : 'Experience' }),
        h('ul', { 'class': 'sim-pexps' }, pr.experience.slice(skipFirst ? 1 : 0).map(expBlock))]),
      h('div', { 'class': 'sim-psec' }, [h('p', { 'class': 'sim-psec-h', text: 'Recommendation' }),
        h('blockquote', { 'class': 'sim-prec' }, [h('p', { text: '“' + pr.recommendation.text + '”' }), h('p', { 'class': 'sim-prec-f', text: pr.recommendation.from })])]),
      h('div', { 'class': 'sim-psec' }, [h('p', { 'class': 'sim-psec-h', text: 'Skills' }),
        h('ul', { 'class': 'sim-pskills' }, pr.skills.map(function (x) { return h('li', { text: x }); }))])
    ];
  }
  function profileFull(c) {   // the briefing viewer
    return h('article', { 'class': 'sim-prof', 'aria-label': c.name + '’s profile' },
      [profileHead(c, true, 'h4')].concat(profileRest(c, false)).concat([screenNotes(c)]));
  }
  var profIx = 0;
  function profileViewer() {
    var list = shuffle(S.candidates);
    if (profIx >= list.length) profIx = 0;
    var c = list[profIx];
    function go(n) { profIx = n; renderBriefing(); }
    return h('div', { 'class': 'sim-pviewer' }, [
      h('div', { 'class': 'sim-pchips', role: 'group', 'aria-label': 'Choose a profile' }, list.map(function (x, n) {
        return h('button', { type: 'button', 'class': 'sim-pchip' + (n === profIx ? ' on' : ''), 'data-k': 'pv-' + x.id, 'aria-pressed': n === profIx ? 'true' : 'false',
          on: { click: function () { go(n); } } }, [ava(x), x.name]);
      })),
      profileFull(c),
      h('div', { 'class': 'sim-pnav' }, [
        h('button', { type: 'button', 'class': 'btn btn-secondary', 'data-k': 'pv-prev', disabled: profIx === 0, on: { click: function () { go(profIx - 1); } }, text: '‹ Previous' }),
        h('span', { 'class': 'sim-hint', text: 'Profile ' + (profIx + 1) + ' of ' + list.length }),
        h('button', { type: 'button', 'class': 'btn btn-secondary', 'data-k': 'pv-next', disabled: profIx === list.length - 1, on: { click: function () { go(profIx + 1); } }, text: 'Next ›' })])
    ]);
  }
  function shortlistMini(cls) {   // the six profiles you reviewed before the meeting (name + current role only)
    return h('ul', { 'class': 'sim-mini ' + (cls || '') }, shuffle(S.candidates).map(function (c) {
      return h('li', {}, [h('span', { 'class': 'sim-ava', 'aria-hidden': 'true', text: c.name.charAt(0) }),
        h('span', {}, [h('strong', { text: c.name }), h('span', { 'class': 'sim-sub', text: c.headline }),
          cls === 'wide' ? h('ul', { 'class': 'sim-mini-b' }, c.bullets.map(function (b) { return h('li', { text: b }); })) : null,
          cls === 'wide' && c.screen_note ? h('span', { 'class': 'sim-screennote', text: c.screen_note }) : null])]);
    }));
  }
  function renderBriefing() {
    if (!S._pv) { profIx = 0; S._pv = true; }
    screen([
      progress(1),
      h('h2', { text: 'Your briefing' }),
      // 11-12: briefing styled as a printed search brief (a document on the desk, like the notes pad)
      h('div', { 'class': 'sim-briefgrid' }, [
      h('article', { 'class': 'sim-doc', 'aria-label': 'Search brief' }, [
        h('div', { 'class': 'sim-doc-head' }, [
          h('div', {}, [
            h('p', { 'class': 'sim-doc-kicker', text: 'Search brief' }),
            h('p', { 'class': 'sim-doc-title', text: S.title })
          ]),
        ]),
        h('dl', { 'class': 'sim-brief' }, [
          h('dt', { text: 'Company' }), h('dd', { text: S.company + '. ' + S.company_line }),
          h('dt', { text: 'Hiring manager' }), h('dd', { text: S.manager.name + ', ' + S.manager.title }),
          h('dt', { text: 'Role' }), h('dd', { text: S.role_line }),
          h('dt', { text: 'Meeting length' }), h('dd', { text: choice.minutes + ' minutes' }),
          h('dt', { text: 'Your task' }), h('dd', { text: 'You reviewed ' + S.candidates.length + ' profiles for this role before the meeting. Use the meeting to find out which one is the best fit.' })
        ]),
        S.intake_email ? emailDoc() : null,
        h('div', { 'class': 'sim-clip' }, [
          h('p', { 'class': 'sim-clip-tag', text: S.intake_email ? 'Attached: the job posting' : 'The job posting you’ve been given' }),
          postingDoc()
        ]),
        h('p', { 'class': 'sim-doc-foot', text: 'Fictional scenario for practice. Names and companies are made up.' })
      ]),
      ]),
      h('section', { 'class': 'sim-suspects', 'aria-label': 'Profiles you reviewed' }, [
        h('h3', { text: 'The ' + S.candidates.length + ' profiles you reviewed' }),
        h('p', { 'class': 'sim-hint', text: 'On paper, most of them could work. Only one is the best fit, and the meeting with ' + S.manager.first + ' is how you find out which. Look for the differences, then plan your questions.' }),
        S.candidates[0].profile ? profileViewer() : shortlistMini('wide')
      ]),
      h('div', { 'class': 'sim-how' }, [
        h('h3', { text: 'How it works' }),
        h('ul', {}, [
          h('li', {}, ['This meeting gives you ', h('strong', { text: plural(BUDGET[choice.minutes].q, 'question', 'questions') }), ' and ',
            h('strong', { text: plural(BUDGET[choice.minutes].f, 'follow-up', 'follow-ups') }), '. ' + (BUDGET[choice.minutes].q >= S.questions.filter(function (x) { return !x.followup; }).length
            ? 'That’s enough time to ask everything.'
            : 'There are ' + S.questions.filter(function (x) { return !x.followup; }).length + ' questions to choose from, so pick the ones that matter.')]),
          h('li', { text: 'Ask, take notes, then sum up what ' + S.manager.first + ' really needs and choose the best fit. ' + S.manager.first + '’s needs can change each time you play.' }),
          tipsDone() ? null : h('li', { text: 'A few quick tips will guide you through your first question.' })
        ])
      ]),
      h('div', { 'class': 'sim-actions' }, [
        h('button', { type: 'button', 'class': 'btn btn-secondary', on: { click: renderStart }, text: 'Back' }),
        h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: startMeeting }, text: 'Start the meeting' })
      ])
    ], 'Briefing');
  }

  // ---------- 3. Meeting ----------
  // 11-12: Sam's real needs vary between plays (scenario 'variants'), so the best fit isn't always the same.
  // Never the same variant twice in a row. The briefing and the six profiles are identical in every variant.
  function applyVariant(base) {
    var copy = JSON.parse(JSON.stringify(base)), vs = base.variants || [];
    if (!vs.length) return copy;
    var pool = vs.filter(function (v) { return v.id !== lastVariant; });
    var v = pool[Math.floor(Math.random() * pool.length)];
    lastVariant = v.id; copy.variant = v;
    Object.keys(v.facts || {}).forEach(function (f) { Object.keys(v.facts[f]).forEach(function (k) { copy.facts[f][k] = v.facts[f][k]; }); });
    copy.questions.forEach(function (q) { if (v.answers && v.answers[q.id]) q.answer = v.answers[q.id]; });
    copy.candidates.forEach(function (c) { var o = (v.candidates || {})[c.id]; if (o) Object.keys(o).forEach(function (k) { c[k] = o[k]; }); });
    return copy;
  }
  function startMeeting() {
    S = applyVariant(BASE);
    var b = BUDGET[choice.minutes];
    st = { tip: tipsDone() ? -1 : 0, summary: '', self: null, pick: null, qLeft: b.q, fLeft: b.f, asked: {}, found: {}, order: [], unlocked: {}, log: [], tab: S.parts[0].id, deeper: [] };
    renderMeeting();
  }
  function q(id) { return S.questions.filter(function (x) { return x.id === id; })[0]; }
  function available(x) { return !st.asked[x.id] && (!x.followup || st.unlocked[x.id]); }
  function canAsk(x) { return x.followup ? st.fLeft > 0 : st.qLeft > 0; }
  function meetingOver() { return !S.questions.some(function (x) { return available(x) && canAsk(x); }); }
  function ask(x) {
    if (!canAsk(x) || st.asked[x.id]) return;
    if (st.tip >= 0) endTips();   // asking a question ends the tips
    st.asked[x.id] = true;
    if (x.followup) st.fLeft -= 1; else st.qLeft -= 1;
    var fresh = (x.reveals || []).filter(function (f) { return !st.found[f]; });
    fresh.forEach(function (f) { st.found[f] = true; st.order.push(f); });
    st.deeper = (x.unlocks || []).filter(function (u) { st.unlocked[u] = true; return true; });
    // Feedback after every answer: what it added, or a nudge to go deeper
    var fb = fresh.length ? { kind: 'gain', items: fresh.map(function (f) { return S.facts[f].note; }) }
      : st.deeper.length ? { kind: 'nudge', items: [st.fLeft > 0 ? 'That’s the headline. Go deeper to get the detail.' : 'That’s the headline. You have no follow-ups left to go deeper.'] }
      : { kind: 'none', items: ['Nothing new here.'] };
    st.log.push({ who: 'you', text: x.text }, { who: 'hm', text: x.answer, fb: fb });
    st.tab = x.part;
    nextFocus = 'convo';
    renderMeeting();
    announce(S.manager.first + ' says: ' + x.answer + ' ' + (fb.kind === 'gain' ? 'Added to your notes: ' + fb.items.join(' ') : fb.items.join(' ')) +
      ' ' + plural(st.qLeft, 'question', 'questions') + ' and ' + plural(st.fLeft, 'follow-up', 'follow-ups') + ' left.');
  }
  function qButton(x, cls) {
    var none = !canAsk(x);
    // 11-12: every button says whether it has a follow-up (or is one)
    var tag = x.followup ? h('span', { 'class': 'sim-ftag is-fu', text: 'Follow-up' })
      : (x.unlocks && x.unlocks.length) ? h('span', { 'class': 'sim-ftag has-fu' }, ['Has a follow-up'])
      : h('span', { 'class': 'sim-ftag no-fu', text: 'No follow-up' });
    return h('button', { type: 'button', 'class': 'sim-q ' + (cls || ''), disabled: none,
      title: none ? (x.followup ? 'No follow-ups left' : 'No questions left') : null,
      on: { click: function () { ask(x); } } },
      [h('span', { 'class': 'sim-qt', text: x.text }),
       h('span', { 'class': 'sim-meta' }, [tag, h('span', { 'class': 'sim-go', 'aria-hidden': 'true', text: '›' })])]);
  }
  function pips(left, total, label, cls) {
    var dots = [];
    for (var i = 0; i < total; i++) dots.push(h('span', { 'class': 'sim-pip' + (i < left ? ' on' : '') }));
    return h('div', { 'class': 'sim-budget ' + cls, role: 'img', 'aria-label': left + ' of ' + total + ' ' + label + ' left' }, [
      h('span', { 'class': 'sim-budget-l' }, [h('strong', { text: String(left) }), ' ' + label + ' left']),
      h('span', { 'class': 'sim-pips', 'aria-hidden': 'true' }, dots)]);
  }
  // 11-12 roadmap #2: three skippable tips on the first meeting (remembered in this browser only)
  var TIP_KEY = 'mts-sim-tips-done';
  function tipsDone() { try { return localStorage.getItem(TIP_KEY) === '1'; } catch (e) { return false; } }
  function endTips() { st.tip = -1; try { localStorage.setItem(TIP_KEY, '1'); } catch (e) {} }
  function tipBox(i) {
    var b = BUDGET[choice.minutes];
    var T = [
      ['Pick a topic', 'Questions are grouped into five topics. Use the arrows or select a topic to see its questions.'],
      ['Look for follow-ups', 'Questions marked “Has a follow-up” open a deeper question once ' + S.manager.first + ' answers. The facts that matter most are often there.'],
      ['Watch your budget', 'You have ' + plural(b.q, 'question', 'questions') + ' and ' + plural(b.f, 'follow-up', 'follow-ups') + '. When they run out, the meeting ends. Ask your first question when you’re ready.']
    ][i];
    return h('div', { 'class': 'sim-tip', role: 'region', 'aria-label': 'Tip ' + (i + 1) + ' of 3' }, [
      h('p', { 'class': 'sim-tip-n', text: 'Tip ' + (i + 1) + ' of 3' }),
      h('p', { 'class': 'sim-tip-h', tabindex: '-1', 'data-k': 'tip', text: T[0] }),
      h('p', { 'class': 'sim-tip-b', text: T[1] }),
      h('div', { 'class': 'sim-tip-a' }, [
        h('button', { type: 'button', 'class': 'btn btn-primary sim-tip-next', 'data-k': 'tipnext',
          on: { click: function () { if (i < 2) { st.tip = i + 1; nextFocus = 'tip'; } else { endTips(); nextFocus = 'tab-' + st.tab; } renderMeeting(); } },
          text: i < 2 ? 'Next tip' : 'Got it' }),
        i < 2 ? h('button', { type: 'button', 'class': 'sim-tip-skip', on: { click: function () { endTips(); nextFocus = 'tab-' + st.tab; renderMeeting(); } }, text: 'Skip tips' }) : null
      ])
    ]);
  }
  function renderMeeting() {
    var over = meetingOver();
    var b = BUDGET[choice.minutes];
    var head = h('div', { 'class': 'sim-bar' }, [
      h('div', { 'class': 'sim-clock' }, [
        pips(st.qLeft, b.q, st.qLeft === 1 ? 'question' : 'questions', 'main'),
        pips(st.fLeft, b.f, st.fLeft === 1 ? 'follow-up' : 'follow-ups', 'fu')
      ]),
      h('button', { type: 'button', 'class': 'sim-notesfab', 'data-k': 'fab',   // phones only: jump to the notes
        on: { click: function () { var n = root.querySelector('.sim-notes h3'); if (n) { n.setAttribute('tabindex', '-1'); n.scrollIntoView({ block: 'start' }); n.focus({ preventScroll: true }); } } } },
        ['Notes', h('span', { 'class': 'sim-fabcount', 'aria-label': st.order.length + ' facts', text: String(st.order.length) })]),
      h('button', { type: 'button', 'class': 'btn btn-secondary sim-end', on: { click: renderChoose }, text: 'End meeting' })
    ]);
    var convo = h('div', { 'class': 'sim-convo', role: 'region', 'aria-label': 'Conversation with ' + S.manager.first, tabindex: '0', 'data-k': 'convo' },
      st.log.length ? st.log.map(function (m) {
        var msg = h('p', { 'class': 'sim-msg ' + m.who }, [h('span', { 'class': 'sim-who', text: m.who === 'you' ? 'You' : S.manager.first }), m.text]);
        if (!m.fb) return msg;
        return h('div', { 'class': 'sim-turn' }, [msg, h('div', { 'class': 'sim-fb ' + m.fb.kind },
          [h('span', { 'class': 'sim-fbh', text: m.fb.kind === 'gain' ? 'Added to your notes' : m.fb.kind === 'nudge' ? 'Tip' : '' })]
            .concat(m.fb.items.map(function (t) { return h('span', { 'class': 'sim-fbi', text: t }); })))]);
      }) : [h('p', { 'class': 'sim-empty', text: S.manager.first + ' is ready. Choose your first question below.' })]);

    var panel;
    if (over) {
      panel = h('div', { 'class': 'sim-over' }, [
        h('h3', { text: 'That’s all your questions' }),
        h('p', { text: 'That’s the end of your ' + choice.minutes + '-minute meeting. Next, choose the best candidate using what you learned.' }),
        h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: renderChoose }, text: 'See the candidates' })
      ]);
    } else {
      var deeper = st.deeper.map(q).filter(function (x) { return x && available(x); });
      // 11-12: the part titles are a carousel: arrows step to the previous/next part, the row scrolls to keep it centred
      var ix = S.parts.map(function (p) { return p.id; }).indexOf(st.tab);
      function go(d) { var n = ix + d; if (n < 0 || n >= S.parts.length) return; st.tab = S.parts[n].id; st.deeper = []; renderMeeting(); }
      var tabRow = h('div', { 'class': 'sim-tabs', role: 'group', 'aria-label': 'Question topics' }, S.parts.map(function (p) {
        var left = S.questions.filter(function (x) { return x.part === p.id && available(x) && !x.followup; }).length;
        return h('button', { type: 'button', 'data-k': 'tab-' + p.id, 'aria-pressed': st.tab === p.id ? 'true' : 'false',
          'class': st.tab === p.id ? 'on' : '', on: { click: function () { st.tab = p.id; st.deeper = []; renderMeeting(); } } },
          [p.title, left ? h('span', { 'class': 'sim-count', 'aria-label': left + ' questions left', text: String(left) }) : null]);
      }));
      var tabs = h('div', { 'class': 'sim-carousel' + (st.tip === 0 ? ' sim-hl' : '') }, [
        h('button', { type: 'button', 'class': 'sim-arrow', 'aria-label': 'Previous topic', 'data-k': 'prev', disabled: ix <= 0, on: { click: function () { go(-1); } }, text: '‹' }),
        tabRow,
        h('button', { type: 'button', 'class': 'sim-arrow', 'aria-label': 'Next topic', 'data-k': 'next', disabled: ix >= S.parts.length - 1, on: { click: function () { go(1); } }, text: '›' }),
        h('p', { 'class': 'sim-partof', 'aria-hidden': 'true', text: 'Part ' + (ix + 1) + ' of ' + S.parts.length })
      ]);
      var list = S.questions.filter(function (x) {
        return x.part === st.tab && available(x) && deeper.indexOf(x) === -1;
      }).map(function (x) { return qButton(x, x.followup ? 'deep' : ''); });
      panel = h('div', { 'class': 'sim-panel' }, [
        deeper.length ? h('div', { 'class': 'sim-deeper' }, [h('p', { 'class': 'sim-label', text: 'Go deeper' })].concat(deeper.map(function (x) { return qButton(x, 'deep'); }))) : null,
        st.tip === 0 ? tipBox(0) : null,
        tabs,
        st.tip === 1 ? tipBox(1) : null,
        h('div', { 'class': 'sim-qs' + (st.tip === 1 ? ' sim-hl' : ''), role: 'group', 'aria-label': (S.parts[ix] || {}).title + ' questions' }, list.length ? list : [h('p', { 'class': 'sim-hint', text: 'You’ve asked everything in this part.' })])
      ]);
    }
    var notes = h('section', { 'class': 'sim-notes', 'aria-label': 'Your notes' }, [h('h3', { text: 'Your notes' })].concat(
      Object.keys(st.found).length ? S.parts.map(function (p) {
        var items = st.order.filter(function (f) { return S.facts[f].part === p.id; });
        return items.length ? h('div', {}, [h('p', { 'class': 'sim-label', text: p.title }), h('ul', {}, items.map(function (f) { return h('li', { text: S.facts[f].note }); }))]) : null;
      }) : [h('p', { 'class': 'sim-hint', text: 'Key facts appear here as you uncover them.' })]).concat([
      h('a', { 'class': 'sim-backq', href: '#', on: { click: function (e) { e.preventDefault(); var t = root.querySelector('.sim-tabs [aria-pressed="true"]'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus({ preventScroll: true }); } } }, text: 'Back to the questions' })]));
    if (st.tip === 2) head.classList.add('sim-hl');
    screen([progress(2), h('h2', { 'class': 'sim-vh', text: 'Kickoff meeting with ' + S.manager.name }), head, st.tip === 2 ? tipBox(2) : null,
      h('div', { 'class': 'sim-grid' }, [h('div', {}, [convo, panel]), h('div', { 'class': 'sim-side' }, [notes,
        h('details', { 'class': 'sim-shortlist' }, [h('summary', { text: 'Profiles you reviewed (' + S.candidates.length + ')' }), shortlistMini()])])])], 'Meeting');
    var c = root.querySelector('.sim-convo'); if (c) c.scrollTop = c.scrollHeight;
    var t = root.querySelector('.sim-tabs .on'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (st.tip >= 0) {   // keep the current tip on screen (runs after the topic row centres itself)
      var tb = root.querySelector('.sim-tip');
      if (tb) tb.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }

  // ---------- 4. Choose a candidate (11-12: replaces the scorecard) ----------
  function shuffle(a) {   // same order for the same scenario, so "try again" feels consistent
    return a.slice().sort(function (x, y) { return (x.id.charCodeAt(1) * 7 + x.id.length) - (y.id.charCodeAt(1) * 7 + y.id.length); });
  }
  function notesAside(title) {
    return h('section', { 'class': 'sim-notes', 'aria-label': title }, [h('h3', { text: title })].concat(
      st.order.length ? S.parts.map(function (p) {
        var items = st.order.filter(function (f) { return S.facts[f].part === p.id; });
        return items.length ? h('div', {}, [h('p', { 'class': 'sim-label', text: p.title }), h('ul', {}, items.map(function (f) { return h('li', { text: S.facts[f].note }); }))]) : null;
      }) : [h('p', { 'class': 'sim-hint', text: 'You didn’t uncover any facts in the meeting.' })]));
  }
  // 11-13: two simple steps instead of one busy screen (partner test: write + select + submit at once was confusing).
  // Step 1: one sentence on what the hiring manager really needs -> Next. Step 2: each card has its own Choose button.
  function renderChoose() {
    if (st.stage === 'pick') return renderPick();
    var MIN = 15;
    var err = h('p', { 'class': 'form-error', id: 'sim-sum-err', role: 'alert' });
    var ta = h('textarea', { id: 'sim-sum', 'class': 'sim-sum', rows: '3', maxlength: '300', 'data-k': 'sum',
      'aria-describedby': 'sim-sum-hint sim-sum-err', placeholder: 'e.g. Someone who…' });
    ta.value = st.summary;
    ta.addEventListener('input', function () { st.summary = ta.value; if (st.summary.trim().length >= MIN) err.textContent = ''; });
    function next() {
      if (st.summary.trim().length < MIN) { err.textContent = 'Write a short sentence first, then press Next.'; ta.focus(); return; }
      st.stage = 'pick'; renderPick();
    }
    screen([
      progress(3),
      h('h2', { text: 'What does ' + S.manager.first + ' really need?' }),
      h('p', { 'class': 'sim-lede', text: 'Before you choose a candidate, sum it up in one sentence. You’ll compare it with the real answer at the end.' }),
      h('div', { 'class': 'sim-grid' }, [
        h('div', { 'class': 'sim-sumbox' }, [
          h('label', { 'for': 'sim-sum', 'class': 'sim-sum-l', text: 'In one sentence:' }),
          h('p', { 'class': 'sim-hint', id: 'sim-sum-hint', text: 'Use your notes on the right.' }),
          ta, err,
          h('div', { 'class': 'sim-actions' }, [h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: next }, text: 'Next: choose a candidate' })])
        ]),
        notesAside('Your notes from the meeting')
      ])
    ], 'What ' + S.manager.first + ' needs');
  }
  function renderPick() {
    var cands = shuffle(S.candidates);
    function choose(c) { st.pick = c.id; renderReveal(); }
    var cards = h('div', { 'class': 'sim-pick', role: 'group', 'aria-label': 'Candidates' }, cands.map(function (c) {
      var btn = h('button', { type: 'button', 'class': 'btn btn-primary sim-choosebtn', 'data-k': 'pc-' + c.id, on: { click: function () { choose(c); } }, text: 'Choose ' + c.name });
      if (c.profile) {
        return h('article', { 'class': 'sim-pcard', 'aria-label': c.name }, [
          profileHead(c, false, 'h3'),
          h('ul', { 'class': 'sim-pexps' }, [expBlock(c.profile.experience[0])]),
          screenNotes(c),
          h('details', { 'class': 'sim-pmore' }, [h('summary', { text: 'Full profile' })].concat(profileRest(c, true))),
          btn]);
      }
      return h('article', { 'class': 'sim-pcard', 'aria-label': c.name }, [
        h('p', { 'class': 'sim-pname', text: c.name }), h('p', { 'class': 'sim-pheadline', text: c.headline }),
        h('ul', {}, c.bullets.map(function (b) { return h('li', { text: b }); })), btn]);
    }));
    screen([
      progress(3),
      h('h2', { text: 'Who is the best fit?' }),
      h('p', { 'class': 'sim-lede', text: 'These are the ' + S.candidates.length + ' profiles you reviewed. Choose the one who best fits what ' + S.manager.first + ' really needs.' }),
      h('p', { 'class': 'sim-yourline' }, [h('strong', { text: 'You wrote: ' }), '“' + st.summary.trim() + '” ',
        h('button', { type: 'button', 'class': 'sim-linkbtn', on: { click: function () { st.stage = 'sum'; renderChoose(); } }, text: 'Edit' })]),
      h('div', { 'class': 'sim-grid' }, [cards, notesAside('Your notes from the meeting')])
    ], 'Choose a candidate');
  }

  // ---------- 5. Debrief ----------
  function finder(f) {   // the question(s) that uncover a fact
    var x = S.questions.filter(function (y) { return (y.reveals || []).indexOf(f) !== -1; })[0];
    if (!x) return '';
    if (!x.followup) return x.text;
    var parent = S.questions.filter(function (y) { return (y.unlocks || []).indexOf(x.id) !== -1; })[0];
    return (parent ? parent.text + ' Then go deeper: ' : '') + x.text;
  }
  // ---------- Roadmap #5: optional "email me when new scenarios launch" (off unless data-notify="on") ----------
  var nf = { name: '', email: '', consent: false, sent: false };   // kept across debrief re-renders
  var capLoading = null;
  function captcha(key) {
    if (!key) return Promise.resolve('');
    if (!capLoading) capLoading = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(key);
      sc.onload = function () { window.grecaptcha.ready(res); }; sc.onerror = rej;
      document.head.appendChild(sc);
    });
    return capLoading.then(function () { return window.grecaptcha.execute(key, { action: 'submit' }); });
  }
  function notifyBox() {
    if (root.getAttribute('data-notify') !== 'on') return null;
    var box = h('section', { 'class': 'sim-notify', 'aria-labelledby': 'sim-nf-h' }, [
      h('h3', { id: 'sim-nf-h', text: 'Want to hear what’s new?' })]);
    if (nf.sent) {
      box.appendChild(h('p', { role: 'status', text: 'Thanks. Check your inbox and confirm your email. After that, you’ll only hear from me occasionally, like when the debrief simulation launches and other resources become available.' }));
      return box;
    }
    var key = root.getAttribute('data-recaptcha');
    var name = h('input', { id: 'sim-nf-name', name: 'first-name', type: 'text', autocomplete: 'given-name', required: true, maxlength: '60', 'data-k': 'nf-name' });
    var mail = h('input', { id: 'sim-nf-email', name: 'email', type: 'email', autocomplete: 'email', required: true, maxlength: '120', 'data-k': 'nf-email' });
    var ok = h('input', { id: 'sim-nf-ok', name: 'consent', type: 'checkbox', value: 'yes', required: true, 'data-k': 'nf-ok' });
    name.value = nf.name; mail.value = nf.email; ok.checked = nf.consent;
    name.addEventListener('input', function () { nf.name = name.value; });
    mail.addEventListener('input', function () { nf.email = mail.value; });
    ok.addEventListener('change', function () { nf.consent = ok.checked; ok.setCustomValidity(''); });
    ok.addEventListener('invalid', function () { ok.setCustomValidity(ok.checked ? '' : 'Please tick this box to agree to occasional updates.'); });
    var btn = h('button', { type: 'submit', 'class': 'btn btn-secondary', text: 'Email me occasional updates' });
    var err = h('p', { 'class': 'form-error', role: 'alert' });
    var form = h('form', { 'class': 'sim-nf-form', method: 'POST', action: root.getAttribute('data-endpoint') }, [
      h('input', { type: 'hidden', name: 'form-name', value: 'sim-updates' }),
      h('input', { type: 'hidden', name: 'scenario', value: S.id }),
      h('p', { 'class': 'sim-hp', 'aria-hidden': 'true' }, [h('label', {}, ['Leave this empty ', h('input', { name: 'company-url-confirm', tabindex: '-1', autocomplete: 'off' })])]),
      h('div', { 'class': 'sim-nf-row' }, [
        h('div', {}, [h('label', { 'for': 'sim-nf-name' }, ['First name ', h('span', { 'class': 'sim-req', text: '(required)' })]), name]),
        h('div', {}, [h('label', { 'for': 'sim-nf-email' }, ['Email ', h('span', { 'class': 'sim-req', text: '(required)' })]), mail])
      ]),
      h('p', { 'class': 'sim-nf-consent' }, [ok, h('label', { 'for': 'sim-nf-ok' }, [' Yes, Morley Talent Solutions can email me occasional updates about the Hiring Challenge and new free resources. I can unsubscribe at any time. ', h('span', { 'class': 'sim-req', text: '(required)' })])]),
      err, btn,
      h('p', { 'class': 'small', text: 'Optional. You’ll get one email to confirm. After that, only occasional updates. No weekly emails.' })
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      btn.disabled = true; btn.textContent = 'Sending…'; err.textContent = '';
      captcha(key).then(function (token) {
        var body = new URLSearchParams(new FormData(form));
        if (token) body.set('g-recaptcha-response', token);
        return fetch(form.action, { method: 'POST', mode: 'no-cors', body: body });
      }).then(function () { nf.sent = true; nextFocus = null; if (Q && QS) qResult(); else renderReveal(); var hh = document.getElementById('sim-nf-h'); if (hh) { hh.setAttribute('tabindex', '-1'); hh.focus(); } })
        .catch(function () { btn.disabled = false; btn.textContent = 'Email me occasional updates'; err.textContent = 'Sorry, that didn’t send. Please check your connection and try again.'; });
    });
    name.addEventListener('focus', function () { captcha(key).catch(function () {}); }, { once: true });
    box.appendChild(h('p', { text: 'If you’d also like occasional news, like when the debrief simulation launches and other resources become available, leave your email.' }));
    box.appendChild(form);
    return box;
  }
  var FIT = { best: 'Best fit', good: 'Good fit', okay: 'Could work', no: 'Not a fit' };
  function renderReveal() {
    var picked = S.candidates.filter(function (c) { return c.id === st.pick; })[0];
    var best = S.candidates.filter(function (c) { return c.fit === 'best'; })[0];
    var right = picked.fit === 'best';
    var headline = right ? 'You picked ' + picked.name + ', the best fit.'
      : picked.fit === 'good' ? 'You picked ' + picked.name + '. A good fit, but not the best.'
      : picked.fit === 'okay' ? 'You picked ' + picked.name + '. Could work, but there’s a real risk.'
      : 'You picked ' + picked.name + '. Not a fit for this role.';
    function keyList(c) {
      return h('ul', { 'class': 'sim-keys' }, c.key.map(function (f) {
        var got = !!st.found[f];
        return h('li', { 'class': got ? 'got' : 'miss' }, [
          h('span', { 'class': 'sim-mark', 'aria-hidden': 'true', text: got ? '✓' : '✕' }),
          h('div', {}, [h('span', { 'class': 'sim-vh', text: got ? 'You found: ' : 'You missed: ' }), S.facts[f].note,
            got ? null : h('span', { 'class': 'sim-ask' }, [h('b', { text: 'Ask: ' }), finder(f)])])]);
      }));
    }
    function card(c, open) {
      var tags = [h('span', { 'class': 'sim-tag ' + c.fit, text: FIT[c.fit] }),
        c.id === st.pick ? h('span', { 'class': 'sim-tag you', text: 'Your pick' }) : null];
      if (open) {
        return h('div', { 'class': 'sim-verdictcard ' + c.fit + (c.id === st.pick ? ' picked' : '') }, [
          h('div', { 'class': 'sim-vhead' }, [h('strong', { text: c.name })].concat(tags)),
          h('p', { 'class': 'sim-reason', text: c.reason }),
          c.sam_view ? h('p', { 'class': 'sim-samsays' }, [h('span', { 'class': 'sim-who', text: S.manager.first + '’s view' }), '“' + c.sam_view + '”']) : null,
          h('p', { 'class': 'sim-label', text: 'What tells you this' }), keyList(c)]);
      }
      return h('details', { 'class': 'sim-verdictcard sim-fold ' + c.fit }, [
        h('summary', {}, [h('strong', { text: c.name })].concat(tags).concat([h('span', { 'class': 'sim-reason1', text: c.reason })])),
        c.sam_view ? h('p', { 'class': 'sim-samsays' }, [h('span', { 'class': 'sim-who', text: S.manager.first + '’s view' }), '“' + c.sam_view + '”']) : null,
        h('p', { 'class': 'sim-label', text: 'What tells you this' }), keyList(c)]);
    }
    // Readability: lead with your pick and the best fit (open); the others fold into one-line reasons
    var lead = right ? [best] : [picked, best];
    var rest = S.candidates.filter(function (c) { return lead.indexOf(c) === -1; })
      .sort(function (a, b) { return ['best', 'good', 'okay', 'no'].indexOf(a.fit) - ['best', 'good', 'okay', 'no'].indexOf(b.fit); });
    var verdicts = lead.map(function (c) { return card(c, true); }).concat([
      h('h3', { text: 'The other profiles' }),
      h('p', { 'class': 'sim-hint', text: 'Select a name to see the facts behind the verdict.' })
    ]).concat(rest.map(function (c) { return card(c, false); }));
    var keyMissed = best.key.filter(function (f) { return !st.found[f]; }).length;
    screen([
      progress(4),
      h('h2', { text: headline }),
      h('p', { 'class': 'sim-lede', text: keyMissed
        ? 'You missed ' + keyMissed + ' of the ' + best.key.length + ' facts that point to ' + best.name + '. The questions to ask are below.'
        : 'You uncovered every fact that points to ' + best.name + '. That’s a strong kickoff.' }),
      h('div', { 'class': 'sim-compare' }, [
        h('div', { 'class': 'sim-yours' }, [h('p', { 'class': 'sim-label', text: 'What you wrote' }), h('p', { text: '“' + st.summary.trim() + '”' })]),
        S.variant && S.variant.need ? h('div', { 'class': 'sim-need' }, [h('p', { 'class': 'sim-label', text: 'What ' + S.manager.first + ' really needed' }), h('p', { text: S.variant.need.replace(/^This time, /, '').replace(/^./, function (c) { return c.toUpperCase(); }) })]) : null,
        h('div', { 'class': 'sim-selfmark' }, [
          h('p', { 'class': 'sim-selfq', id: 'sim-selfq', text: 'How close were you?' }),
          h('div', { role: 'group', 'aria-labelledby': 'sim-selfq', 'class': 'sim-seg' }, [['spot', 'Spot on'], ['close', 'Close'], ['missed', 'Missed it']].map(function (o) {
            return h('button', { type: 'button', 'data-k': 'self-' + o[0], 'aria-pressed': st.self === o[0] ? 'true' : 'false', 'class': st.self === o[0] ? 'on' : '',
              on: { click: function () { st.self = o[0]; renderReveal(); } }, text: o[1] });
          })),
          st.self ? h('p', { 'class': 'sim-hint', role: 'status', text: st.self === 'spot' ? 'Nice. That’s the brief a search should start from.'
            : st.self === 'close' ? 'Close is useful. Compare the details: deal size, pay, and what changed since the last hire.'
            : 'That’s what practice is for. The questions below would have changed your answer.' }) : null
        ])
      ]),
      h('div', { 'class': 'sim-verdicts' }, verdicts),
      h('p', { 'class': 'sim-hint sim-again' }, [S.manager.first + '’s needs can change each time you play, so the best fit may be someone else next time.']),
      notifyBox(),
      h('div', { 'class': 'sim-actions' }, [
        h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: function () { st = null; renderStart(); } }, text: 'Back to the main menu' }),
        h('a', { 'class': 'btn btn-secondary', href: '/resources/recruitment-kickoff-kit/', text: 'Get the free intake question template' })
      ])
    ], 'Debrief');
  }

  // =====================================================================================================
  // QUICK CHALLENGE (11-13): about 5 minutes, plain words, 8 questions, 4 asks ("Dig deeper" uses one),
  // 3 candidates, tap what the manager needs, one-screen result. Data: /sim/<id>-quick.json
  // =====================================================================================================
  var Q = null, QS = null, lastQV = null;   // QS, not q: q() is a full-mode helper
  function qval(x) { return x == null ? '' : typeof x === 'string' ? x : (x[QS.v] || ''); }
  function loadQuick() {
    var wn = weekNo(), meta = weekEntry(wn);
    if (!meta) return;
    fetch(meta.file).then(function (r) { return r.json(); }).then(function (data) { Q = data; S = data; qNew(); qBrief(); })
      .catch(function () { screen([h('h2', { text: 'Something went wrong' }), h('p', { text: 'The challenge didn’t load. Please refresh and try again.' })], 'Error'); });
  }
  function qNew() {
    var vs = Object.keys(Q.needs).filter(function (v) { return v !== lastQV; });
    var v = Q.version || vs[Math.floor(Math.random() * vs.length)]; lastQV = v;   // weekly: the version is fixed
    QS = { v: v, need: null, pick: null, week: weekNo() };
  }
  function qSteps(n) {
    var names = ['Brief', 'Conversation', 'Decide', 'Result'];
    return h('div', { 'class': 'sim-progress' }, [
      h('p', { 'class': 'sim-stepnow', text: 'Step ' + (n + 1) + ' of 4: ' + names[n] }),
      h('ol', { 'class': 'sim-steps', 'aria-label': 'Progress' }, names.map(function (x, i) {
        return h('li', { 'class': i < n ? 'done' : i === n ? 'now' : '', 'aria-current': i === n ? 'step' : false, text: x });
      }))]);
  }
  function qCard(c, chooseBtn) {
    return h('article', { 'class': 'sim-qcard', 'aria-label': c.name }, [
      h('div', { 'class': 'sim-qcard-h' }, [ava(c), h('div', {}, [h('p', { 'class': 'sim-pname', text: c.name }), h('p', { 'class': 'sim-pheadline', text: c.job })])]),
      h('p', { 'class': 'sim-qcard-l', text: 'Track record' }),
      h('ul', {}, c.facts.map(function (f) { return h('li', { text: f }); })),
      h('p', { 'class': 'sim-qask' }, [h('strong', { text: 'Wants: ' }), /hour|base/.test(c.ask) ? c.ask : c.ask + ' base salary']),
      chooseBtn || null]);
  }
  // ---- v2 (11-13): a dialogue-choice conversation. Sam makes assumptions; you choose how to respond. ----
  // v3: responses are graded best / ok / poor (the best one is not always the question)
  var QUAL = { best: 'Best question', ok: 'Okay, but there was a better one', poor: 'Missed chance' };
  function qBeat(id) { return Q.beats.filter(function (b) { return b.id === id; })[0]; }
  function qMain() { return Q.beats.filter(function (b) { return !b.followup; }); }
  function qStart() {
    QS.cur = qMain()[0].id; QS.mainIx = 0; QS.log = []; QS.clues = {}; QS.mood = 0; QS.ended = false; QS.last = null;
    qTalk();
  }
  function qBrief() {
    screen([
      qSteps(0),
      h('h2', { text: 'Your brief' }),
      h('div', { 'class': 'sim-paper' }, [
        h('p', { 'class': 'sim-paper-meta' }, [h('strong', { text: 'From: ' }), Q.manager.first + ', ' + Q.manager.title]),
        h('p', { 'class': 'sim-paper-meta' }, [h('strong', { text: 'About: ' }), 'Hiring a ' + Q.title.toLowerCase()]),
        h('div', { 'class': 'sim-paper-msg' }, Q.message.map(function (m) { return h('p', { text: m }); })),
        Q.context ? h('h3', { text: 'What you know' }) : null,
        Q.context ? h('ul', {}, Q.context.map(function (m) { return h('li', { text: m }); })) : null,
        h('h3', { text: 'The old job ad says' }),
        h('ul', {}, Q.ad.map(function (m) { return h('li', { text: m }); })),
        h('h3', { text: 'How it works' }),
        h('ul', { 'class': 'sim-qhow' }, [
          h('li', { text: Q.framing || (Q.manager.first + ' will share a few first thoughts about the role.') }),
          h('li', { text: 'Each time, choose the question you’d ask next. Some questions open the conversation up. Others close it down or put ' + Q.manager.first + ' on the defensive, and too many of those may end the call.' }),
          h('li', { text: 'Then decide what ' + Q.manager.first + ' really needs, and pick the best of ' + Q.candidates.length + ' candidates.' })])]),
      h('div', { 'class': 'sim-actions' }, [
        h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: qStart }, text: 'Start the conversation' }),
        h('button', { type: 'button', 'class': 'btn btn-secondary', on: { click: renderStart }, text: 'Back' })])
    ], 'Brief');
  }
  function qChoose(beat, c) {
    var reply = qval(c.reply);
    var bestC = beat.choices.filter(function (x) { return x.quality === 'best'; })[0];
    QS.log.push({ beat: beat.id, label: beat.label, kit: !!beat.kit, note: beat.note || null, quality: c.quality, cost: (c.mood || 0) < 0, text: c.text, why: c.why,
      better: c.quality === 'best' ? null : bestC.text, betterWhy: c.quality === 'best' ? null : bestC.why });
    QS.mood += c.mood || 0;
    if (c.clue) QS.clues[c.clue] = reply.replace(/^(Fine|Okay|Sure)[.,] /, '');   // notes keep the facts, not the tone
    QS.last = { you: c.text, reply: reply }; QS.lastStyle = c.style;
    if (QS.mood <= -2) { QS.ended = true; QS.cur = null; }
    else if (c.next) QS.cur = c.next;
    else { QS.mainIx += 1; var m = qMain(); QS.cur = QS.mainIx < m.length ? m[QS.mainIx].id : null; }
    nextFocus = 'qbox';
    qTalk();
    var b = QS.cur ? qBeat(QS.cur) : null;
    announce(Q.manager.first + ' says: ' + reply + (QS.ended ? ' ' + Q.end_early : b && b.sam ? ' ' + b.sam : ''));
  }
  // The face shows how the manager FEELS, not whether you were right: agreeing pleases them even when it's the weaker move.
  function qFace() {
    var s = QS.lastStyle, f = QS.ended ? ['😤', 'fed up'] : s === 'push' ? ['😠', 'annoyed'] : s === 'agree' ? ['😄', 'pleased']
      : QS.mood < 0 ? ['😒', 'a bit guarded'] : s === 'question' || s === 'flag' ? ['🤔', 'thoughtful'] : ['🙂', 'relaxed'];
    return h('span', { 'class': 'sim-face', role: 'img', 'aria-label': Q.manager.first + ' looks ' + f[1], title: Q.manager.first + ' looks ' + f[1], text: f[0] });
  }
  function qMood() {
    var t = QS.ended ? Q.manager.first + ' ended the call' : QS.mood === 0 ? Q.manager.first + ' is open' : Q.manager.first + ' is getting guarded';
    return h('p', { 'class': 'sim-mood m' + (QS.ended ? 'x' : QS.mood), role: 'status' }, [h('span', { 'class': 'sim-mood-dot', 'aria-hidden': 'true' }), t]);
  }
  function qNotes() {
    var keys = Object.keys(QS.clues || {});
    if (QS.notesOpen == null) QS.notesOpen = !(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
    var box = h('details', { 'class': 'sim-notes', open: QS.notesOpen }, [
      h('summary', {}, [h('span', { 'class': 'sim-notes-h', text: 'What you’ve learned' }), h('span', { 'class': 'sim-notes-n', text: String(keys.length) })]),
      keys.length ? h('ul', { 'class': 'sim-qnotes' }, keys.map(function (k) { return h('li', { text: QS.clues[k] }); }))
        : h('p', { 'class': 'sim-hint', text: 'The real story shows up here when you ask good questions.' })]);
    box.addEventListener('toggle', function () { QS.notesOpen = box.open; });
    return box;
  }
  function qTalk() {
    var beat = QS.cur ? qBeat(QS.cur) : null;
    var done = !beat;
    var main = qMain(), mi = Math.min(QS.mainIx + 1, main.length);
    var lines = [];
    var who = Q.manager.first;
    function turn(cls, label, text) { return h('div', { 'class': 'sim-turn ' + cls }, [h('p', { 'class': 'sim-turn-l', text: label }), h('p', { 'class': 'sim-turn-t', text: text })]); }
    if (QS.last) { lines.push(turn('you', 'You asked', QS.last.you)); lines.push(turn('reply', who + ' replied', QS.last.reply)); }
    if (QS.ended) lines.push(turn('now', who + ' says', Q.end_early));
    else if (done) lines.push(turn('now', who + ' says', 'That’s everything from me. Thanks!'));
    else if (beat.sam) lines.push(turn('now', QS.last ? who + '’s next point' : who + ' says', beat.sam));
    var box = h('div', { 'class': 'sim-dlg', tabindex: '-1', 'data-k': 'qbox', role: 'region', 'aria-label': Q.manager.first + ' says' }, [
      h('div', { 'class': 'sim-dlg-head' }, [qFace(),
        h('span', { 'class': 'sim-dlg-name', text: Q.manager.first + ', ' + Q.manager.title })]),
      h('div', { 'class': 'sim-dlg-body' }, lines)]);
    var opts = null;
    if (!done) {
      var n = Q.beats.indexOf(beat), cs = beat.choices.slice(n % 3).concat(beat.choices.slice(0, n % 3));   // vary the order
      opts = h('div', { 'class': 'sim-dlg-opts', role: 'group', 'aria-label': 'Choose your question' }, cs.map(function (c, k) {
        return h('button', { type: 'button', 'class': 'sim-dlg-opt', 'data-k': 'opt-' + k, on: { click: function () { qChoose(beat, c); } } },
          [h('span', { 'class': 'sim-dlg-cur', 'aria-hidden': 'true', text: '▶' }), c.text]);
      }));
      opts.addEventListener('keydown', function (e) {   // arrow keys move between responses, like a game menu
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        var bs = Array.prototype.slice.call(opts.querySelectorAll('button')), at = bs.indexOf(document.activeElement);
        if (at < 0) return;
        e.preventDefault(); bs[(at + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
      });
    }
    screen([
      qSteps(1),
      h('h2', { 'class': 'sim-vh', text: 'Conversation with ' + Q.manager.name }),
      h('div', { 'class': 'sim-bar' }, [
        h('p', { 'class': 'sim-moment', text: done ? 'Conversation over' : 'Moment ' + mi + ' of ' + main.length + (beat.followup ? ' (follow-up)' : '') }),
        qMood()]),
      h('div', { 'class': 'sim-grid' }, [
        h('div', {}, [box,
          done ? h('div', { 'class': 'sim-actions' }, [h('button', { type: 'button', 'class': 'btn btn-primary', 'data-k': 'decide', on: { click: qNeed }, text: 'Decide' })])
            : h('div', {}, [h('p', { 'class': 'sim-label', id: 'sim-dlg-l', text: 'What do you ask?' }), opts,
                h('p', { 'class': 'sim-hint sim-dlg-keys', text: 'Tip: use the arrow keys to move between responses.' })])]),
        qNotes()])
    ], 'Conversation');
    if (done) { var d = root.querySelector('[data-k="decide"]'); if (d) d.focus({ preventScroll: true }); }
  }
  function qNeed() {
    var opts = shuffle(Object.keys(Q.needs).map(function (k) { return { id: k }; })).map(function (o) { return o.id; });
    screen([
      qSteps(2),
      h('h2', { text: 'What does ' + Q.manager.first + ' really need?' }),
      h('p', { 'class': 'sim-lede', text: 'Pick the one that matches what you heard.' }),
      h('div', { 'class': 'sim-grid' }, [
        h('div', { 'class': 'sim-needs', role: 'group', 'aria-label': 'What the manager needs' }, opts.map(function (k) {
          return h('button', { type: 'button', 'class': 'sim-needopt' + (QS.need === k ? ' on' : ''), 'data-k': 'need-' + k, 'aria-pressed': QS.need === k ? 'true' : 'false',
            on: { click: function () { QS.need = k; qPick(); } }, text: Q.needs[k] });
        })),
        qNotes()])
    ], 'What ' + Q.manager.first + ' needs');
  }
  function qPick() {
    screen([
      qSteps(2),
      h('h2', { text: 'Who is the best fit?' }),
      h('p', { 'class': 'sim-yourline' }, [h('strong', { text: 'You said ' + Q.manager.first + ' needs: ' }), Q.needs[QS.need] + ' ',
        h('button', { type: 'button', 'class': 'sim-linkbtn', on: { click: qNeed }, text: 'Change' })]),
      h('div', { 'class': 'sim-grid' }, [
        h('div', { 'class': 'sim-qcards' }, Q.candidates.map(function (c) {
          return qCard(c, h('button', { type: 'button', 'class': 'btn btn-primary sim-choosebtn', 'data-k': 'pick-' + c.id,
            on: { click: function () { QS.pick = c.id; qResult(); } }, text: 'Choose ' + c.name }));
        })),
        qNotes()])
    ], 'Choose a candidate');
  }
  function shareBox(good, total, fit) {   // 11-14: a clean preview card; what you see is exactly what gets copied
    var right = fit === 'best';
    var url = 'https://www.morleytalentsolutions.com/resources/kickoff-simulator/';
    var grid = QS.log.map(function (l) { return l.quality === 'best' ? '🟩' : l.quality === 'ok' ? '🟨' : '🟥'; }).join('');
    var outcome = right ? '🎯 Right hire' : fit === 'close' ? '🤏 Close on the hire' : '❌ Missed the hire';
    var title = 'Hiring Challenge ' + QS.week + ' of ' + NCH;
    var msg = title + '\n' + grid + '\n' + outcome + '\n\nCan you pick the right hire?\n' + url;
    var said = 'Best question at ' + good + ' of ' + total + ' moments. ' + outcome.replace(/^\S+\s/, '') + '.';
    var status = h('p', { 'class': 'sim-share-st', role: 'status' });
    var card = h('div', { 'class': 'sim-share-card' }, [
      h('p', { 'class': 'sim-share-title', text: title }),
      h('p', { 'class': 'sim-share-grid', role: 'img', 'aria-label': said, text: grid }),
      h('p', { 'class': 'sim-share-out', text: outcome }),
      h('p', { 'class': 'sim-share-ask', text: 'Can you pick the right hire?' }),
      h('p', { 'class': 'sim-share-url', text: url.replace('https://www.', '') })]);
    var btn = h('button', { type: 'button', 'class': 'btn btn-primary sim-share-btn', text: 'Copy to share' });
    btn.addEventListener('click', function () {
      function selectText() { var r = document.createRange(); r.selectNodeContents(card); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(function () { status.textContent = 'Copied. Paste it into a post or a message.'; },
          function () { selectText(); status.textContent = 'Press Ctrl+C (or Cmd+C) to copy.'; });
      } else { selectText(); status.textContent = 'Press Ctrl+C (or Cmd+C) to copy.'; }
    });
    return h('section', { 'class': 'sim-share', 'aria-labelledby': 'sim-share-h' }, [
      h('h3', { 'class': 'sim-share-h', id: 'sim-share-h', text: 'Challenge a colleague' }),
      h('p', { 'class': 'sim-share-intro', text: 'Share your result. It shows how you did without giving away any answers.' }),
      card,
      h('p', { 'class': 'sim-share-key', 'aria-hidden': 'true' }, [
        h('span', { text: '🟩 Best question' }), h('span', { text: '🟨 Okay' }), h('span', { text: '🟥 Missed chance' })]),
      h('div', { 'class': 'sim-share-a' }, [btn, status])]);
  }
  function qResult() {
    var picked = Q.candidates.filter(function (c) { return c.id === QS.pick; })[0];
    var best = Q.candidates.filter(function (c) { return c.fit[QS.v] === 'best'; })[0];
    var fit = picked.fit[QS.v];
    var head = fit === 'best' ? 'You picked ' + best.name + '. Right choice.'
      : 'You picked ' + picked.name + '. ' + (fit === 'close' ? 'Close, but ' : 'Not this time. ') + best.name + ' was the best fit.';
    var yourCard = fit === 'best' ? null : h('div', { 'class': 'sim-verdictcard sim-yourpick ' + fit }, [
      h('div', { 'class': 'sim-vhead' }, [h('strong', { text: picked.name }), h('span', { 'class': 'sim-tag you', text: 'Your pick' }),
        h('span', { 'class': 'sim-tag ' + (fit === 'close' ? 'k-ok' : 'k-poor'), text: fit === 'close' ? 'Close fit' : 'Not a fit' })]),
      h('p', { 'class': 'sim-reason', text: picked.reason[QS.v] }),
      h('p', { 'class': 'sim-samsays' }, [h('span', { 'class': 'sim-who', text: Q.manager.first + '’s view' }), '“' + picked.view[QS.v] + '”']),
      picked.miss ? (QS.clues[picked.miss]
        ? h('p', { 'class': 'sim-clue-st got' }, ['✓ You uncovered the clue that rules ' + picked.name + ' out, so it was there to use.'])
        : h('p', { 'class': 'sim-clue-st miss' }, ['✕ You didn’t uncover the clue that rules ' + picked.name + ' out. ', h('b', { text: 'Ask: ' }), probeFor(picked.miss).ask])) : null]);
    var gotNeed = QS.need === QS.v;
    function probeFor(clue) {   // the thoughtful question that reveals a clue (and the one before it, for follow-ups)
      var b = Q.beats.filter(function (x) { return x.choices.some(function (c) { return c.clue === clue && c.quality === 'best'; }); })[0];
      var c = b.choices.filter(function (x) { return x.quality === 'best'; })[0];
      if (!b.followup) return { ask: '“' + c.text + '”', reply: qval(c.reply) };
      var parent = Q.beats.filter(function (x) { return x.choices.some(function (y) { return y.next === b.id; }); })[0];
      var pc = parent.choices.filter(function (y) { return y.next === b.id; })[0];
      return { ask: '“' + pc.text + '” Then: “' + c.text + '”', reply: qval(c.reply) };
    }
    var clues = Q.keys[QS.v].map(function (k) {
      var found = !!QS.clues[k], pf = probeFor(k);
      return h('li', { 'class': found ? 'got' : 'miss' }, [
        h('span', { 'class': 'sim-mark', 'aria-hidden': 'true', text: found ? '✓' : '✕' }),
        h('div', {}, [h('span', { 'class': 'sim-vh', text: found ? 'You found: ' : 'You missed: ' }), '“' + pf.reply + '”',
          found ? null : h('span', { 'class': 'sim-ask' }, [h('b', { text: 'Ask: ' }), pf.ask])])]);
    });
    var good = QS.log.filter(function (l) { return l.quality === 'best'; }).length;
    if (!QS.recorded) { QS.rec = recordPlay(QS.week, { good: good, total: QS.log.length, right: fit === 'best', fit: fit }); QS.recorded = true; }
    var doneN = (QS.rec && QS.rec.done) || 0;
    // 11-14: the results page shows the outcome first; the detail sits in sections players can expand
    function fold(title, extra, kids, k, tease, improve) {
      return h('details', { 'class': 'sim-verdictcard sim-fold sim-more' + (improve ? ' improve' : ''), 'data-k': k, id: k }, [
        h('summary', {}, [h('span', { 'class': 'sim-more-t' }, [h('strong', { text: title }), tease ? h('span', { 'class': 'sim-more-tease', text: tease }) : null]),
          extra ? h('span', { 'class': 'sim-more-x', text: extra }) : null])].concat(
        [h('div', { 'class': 'sim-more-body' }, kids)]));
    }
    function openFold(k) {   // scorecard tiles open their section and bring it into view
      var d = document.getElementById(k); if (!d) return;
      d.open = true; d.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      var sm = d.querySelector('summary'); if (sm) sm.focus({ preventScroll: true });
    }
    var toImprove = QS.log.filter(function (l) { return l.quality !== 'best'; }).length;
    var nFound = clues.filter(function (li) { return li.className === 'got'; }).length;
    function dots(n, of) { var a = []; for (var i = 0; i < of; i++) a.push(h('span', { 'class': 'sim-dot' + (i < n ? ' on' : '') })); return h('span', { 'class': 'sim-dots', 'aria-hidden': 'true' }, a); }
    function tile(label, n, of, k, cta) {
      return h('button', { type: 'button', 'class': 'sim-tile' + (n < of ? ' improve' : ' full'), on: { click: function () { openFold(k); } } }, [
        h('span', { 'class': 'sim-tile-l', text: label }),
        h('span', { 'class': 'sim-tile-n' }, [h('strong', { text: String(n) }), ' of ' + of]),
        dots(n, of),
        h('span', { 'class': 'sim-tile-cta', text: cta })]);
    }
    var scorecard = h('section', { 'class': 'sim-scorecard', 'aria-labelledby': 'sim-sc-h' }, [
      h('h3', { id: 'sim-sc-h', text: toImprove || nFound < clues.length ? 'Where you can improve' : 'Your scorecard' }),
      h('div', { 'class': 'sim-tiles' }, [
        tile('Clues found', nFound, clues.length, 'more-clues', nFound < clues.length ? 'See what you missed →' : 'See the clues →'),
        tile('Best questions', QS.log.length - toImprove, QS.log.length, 'more-moments', toImprove ? 'See better questions →' : 'See why they worked →')])]);
    var handled = h('div', { 'class': 'sim-handled' }, [
      h('h3', { text: 'Your kickoff with ' + Q.manager.first }),
      h('p', { 'class': 'sim-lede', text: 'You asked the best question at ' + good + ' of ' + QS.log.length + ' moments.' +
        (QS.ended ? ' Pushing too hard ended the call early.' : '') }),
      doneN > 1 ? h('p', { 'class': 'sim-streak' }, [h('strong', { text: 'Challenges completed: ' + doneN + '.' })]) : null,
      Q.manager.persona ? h('div', { 'class': 'sim-reveal' }, [
        h('div', {}, [h('p', { 'class': 'sim-label', text: 'The kickoff challenge' }),
          h('p', { 'class': 'sim-reveal-h' }, [h('strong', { text: Q.manager.persona })]),
          Q.manager.persona_note ? h('p', { text: Q.manager.persona_note }) : null])]) : null]);
    var moments = fold('Your questions, moment by moment', toImprove ? toImprove + ' to improve' : 'All best questions', [
      h('div', { 'class': 'sim-hmcall' }, [h('p', { 'class': 'sim-hmcall-h', text: 'Hiring manager?' }),
        h('p', { text: 'These are the questions a good recruiter will ask you, and why they help you hire well.' })]),
      h('ol', { 'class': 'sim-moments' }, QS.log.map(function (l) {
        if (l.quality === 'best') {   // keep it short: moments you got right are one line
          return h('li', { 'class': 'k-best sim-mom-short' }, [h('p', { 'class': 'sim-mom-h' }, [h('strong', { text: l.label }),
            h('span', { 'class': 'sim-tag k-best', text: QUAL.best }), h('span', { 'class': 'sim-mom-you', text: '“' + l.text + '”' })]),
            l.note ? h('p', { 'class': 'sim-mom-note' }, [h('b', { text: 'Good to know: ' }), l.note]) : null]);
        }
        return h('li', { 'class': 'k-' + l.quality }, [
          h('p', { 'class': 'sim-mom-h' }, [h('strong', { text: l.label }), h('span', { 'class': 'sim-tag k-' + l.quality, text: QUAL[l.quality] }),
            l.cost ? h('span', { 'class': 'sim-tag k-poor', text: 'Cost goodwill' }) : null]),
          h('p', { 'class': 'sim-mom-you', text: 'You said: “' + l.text + '”' }),
          h('p', { 'class': 'sim-mom-why', text: l.why }),
          l.better ? h('p', { 'class': 'sim-mom-better' }, [h('b', { text: 'Better: ' }), '“' + l.better + '” ', h('span', { 'class': 'sim-mom-bwhy', text: l.betterWhy })]) : null,
          l.better && l.kit ? h('a', { 'class': 'sim-kitlink', href: '/resources/recruitment-kickoff-kit/', text: 'This question is in the free intake question template →' }) : null]);
      })),
      QS.log.some(function (l) { return l.note && l.quality === 'best'; })
        ? h('p', { 'class': 'sim-hint sim-notelegal', text: '“Good to know” notes are general information about Ontario rules, not legal advice.' }) : null], 'more-moments',
      toImprove ? 'See the better question for each one, and why it works.' : 'See why each of your questions worked.', toImprove > 0);
    var others = Q.candidates.filter(function (c) { return c.id !== best.id && c.id !== picked.id; });
    screen([
      qSteps(3),
      h('div', { 'class': 'sim-banner ' + fit }, [
        h('span', { 'class': 'sim-banner-i', 'aria-hidden': 'true', text: fit === 'best' ? '✓' : fit === 'close' ? '≈' : '✕' }),
        h('h2', { text: head }),
        h('button', { type: 'button', 'class': 'sim-linkbtn sim-banner-next', on: { click: renderStart }, text: 'Skip to the next challenge →' })]),
      h('div', { 'class': 'sim-compare' }, [
        h('div', { 'class': 'sim-need' }, [h('p', { 'class': 'sim-label', text: 'What ' + Q.manager.first + ' really needed' }), h('p', { text: Q.needs[QS.v] })]),
        h('div', { 'class': 'sim-yours' }, [h('p', { 'class': 'sim-label', text: gotNeed ? 'You got this right' : 'You thought' }),
          h('p', { text: (gotNeed ? '✓ ' : '') + Q.needs[QS.need] })])]),
      yourCard,
      h('div', { 'class': 'sim-verdictcard best' }, [
        h('div', { 'class': 'sim-vhead' }, [h('strong', { text: best.name }), h('span', { 'class': 'sim-tag best', text: 'Best fit' }),
          picked.id === best.id ? h('span', { 'class': 'sim-tag you', text: 'Your pick' }) : null]),
        h('p', { 'class': 'sim-reason', text: best.reason[QS.v] }),
        h('p', { 'class': 'sim-samsays' }, [h('span', { 'class': 'sim-who', text: Q.manager.first + '’s view' }), '“' + best.view[QS.v] + '”'])]),
      scorecard,
      handled,
      fold('The clues that mattered', nFound + ' of ' + clues.length + ' found',
        [h('ul', { 'class': 'sim-keys' }, clues)], 'more-clues',
        nFound < clues.length ? 'See which ones you missed, and the question that uncovers each.' : 'See the facts that pointed to the right hire.', nFound < clues.length),
      fold(others.length > 1 ? 'Why not the others?' : 'Why not ' + others[0].name + '?', null, others.map(function (c) {
        var f = c.fit[QS.v];
        return h('div', { 'class': 'sim-other-in ' + f }, [
          h('div', { 'class': 'sim-vhead' }, [h('strong', { text: c.name }),
            h('span', { 'class': 'sim-tag ' + (f === 'close' ? 'k-ok' : 'k-poor'), text: f === 'close' ? 'Close fit' : 'Not a fit' })]),
          h('p', { 'class': 'sim-reason', text: c.reason[QS.v] }),
          c.miss ? (QS.clues[c.miss]
            ? h('p', { 'class': 'sim-clue-st got' }, ['✓ You uncovered the clue that rules ' + c.name + ' out.'])
            : h('p', { 'class': 'sim-clue-st miss' }, ['✕ You didn’t uncover the clue that rules ' + c.name + ' out. ', h('b', { text: 'Ask: ' }), probeFor(c.miss).ask])) : null]);
      }), 'more-others'),
      moments,
      shareBox(good, QS.log.length, fit),
      h('p', { 'class': 'sim-hint sim-again', text: 'The next challenge has a new role and a new hiring manager.' }),
      notifyBox(),
      h('div', { 'class': 'sim-actions' }, [
        h('button', { type: 'button', 'class': 'btn btn-primary', on: { click: renderStart }, text: 'Next challenge' }),
        h('a', { 'class': 'btn btn-secondary', href: '/resources/recruitment-kickoff-kit/', text: 'Get the free intake question template' })])
    ], 'Result');
  }

  renderStart();
})();
