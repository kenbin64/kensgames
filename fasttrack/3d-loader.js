// fasttrack/3d-loader.js — extracted from 3d.html
// Dismisses the #ft3d-loader as soon as the 3D scene signals ready.
// Includes an error/timeout fallback so users never get stuck on the spinner.
    // Dismiss the loader as soon as the 3D scene signals it is ready.
    // Also include an error/timeout fallback so users never get stuck on an infinite spinner.
    (function () {
      let dismissed = false;
      function dismissLoader(labelText) {
        if (dismissed) return;
        dismissed = true;
        const loader = document.getElementById('ft3d-loader');
        if (!loader) return;
        if (labelText) {
          const label = document.getElementById('ft3d-loader-label');
          if (label) label.textContent = labelText;
        }
        loader.classList.add('fade-out');
        // Force-hide inline, then remove regardless of transition support.
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
        const removeLoader = () => {
          if (loader.parentNode) loader.remove();
        };
        loader.addEventListener('transitionend', removeLoader, { once: true });
        setTimeout(removeLoader, 750);
      }

      window.addEventListener('ft3d:ready', () => dismissLoader());
      window.addEventListener('ft3d:error', () => dismissLoader('STARTUP ERROR — TRY REFRESHING'));

      // Some init paths can miss the ready event; if the renderer/canvas is present, unblock anyway.
      const readinessPoll = setInterval(() => {
        const hasRenderer = !!window.FT3DRenderer;
        const hasCanvas = !!document.querySelector('#container canvas, canvas.webgl, canvas');
        if (hasRenderer && hasCanvas) {
          clearInterval(readinessPoll);
          dismissLoader();
        }
      }, 250);

      // Hard cap: never leave users blocked behind the loader forever.
      setTimeout(() => {
        clearInterval(readinessPoll);
        dismissLoader('STARTUP TAKING TOO LONG — CONTINUING');
      }, 15000);
    })();
