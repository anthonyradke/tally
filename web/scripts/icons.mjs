// Renders the app icon: four tally strokes and the cross-stroke, paper on black. Run: node scripts/icons.mjs
import sharp from 'sharp'
const svg = (scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#000"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)" stroke="#f4f2ee" stroke-width="78" stroke-linecap="round" fill="none">
    <line x1="296" y1="292" x2="296" y2="732"/>
    <line x1="440" y1="292" x2="440" y2="732"/>
    <line x1="584" y1="292" x2="584" y2="732"/>
    <line x1="728" y1="292" x2="728" y2="732"/>
    <line x1="226" y1="676" x2="798" y2="368"/>
  </g>
</svg>`
const out = async (name, size, scale = 1) => { await sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(`public/${name}`); console.log(name) }
await out('icon-512.png', 512); await out('icon-192.png', 192); await out('icon-180.png', 180); await out('icon-maskable-512.png', 512, 0.72)
