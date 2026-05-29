'use strict';
const { chromium } = require('playwright');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'icons');

function iconHtml(size) {
  const r = Math.round(size * 0.22);          // corner radius
  const strokeW = Math.max(1, size * 0.072);  // arch stroke width
  // Arch SVG: two columns + semicircle top, open bottom (doorway)
  // viewBox 100x100; arch sits in horizontal center, occupies ~56% width
  const ax = 22, bx = 78, ay = 86, arcY = 46; // column bases + arch spring line
  const archPath = `M ${ax},${ay} L ${ax},${arcY} A 28,28 0 0,0 ${bx},${arcY} L ${bx},${ay}`;

  return `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent}
    .ic{
      width:${size}px;height:${size}px;
      border-radius:${r}px;
      background:
        radial-gradient(ellipse 70% 55% at 50% 20%, rgba(108,80,200,0.55) 0%, transparent 65%),
        radial-gradient(ellipse 60% 50% at 85% 80%, rgba(40,20,100,0.60) 0%, transparent 58%),
        linear-gradient(150deg, #221050 0%, #3a2282 40%, #2a1660 70%, #180e40 100%);
      display:flex;align-items:center;justify-content:center;
      position:relative;overflow:hidden;
    }
    /* subtle top sheen */
    .ic::before{
      content:'';position:absolute;top:0;left:0;right:0;height:42%;
      background:linear-gradient(180deg,rgba(255,255,255,0.10) 0%,transparent 100%);
    }
    svg{position:relative;z-index:1;width:${size*0.60}px;height:${size*0.60}px;}
  </style></head><body>
  <div class="ic">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- arch drop-shadow -->
      <path d="${archPath}" stroke="rgba(0,0,0,0.35)" stroke-width="${strokeW * 1.6}"
            stroke-linecap="round" stroke-linejoin="round"/>
      <!-- arch main -->
      <path d="${archPath}" stroke="white" stroke-width="${strokeW}"
            stroke-linecap="round" stroke-linejoin="round"
            style="filter:drop-shadow(0 0 3px rgba(200,180,255,0.5))"/>
      <!-- floor line -->
      <line x1="${ax - 2}" y1="${ay}" x2="${bx + 2}" y2="${ay}"
            stroke="rgba(255,255,255,0.45)" stroke-width="${strokeW * 0.55}"
            stroke-linecap="round"/>
    </svg>
  </div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const size of [16, 48, 128]) {
    const ctx  = await browser.newContext({ viewport: { width: size, height: size } });
    const page = await ctx.newPage();
    await page.setContent(iconHtml(size), { waitUntil: 'networkidle' });
    await page.screenshot({
      path: path.join(ICONS_DIR, `icon${size}.png`),
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: false,
    });
    await ctx.close();
    console.log(`✓ icon${size}.png`);
  }

  await browser.close();
  console.log('Done.');
})();
