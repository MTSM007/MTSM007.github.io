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
})();
