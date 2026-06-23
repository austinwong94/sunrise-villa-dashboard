// Sunrise Villa - clickjacking frame-buster (external file, CSP-clean).
// The main thread owns index.html; if they adopt this, load it FIRST in <head>:
//   <script src="./framebuster.js"></script>
// It is covered by `script-src 'self'` so the strict CSP stays intact (no
// 'unsafe-inline' needed). This is the GitHub-Pages fallback for the
// X-Frame-Options / CSP frame-ancestors header you cannot set there.
(function () {
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      // Cross-origin parent blocked the redirect; hide content so a clickjacker
      // cannot overlay an invisible login on top of their own page.
      document.documentElement.style.display = "none";
    }
  }
})();
