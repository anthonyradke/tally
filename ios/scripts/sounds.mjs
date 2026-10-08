// Draws Tally's sound effects (assets/sounds/*.wav) from scratch: a few tuned bells, marimba notes and filtered noise,
// so nothing is borrowed and every sound can be changed here and rerun with `node scripts/sounds.mjs`.
// 44.1 kHz mono 16-bit. Each sound is short (the longest is under a second) and peaks well below full scale: these
// sit under the haptics, they don't announce themselves.
import fs from 'node:fs'
import path from 'node:path'

const RATE = 44100
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../assets/sounds')

const buf = (sec) => new Float64Array(Math.ceil(sec * RATE))
const note = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name)
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12
  return 440 * 2 ** (semis / 12)
}

/** A struck tone: partials [ratio, gain, decay seconds], a few ms of attack so it never clicks. */
function strike(out, at, freq, partials, gain = 1) {
  const start = Math.floor(at * RATE)
  const attack = 0.003 * RATE
  for (const [ratio, g, decay] of partials) {
    const f = freq * ratio
    if (f > RATE / 2.2) continue
    const len = Math.min(out.length - start, Math.ceil(decay * 7 * RATE))
    for (let i = 0; i < len; i++) {
      const env = Math.min(1, i / attack) * Math.exp(-i / (decay * RATE))
      out[start + i] += gain * g * env * Math.sin((2 * Math.PI * f * i) / RATE)
    }
  }
}
const MARIMBA = [[1, 1, 0.09], [3.93, 0.35, 0.025], [9.2, 0.08, 0.01]]
const GLASS = [[1, 1, 0.35], [2.76, 0.4, 0.16], [5.4, 0.18, 0.08], [8.93, 0.06, 0.04]]
const TINE = [[1, 1, 0.22], [2, 0.25, 0.12], [3.01, 0.12, 0.06]]

/** Band-passed noise whose center glides from f0 to f1 (Hz), with a smooth swell: breath, whoosh, paper. */
function noise(out, at, dur, f0, f1, gain, q = 2.2, seed = 1) {
  let s = seed * 9301 + 49297
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 * 2 - 1 }
  const start = Math.floor(at * RATE), len = Math.floor(dur * RATE)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < len && start + i < out.length; i++) {
    const k = i / len
    const f = f0 * (f1 / f0) ** k
    const w = (2 * Math.PI * f) / RATE, alpha = Math.sin(w) / (2 * q)
    const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha
    const x = rand()
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = x; y2 = y1; y1 = y
    const env = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 1.5
    out[start + i] += gain * env * y
  }
}

function write(name, data, peak) {
  let max = 0
  for (const v of data) max = Math.max(max, Math.abs(v))
  const scale = max ? peak / max : 0
  // Fade the last 10 ms, so a tail cut by the buffer's end never clicks.
  const fade = Math.floor(0.01 * RATE)
  const pcm = Buffer.alloc(44 + data.length * 2)
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + data.length * 2, 4); pcm.write('WAVE', 8)
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22)
  pcm.writeUInt32LE(RATE, 24); pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34)
  pcm.write('data', 36); pcm.writeUInt32LE(data.length * 2, 40)
  data.forEach((v, i) => {
    const tail = Math.min(1, (data.length - i) / fade)
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * scale * tail)) * 32767), 44 + i * 2)
  })
  fs.writeFileSync(path.join(OUT, `${name}.wav`), pcm)
  console.log(`${name}.wav ${(data.length / RATE).toFixed(2)}s`)
}

fs.mkdirSync(OUT, { recursive: true })

// key: a keypad press. A short wooden tock, felt more than heard.
{ const o = buf(0.06); strike(o, 0, 1480, [[1, 1, 0.012], [2.3, 0.3, 0.006]]); noise(o, 0, 0.012, 3000, 2000, 0.25, 1.2, 3); write('key', o, 0.22) }

// tick: a selection (chips, toggles, an armed swipe). Smaller and higher than the key.
{ const o = buf(0.04); strike(o, 0, 2350, [[1, 1, 0.008], [2.1, 0.25, 0.004]]); write('tick', o, 0.16) }

// add: an entry saved. Two marimba notes going up a fifth.
{ const o = buf(0.5); strike(o, 0, note('G5'), MARIMBA); strike(o, 0.075, note('D6'), MARIMBA, 0.95); write('add', o, 0.5) }

// income: money in. A soft "cha" then a bright two-bell "ching", like a till drawer.
{
  const o = buf(0.9)
  noise(o, 0, 0.05, 5200, 3800, 0.5, 1.4, 7)
  strike(o, 0.045, note('E6'), GLASS, 0.9)
  strike(o, 0.05, note('B6'), GLASS, 0.6)
  strike(o, 0.12, note('E7'), GLASS, 0.35)
  write('income', o, 0.5)
}

// remove: an entry deleted. A short breath falling away, with a low tine under it.
{ const o = buf(0.32); noise(o, 0, 0.24, 2600, 500, 1, 1.6, 11); strike(o, 0.02, note('A4'), TINE, 0.35); write('remove', o, 0.34) }

// undo: the delete played backwards, rising, landing on a note.
{ const o = buf(0.4); noise(o, 0, 0.2, 500, 2600, 1, 1.6, 13); strike(o, 0.17, note('E5'), MARIMBA, 0.7); write('undo', o, 0.36) }

// success: reconciled to the cent, a month under budget. A rising arpeggio of glass bells.
{
  const o = buf(1.2)
  ;['C6', 'E6', 'G6', 'C7'].forEach((n, i) => strike(o, i * 0.07, note(n), GLASS, 1 - i * 0.12))
  write('success', o, 0.5)
}

// error: refused. Two low, soft knocks, the second a step down.
{ const o = buf(0.3); strike(o, 0, note('D4'), MARIMBA, 1); strike(o, 0.1, note('B3'), MARIMBA, 0.9); write('error', o, 0.42) }

// toggle: a switch, theme or the eye on Home. A click with a little body.
{ const o = buf(0.08); strike(o, 0, 1760, [[1, 1, 0.02], [2.5, 0.4, 0.01]]); noise(o, 0, 0.015, 4000, 3000, 0.3, 1.5, 17); write('toggle', o, 0.22) }

// swoosh: a sheet or a story page sliding by.
{ const o = buf(0.3); noise(o, 0, 0.26, 900, 2400, 1, 0.9, 19); write('swoosh', o, 0.16) }
