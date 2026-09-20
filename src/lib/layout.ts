import { pageHead } from "./styles";
import { esc } from "./html";

const MENU_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line class="bar bar-top" x1="3" y1="6" x2="21" y2="6"/><line class="bar bar-mid" x1="3" y1="12" x2="21" y2="12"/><line class="bar bar-bottom" x1="3" y1="18" x2="21" y2="18"/></svg>`;

// The full set of marketing nav links, shared between the desktop bar and
// the mobile dropdown panel. Most are anchors on the homepage itself
// ("/#section") rather than separate pages — clicking one from another
// page (e.g. /pricing) still works, since "/#about" is an absolute path
// that loads the homepage and then jumps to the section.
const NAV_LINKS: Array<[href: string, label: string, key: string]> = [
  ["/#how-it-works", "HOW IT WORKS", "how"],
  ["/#the-mark", "THE MARK", "mark"],
  ["/#see-it-in-action", "THE APP", "app"],
  ["/verify", "VERIFY A VEHICLE", "verify"],
  ["/pricing", "PRICING", "pricing"],
  ["/#about", "ABOUT", "about"],
  ["/contact", "CONTACT", "contact"],
];

const VERIFY_DOT = `<span class="pulse-dot" aria-hidden="true"></span>`;

/** Full marketing site chrome: sticky nav with smooth-scroll links, a mobile menu, and footer. */
export function marketingShell(title: string, body: string, opts?: { activeNav?: string }): string {
  const active = opts?.activeNav ?? "";
  const navLink = (href: string, label: string, key: string) => {
    const classes = [key === active ? "active" : "", key === "verify" ? "nav-verify" : ""].filter(Boolean).join(" ");
    const inner = key === "verify" ? `${VERIFY_DOT}${label}` : label;
    return `<a href="${href}" data-nav-key="${key}" class="${classes}">${inner}</a>`;
  };
  const navLinksHtml = NAV_LINKS.map(([href, label, key]) => navLink(href, label, key)).join("");

  return `<!doctype html>
