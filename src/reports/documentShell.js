import fonts from './fonts/tajawal.json' with { type: 'json' }

/**
 * The page the document is printed onto.
 *
 * ============================================================================
 * The fonts are inside the file
 * ============================================================================
 * Tajawal is loaded from Google Fonts on the site. A headless Chromium
 * rendering this on a server has no business depending on that: if the request
 * is slow, blocked, or the sandbox has no egress, the page still renders — in a
 * fallback face, with Arabic that is measurably wrong and, on some fallbacks,
 * unshaped. Nothing errors. You get a finished PDF that simply looks cheap, and
 * you only find out when somebody prints one.
 *
 * So the three weights are base64 inside the stylesheet. 76KB, no network, and
 * the same glyphs every time. `font-display: block` because a swap in a
 * document that is captured once means capturing the swap.
 *
 * ============================================================================
 * Millimetres, because it is paper
 * ============================================================================
 * `@page { size: A4 }` with 18mm sides and generous top and bottom, which is
 * where Chromium draws the running header and footer. Nothing is sized in `vh`
 * or `vw`: there is no viewport, those units resolve against the page box, and
 * they move when the margin does.
 */

const face = (weight, subset, range) => `
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url(data:font/woff2;charset=utf-8;base64,${fonts[`tajawal-${weight}-${subset}`]}) format('woff2');
  unicode-range: ${range};
}`

const ARABIC = 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFF'
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215'

export const REPORT_CSS = `
${[400, 700, 900].map((w) => face(w, 'arabic', ARABIC) + face(w, 'latin', LATIN)).join('\n')}

@page {
  size: A4;
  /* Top and bottom leave room for the running header and footer Chromium
     draws; sides are the text measure. */
  margin: 20mm 18mm 18mm 18mm;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #0F172A;
  font-family: 'Tajawal', sans-serif;
  font-size: 10.5pt;
  line-height: 1.75;
  direction: rtl;
  text-align: right;
  /* Colours are information here — a band, a status. Chromium drops
     backgrounds when printing unless told not to. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.doc { width: 100%; }

/* ===== Cover ===== */
.cover { border-bottom: 2.5pt solid #1E2A52; padding-bottom: 7mm; margin-bottom: 7mm; }

.brand { display: flex; align-items: baseline; gap: 8pt; margin-bottom: 5mm; }
.brand-mark { font-size: 17pt; font-weight: 900; color: #1E2A52; letter-spacing: -.3pt; }
.brand-sub { font-size: 9.5pt; font-weight: 700; color: #64748B; }

.co-name { font-size: 21pt; font-weight: 900; margin: 0 0 3mm; line-height: 1.3; color: #0F172A; }

.co-meta { display: flex; flex-wrap: wrap; gap: 4pt 10pt; font-size: 9.5pt; color: #64748B; font-weight: 700; }
.co-meta .ok { color: #15803D; }

.score-row { display: flex; gap: 7mm; align-items: stretch; margin-top: 6mm; }

.score-box {
  border: 1.5pt solid; border-radius: 4mm; padding: 4mm 7mm;
  text-align: center; flex: none; min-width: 34mm;
  display: flex; flex-direction: column; justify-content: center;
}
.score-num { font-size: 30pt; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.score-of { font-size: 8.5pt; color: #64748B; font-weight: 700; margin-top: 1mm; }

.score-say { flex: 1; min-width: 0; }
.score-band { font-size: 13pt; font-weight: 900; margin-bottom: 1.5mm; }
.score-note { font-size: 9.5pt; color: #475569; margin: 0; line-height: 1.85; }

/* ===== Panels =====
   A decision document must not break between a number and what it means. */
.panel {
  break-inside: avoid;
  page-break-inside: avoid;
  margin-bottom: 6mm;
  border: 0.8pt solid #E2E8F0;
  border-radius: 3mm;
  padding: 5mm 5mm 4mm;
}
.panel-title {
  font-size: 12pt; font-weight: 900; color: #1E2A52;
  margin: 0 0 2mm; padding-bottom: 2mm; border-bottom: 0.8pt solid #E2E8F0;
}
.panel-note { font-size: 9pt; color: #64748B; margin: 0 0 3mm; }

/* ===== Facts ===== */
.facts {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 3mm 5mm; margin: 0;
}
.fact { break-inside: avoid; min-width: 0; }
.fact dt { font-size: 8.5pt; color: #64748B; font-weight: 700; margin-bottom: .6mm; }
.fact dd { font-size: 10.5pt; color: #0F172A; font-weight: 700; margin: 0; word-break: break-word; }

/* ===== Tables ===== */
.tbl { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm; }
.tbl th {
  text-align: right; font-size: 8.5pt; font-weight: 800; color: #64748B;
  border-bottom: 0.8pt solid #E2E8F0; padding: 2mm 2mm; white-space: nowrap;
}
.tbl td { font-size: 9.5pt; padding: 2mm; border-bottom: 0.5pt solid #F1F5F9; }
.tbl td.num { font-variant-numeric: tabular-nums; white-space: nowrap; color: #475569; }
/* A row is never split, and a header repeats when a long table does run on. */
.tbl tr { break-inside: avoid; page-break-inside: avoid; }
.tbl thead { display: table-header-group; }

.chart { width: 100%; height: auto; display: block; margin: 2mm 0 1mm; }

.empty {
  font-size: 9.5pt; color: #64748B; background: #F8FAFC;
  border: 0.8pt solid #E2E8F0; border-radius: 2mm; padding: 3mm; margin: 3mm 0 0;
  line-height: 1.85;
}

.limits { margin: 0; padding-inline-start: 5mm; }
.limits li { font-size: 9.5pt; color: #334155; margin-bottom: 2mm; line-height: 1.85; }

.issued {
  margin-top: 6mm; padding-top: 3mm; border-top: 0.8pt solid #E2E8F0;
  font-size: 8.5pt; color: #94A3B8; text-align: center;
}
`

/** The whole file: one document, one stylesheet, nothing fetched. */
export function documentShell (bodyHtml, title) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${REPORT_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`
}
