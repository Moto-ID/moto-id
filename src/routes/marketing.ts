import { Hono } from "hono";
import type { Env } from "../types";
import { marketingShell } from "../lib/layout";

export const marketing = new Hono<Env>();

marketing.get("/", (c) => {
  // The installed PWA's manifest start_url is "/?launch=app" (not plain "/")
  // specifically so this one case — the app being freshly opened from a
  // phone's home screen — can be told apart from an ordinary visit to the
  // marketing homepage, including a signed-in visitor clicking the "MOTO ID"
  // wordmark from inside the app's own topbar (src/lib/layout.ts), which
  // deliberately still leads here with no query string. A signed-in visitor
  // relaunching the app from their home screen goes straight to "My
  // Collection" instead of the marketing page they've already seen; a
  // signed-out relaunch (or anyone just visiting the homepage normally)
  // falls through to the ordinary marketing page below, unchanged.
  if (c.req.query("launch") === "app" && c.get("user")) {
    return c.redirect("/dashboard");
  }

  // Signed-in visitors go straight to the (free, for their first vehicle)
  // registration flow; signed-out visitors sign up first (a free account)
  // and land on "My Collection", where registering their first vehicle is
  // the very next step.
  const ctaHref = c.get("user") ? "/register-vehicle" : "/signup";

  // Illustrative example vehicles for the verified-record ticker and the
  // ledger/plate mockups below — no real owner data, no claimed real-time
  // activity (deliberately not "registered Nm ago": that would read as a
  // fabricated live-activity signal). Just a static set of plausible makes
  // to carry the "VERIFIED" visual motif.
  const TICKER_VEHICLES = [
    "1975 PORSCHE 911 2.7 RS",
    "1987 LAND ROVER DEFENDER 90",
    "1965 FORD MUSTANG FASTBACK",
    "2003 DUCATI 999",
    "1998 NISSAN SKYLINE GT-R",
    "1970 DODGE CHARGER R/T",
  ];
  const tickerRow = TICKER_VEHICLES.concat(TICKER_VEHICLES)
    .map(
      (v) => `
      <div style="display:flex;align-items:center;gap:10px;flex:none">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--hv2-verified);display:inline-block"></span>
        <span style="font-family:var(--font-mono);font-size:11.5px;font-weight:700;letter-spacing:0.08em;color:var(--hv2-verified)">VERIFIED</span>
        <span style="font-family:var(--font-mono);font-size:11.5px;color:var(--hv2-ink-muted)">${v}</span>
      </div>`
    )
    .join("");

  const CATEGORY_TAGS = ["CLASSIC CARS", "RESTOMODS", "CUSTOM BUILDS", "CAF&Eacute; RACERS", "CHOPPERS", "BESPOKE COACHWORK"];
  const categoryTagsRow = CATEGORY_TAGS.map((t) => `<span style="font-size:10px;letter-spacing:0.08em;color:var(--hv2-ink-subtle);border:1px solid var(--hv2-line);padding:7px 13px;white-space:nowrap">${t}</span>`).join("");

  // Four simple line icons for the "HOW IT STARTS" steps — drawn fresh for
  // this redesign rather than reusing a photo/illustration, per the brief.
  const ICON_ACCOUNT = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3.5 2.5-5.5 5.5-5.5s5.5 2 5.5 5.5"/><line x1="18" y1="8" x2="18" y2="13"/><line x1="15.5" y1="10.5" x2="20.5" y2="10.5"/></svg>`;
  const ICON_VEHICLE = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15l1.3-4.8A2 2 0 0 1 6.2 9h11.6a2 2 0 0 1 1.9 1.2L21 15"/><rect x="2.3" y="15" width="19.4" height="3.6" rx="1.2"/><circle cx="7" cy="18.6" r="1.4"/><circle cx="17" cy="18.6" r="1.4"/></svg>`;
  const ICON_RECORD = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="1.5"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
  const ICON_MARK = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="6.5"/><polyline points="9,10 11,12.5 15.5,7"/><path d="M8 16.5 6 21l6-2.5 6 2.5-2-4.5"/></svg>`;

  const STEPS: Array<[string, string, string]> = [
    [ICON_ACCOUNT, "Create a free account.", "No subscription, no card required &mdash; just an email address."],
    [ICON_VEHICLE, "Register your vehicle.", "Your first one's free, and its Moto ID number and public page are live straight away."],
    [ICON_RECORD, "Build the record.", "Documents, invoices and photographs added as the history actually unfolds."],
    [ICON_MARK, "Mark it, when you're ready.", "Order the laser-engraved plaque any time &mdash; the physical twin of the record you've already built."],
  ];
  const stepsRow = STEPS.map(
    ([icon, title, text], i) => `
    <div style="padding:0 28px 0 ${i === 0 ? "0" : "28px"};${i > 0 ? "border-left:1px solid var(--hv2-line);" : ""}min-width:0">
      <div class="hv2-step-icon" style="color:var(--hv2-accent-deep)">${icon}</div>
      <div style="font-weight:600;font-size:15px;margin:18px 0 8px">${title}</div>
      <div style="font-size:13.5px;color:var(--hv2-ink-muted);line-height:1.6">${text}</div>
    </div>`
  ).join("");

  const body = `
    <style>
      .hv2{
        /* Fully monochrome, matching the rest of the site's grayscale palette.
           The "accent" is a light grey — no hue, just a lighter/darker pair
           used for CTAs, the verification seal/ticker and status badges. */
        --hv2-bg: oklch(99% 0 0);
        --hv2-bg-raised: oklch(96% 0 0);
        --hv2-ink: oklch(14% 0 0);
        --hv2-ink-muted: oklch(42% 0 0);
        --hv2-ink-subtle: oklch(58% 0 0);
        --hv2-line: oklch(87% 0 0);
        --hv2-line-strong: oklch(70% 0 0);
        --hv2-accent: oklch(62% 0 0);
        --hv2-accent-deep: oklch(40% 0 0);
        --hv2-verified: var(--hv2-accent);
        --hv2-dark: oklch(11% 0 0);
        --hv2-display: 'Fraunces', 'Libre Caslon Text', Georgia, serif;
        background:var(--hv2-bg);
        color:var(--hv2-ink);
      }
      .hv2 h1, .hv2 h2 { font-family:var(--hv2-display); font-weight:400; margin:0; text-wrap:balance }
      .hv2 a { color:inherit }
      .hv2-seal-ring{animation:hv2-spin 46s linear infinite}
      @keyframes hv2-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      .hv2-ticker-track{display:flex;gap:44px;padding:0 22px;animation:hv2-ticker 36s linear infinite}
      .hv2-ticker:hover .hv2-ticker-track{animation-play-state:paused}
      @keyframes hv2-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      .hv2-step-icon{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1px solid var(--hv2-line-strong);border-radius:50%}
      .hv2-cta-btn{display:inline-block;background:var(--hv2-accent);color:oklch(99% 0 0);font-family:var(--font-body);font-size:13px;font-weight:600;letter-spacing:0.03em;padding:16px 32px;border:none;cursor:pointer;transition:background .15s ease}
      .hv2-cta-btn:hover{background:var(--hv2-accent-deep)}
      @media (max-width:860px){
        .hv2-hero-grid{grid-template-columns:1fr!important}
        .hv2-seal-wrap{order:-1;margin-bottom:12px}
        .hv2-cols-4{grid-template-columns:1fr!important}
        .hv2-cols-4 > div{border-left:none!important;border-top:1px solid var(--hv2-line);padding:28px 0 0 0!important;margin-top:4px}
        .hv2-cols-4 > div:first-child{border-top:none;margin-top:0}
        .hv2-cols-2{grid-template-columns:1fr!important}
        .hv2-cols-2 > div:first-child{border-right:none!important;border-bottom:1px solid var(--hv2-line-strong)}
        .hv2-cols-3{grid-template-columns:1fr!important;gap:28px!important}
        .hv2-cols-3 > div{border-right:none!important;padding:0 0 24px 0!important;border-bottom:1px solid var(--hv2-line)}
        .hv2-cols-3 > div:last-child{border-bottom:none;padding-bottom:0!important}
        .hv2-record-grid{grid-template-columns:1fr!important}
        .hv2-mark-grid{grid-template-columns:1fr!important}
      }
    </style>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz@0,9..144;1,9..144&display=swap">

    <div class="hv2">

      <!-- HERO -->
      <div style="padding:76px 56px 90px;max-width:1280px;margin:0 auto">
        <div class="hv2-hero-grid" style="display:grid;grid-template-columns:1.15fr 0.85fr;gap:64px;align-items:center">
          <div>
            <div style="font-size:10.5px;letter-spacing:0.22em;color:var(--hv2-accent-deep);margin-bottom:22px">DIGITAL PROVENANCE FOR EXCEPTIONAL VEHICLES</div>
            <h1 style="font-size:min(60px,9vw);line-height:1.08;margin-bottom:26px">A vehicle's record,<br><em style="font-style:italic">made to be believed.</em></h1>
            <div style="font-size:16px;color:var(--hv2-ink-muted);max-width:460px;margin-bottom:34px;line-height:1.7">Create a free account, register your first vehicle at no cost, and its public verification page goes live immediately. Add a laser-marked plaque, whenever you're ready, for &pound;15.</div>
            <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap;margin-bottom:40px">
              <a href="${ctaHref}" class="hv2-cta-btn">Create your Moto ID &mdash; free</a>
              <a href="/#the-mark" style="font-size:13px;border-bottom:1px solid var(--hv2-line-strong);padding-bottom:2px">See the plaque &rarr;</a>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">${categoryTagsRow}</div>
          </div>
          <div class="hv2-seal-wrap" style="display:flex;flex-direction:column;align-items:center;gap:22px">
            <div style="position:relative;width:220px;height:220px">
              <div class="hv2-seal-ring" style="position:absolute;inset:0">
                <svg viewBox="0 0 200 200" width="220" height="220">
                  <defs><path id="hv2SealArc" d="M 100,100 m -80,0 a 80,80 0 1,1 160,0 a 80,80 0 1,1 -160,0"/></defs>
                  <circle cx="100" cy="100" r="92" fill="none" stroke="oklch(62% 0 0)" stroke-width="1.4"/>
                  <circle cx="100" cy="100" r="80" fill="none" stroke="oklch(62% 0 0)" stroke-width="1" stroke-dasharray="1 5"/>
                  <circle cx="100" cy="100" r="60" fill="none" stroke="oklch(62% 0 0)" stroke-width="1.2"/>
                  <text font-family="'Space Mono', monospace" font-size="9.5" letter-spacing="3" fill="oklch(62% 0 0)">
                    <textPath href="#hv2SealArc" startOffset="1%">VERIFIED &amp; PROVENANCED &bull; VERIFIED &amp; PROVENANCED &bull;</textPath>
                  </text>
                </svg>
              </div>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="oklch(14% 0 0)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,13 10,18 19,7"/></svg>
                <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em">MOTO ID</div>
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--hv2-ink-subtle);text-align:center;max-width:220px">Live verification &mdash; not a certificate issued once and never checked again.</div>
          </div>
        </div>
      </div>

      <!-- VERIFIED TICKER -->
      <div class="hv2-ticker" style="border-top:1px solid var(--hv2-line);border-bottom:1px solid var(--hv2-line);padding:18px 0;overflow:hidden;background:var(--hv2-bg-raised)">
        <div class="hv2-ticker-track">${tickerRow}</div>
      </div>

      <!-- HOW IT STARTS -->
      <div id="how-it-works" style="padding:110px 56px;max-width:1180px;margin:0 auto">
        <div style="text-align:center;margin-bottom:64px">
          <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--hv2-accent-deep);margin-bottom:16px">HOW IT STARTS</div>
          <h2 style="font-size:min(40px,7vw);line-height:1.25">Free to register.<br>Yours to prove, from day one.</h2>
        </div>
        <div class="hv2-cols-4" style="display:grid;grid-template-columns:repeat(4,1fr)">${stepsRow}</div>
      </div>

      <!-- THE RECORD -->
      <div id="see-it-in-action" style="padding:110px 56px;background:var(--hv2-bg-raised);border-top:1px solid var(--hv2-line);border-bottom:1px solid var(--hv2-line)">
        <div class="hv2-record-grid" style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:0.95fr 1.05fr;gap:72px;align-items:center">
          <div>
            <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--hv2-accent-deep);margin-bottom:16px">THE RECORD</div>
            <h2 style="font-size:min(38px,7vw);line-height:1.3;margin-bottom:20px">Everything about the vehicle, in one verifiable place.</h2>
            <div style="font-size:14.5px;color:var(--hv2-ink-muted);line-height:1.75;max-width:420px;margin-bottom:24px">Registration, specification, service history, invoices and photographs &mdash; added by the owner as the work actually happens, and checkable by anyone who scans the plate or opens the link.</div>
            <a href="/verify" style="font-size:13px;border-bottom:1px solid var(--hv2-line-strong);padding-bottom:2px">Search a real record &rarr;</a>
          </div>
          <div>
            <div style="background:var(--hv2-bg);border:1px solid var(--hv2-line-strong);max-width:420px;margin:0 auto">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--hv2-line)">
                <div style="font-family:var(--font-mono);font-size:10.5px;letter-spacing:0.08em;color:var(--hv2-ink-subtle)">MOTO ID &middot; VEHICLE RECORD</div>
                <div style="display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:var(--hv2-verified);display:inline-block"></span><span style="font-size:9.5px;letter-spacing:0.1em;color:var(--hv2-verified);font-weight:700">LIVE</span></div>
              </div>
              <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">
                <div style="display:flex;justify-content:space-between;gap:12px"><span style="font-size:11.5px;color:var(--hv2-ink-subtle)">VEHICLE</span><span style="font-size:12.5px;font-weight:600;text-align:right">1975 Porsche 911 2.7 RS</span></div>
                <div style="display:flex;justify-content:space-between;gap:12px"><span style="font-size:11.5px;color:var(--hv2-ink-subtle)">VIN</span><span style="font-family:var(--font-mono);font-size:12px;text-align:right">9115600641</span></div>
                <div style="display:flex;justify-content:space-between;gap:12px"><span style="font-size:11.5px;color:var(--hv2-ink-subtle)">REGISTRATION</span><span style="font-family:var(--font-mono);font-size:12px;text-align:right">AB12 CDE</span></div>
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><span style="font-size:11.5px;color:var(--hv2-ink-subtle)">MOT STATUS</span><span style="font-size:10.5px;font-weight:700;letter-spacing:0.04em;color:var(--hv2-verified);border:1px solid var(--hv2-verified);padding:3px 8px">VALID &middot; EXP MAR 2027</span></div>
                <div style="display:flex;justify-content:space-between;gap:12px"><span style="font-size:11.5px;color:var(--hv2-ink-subtle)">DOCUMENTS</span><span style="font-size:12.5px;text-align:right">14 files</span></div>
                <div style="display:flex;justify-content:space-between;gap:12px"><span style="font-size:11.5px;color:var(--hv2-ink-subtle)">PHOTOS</span><span style="font-size:12.5px;text-align:right">32 files</span></div>
              </div>
              <div style="font-size:10.5px;color:var(--hv2-ink-subtle);text-align:center;padding:10px;border-top:1px solid var(--hv2-line)">Illustrative example</div>
            </div>
          </div>
        </div>
      </div>

      <!-- THE MARK: optional plaque -->
      <div id="the-mark" style="padding:110px 56px;max-width:1100px;margin:0 auto">
        <div class="hv2-mark-grid" style="display:grid;grid-template-columns:0.9fr 1.1fr;gap:72px;align-items:center">
          <div>
            <img src="/media/plate-example.jpg" alt="A Moto ID plate laser-marked with a Porsche 911's registration and Moto ID number, next to its QR code" style="width:100%;max-width:420px;display:block;margin:0 auto;border:1px solid var(--hv2-line);box-shadow:0 30px 60px -20px rgba(0,0,0,0.35)">
          </div>
          <div>
            <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--hv2-accent-deep);margin-bottom:16px">THE MARK &mdash; OPTIONAL, ADD IT ANY TIME</div>
            <h2 style="font-size:min(38px,7vw);line-height:1.3;margin-bottom:20px">Engraved once.<br>Verified forever.</h2>
            <div style="font-size:14.5px;color:var(--hv2-ink-muted);line-height:1.75;max-width:440px;margin-bottom:28px">Your vehicle's record and public page go live the moment you register it &mdash; free, with no plate required. When you're ready, order the plaque: laser-annealed stainless steel, engraved to order, carrying the same Moto ID number and a QR code straight to the public record. &pound;15, posted to you.</div>
            <a href="/pricing" style="font-size:13px;border-bottom:1px solid var(--hv2-line-strong);padding-bottom:2px">See full pricing &rarr;</a>
          </div>
        </div>
      </div>

      <!-- FOR THE DISCERNING OWNER -->
      <div style="padding:100px 56px;border-top:1px solid var(--hv2-line)">
        <div style="font-family:var(--hv2-display);font-style:italic;font-size:min(42px,7vw);line-height:1.3;text-align:center;margin-bottom:64px;max-width:640px;margin-left:auto;margin-right:auto">For the owner who cares how the story is told.</div>
        <div class="hv2-cols-3" style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:32px;max-width:960px;margin:0 auto">
          <div style="padding-right:36px;border-right:1px solid var(--hv2-line)">
            <div style="font-size:10px;letter-spacing:0.1em;color:var(--hv2-ink-subtle);margin-bottom:14px">AGAINST COUNTERFEIT HISTORY</div>
            <div style="font-size:13.5px;color:var(--hv2-ink-muted)">A record built and dated by the owner over time is far harder to fake than a single certificate issued once.</div>
          </div>
          <div style="padding:0 36px;border-right:1px solid var(--hv2-line)">
            <div style="font-size:10px;letter-spacing:0.1em;color:var(--hv2-ink-subtle);margin-bottom:14px">FOR WORK DONE BY HAND</div>
            <div style="font-size:13.5px;color:var(--hv2-ink-muted)">Restore or maintain it yourself? Log parts, dates and photographs, so the work counts as real, dated history.</div>
          </div>
          <div style="padding-left:36px">
            <div style="font-size:10px;letter-spacing:0.1em;color:var(--hv2-ink-subtle);margin-bottom:14px">FOR TRUE CONDITION</div>
            <div style="font-size:13.5px;color:var(--hv2-ink-muted)">Photographs and documents build a timeline a buyer, insurer or club can trust at a glance.</div>
          </div>
        </div>
      </div>

      <!-- PRICING RECAP -->
      <div style="padding:90px 56px 110px;max-width:900px;margin:0 auto">
        <div style="text-align:center;margin-bottom:48px">
          <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--hv2-accent-deep);margin-bottom:16px">PRICING</div>
          <h2 style="font-size:min(36px,7vw)">Free to start. Pay only for what you add.</h2>
        </div>
        <div class="hv2-cols-2" style="display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--hv2-line-strong)">
          <div style="padding:36px;border-right:1px solid var(--hv2-line-strong)">
            <div style="font-size:10px;letter-spacing:0.1em;color:var(--hv2-ink-subtle);margin-bottom:10px">FREE ACCOUNT</div>
            <div style="font-family:var(--hv2-display);font-size:30px;margin-bottom:8px">&pound;0</div>
            <div style="font-size:13px;color:var(--hv2-ink-muted)">Your account and first vehicle, free for as long as you keep it.</div>
          </div>
          <div style="padding:36px">
            <div style="font-size:10px;letter-spacing:0.1em;color:var(--hv2-ink-subtle);margin-bottom:10px">LASER-MARKED PLAQUE</div>
            <div style="font-family:var(--hv2-display);font-size:30px;margin-bottom:8px">&pound;15</div>
            <div style="font-size:13px;color:var(--hv2-ink-muted)">Optional, per vehicle &mdash; order any time, no rush.</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:28px"><a href="/pricing" style="font-size:13px;border-bottom:1px solid var(--hv2-line-strong);padding-bottom:2px">See the full price list &rarr;</a></div>
      </div>

      <!-- ABOUT -->
      <div id="about" style="padding:100px 56px;border-top:1px solid var(--hv2-line)">
        <div style="text-align:center;margin-bottom:48px">
          <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--hv2-accent-deep);margin-bottom:16px">ABOUT</div>
          <h2 style="font-size:min(38px,7vw);line-height:1.3;max-width:640px;margin:0 auto">Built for vehicles that deserve a real history.</h2>
        </div>
        <div style="max-width:680px;margin:0 auto;font-size:14.5px;color:var(--hv2-ink-muted);line-height:1.8;display:flex;flex-direction:column;gap:22px">
          <p>Moto ID gives a car or motorcycle a permanent, verifiable identity: a free account where the owner builds a digital record of the vehicle &mdash; registration details, service documents, invoices and photographs &mdash; with a public page anyone can check. A laser-marked plaque, carrying the same number and a QR code, is there whenever you want the physical mark to match it.</p>

          <p>It exists because paper histories are easy to lose, easy to forge and impossible to check independently. A stack of invoices or a seller's word is only ever as good as the trust you place in the person handing it to you. Owners who service and restore their own vehicles have it worse still &mdash; a main dealer stamp counts for something at resale, while a logbook of an owner's own labour and parts usually counts for nothing, however carefully it was kept.</p>

          <p>Moto ID doesn't solve that by asking anyone to trust us instead. The record itself is built by the owner, over time, and stands or falls on its own consistency &mdash; a registration date, a pattern of activity, photographs and documents added as the work actually happened. That's a more honest kind of proof than a single certificate issued once and never checked again.</p>

          <p>The account is free, and so is your first vehicle's digital record and public verification page &mdash; no subscription, ever. The laser-marked plaque itself is an optional, one-time purchase you can add whenever you're ready. The record transfers with the vehicle, free of charge, when it's sold.</p>
        </div>
      </div>

      <!-- FINAL CTA -->
      <div style="background:var(--hv2-dark);padding:120px 56px;text-align:center">
        <div style="font-family:var(--hv2-display);font-style:italic;color:oklch(97% 0 0);font-size:min(40px,7vw);max-width:560px;margin:0 auto 36px;line-height:1.3">Give your vehicle a record worth trusting.</div>
        <a href="${ctaHref}" class="hv2-cta-btn">Create your Moto ID &mdash; free</a>
      </div>

    </div>
  `;
  return c.html(marketingShell("Moto ID — Digital provenance for exceptional vehicles", body, { activeNav: "" }));
});

marketing.get("/pricing", (c) => {
  const ctaHref = c.get("user") ? "/register-vehicle" : "/signup";
  const body = `
    <!-- HEADER -->
    <div style="padding:80px 56px 56px;text-align:center">
      <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--ink-subtle);margin-bottom:22px">PRICING</div>
      <div style="font-family:var(--font-display);font-size:min(38px,8vw);line-height:1.3;max-width:620px;margin:0 auto">Free to start.<br>Pay only for what you add.</div>
    </div>

    <!-- PLANS -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;max-width:920px;margin:0 auto 90px;border:1px solid var(--hairline)" class="pricing-grid">

      <div style="padding:48px 44px;border-right:1px solid var(--hairline)">
        <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:16px">FREE ACCOUNT</div>
        <div style="font-family:var(--font-display);font-size:34px;margin-bottom:6px">&pound;0</div>
        <div style="font-size:12.5px;color:var(--ink-subtle);margin-bottom:32px">your account, and your first vehicle, free for as long as you keep it</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:36px">
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">One vehicle profile, free</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Public verification page from the moment you register</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">10 free photo slots &amp; 10 free document slots</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">MOT history &amp; mileage tracking</div>
        </div>
        <a href="${ctaHref}" style="display:block;background:var(--ink);color:var(--bg);font-size:12.5px;letter-spacing:0.04em;padding:15px;text-align:center;cursor:pointer">Create a free account</a>
      </div>

      <div style="padding:48px 44px">
        <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:16px">LASER-MARKED PLAQUE &mdash; OPTIONAL</div>
        <div style="font-family:var(--font-display);font-size:34px;margin-bottom:6px">&pound;15</div>
        <div style="font-size:12.5px;color:var(--ink-subtle);margin-bottom:32px">per vehicle &middot; buy any time, no rush</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:36px">
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">One engraved plate, made to order</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Tamper-evident QR stickers linking to your public record</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Posted to you once ordered</div>
        </div>
        <a href="${ctaHref}" style="display:block;border:1px solid var(--ink);color:var(--ink);font-size:12.5px;letter-spacing:0.04em;padding:15px;text-align:center;cursor:pointer">Register a vehicle first</a>
      </div>
    </div>

    <!-- EXTRAS -->
    <div style="max-width:920px;margin:0 auto 100px;border-top:1px solid var(--hairline)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--hairline);gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Additional vehicle</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">Every vehicle on your account after the first free one.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">&pound;5</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--hairline);gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Extra storage</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">+20 more slots in either pool (photos, or service documents &amp; invoices combined) once you've used your free ones.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">&pound;5</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--hairline);gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Replacement plate</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">Lost or damaged plaque, re-issued against your existing Moto ID number.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">&pound;18</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--hairline);gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Trade partner (5+ units)</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">For restorers, dealers and clubs fitting Moto ID plaques across multiple vehicles.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">&pound;27 / plaque</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Transferring ownership</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">Selling the vehicle? The record transfers to its new owner, free of charge.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">Included</div>
      </div>
    </div>

    <style>@media (max-width:720px){.pricing-grid{grid-template-columns:1fr!important}.pricing-grid > div:first-child{border-right:none!important;border-bottom:1px solid var(--hairline)}}</style>
  `;
  return c.html(marketingShell("Pricing — Moto ID", body, { activeNav: "pricing" }));
});

// Shared header block used by the simple content pages below (About, Contact, Privacy, Terms).
const PAGE_HEADER = (eyebrow: string, headline: string) => `
  <div style="padding:80px 56px 56px;text-align:center">
    <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--ink-subtle);margin-bottom:22px">${eyebrow}</div>
    <div style="font-family:var(--font-display);font-size:min(38px,8vw);line-height:1.3;max-width:680px;margin:0 auto">${headline}</div>
  </div>
