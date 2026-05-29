'use strict';
const { chromium } = require('playwright');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'icons');

// Exact SVG from "Foyer Icon.html" — Claude-designed, warm cream arch
function iconHtml(size) {
  const rx = Math.round(270 * size / 1024); // scale corner radius proportionally
  return `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent}
  </style></head><body>
  <svg width="${size}" height="${size}" viewBox="0 0 1024 1024"
       xmlns="http://www.w3.org/2000/svg" style="display:block">
  <defs>
    <clipPath id="cp">
      <rect width="1024" height="1024" rx="270" ry="270"/>
    </clipPath>
    <!-- Warm cream background -->
    <radialGradient id="bg" cx="50%" cy="46%" r="68%">
      <stop offset="0%"   stop-color="#F7F1E7"/>
      <stop offset="100%" stop-color="#E4D9C6"/>
    </radialGradient>
    <!-- Arch interior: overhead light -->
    <radialGradient id="ai" cx="512" cy="320" r="360" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#FEFAF3"/>
      <stop offset="100%" stop-color="#EEE4D6"/>
    </radialGradient>
    <!-- Arch frame: lighter at apex, deeper at base -->
    <linearGradient id="af" x1="0" y1="225" x2="0" y2="800" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#D6C8AA"/>
      <stop offset="50%"  stop-color="#C4B38E"/>
      <stop offset="100%" stop-color="#AE9870"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#cp)">
    <!-- Background -->
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <!-- Arch interior space -->
    <path d="M 344,800 L 344,460 A 168,168 0 0,1 680,460 L 680,800 Z"
          fill="url(#ai)"/>
    <!-- Arch frame (even-odd: outer minus inner = stone) -->
    <path d="M 277,800 L 277,460 A 235,235 0 0,1 747,460 L 747,800 Z
             M 344,800 L 344,460 A 168,168 0 0,1 680,460 L 680,800 Z"
          fill="url(#af)" fill-rule="evenodd"/>
    <!-- Soffit highlight at intrados -->
    <path d="M 344,460 A 168,168 0 0,1 680,460"
          fill="none" stroke="#EAD9BE" stroke-width="3.5"
          opacity="0.70" stroke-linecap="round"/>
    <!-- Outer arch crest -->
    <path d="M 277,460 A 235,235 0 0,1 747,460"
          fill="none" stroke="#DDD0B8" stroke-width="2"
          opacity="0.28" stroke-linecap="round"/>
    <!-- Floor threshold line -->
    <line x1="196" y1="800" x2="828" y2="800"
          stroke="#BEAC8A" stroke-width="2.5" opacity="0.36"
          stroke-linecap="round"/>
  </g>
  </svg>
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
    });
    await ctx.close();
    console.log(`✓ icon${size}.png`);
  }

  await browser.close();
  console.log('Done.');
})();