<html lang="en">
<head>${pageHead(title)}</head>
<body>
  <div class="nav" id="siteNav">
    <a href="/" class="wordmark">MOTO ID</a>
    <div class="links" id="navLinks">${navLinksHtml}<span class="nav-underline" id="navUnderline"></span></div>
    <div class="right">
      <a href="/login">SIGN IN</a>
      <a href="/signup" class="text-link">Enquire</a>
    </div>
    <button type="button" class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">${MENU_ICON}</button>
    <div class="nav-progress" aria-hidden="true"><div class="fill" id="navProgressFill"></div></div>
  </div>
  <div class="nav-mobile" id="navMobile">
    ${navLinksHtml}
    <div class="mobile-cta">
      <a href="/login">SIGN IN</a>
      <a href="/signup" class="text-link">Enquire</a>
    </div>
  </div>

  ${body}

  <div class="footer">
    <div class="cols" style="justify-content:space-between">
      <div>
        <div style="font-weight:600;font-size:11px;letter-spacing:0.18em;margin-bottom:10px">MOTO ID</div>
        <div class="subtle" style="font-size:12.5px;max-width:220px">Digital provenance for exceptional cars and motorcycles.</div>
      </div>
      <div class="cols">
        <div>
          <div class="col-title">STUDIO</div>
          <div class="col-links"><a href="/#how-it-works">How it works</a><a href="/#the-mark">The Mark</a><a href="/pricing">Pricing</a></div>
        </div>
        <div>
          <div class="col-title">COMPANY</div>
          <div class="col-links"><a href="/#about">About</a><a href="/contact">Contact</a></div>
        </div>
        <div>
          <div class="col-title">LEGAL</div>
          <div class="col-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
        </div>
      </div>
    </div>
  </div>
  <div class="container subtle" style="font-size:10.5px;padding-bottom:36px">&copy; ${new Date().getFullYear()} Moto ID. All rights reserved.</div>

  <script>
    (function () {
      var nav = document.getElementById('siteNav');
      var toggle = document.getElementById('navToggle');
      var mobile = document.getElementById('navMobile');
      var links = document.getElementById('navLinks');
      var underline = document.getElementById('navUnderline');
      var progressFill = document.getElementById('navProgressFill');
      if (!nav) return;

      function onScroll() {
        nav.classList.toggle('is-scrolled', window.scrollY > 4);
      }
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });

      if (toggle && mobile) {
        toggle.addEventListener('click', function () {
          var open = mobile.classList.toggle('is-open');
          toggle.classList.toggle('is-open', open);
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        mobile.querySelectorAll('a').forEach(function (a) {
          a.addEventListener('click', function () {
            mobile.classList.remove('is-open');
            toggle.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
          });
        });
      }

      // Scroll-progress bar: how far down the whole page the visitor is.
      if (progressFill) {
        var updateProgress = function () {
          var doc = document.documentElement;
          var scrollable = doc.scrollHeight - doc.clientHeight;
          var pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
          progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        };
        updateProgress();
        window.addEventListener('scroll', updateProgress, { passive: true });
        window.addEventListener('resize', updateProgress);
      }

      // Scroll-spy underline: tracks whichever nav link's target section is
      // currently in view, sliding a thin bar beneath it. Only links whose
      // "#id" target actually exists on this page take part (a link to a
      // homepage section is inert here when we're not on the homepage), so
      // this quietly does nothing on pages with no matching sections.
      if (links && underline) {
        var navAnchors = Array.prototype.slice.call(links.querySelectorAll('a[data-nav-key]'));
        var spySections = navAnchors
          .map(function (a) {
            var href = a.getAttribute('href') || '';
            var hashIndex = href.indexOf('#');
            if (hashIndex === -1) return null;
            var target = document.getElementById(href.slice(hashIndex + 1));
            return target ? { link: a, section: target } : null;
          })
          .filter(Boolean);

        var activeLink = null;

        function placeUnderline(link) {
          if (!link) {
            underline.classList.remove('is-visible');
            return;
          }
          var linksRect = links.getBoundingClientRect();
          var linkRect = link.getBoundingClientRect();
          underline.style.width = linkRect.width + 'px';
          underline.style.transform = 'translateX(' + (linkRect.left - linksRect.left) + 'px)';
          underline.classList.add('is-visible');
        }

        function updateSpy() {
          if (!spySections.length) return;
          // The section whose top has scrolled closest to (but not past) the
          // nav's own bottom edge is the one currently "in view" for this
          // purpose — matches how the sticky nav's scroll-margin-top offset
          // makes sections land right underneath it.
          var navBottom = nav.getBoundingClientRect().bottom;
          var current = null;
          for (var i = 0; i < spySections.length; i++) {
            var rect = spySections[i].section.getBoundingClientRect();
            if (rect.top <= navBottom + 4) {
              current = spySections[i];
            }
          }
          var nextLink = current ? current.link : null;
          if (nextLink !== activeLink) {
            activeLink = nextLink;
            navAnchors.forEach(function (a) {
              a.classList.toggle('active', a === activeLink);
            });
            placeUnderline(activeLink);
          } else if (activeLink) {
            // Keep the underline aligned across resizes/reflow even when the
            // active link hasn't changed.
            placeUnderline(activeLink);
          }
        }

        updateSpy();
        window.addEventListener('scroll', updateSpy, { passive: true });
        window.addEventListener('resize', updateSpy);
      }
    })();
  </script>
</body>
</html>`;
}

/** Minimal chrome for auth-style flows (sign up, log in, register a vehicle): logo only, centered card. */
export function authShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>${pageHead(title)}</head>
<body style="min-height:100vh;display:flex;flex-direction:column">
  <div style="padding:26px 56px;border-bottom:1px solid var(--hairline)">
    <a href="/" class="wordmark">MOTO ID</a>
  </div>
  <div style="flex:1 1 0;display:flex;align-items:center;justify-content:center;padding:60px 24px">
    ${body}
  </div>
</body>
</html>`;
}

/** Signed-in product chrome: topbar with breadcrumb + account avatar. */
export function appShell(
  title: string,
  breadcrumb: string,
  body: string,
  user: { name: string }
): string {
  const initials = esc(
    user.name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  );
  return `<!doctype html>
<html lang="en">
<head>${pageHead(title)}</head>
<body>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 32px;border-bottom:1px solid var(--hairline)">
    <div style="display:flex;align-items:center;gap:16px">
      <a href="/dashboard" class="wordmark">MOTO ID</a>
      <div style="width:1px;height:14px;background:var(--hairline)"></div>
      <div class="subtle breadcrumb" style="font-size:12.5px">${breadcrumb}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <a href="/settings" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--hairline);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;color:var(--ink-muted)">${initials}</a>
    </div>
  </div>
  <div style="padding:36px 32px;max-width:1200px;margin:0 auto">
    ${body}
  </div>
</body>
</html>`;
}