`;

// About now lives as a section on the homepage itself (see "#about" in the
// "/" route above), so this old standalone page just redirects there for
// anyone with an existing "/about" link or bookmark.
marketing.get("/about", (c) => c.redirect("/#about", 301));

marketing.get("/contact", (c) => {
  const body = `
    ${PAGE_HEADER("CONTACT", "Get in touch.")}

    <div style="max-width:520px;margin:0 auto 110px;padding:0 56px;text-align:center;font-size:14.5px;color:var(--ink-muted);line-height:1.8;display:flex;flex-direction:column;align-items:center;gap:4px">
      <p>Questions about a kit, an existing account, or a trade or partnership enquiry &mdash; we read everything sent here and reply as quickly as we can.</p>
      <a href="mailto:hello@digitalvehicleid.com" style="display:inline-block;margin-top:18px;background:var(--ink);color:var(--bg);font-size:12.5px;letter-spacing:0.04em;padding:15px 30px;cursor:pointer">hello@digitalvehicleid.com</a>
      <p style="margin-top:36px;font-size:12.5px;color:var(--ink-subtle)">Fitting Moto ID kits across multiple vehicles as a restorer, dealer or club? Mention it in your message &mdash; trade pricing is on the <a href="/pricing">Pricing</a> page.</p>
    </div>
  `;
  return c.html(marketingShell("Contact — Moto ID", body, { activeNav: "contact" }));
});

marketing.get("/privacy", (c) => {
  const s = (title: string, html: string) => `
    <div style="font-family:var(--font-display);font-size:18px;margin:40px 0 12px">${title}</div>
    <p>${html}</p>
  `;
  const body = `
    ${PAGE_HEADER("LEGAL", "Privacy Policy")}

    <div style="max-width:680px;margin:0 auto 110px;padding:0 56px;font-size:14px;color:var(--ink-muted);line-height:1.8">
      <p style="color:var(--ink-subtle);font-size:12.5px;margin-bottom:20px">Last updated 15 September 2026.</p>

      <p>This policy explains what personal data Moto ID collects when you create an account or use the public verification page, why we collect it, and what rights you have over it. Moto ID is based in the UK and handles personal data under UK GDPR and the Data Protection Act 2018.</p>

      ${s("What we collect", "Account data: your name, email address and a securely hashed password. Vehicle data: registration number, VIN, make, model and year for each vehicle you register. Anything you choose to upload to a vehicle's Service Documents, Invoices or Photos folders. Verification activity: the date and approximate volume of scans against a vehicle's public page (we don't identify who scanned it).")}

      ${s("Why we collect it", "To create and run your account, generate each vehicle's public verification page, store the documents and photos you upload, and respond if you contact us. We don't use your data for advertising, and we don't sell it to anyone.")}

      ${s("What's public", "The public page reached by scanning the plate shows only vehicle-level facts &mdash; make, model, how long it's been registered, how many records exist &mdash; plus any specific document or photo you've explicitly marked public in a folder view. It never shows your name, email or any other personal detail, and anything you haven't marked public stays private by default.")}

      ${s("Cookies", "We use a single session cookie to keep you signed in. We don't use third-party analytics or advertising cookies.")}

      ${s("How long we keep it", "For as long as your account is active. If you'd like your account and its data deleted, contact us and we'll action it, subject to anything we're required to keep for legal or accounting reasons.")}

      ${s("Your rights", "Under UK GDPR you can ask us to give you a copy of your data, correct it, delete it, or move it elsewhere, and you can object to how we use it. Contact us to exercise any of these, and if you're unhappy with our response you can complain to the <a href=\"https://ico.org.uk\">Information Commissioner's Office</a>.")}

      ${s("Changes to this policy", "If we make a material change, we'll update the date at the top of this page.")}

      ${s("Contact", "Questions about this policy or your data: <a href=\"mailto:hello@digitalvehicleid.com\">hello@digitalvehicleid.com</a>.")}
    </div>
  `;
  return c.html(marketingShell("Privacy Policy — Moto ID", body, { activeNav: "" }));
});

marketing.get("/terms", (c) => {
  const s = (title: string, html: string) => `
    <div style="font-family:var(--font-display);font-size:18px;margin:40px 0 12px">${title}</div>
    <p>${html}</p>
  `;
  const body = `
    ${PAGE_HEADER("LEGAL", "Terms of Service")}

    <div style="max-width:680px;margin:0 auto 110px;padding:0 56px;font-size:14px;color:var(--ink-muted);line-height:1.8">
      <p style="color:var(--ink-subtle);font-size:12.5px;margin-bottom:20px">Last updated 15 September 2026.</p>

      <p>These terms cover the free Moto ID account, the optional laser-marked plaque, and the public verification page that goes with each vehicle. By creating an account, registering a vehicle, or buying a plaque, you agree to them.</p>

      ${s("What Moto ID is", "Creating an account and registering your first vehicle is free, with no subscription. Each vehicle gets a free allowance of document and photo storage and a public verification page from the moment it's registered. Additional vehicles, extra storage, and the optional laser-marked plaque are one-time purchases &mdash; current prices are on the <a href=\"/pricing\">Pricing</a> page.")}

      ${s("What \"verified\" means", "Moto ID verifies that a specific physical mark is genuine and hasn't been reissued to a different vehicle, and that the documents in a vehicle's record were uploaded by the account holder on the dates shown. Moto ID cannot verify that an uploaded document is itself genuine, and does not guarantee a vehicle's condition, mileage or history beyond what it can actually check. Anyone relying on a Moto ID record when buying or insuring a vehicle should treat it as one part of their own due diligence, not a substitute for it.")}

      ${s("Your account and content", "You're responsible for the accuracy of what you enter and upload. Don't upload anything unlawful, infringing, or that isn't genuinely related to the vehicle. We may remove content or suspend an account that breaches these terms.")}

      ${s("Selling the vehicle", "A vehicle's record transfers to its new owner free of charge when it's sold. Contact us to arrange a transfer.")}

      ${s("Liability", "Nothing in these terms limits liability for death, personal injury or fraud caused by our negligence. Beyond that, to the extent permitted by law, Moto ID isn't liable for indirect or consequential losses, and our total liability in connection with a kit is capped at the amount you paid for it.")}

      ${s("Governing law", "These terms are governed by the law of England and Wales.")}

      ${s("Changes to these terms", "If we make a material change, we'll update the date at the top of this page.")}

      ${s("Contact", "Questions about these terms: <a href=\"mailto:hello@digitalvehicleid.com\">hello@digitalvehicleid.com</a>.")}
    </div>
  `;
  return c.html(marketingShell("Terms of Service — Moto ID", body, { activeNav: "" }));
});
