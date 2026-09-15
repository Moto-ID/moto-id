import { Hono } from "hono";
import type { Env } from "../types";
import { marketingShell } from "../lib/layout";

export const marketing = new Hono<Env>();

const MOTO_MARK_SVG = (size: number) => `<svg viewBox="0 0 25 25" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="2" width="3" height="3" fill="currentColor"/>
  <rect x="18" y="0" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="20" y="2" width="3" height="3" fill="currentColor"/>
  <rect x="0" y="18" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="20" width="3" height="3" fill="currentColor"/>
  <g fill="currentColor">
    <rect x="9" y="2" width="1" height="1"/><rect x="11" y="2" width="1" height="1"/><rect x="13" y="2" width="1" height="1"/><rect x="15" y="3" width="1" height="1"/>
    <rect x="9" y="5" width="1" height="1"/><rect x="12" y="5" width="1" height="1"/><rect x="16" y="5" width="1" height="1"/>
    <rect x="19" y="9" width="1" height="1"/><rect x="21" y="9" width="1" height="1"/><rect x="23" y="9" width="1" height="1"/>
    <rect x="9" y="9" width="1" height="1"/><rect x="11" y="9" width="1" height="1"/><rect x="13" y="9" width="1" height="1"/><rect x="15" y="9" width="1" height="1"/><rect x="17" y="9" width="1" height="1"/>
    <rect x="19" y="11" width="1" height="1"/><rect x="9" y="11" width="1" height="1"/><rect x="13" y="11" width="1" height="1"/>
    <rect x="21" y="13" width="1" height="1"/><rect x="11" y="13" width="1" height="1"/><rect x="15" y="13" width="1" height="1"/><rect x="23" y="13" width="1" height="1"/>
    <rect x="9" y="15" width="1" height="1"/><rect x="13" y="15" width="1" height="1"/><rect x="17" y="15" width="1" height="1"/><rect x="19" y="15" width="1" height="1"/>
    <rect x="21" y="16" width="1" height="1"/>
  </g>
</svg>`;

// Simple monochrome line-art vehicle icons for the "See it in action" demo reel.
const CAR_ICON = (size: number) => `<svg viewBox="0 0 120 60" width="${size}" height="${size * 0.5}" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 40 L18 24 Q26 14 40 14 L70 14 Q82 14 88 24 L98 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M4 40 L4 34 Q4 30 8 30 L104 30 Q110 30 112 34 L112 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  <line x1="2" y1="40" x2="114" y2="40" stroke="currentColor" stroke-width="2.5"/>
  <circle cx="26" cy="42" r="8" fill="currentColor"/>
  <circle cx="90" cy="42" r="8" fill="currentColor"/>
</svg>`;

const BIKE_ICON = (size: number) => `<svg viewBox="0 0 120 60" width="${size}" height="${size * 0.5}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="22" cy="42" r="14" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <circle cx="98" cy="42" r="14" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <circle cx="22" cy="42" r="2.5" fill="currentColor"/>
  <circle cx="98" cy="42" r="2.5" fill="currentColor"/>
  <path d="M22 42 L48 26 L64 26 L74 42" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M64 26 L98 42" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M48 26 L44 14 L58 14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="30" y="30" width="20" height="7" rx="3" fill="currentColor"/>
</svg>`;

// isCar: rigid engraved plate (dashboard); otherwise a round tamper-evident sticker (headstock).
const PLATE_CARD = (isCar: boolean) =>
  isCar
    ? `<div style="width:130px;height:84px;background:var(--bg);border:1px solid var(--hairline);box-shadow:0 20px 40px -18px rgba(0,0,0,0.25);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
        <div style="font-size:7.5px;letter-spacing:0.16em;color:var(--ink-subtle)">MOTO&nbsp;ID</div>
        <div style="color:var(--ink)">${MOTO_MARK_SVG(30)}</div>
        <div style="font-family:var(--font-mono);font-size:9.5px">No.&nbsp;719726</div>
      </div>`
    : `<div style="width:96px;height:96px;border-radius:50%;border:1.5px dashed var(--ink-subtle);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
        <div style="color:var(--ink)">${MOTO_MARK_SVG(26)}</div>
        <div style="font-family:var(--font-mono);font-size:8.5px">No.&nbsp;305297</div>
      </div>`;

