export const BASE_CSS = `
:root{
  --bg: oklch(99% 0 0);
  --bg-panel: oklch(96% 0 0);
  --ink: oklch(14% 0 0);
  --ink-muted: oklch(42% 0 0);
  --ink-subtle: oklch(58% 0 0);
  --hairline: oklch(87% 0 0);
  --hairline-strong: oklch(70% 0 0);
  --font-display: 'Libre Caslon Text', Georgia, serif;
  --font-body: 'Work Sans', system-ui, sans-serif;
  --font-mono: 'Space Mono', ui-monospace, monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.6}
a{color:var(--ink);text-decoration:none}
h1,h2,h3{font-family:var(--font-display);font-weight:400;margin:0}
p{margin:0}
/* Anchor targets on the marketing homepage sit under the sticky nav, so
   jumping to one (via smooth-scroll or a direct #hash link) needs this
   offset or the nav would cover the top of the section. */
[id]{scroll-margin-top:88px}
input,select{
  width:100%;font-family:var(--font-body);font-size:14.5px;color:var(--ink);
  border:none;border-bottom:1px solid var(--hairline-strong);background:transparent;
  padding:0 0 10px;outline:none;
}
input:focus,select:focus{border-bottom-color:var(--ink)}
label{font-size:10px;letter-spacing:0.08em;color:var(--ink-subtle);display:block;margin-bottom:8px}
.field{margin-bottom:26px}
.container{max-width:1200px;margin:0 auto;padding:0 56px}
@media (max-width:720px){.container{padding:0 20px}}

/* Nav — sticky, so it stays visible while scrolling a long homepage */
.nav{position:sticky;top:0;z-index:200;display:flex;align-items:center;justify-content:space-between;padding:22px 56px;border-bottom:1px solid var(--hairline);background:var(--bg);transition:box-shadow 0.2s ease}
.nav.is-scrolled{box-shadow:0 8px 24px -20px rgba(0,0,0,0.35)}
.nav .wordmark{font-weight:600;font-size:12px;letter-spacing:0.2em}
.nav .links{position:relative;display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.nav .links a{font-size:11px;letter-spacing:0.05em;color:var(--ink-muted);white-space:nowrap}
.nav .links a:hover, .nav .links a.active{color:var(--ink)}
.nav .right{display:flex;align-items:center;gap:24px}
.nav-toggle{display:none;background:none;border:none;padding:6px;margin:-6px;color:var(--ink);cursor:pointer;transition:transform .25s ease}
.nav-toggle svg .bar{transform-origin:center;transition:transform .25s ease, opacity .15s ease}
.nav-toggle.is-open .bar-top{transform:translateY(6px) rotate(45deg)}
.nav-toggle.is-open .bar-mid{opacity:0}
.nav-toggle.is-open .bar-bottom{transform:translateY(-6px) rotate(-45deg)}

/* Scroll-spy underline — a thin bar that slides beneath the desktop nav
   links to track which homepage section is currently in view. Position and
   width are set inline (via JS) from the active link's own geometry, so
   only transform/opacity need to animate here. Hidden until JS has placed
   it over a real target, so it never flashes at the default 0-width. */
.nav .links .nav-underline{position:absolute;left:0;bottom:-9px;height:2px;width:0;background:var(--ink);opacity:0;transition:transform .35s cubic-bezier(.4,0,.2,1),width .35s cubic-bezier(.4,0,.2,1),opacity .2s ease}
.nav .links .nav-underline.is-visible{opacity:1}

/* Scroll progress — hairline-thin bar tracking how far down the page the
   visitor has scrolled, sitting right on the nav's bottom border. */
.nav-progress{position:absolute;left:0;right:0;bottom:-1px;height:1px;background:transparent;overflow:hidden;pointer-events:none}
.nav-progress .fill{height:100%;width:0%;background:var(--ink);transition:width .1s linear}

/* Pulsing dot beside "Verify a vehicle" — draws the eye to the core action
   without any moving text. */
.nav .links a.nav-verify{display:inline-flex;align-items:center;gap:7px}
.nav .links a.nav-verify .pulse-dot{position:relative;width:6px;height:6px;border-radius:50%;background:var(--ink);flex:none}
.nav .links a.nav-verify .pulse-dot::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--ink);opacity:0.6;animation:pulse-ring 2.2s cubic-bezier(.4,0,.2,1) infinite}
@media (prefers-reduced-motion: reduce){.nav .links a.nav-verify .pulse-dot::after{animation:none}}
@keyframes pulse-ring{0%{transform:scale(0.6);opacity:0.6}100%{transform:scale(2.1);opacity:0}}

/* Mobile nav: hamburger toggle + dropdown panel, since links/right are
   hidden below 900px and previously had no fallback at all. */
.nav-mobile{display:none;flex-direction:column;position:sticky;top:65px;z-index:199;background:var(--bg);border-bottom:1px solid var(--hairline);padding:4px 20px 18px;max-height:calc(100vh - 65px);overflow-y:auto}
.nav-mobile.is-open{display:flex}
.nav-mobile a{padding:13px 0;font-size:12.5px;letter-spacing:0.04em;color:var(--ink-muted);border-top:1px solid var(--hairline)}
.nav-mobile a:first-child{border-top:none}
.nav-mobile a:hover, .nav-mobile a.active{color:var(--ink)}
.nav-mobile .mobile-cta{display:flex;align-items:center;gap:22px;margin-top:8px;padding-top:16px;border-top:1px solid var(--hairline)}
@media (max-width:900px){
  .nav{padding:18px 20px}
  .nav .links{display:none}
  .nav .right{display:none}
  .nav-toggle{display:flex;align-items:center;justify-content:center}
}

/* Buttons */
.btn{display:inline-block;font-size:13px;letter-spacing:0.03em;padding:15px 26px;cursor:pointer;border:1px solid var(--ink);background:transparent;color:var(--ink);font-family:var(--font-body)}
.btn-solid{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.btn-solid:hover{background:oklch(28% 0 0)}
.btn-outline:hover{background:var(--ink);color:var(--bg)}
.text-link{border-bottom:1px solid var(--ink);padding-bottom:2px;cursor:pointer;font-size:13px}
.text-link:hover{opacity:0.6}

/* Hairline dividers / tables */
.hr{height:1px;background:var(--hairline)}
.bordered{border:1px solid var(--hairline)}
.row-list > *{border-bottom:1px solid var(--hairline)}
.row-list > *:last-child{border-bottom:none}

/* Cards / grid */
.grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--hairline);border:1px solid var(--hairline)}
.grid-4 > *{background:var(--bg);padding:22px}
@media (max-width:900px){.grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
.panel:hover, .row:hover, .vrow:hover{background:var(--bg-panel)}
.tab:hover{color:var(--ink)!important}

/* Badge */
.badge{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ink);font-size:10px;letter-spacing:0.06em;padding:3px 9px;border-radius:100px}
.badge .dot{width:5px;height:5px;border-radius:50%;background:var(--ink)}

/* Footer */
.footer{border-top:1px solid var(--hairline);padding:48px 56px 20px}
.footer .cols{display:flex;gap:56px}
.footer .col-title{font-size:10px;color:var(--ink-subtle);letter-spacing:0.1em;margin-bottom:14px}
.footer .col-links{display:flex;flex-direction:column;gap:9px;font-size:12.5px;color:var(--ink-muted)}
.footer .col-links a{color:inherit}
.footer .col-links a:hover{color:var(--ink);text-decoration:underline;text-underline-offset:2px}

/* Photo upload */
.photo-upload{position:relative;overflow:hidden;cursor:pointer}
.photo-upload .photo-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:oklch(14% 0 0 / 0.55);color:var(--bg);font-size:10.5px;letter-spacing:0.06em;opacity:0;transition:opacity .15s;pointer-events:none;text-align:center;padding:0 10px}
.photo-upload:hover .photo-overlay{opacity:1}
.photo-upload input[type="file"]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}

/* Utility */
.muted{color:var(--ink-muted)}
.subtle{color:var(--ink-subtle)}
.mono{font-family:var(--font-mono)}
.eyebrow{font-size:10.5px;letter-spacing:0.2em;color:var(--ink-subtle)}
.error{color:oklch(45% 0.18 25);font-size:13px;margin-bottom:20px}
.breadcrumb a{color:inherit}
.breadcrumb a:hover{color:var(--ink);text-decoration:underline;text-underline-offset:2px}

/* Install-app banner (see pageHead's beforeinstallprompt script). Hidden
   until the browser confirms the site is actually installable, so it never
   shows on a browser that can't install (e.g. iOS Safari). */
#pwa-install-banner{
  display:none;position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;
  max-width:420px;margin:0 auto;background:var(--ink);color:var(--bg);
  padding:16px 18px;align-items:center;gap:14px;
  box-shadow:0 12px 32px -12px rgba(0,0,0,0.4);
}
#pwa-install-banner.is-visible{display:flex}
#pwa-install-banner .pwa-install-text{flex:1 1 auto;font-size:12.5px;line-height:1.5}
#pwa-install-banner button{font-family:var(--font-body);cursor:pointer;border:none}
#pwa-install-banner .pwa-install-btn{background:var(--bg);color:var(--ink);font-size:12.5px;letter-spacing:0.03em;padding:9px 16px;white-space:nowrap}
#pwa-install-banner .pwa-install-btn:hover{background:oklch(88% 0 0)}
#pwa-install-banner .pwa-install-dismiss{background:transparent;color:var(--bg);opacity:0.6;font-size:18px;line-height:1;padding:4px}
#pwa-install-banner .pwa-install-dismiss:hover{opacity:1}
`;

