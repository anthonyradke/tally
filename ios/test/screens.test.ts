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

test('Summary and Accounts open Settings from a button straight in their header toolbar', () => {
  for (const name of ['index.tsx', 'accounts.tsx']) {
    const text = readFileSync(join(src, 'app/(tabs)/(home,activity,insights,accounts)', name), 'utf8')
    const header = /const HEADER = \(\s*<Stack\.Toolbar placement="right">([\s\S]*?)<\/Stack\.Toolbar>\s*\)/.exec(text)
    assert.ok(header, `${name}: HEADER is a Stack.Toolbar itself, not one wrapped in something`)
    assert.match(header[1], /<Stack\.Toolbar\.Button icon="gearshape"[^\n]*router\.push\('\/settings'\)/, name)
  }
})

test('every Settings page is in its stack, which gives each one Done', () => {
  const dir = join(src, 'app/settings')
  const layout = readFileSync(join(dir, '_layout.tsx'), 'utf8')
  const pages = files(dir).map((f) => f.slice(dir.length + 1).replace(/\.tsx$/, '')).filter((n) => n !== '_layout')
  for (const page of pages) assert.match(layout, new RegExp(`<Stack\\.Screen name="${page.replace(/[[\]]/g, '\\$&')}"`), page)
  assert.match(layout, /unstable_headerRightItems: \(\) => \[\{ type: 'button', label: 'Done'/)
  // A page's own right-hand toolbar would replace the layout's Done.
  for (const page of pages) assert.doesNotMatch(readFileSync(join(dir, `${page}.tsx`), 'utf8'), /<Stack\.Toolbar placement="right"/, page)
})

test('no leftovers of the retired web app', () => {
  const hits = files(src).filter((f) => /\bweb\/|\/static\/|pwa|service ?worker/i.test(readFileSync(f, 'utf8')))
  assert.deepEqual(hits.map((f) => f.slice(src.length)), [])
})