const PHONE_SCAN = () => `<div style="width:100px;height:180px;border:2px solid var(--ink);border-radius:14px;position:relative;overflow:hidden;background:var(--bg)">
  <div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:28px;height:4px;border-radius:2px;background:var(--hairline)"></div>
  <div style="position:absolute;inset:20px 14px;border:1px solid var(--ink-subtle)">
    <div style="position:absolute;top:-1px;left:-1px;width:12px;height:12px;border-top:2px solid var(--ink);border-left:2px solid var(--ink)"></div>
    <div style="position:absolute;top:-1px;right:-1px;width:12px;height:12px;border-top:2px solid var(--ink);border-right:2px solid var(--ink)"></div>
    <div style="position:absolute;bottom:-1px;left:-1px;width:12px;height:12px;border-bottom:2px solid var(--ink);border-left:2px solid var(--ink)"></div>
    <div style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-bottom:2px solid var(--ink);border-right:2px solid var(--ink)"></div>
    <div class="reel-scanline" style="position:absolute;left:0;right:0;height:2px;background:var(--ink);top:50%"></div>
  </div>
</div>`;

const PHONE_APP = (make: string, year: string, num: string) => `<div style="width:120px;height:200px;border:2px solid var(--ink);border-radius:16px;padding:14px 12px;background:var(--bg);display:flex;flex-direction:column;gap:8px">
  <div style="width:22px;height:3px;border-radius:2px;background:var(--hairline);margin:0 auto 4px"></div>
  <div style="font-family:var(--font-display);font-size:12.5px;line-height:1.25">${make}<br><span style="font-size:10px;color:var(--ink-subtle);font-family:var(--font-mono)">${year}</span></div>
  <div style="display:inline-flex;align-items:center;gap:4px;font-size:7.5px;letter-spacing:0.08em;color:var(--ink-muted)">
    <span style="width:5px;height:5px;border-radius:50%;background:var(--ink-muted);display:inline-block"></span>AUTHENTICATED
  </div>
  <div style="font-family:var(--font-mono);font-size:9px;color:var(--ink-subtle);margin-top:auto">No.&nbsp;${num}</div>
</div>`;