export function pageHead(title: string): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital@0;1&family=Work+Sans:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap">
<style>${BASE_CSS}</style>
<!-- Installable web app (PWA): lets visitors add Moto ID to their phone's
     home screen and open it full-screen, like a downloaded app. See
     public/manifest.webmanifest and public/service-worker.js. -->
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#fcfcfc">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/media/icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/media/icons/icon-192.png">
<link rel="apple-touch-icon" href="/media/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Moto ID">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function () {});
    });
  }

  // Explicit "Install app" banner. Chrome/Android (and desktop Chrome/Edge)
  // fire 'beforeinstallprompt' once they've decided the site is installable
  // - but Chrome's own automatic prompt is subject to an internal timing
  // heuristic and won't necessarily appear on a first visit, so relying on
  // it alone left visitors with no obvious way to install. This shows our
  // own on-brand button the moment the browser confirms installability is
  // possible, rather than waiting on Chrome's own UI. It never appears at
  // all on browsers that don't support this (e.g. iOS Safari, where
  // installing is only possible via Share -> Add to Home Screen).
  (function () {
    var DISMISS_KEY = 'motoid-pwa-install-dismissed-at';
    var DISMISS_DAYS = 30;
    var deferredPrompt = null;

    function recentlyDismissed() {
      try {
        var at = Number(localStorage.getItem(DISMISS_KEY) || 0);
        return at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
      } catch (e) {
        return false;
      }
    }

    function buildBanner() {
      var el = document.createElement('div');
      el.id = 'pwa-install-banner';
      el.innerHTML =
        '<div class="pwa-install-text">Install Moto ID on this device for quick, full-screen access.</div>' +
        '<button type="button" class="pwa-install-btn">Install</button>' +
        '<button type="button" class="pwa-install-dismiss" aria-label="Dismiss">&times;</button>';
      document.body.appendChild(el);

      el.querySelector('.pwa-install-btn').addEventListener('click', async function () {
        if (!deferredPrompt) return;
        el.classList.remove('is-visible');
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch (e) {}
        deferredPrompt = null;
      });

      el.querySelector('.pwa-install-dismiss').addEventListener('click', function () {
        el.classList.remove('is-visible');
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch (e) {}
      });

      return el;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (recentlyDismissed()) return;
      var el = document.getElementById('pwa-install-banner') || buildBanner();
      el.classList.add('is-visible');
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      var el = document.getElementById('pwa-install-banner');
      if (el) el.classList.remove('is-visible');
    });
  })();
</script>`;
}



