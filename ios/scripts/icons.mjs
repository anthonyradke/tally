// Renders the app icon (four tally strokes and the cross-stroke, paper on black, same mark as the old web app) and the
// splash mark. Run after changing the mark: node scripts/icons.mjs
import sharp from 'sharp'

const strokes = (color) => `
  <g stroke="${color}" stroke-width="78" stroke-linecap="round" fill="none">
    <line x1="296" y1="292" x2="296" y2="732"/><line x1="440" y1="292" x2="440" y2="732"/>
    <line x1="584" y1="292" x2="584" y2="732"/><line x1="728" y1="292" x2="728" y2="732"/>
    <line x1="226" y1="676" x2="798" y2="368"/>
  </g>`
const svg = (bg, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${strokes(color)}</svg>`

const out = async (file, s, size = 1024) => { await sharp(Buffer.from(s)).resize(size, size).png().toFile(`assets/${file}`); console.log(file) }
await out('icon.png', svg('#000000', '#f4f2ee'))                 // iOS flattens this; no transparency allowed
await out('icon-dark.png', svg(null, '#f4f2ee'))                 // iOS 18+ dark icon: transparent background
await out('icon-tinted.png', svg(null, '#ffffff'))               // iOS 18+ tinted icon: white on transparent
await out('splash-icon.png', svg(null, '#000000'), 512)
await out('splash-icon-dark.png', svg(null, '#f4f2ee'), 512)
await out('favicon.png', svg('#000000', '#f4f2ee'), 48)
