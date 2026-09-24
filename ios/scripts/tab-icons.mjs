// Renders the + in the middle of the tab bar: a circle in each theme's accent with the plus in its onInk color, for
// light and dark. The tab bar can't color one item's symbol on its own, so these are images drawn in their own colors.
// Run after changing a theme's ink: node --import ./test/register.mjs scripts/tab-icons.mjs
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'
import { THEMES } from '../src/theme/themes.ts'

const PT = 26 // point size in the tab bar: the same box as the SF Symbols beside it, so its label lines up with theirs
const svg = (fill, plus) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="60" fill="${fill}"/>
  <g stroke="${plus}" stroke-width="9" stroke-linecap="round"><line x1="60" y1="37" x2="60" y2="83"/><line x1="37" y1="60" x2="83" y2="60"/></g>
</svg>`

mkdirSync('assets/tab', { recursive: true })
for (const t of THEMES) {
  for (const mode of ['light', 'dark']) {
    const p = t[mode]
    for (const scale of [2, 3]) {
      const file = `assets/tab/add-${t.id}-${mode}@${scale}x.png`
      await sharp(Buffer.from(svg(p.ink, p.onInk))).resize(PT * scale, PT * scale).png().toFile(file)
    }
  }
}
console.log(`${THEMES.length * 4} icons in assets/tab`)
