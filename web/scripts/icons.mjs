// Renders the app icon: the ledger rule under a bold "$" — the signature move, on black. Run: node scripts/icons.mjs
import sharp from 'sharp'
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#000"/>
  <text x="512" y="${560 - pad * 0.15}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="${600 - pad}" fill="#f4f2ee">$</text>
  <rect x="${200 + pad / 2}" y="${760 - pad * 0.3}" width="${624 - pad}" height="34" rx="17" fill="#f4f2ee"/>
</svg>`
const out = async (name, size, pad = 0) => { await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/${name}`); console.log(name) }
await out('icon-512.png', 512); await out('icon-192.png', 192); await out('icon-180.png', 180); await out('icon-maskable-512.png', 512, 140)
