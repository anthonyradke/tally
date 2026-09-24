// Static checks on the screens for mistakes that only show up in a Release build on the phone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []
})
const src = new URL('../src/', import.meta.url).pathname

test('toolbar items are direct children of Stack.Toolbar', () => {
  // expo-router keeps only Button/Menu/Spacer/View children (processHeaderItemsForPlatform.ios); a fragment is
  // dropped without a word in Release builds, taking every button inside it along.
  const bad: string[] = []
  for (const f of files(src)) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/<Stack\.Toolbar\b[^>]*>([\s\S]*?)<\/Stack\.Toolbar>/g)) {
      if (/<>|<Fragment|<React\.Fragment/.test(m[1])) bad.push(f.slice(src.length))
    }
  }
  assert.deepEqual(bad, [])
})

test('no leftovers of the retired web app', () => {
  const hits = files(src).filter((f) => /\bweb\/|\/static\/|pwa|service ?worker/i.test(readFileSync(f, 'utf8')))
  assert.deepEqual(hits.map((f) => f.slice(src.length)), [])
})
