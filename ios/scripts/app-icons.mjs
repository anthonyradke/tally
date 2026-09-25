// Renders the glowing lowercase-t app icons: one per theme on black and on white, plus a DEV pair for Tally Dev.
// Saved to assets/app-icons/ for the icon picker. Run after changing the mark: node scripts/app-icons.mjs
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

// Glow gradients per theme (top-left to bottom-right), matching the dark theme glows in src/theme/themes.ts.
const THEMES = {
  aurora: ['#8B6CFF', '#2F8BFF'],
  sunset: ['#FF8A4C', '#FF2D87'],
  ocean: ['#35D0EA', '#2F6BFF'],
  citrus: ['#FFD04D', '#FF7A1A'],
  blossom: ['#FF6FB5', '#9D5CFF'],
}
const DEV = ['#FFB340', '#FF6A00']
const BGS = { black: { fill: '#05060B', glow: 0.75 }, white: { fill: '#FFFFFF', glow: 0.5 } }

const SIZE = 1024
const SCALE = 0.74 // letter height is about 55% of the icon
const STROKE = 130
const PATHS = ['M460 230V670Q460 800 580 800Q660 800 700 720', 'M340 400H620']

const letter = (paint, tx, ty) => `<g transform="translate(${tx} ${ty}) scale(${SCALE})">${PATHS.map((d) =>
  `<path d="${d}" stroke="${paint}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`).join('')}</g>`

// Measure the rendered letter so its ink box sits exactly on the center (the curl makes the path box lopsided).
const probe = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${letter('#fff', 0, 0)}</svg>`))
  .png().toBuffer({ resolveWithObject: false })
const { info } = await sharp(probe).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })
const ink = { x: -info.trimOffsetLeft, y: -info.trimOffsetTop, w: info.width, h: info.height }

const icon = ([a, b], bg, { dy = 0, badge = '' } = {}) => {
  const tx = SIZE / 2 - ink.x - ink.w / 2, ty = SIZE / 2 - ink.y - ink.h / 2 + dy
  const mark = letter('url(#g)', tx, ty) + badge
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${SIZE / 2 - ink.w / 2}" y1="${SIZE / 2 - ink.h / 2 + dy}" x2="${SIZE / 2 + ink.w / 2}" y2="${SIZE / 2 + ink.h / 2 + dy}">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="36"/></filter></defs>
    <rect width="${SIZE}" height="${SIZE}" fill="${bg.fill}"/>
    <g filter="url(#blur)" opacity="${bg.glow}">${mark}</g>${mark}</svg>`
}

// DEV: the letter moves up and a pill with "DEV" sits under it; the pair is centered as a group.
const pillW = 260, pillH = 96, gap = 44, dy = -(pillH + gap) / 2
const pillY = SIZE / 2 + ink.h / 2 + dy + gap
const badge = (bg) => `<rect x="${SIZE / 2 - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="url(#g)"/>
  <text x="${SIZE / 2}" y="${pillY + pillH / 2}" dy="0.36em" text-anchor="middle" font-family="SF Pro Rounded, SF Pro Display, Helvetica Neue, Arial"
    font-weight="800" font-size="62" letter-spacing="6" fill="${bg.fill}">DEV</text>`

mkdirSync('assets/app-icons', { recursive: true })
const write = async (name, svg) => { await sharp(Buffer.from(svg)).flatten().png().toFile(`assets/app-icons/${name}.png`); console.log(name) }
for (const [bgName, bg] of Object.entries(BGS)) {
  for (const [theme, colors] of Object.entries(THEMES)) await write(`${theme}-${bgName}`, icon(colors, bg))
  await write(`dev-${bgName}`, icon(DEV, bg, { dy, badge: badge(bg) }))
}