const DEMO_REEL_SECTION = `
<!-- SEE IT IN ACTION: looping demo reel -->
<div id="see-it-in-action" style="padding:100px 56px;border-bottom:1px solid var(--hairline);background:var(--bg-panel)">
  <div style="font-size:10.5px;letter-spacing:0.18em;color:var(--ink-subtle);margin-bottom:16px;text-align:center">SEE IT IN ACTION</div>
  <div style="font-family:var(--font-display);font-size:min(34px,7vw);line-height:1.3;text-align:center;margin-bottom:56px;max-width:560px;margin-left:auto;margin-right:auto">From engraved plate to verified history, in one scan.</div>

  <div class="reel" id="motoReel">
    <div class="reel-scene is-active">
      <div class="reel-eyebrow">01 &mdash; THE VEHICLE</div>
      <div class="reel-stage"><div class="reel-anim reel-spin play">${CAR_ICON(96)}</div></div>
      <div class="reel-caption">A classic car, ready to be recorded.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">02 &mdash; THE PLATE</div>
      <div class="reel-stage"><div class="reel-anim reel-pop play">${PLATE_CARD(true)}</div></div>
      <div class="reel-caption">One engraved plate, fixed to the dashboard.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">03 &mdash; THE SCAN</div>
      <div class="reel-stage">${PHONE_SCAN()}</div>
      <div class="reel-caption">Scanned in seconds, from any phone.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">04 &mdash; THE RECORD</div>
      <div class="reel-stage">${PHONE_APP("Porsche 911", "1988", "719726")}</div>
      <div class="reel-caption">Its full, verified history &mdash; instantly.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">05 &mdash; THE VEHICLE</div>
      <div class="reel-stage"><div class="reel-anim reel-spin play">${BIKE_ICON(96)}</div></div>
      <div class="reel-caption">Motorcycles get exactly the same standard.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">06 &mdash; THE STICKER</div>
      <div class="reel-stage"><div class="reel-anim reel-pop play">${PLATE_CARD(false)}</div></div>
      <div class="reel-caption">A tamper-evident ID sticker on the headstock.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">03 &mdash; THE SCAN</div>
      <div class="reel-stage">${PHONE_SCAN()}</div>
      <div class="reel-caption">Scanned in seconds, from any phone.</div>
    </div>
    <div class="reel-scene">
      <div class="reel-eyebrow">04 &mdash; THE RECORD</div>
      <div class="reel-stage">${PHONE_APP("Ducati Monster", "2019", "305297")}</div>
      <div class="reel-caption">Its full, verified history &mdash; instantly.</div>
    </div>
  </div>
  <div class="reel-dots" id="reelDots"></div>
</div>

<style>
  .reel{position:relative;max-width:360px;height:420px;margin:0 auto;border:1px solid var(--hairline);background:var(--bg);overflow:hidden}
  .reel-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;opacity:0;transition:opacity 0.7s ease}
  .reel-scene.is-active{opacity:1}
  .reel-eyebrow{font-size:9.5px;letter-spacing:0.16em;color:var(--ink-subtle)}
  .reel-stage{display:flex;align-items:center;justify-content:center;min-height:140px}
  .reel-caption{font-family:var(--font-display);font-size:16px;text-align:center;max-width:260px;line-height:1.4}
  .reel-anim{color:var(--ink)}
  .reel-spin.play{animation:reelSpin 3.4s ease-in-out}
  @keyframes reelSpin{0%{transform:perspective(500px) rotateY(-38deg)}50%{transform:perspective(500px) rotateY(38deg)}100%{transform:perspective(500px) rotateY(-38deg)}}
  .reel-pop.play{animation:reelPop 3.4s ease-in-out}
  @keyframes reelPop{0%{transform:scale(0.82)}50%{transform:scale(1.12)}100%{transform:scale(0.82)}}
  .reel-scanline{animation:reelScan 1.6s ease-in-out infinite}
  @keyframes reelScan{0%{transform:translateY(-46px);opacity:0.2}50%{opacity:0.9}100%{transform:translateY(46px);opacity:0.2}}
  .reel-dots{display:flex;justify-content:center;gap:8px;margin-top:28px}
  .reel-dot{width:5px;height:5px;border-radius:50%;background:var(--hairline);transition:background 0.3s ease}
  .reel-dot.is-active{background:var(--ink)}
  @media (max-width:480px){ .reel{max-width:100%} }
</style>

<script>
(function(){
  var reel = document.getElementById('motoReel');
  if(!reel) return;
  var scenes = reel.querySelectorAll('.reel-scene');
  var dotsWrap = document.getElementById('reelDots');
  var dots = [];
  scenes.forEach(function(_, k){
    var d = document.createElement('span');
    d.className = 'reel-dot' + (k === 0 ? ' is-active' : '');
    dotsWrap.appendChild(d);
    dots.push(d);
  });
  function show(idx){
    scenes.forEach(function(s, k){
      var active = k === idx;
      s.classList.toggle('is-active', active);
      if(active){
        s.querySelectorAll('.reel-anim').forEach(function(el){
          el.classList.remove('play');
          void el.offsetWidth;
          el.classList.add('play');
        });
      }
    });
    dots.forEach(function(d, k){ d.classList.toggle('is-active', k === idx); });
  }
  var i = 0;
  setInterval(function(){ i = (i + 1) % scenes.length; show(i); }, 3500);
})();
</script>
`;

