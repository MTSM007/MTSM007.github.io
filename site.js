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

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
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
})();
