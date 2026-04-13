// ═══════════════════════════════════════════════════════════════
// Google Analytics 4 — Ken's Games
// Replace GA_MEASUREMENT_ID with your real GA4 property ID
// ═══════════════════════════════════════════════════════════════
(function () {
  var GA_ID = 'G-0V65GVQ0P6';

  // Load gtag.js
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(script);

  // Initialize dataLayer and gtag
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID, {
    send_page_view: true,
    cookie_flags: 'SameSite=None;Secure'
  });
})();