marketing.get("/", (c) => {
  const body = `
    <style>
      .m-btn-solid-inv:hover{background:oklch(88% 0 0)!important}
    </style>

    <!-- HERO: full-bleed dark, overlaid type -->
    <div style="background:linear-gradient(200deg, oklch(46% 0 0) 0%, oklch(14% 0 0) 55%, oklch(9% 0 0) 100%);min-height:660px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:56px">
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(112deg, rgba(255,255,255,0.025), rgba(255,255,255,0.025) 1px, transparent 1px, transparent 4px)"></div>

      <div style="position:relative;z-index:1">
        <div style="font-size:10.5px;letter-spacing:0.24em;color:oklch(74% 0 0);margin-bottom:26px">DIGITAL PROVENANCE FOR EXCEPTIONAL CARS &amp; MOTORCYCLES</div>
        <div style="font-family:var(--font-display);color:oklch(97% 0 0);font-size:min(128px, 14vw);line-height:0.88;letter-spacing:-0.01em">Provenance<span style="color:oklch(52% 0 0)">.</span></div>
      </div>

      <div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;gap:48px;flex-wrap:wrap">
        <div>
          <div style="font-size:15px;color:oklch(74% 0 0);max-width:400px;margin-bottom:30px">One number. One history. Held to the same standard as the vehicle it belongs to &mdash; engraved, tamper-evident, and yours to prove, at any time.</div>
          <div style="display:flex;align-items:center;gap:26px;flex-wrap:wrap">
            <a href="/signup" class="m-btn-solid-inv" style="background:oklch(97% 0 0);color:oklch(10% 0 0);font-size:12.5px;letter-spacing:0.05em;padding:16px 30px;cursor:pointer;display:inline-block">Request a plate</a>
            <a href="/#the-mark" style="font-size:13px;letter-spacing:0.02em;color:oklch(97% 0 0);cursor:pointer;border-bottom:1px solid oklch(74% 0 0);padding-bottom:2px">See the mark &rarr;</a>
          </div>
        </div>
        <div style="text-align:right;font-size:10.5px;letter-spacing:0.08em;color:oklch(52% 0 0);white-space:nowrap;padding-bottom:6px">LOT&nbsp;084213<br>PORSCHE&nbsp;911,&nbsp;1988</div>
      </div>
    </div>

    <!-- CATEGORY STRIP -->
    <div style="padding:24px 56px;border-bottom:1px solid var(--hairline);display:flex;justify-content:center;gap:0;flex-wrap:wrap">
      <div style="font-size:10.5px;letter-spacing:0.1em;color:var(--ink-subtle);padding:0 20px;border-right:1px solid var(--hairline)">CLASSIC CARS</div>
      <div style="font-size:10.5px;letter-spacing:0.1em;color:var(--ink-subtle);padding:0 20px;border-right:1px solid var(--hairline)">RESTOMODS</div>
      <div style="font-size:10.5px;letter-spacing:0.1em;color:var(--ink-subtle);padding:0 20px;border-right:1px solid var(--hairline)">CUSTOM BUILDS</div>
      <div style="font-size:10.5px;letter-spacing:0.1em;color:var(--ink-subtle);padding:0 20px;border-right:1px solid var(--hairline)">CAF&Eacute; RACERS</div>
      <div style="font-size:10.5px;letter-spacing:0.1em;color:var(--ink-subtle);padding:0 20px;border-right:1px solid var(--hairline)">CHOPPERS</div>
      <div style="font-size:10.5px;letter-spacing:0.1em;color:var(--ink-subtle);padding:0 20px">BESPOKE COACHWORK</div>
    </div>

    <!-- THE MARK: dark spotlight -->
    <div id="the-mark" style="background:oklch(11% 0 0);padding:100px 56px;position:relative;overflow:hidden">
      <div style="position:absolute;left:50%;top:50%;width:640px;height:640px;transform:translate(-50%,-50%);background:radial-gradient(circle, oklch(24% 0 0), transparent 68%)"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;position:relative;z-index:1" class="two-col">
        <div style="display:flex;justify-content:center">
          <img src="/media/plate-photo.jpg" alt="An engraved Moto ID stainless steel plate, laser-marked with the vehicle name, registration and Moto ID number" style="width:100%;max-width:340px;height:auto;border-radius:6px;border:1px solid oklch(24% 0 0);box-shadow:0 40px 70px -20px rgba(0,0,0,0.7);transform:rotate(-3deg)">
        </div>
        <div>
          <div style="font-size:10.5px;letter-spacing:0.18em;color:oklch(52% 0 0);margin-bottom:22px">THE MARK</div>
          <div style="font-family:var(--font-display);color:oklch(97% 0 0);font-size:40px;line-height:1.22;margin-bottom:24px">Engraved once.<br>Verified forever.</div>
          <div style="font-size:14.5px;color:oklch(74% 0 0);max-width:420px;margin-bottom:36px">Each plate is engraved to order and fixed where it belongs &mdash; the top of a dashboard, a tank or a tail unit. Tamper-evident marks placed elsewhere on the vehicle carry the same identity, so its history can't quietly move to another chassis.</div>
          <div style="display:flex;flex-direction:column;gap:18px">
            <div style="border-top:1px solid oklch(26% 0 0);padding-top:14px">
              <span style="font-weight:600;font-size:13.5px;color:oklch(97% 0 0)">For cars &mdash; </span><span style="font-size:13.5px;color:oklch(74% 0 0)">fixed at the top of the dashboard, in clear view.</span>
            </div>
            <div style="border-top:1px solid oklch(26% 0 0);padding-top:14px">
              <span style="font-weight:600;font-size:13.5px;color:oklch(97% 0 0)">For motorcycles &mdash; </span><span style="font-size:13.5px;color:oklch(74% 0 0)">fixed wherever suits the build: tank, tail or under the seat.</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Real laser-marking footage -->
      <div style="max-width:900px;margin:90px auto 0;position:relative;z-index:1;border-top:1px solid oklch(24% 0 0);padding-top:64px;display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center" class="two-col">
        <div>
          <div style="font-size:10.5px;letter-spacing:0.18em;color:oklch(52% 0 0);margin-bottom:22px">HOW IT'S MARKED</div>
          <div style="font-family:var(--font-display);color:oklch(97% 0 0);font-size:28px;line-height:1.3;margin-bottom:20px">Laser-annealed, not printed.</div>
          <div style="font-size:14.5px;color:oklch(74% 0 0);max-width:420px">Every plate and sticker is marked on our own laser, tuned to anneal the stainless steel's surface rather than just etch or print it. Annealing changes the metal's own oxide layer instead of cutting through or coating it, so the mark won't fade, flake or rust &mdash; it's part of the steel for the life of the vehicle.</div>
        </div>
        <div>
          <video controls preload="none" poster="/media/laser-marking-poster.jpg" playsinline style="width:100%;display:block;border:1px solid oklch(24% 0 0);box-shadow:0 30px 60px -20px rgba(0,0,0,0.6)">
            <source src="/media/laser-marking.mp4" type="video/mp4">
          </video>
          <div style="font-size:11px;color:oklch(52% 0 0);margin-top:10px;text-align:center">Real footage &mdash; one of our plates being marked.</div>
        </div>
      </div>
    </div>

    <!-- HOW IT WORKS: ghost numerals -->
    <div id="how-it-works" style="padding:100px 56px;border-bottom:1px solid var(--hairline)">
      <div style="font-size:10.5px;letter-spacing:0.18em;color:var(--ink-subtle);margin-bottom:56px;text-align:center">HOW IT WORKS</div>
      <div style="max-width:820px;margin:0 auto">

        <div style="display:flex;align-items:center;gap:12px;padding:22px 0;border-top:1px solid var(--hairline);position:relative">
          <div style="font-family:var(--font-display);font-size:min(120px,20vw);line-height:1;color:var(--bg-panel);position:absolute;left:-10px;top:50%;transform:translateY(-52%);z-index:0;user-select:none">01</div>
          <div style="flex:1 1 0;position:relative;z-index:1;padding-left:min(150px,26vw)"><span style="font-weight:600;font-size:16px">Commission your plate. </span><span style="font-size:15px;color:var(--ink-muted)">Tell us about the vehicle; it's engraved to order and shipped with its tamper-evident marks.</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:22px 0;border-top:1px solid var(--hairline);position:relative">
          <div style="font-family:var(--font-display);font-size:min(120px,20vw);line-height:1;color:var(--bg-panel);position:absolute;left:-10px;top:50%;transform:translateY(-52%);z-index:0;user-select:none">02</div>
          <div style="flex:1 1 0;position:relative;z-index:1;padding-left:min(150px,26vw)"><span style="font-weight:600;font-size:16px">Fix it in place. </span><span style="font-size:15px;color:var(--ink-muted)">On the dashboard, tank or wherever suits the build; marks go elsewhere on the vehicle.</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:22px 0;border-top:1px solid var(--hairline);position:relative">
          <div style="font-family:var(--font-display);font-size:min(120px,20vw);line-height:1;color:var(--bg-panel);position:absolute;left:-10px;top:50%;transform:translateY(-52%);z-index:0;user-select:none">03</div>
          <div style="flex:1 1 0;position:relative;z-index:1;padding-left:min(150px,26vw)"><span style="font-weight:600;font-size:16px">Build the record. </span><span style="font-size:15px;color:var(--ink-muted)">Registration, VIN and specification, then documents, invoices and photographs as the history unfolds.</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:22px 0;border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline);position:relative">
          <div style="font-family:var(--font-display);font-size:min(120px,20vw);line-height:1;color:var(--bg-panel);position:absolute;left:-10px;top:50%;transform:translateY(-52%);z-index:0;user-select:none">04</div>
          <div style="flex:1 1 0;position:relative;z-index:1;padding-left:min(150px,26vw)"><span style="font-weight:600;font-size:16px">Prove it, always. </span><span style="font-size:15px;color:var(--ink-muted)">A verified scan for a buyer, an insurer, or your own record, set against a history that can't be rewritten.</span></div>
        </div>
      </div>
    </div>

    ${DEMO_REEL_SECTION}

    <!-- FOR THE DISCERNING OWNER -->
    <div style="padding:100px 56px;border-bottom:1px solid var(--hairline)">
      <div style="font-family:var(--font-display);font-style:italic;font-size:min(44px,7vw);line-height:1.3;text-align:center;margin-bottom:64px;max-width:640px;margin-left:auto;margin-right:auto">For the owner who cares how the story is told.</div>
      <div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:32px;max-width:960px;margin:0 auto" class="three-col">
        <div style="padding-right:36px;border-right:1px solid var(--hairline)">
          <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:14px">AGAINST COUNTERFEIT HISTORY</div>
          <div style="font-size:13.5px;color:var(--ink-muted)">A record tied to a tamper-evident mark can't be quietly rewritten, or transplanted onto another chassis.</div>
        </div>
        <div style="padding:0 36px;border-right:1px solid var(--hairline)">
          <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:14px">FOR WORK DONE BY HAND</div>
          <div style="font-size:13.5px;color:var(--ink-muted)">Restore or maintain it yourself? Log parts, dates and photographs, so the work counts as real, dated history.</div>
        </div>
        <div style="padding-left:36px">
          <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:14px">FOR TRUE CONDITION</div>
          <div style="font-size:13.5px;color:var(--ink-muted)">Photographs and documents build a timeline a buyer, insurer or club can trust at a glance.</div>
        </div>
      </div>
    </div>

    <!-- CTA: full-bleed dark -->
    <div style="background:oklch(11% 0 0);padding:110px 56px;text-align:center">
      <div style="font-family:var(--font-display);color:oklch(97% 0 0);font-style:italic;font-size:min(34px,7vw);max-width:520px;margin:0 auto 34px">Give your build a provenance worthy of it.</div>
      <a href="/signup" class="m-btn-solid-inv" style="display:inline-block;background:oklch(97% 0 0);color:oklch(10% 0 0);font-size:12.5px;letter-spacing:0.05em;padding:16px 30px;cursor:pointer">Request a plate &mdash; from &pound;29</a>
    </div>

    <style>
      @media (max-width:820px){ .two-col{grid-template-columns:1fr!important} .three-col{grid-template-columns:1fr!important} .three-col > div{border-right:none!important;border-bottom:1px solid var(--hairline);padding:0 0 24px!important} .three-col > div:last-child{border-bottom:none} }
    </style>
  `;
  return c.html(marketingShell("Moto ID — Digital provenance for exceptional vehicles", body, { activeNav: "" }));
});

