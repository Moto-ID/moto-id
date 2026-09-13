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
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.6}
a{color:var(--ink);text-decoration:none}
h1,h2,h3{font-family:var(--font-display);font-weight:400;margin:0}
p{margin:0}
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

/* Nav */
.nav{display:flex;align-items:center;justify-content:space-between;padding:26px 56px;border-bottom:1px solid var(--hairline)}
.nav .wordmark{font-weight:600;font-size:12px;letter-spacing:0.2em}
.nav .links{display:flex;align-items:center;gap:40px}
.nav .links a{font-size:11.5px;letter-spacing:0.06em;color:var(--ink-muted)}
.nav .links a:hover, .nav .links a.active{color:var(--ink)}
.nav .right{display:flex;align-items:center;gap:28px}
@media (max-width:900px){.nav{padding:20px}.nav .links{display:none}}

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

/* Utility */
.muted{color:var(--ink-muted)}
.subtle{color:var(--ink-subtle)}
.mono{font-family:var(--font-mono)}
.eyebrow{font-size:10.5px;letter-spacing:0.2em;color:var(--ink-subtle)}
.error{color:oklch(45% 0.18 25);font-size:13px;margin-bottom:20px}
`;

export function pageHead(title: string): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital@0;1&family=Work+Sans:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap">
<style>${BASE_CSS}</style>`;
}



