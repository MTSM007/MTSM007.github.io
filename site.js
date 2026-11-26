(function () {
  var doc = document.documentElement;
  doc.classList.add('js');


  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Logo strip pause button (11-25 critique, WCAG 2.2.2)
  var mq = document.querySelector('.marquee'), mqBtn = document.querySelector('.marquee-toggle');
  if (mq && mqBtn) {
    mqBtn.addEventListener('click', function () {
      var paused = mq.classList.toggle('paused');
      mqBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      mqBtn.textContent = paused ? 'Play logos' : 'Pause logos';
    });
  }

  // Header border once scrolled
  var header = document.querySelector('.site-header');
  var onScroll = function () { header && header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Start hiring form: pre-select the option chosen on How it works
  var opt = new URLSearchParams(location.search).get('option');
  if (opt) {
    var radio = document.querySelector('input[name="option"][data-key="' + opt.replace(/[^a-z]/g, '') + '"]');
    if (radio) radio.checked = true;
  }

  // Forms: send to the Google form handler, then show the thank-you page
  var recaptchaLoading = null;
  function recaptchaToken(key) {
    if (!key) return Promise.resolve('');
    if (!recaptchaLoading) {
      recaptchaLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(key);
        s.onload = function () { window.grecaptcha.ready(resolve); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return recaptchaLoading.then(function () {
      return window.grecaptcha.execute(key, { action: 'submit' });
    });
  }

  document.querySelectorAll('form.js-form').forEach(function (form) {
    var key = form.getAttribute('data-recaptcha');
    if (key) form.addEventListener('focusin', function () { recaptchaToken(key).catch(function () {}); }, { once: true });

    // Checkbox groups marked data-required-group need at least one box ticked
    var group = form.querySelectorAll('input[type="checkbox"][name="areas"]');
    if (group.length) {
      var checkGroup = function () {
        var any = Array.prototype.some.call(group, function (c) { return c.checked; });
        group[0].setCustomValidity(any ? '' : 'Please choose at least one type of role.');
      };
      group.forEach(function (c) { c.addEventListener('change', checkGroup); });
      checkGroup();
    }
    // "Other" role area: show a text box, require it, and send "Other: <text>" as the areas value
    var other = form.querySelector('#c-area-other');
    var otherText = form.querySelector('#c-area-other-text');
    if (other && otherText) {
      var otherBox = otherText.closest('.area-other');
      var syncOther = function () {
        otherBox.hidden = !other.checked;
        otherText.required = other.checked;
        var t = otherText.value.trim().replace(/\s*,\s*/g, ' / ');
        other.value = t ? 'Other: ' + t : 'Other';
      };
      other.addEventListener('change', function () { syncOther(); if (other.checked) otherText.focus(); });
      otherText.addEventListener('input', syncOther);
      syncOther();
    }
    // Resource kits: choose at least one document
    var items = form.querySelectorAll('input[type="checkbox"][name="items"]');
    if (items.length) {
      var checkItems = function () {
        var any = Array.prototype.some.call(items, function (c) { return c.checked; });
        items[0].setCustomValidity(any ? '' : 'Please choose at least one document.');
      };
      items.forEach(function (c) { c.addEventListener('change', checkItems); });
      checkItems();
    }

    // Inline error messages in plain words, instead of the browser's pop-ups (11-25 round 4)
    form.noValidate = true;
    var messageFor = function (el) {
      var v = el.validity, id = el.id || '';
      if (v.customError) return el.validationMessage;
      if (v.valueMissing) {
        if (el.type === 'radio') return 'Please choose the option that interests you.';
        if (el.name === 'consent') return 'Please tick the box so I can email you about new roles.';
        if (el.tagName === 'SELECT') return 'Please choose an answer.';
        if (el.type === 'email') return id === 'f-email' ? 'Please add your work email.' : 'Please add your email.';
        if (el.type === 'tel') return 'Please add a phone number so I can reach you.';
        if (el.name === 'first-name') return 'Please add your first name.';
        if (el.name === 'last-name') return 'Please add your last name.';
        if (el.name === 'location') return 'Please tell me where you’re based.';
        if (el.name === 'linkedin') return 'Please add your LinkedIn profile link.';
        if (el.name === 'website') return 'Please add your company website.';
        if (id === 'f-roles') return 'Please tell me which roles you’re hiring for.';
        if (id === 'c-area-other-text') return 'Please tell me which kind of role.';
        return 'Please fill this in.';
      }
      if (v.typeMismatch && el.type === 'email') return 'Please check your email address. It should look like name@company.com.';
      if (v.tooShort) {
        if (el.type === 'tel') return 'Please add your full phone number.';
        if (el.name === 'linkedin') return 'Please add your full LinkedIn profile link.';
        if (id === 'f-roles') return 'Please add a few more words about the roles.';
      }
      return el.validationMessage || 'Please check this answer.';
    };
    var clearError = function (el) {
      var box = el.closest('fieldset') || el.closest('.field') || el.closest('label');
      var err = box && box.parentNode.querySelector('[data-err-for="' + (el.name || el.id) + '"]');
      if (err) err.remove();
      var same = el.name ? form.querySelectorAll('[name="' + el.name + '"]') : [el];
      Array.prototype.forEach.call(same, function (x) { x.removeAttribute('aria-invalid'); x.removeAttribute('aria-describedby'); });
    };
    var showError = function (el, text) {
      var key = el.name || el.id, errId = 'err-' + form.name + '-' + key;
      var box = el.closest('fieldset') || el.closest('.field') || el.closest('label');
      var p = document.createElement('p');
      p.className = 'field-error'; p.id = errId; p.setAttribute('data-err-for', key); p.textContent = text;
      if (box.tagName === 'LABEL') box.insertAdjacentElement('afterend', p); else box.appendChild(p);
      form.querySelectorAll('[name="' + el.name + '"]').forEach(function (x) { x.setAttribute('aria-invalid', 'true'); x.setAttribute('aria-describedby', errId); });
      if (el.id && !el.name) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', errId); }
    };
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      var again = function () { if (el.getAttribute('aria-invalid') && el.checkValidity()) clearError(el); };
      el.addEventListener('input', again); el.addEventListener('change', again);
    });
    var formIsValid = function () {
      form.querySelectorAll('.field-error').forEach(function (e) { e.remove(); });
      form.querySelectorAll('[aria-invalid]').forEach(function (x) { x.removeAttribute('aria-invalid'); x.removeAttribute('aria-describedby'); });
      var first = null, seen = {};
      form.querySelectorAll('input, select, textarea').forEach(function (el) {
        if (el.type === 'hidden' || el.closest('.hp') || el.closest('[hidden]') || el.checkValidity()) return;
        var key = el.name || el.id;
        if (seen[key]) return;
        seen[key] = true;
        showError(el, messageFor(el));
        if (!first) first = el;
      });
      if (first) first.focus();
      return !first;
    };

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!formIsValid()) return;
      var button = form.querySelector('button[type="submit"]');
      var label = button.textContent;
      button.disabled = true;
      button.textContent = 'Sending…';
      var old = form.querySelector('.form-error');
      if (old) old.remove();

      recaptchaToken(key).then(function (token) {
        var body = new URLSearchParams(new FormData(form));
        if (token) body.set('g-recaptcha-response', token);
        return fetch(form.action, { method: 'POST', mode: 'no-cors', body: body });
      }).then(function () {
        window.location.href = form.getAttribute('data-thanks');
      }).catch(function () {
        button.disabled = false;
        button.textContent = label;
        var msg = document.createElement('p');
        msg.className = 'form-error';
        msg.setAttribute('role', 'alert');
        msg.textContent = 'Sorry, that didn’t send. Please check your connection and try again.';
        button.insertAdjacentElement('beforebegin', msg);
      });
    });
  });

  // Unsubscribe page: pass the signed link on to the form handler
  var unsub = document.getElementById('unsub');
  if (unsub) {
    var q = new URLSearchParams(location.search);
    var h1 = unsub.querySelector('h1'), lede = unsub.querySelector('.lede');
    if (!q.get('e') || !q.get('t')) {
      h1.textContent = 'Unsubscribe link incomplete';
      lede.textContent = 'Please use the full link from your job-alert email.';
    } else {
      var url = unsub.getAttribute('data-endpoint') + '?unsubscribe=' + encodeURIComponent(q.get('e')) + '&t=' + encodeURIComponent(q.get('t'));
      fetch(url, { mode: 'no-cors' }).then(function () {
        h1.textContent = "You're unsubscribed.";
        lede.textContent = "You won't receive any more job alerts from Morley Talent Solutions.";
      }).catch(function () {
        h1.textContent = 'Something went wrong';
        lede.textContent = 'Please try the link again in a moment.';
      });
    }
  }

  // Confirm page (double opt-in): pass the signed link on to the form handler
  var conf = document.getElementById('confirm');
  if (conf) {
    var cq = new URLSearchParams(location.search);
    var ch1 = conf.querySelector('h1'), clede = conf.querySelector('.lede');
    var list = cq.get('l');
    if (!cq.get('e') || !cq.get('t') || (list !== 'alerts' && list !== 'updates' && list !== 'sim')) {
      ch1.textContent = 'Confirmation link incomplete';
      clede.textContent = 'Please use the full link from your email.';
    } else {
      var curl = conf.getAttribute('data-endpoint') + '?confirm=' + encodeURIComponent(cq.get('e')) +
        '&l=' + encodeURIComponent(list) + '&t=' + encodeURIComponent(cq.get('t'));
      fetch(curl, { mode: 'no-cors' }).then(function () {
        ch1.textContent = "You're confirmed.";
        clede.textContent = list === 'alerts'
          ? "I'll email you when a role matches what you're looking for. Every email includes a link to unsubscribe."
          : list === 'sim'
          ? "I'll send occasional updates, like when the debrief simulation launches and other resources become available. Every email includes a link to unsubscribe."
          : "I'll let you know when new hiring resources are available. Every email includes a link to unsubscribe.";
      }).catch(function () {
        ch1.textContent = 'Something went wrong';
        clede.textContent = 'Please try the link again in a moment.';
      });
    }
  }

  // Resources: print / save-as-PDF buttons
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { window.print(); });
  });
})();