marketing.get("/pricing", (c) => {
  const body = `
    <!-- HEADER -->
    <div style="padding:80px 56px 56px;text-align:center">
      <div style="font-size:10.5px;letter-spacing:0.2em;color:var(--ink-subtle);margin-bottom:22px">PRICING</div>
      <div style="font-family:var(--font-display);font-size:min(38px,8vw);line-height:1.3;max-width:620px;margin:0 auto">One plate. One record.<br>No subscription to keep it real.</div>
    </div>

    <!-- PLANS -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;max-width:920px;margin:0 auto 90px;border:1px solid var(--hairline)" class="pricing-grid">

      <div style="padding:48px 44px;border-right:1px solid var(--hairline)">
        <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:16px">THE MOTO ID KIT &mdash; FOUNDING PRICE</div>
        <div style="font-family:var(--font-display);font-size:34px;margin-bottom:6px">&pound;29</div>
        <div style="font-size:12.5px;color:var(--ink-subtle);margin-bottom:32px">one-time &middot; per vehicle &middot; first 250 kits (usually &pound;45)</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:36px">
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">One engraved plate, made to order</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Set of tamper-evident marks</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Unlimited document storage</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Public verification page</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Record kept for the life of the vehicle</div>
        </div>
        <a href="/signup" style="display:block;background:var(--ink);color:var(--bg);font-size:12.5px;letter-spacing:0.04em;padding:15px;text-align:center;cursor:pointer">Request a plate</a>
      </div>

      <div style="padding:48px 44px">
        <div style="font-size:10px;letter-spacing:0.1em;color:var(--ink-subtle);margin-bottom:16px">ADDITIONAL VEHICLES</div>
        <div style="font-family:var(--font-display);font-size:34px;margin-bottom:6px">&pound;35</div>
        <div style="font-size:12.5px;color:var(--ink-subtle);margin-bottom:32px">per additional vehicle in your collection</div>
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:36px">
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Everything in the Moto ID Kit</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Managed under one account</div>
          <div style="border-top:1px solid var(--hairline);padding-top:12px;font-size:13.5px;color:var(--ink-muted)">Same standard of engraving &amp; marking</div>
        </div>
        <a href="/signup" style="display:block;border:1px solid var(--ink);color:var(--ink);font-size:12.5px;letter-spacing:0.04em;padding:15px;text-align:center;cursor:pointer">Add a vehicle</a>
      </div>
    </div>

    <!-- EXTRAS -->
    <div style="max-width:920px;margin:0 auto 100px;border-top:1px solid var(--hairline)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--hairline);gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Replacement plate or stickers</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">Lost or damaged marks, re-issued against your existing Moto ID number.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">&pound;18</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 0;border-bottom:1px solid var(--hairline);gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">Trade partner (5+ units)</div>
          <div style="font-size:12.5px;color:var(--ink-subtle)">For restorers, dealers and clubs fitting Moto ID kits across multiple vehicles.</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:14px;white-space:nowrap">&pound;27 / kit</div>
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
