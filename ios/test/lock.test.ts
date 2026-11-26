// Face ID to open Tally: when it locks again, when it asks, and the links that wait for it.
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import storage from '@react-native-async-storage/async-storage'
import * as Auth from 'expo-local-authentication'
import { appStateChanged, AWAY_MS, holdLink, loadLock, lockDue, lockedNow, onAppState, setFaceId, unlock, useLock, type Gate } from '@/lib/lock'

const phone = (Auth as unknown as { phone: { hardware: boolean; enrolled: boolean; answers: object[]; asked: number } }).phone
const PASS = { success: true }
const CANCEL = { success: false, error: 'user_cancel' }
const MIN = 60_000
const open: Gate = { locked: false, tried: false, since: null }

/** Runs AppState changes `[state, at]` through the pure rules. */
const run = (g: Gate, steps: [string, number][], on = true) => steps.reduce((x, [app, at]) => onAppState(x, app, at, on), g)

beforeEach(() => {
  ;(storage as unknown as { clear(): void }).clear()
  Object.assign(phone, { hardware: true, enrolled: true, answers: [], asked: 0 })
  useLock.setState({ ready: false, available: false, enabled: false, asking: false, opened: false, cover: false, held: null, ...open })
})

test('more than five minutes in the background locks', () => {
  assert.equal(run(open, [['inactive', 0], ['background', 1], ['active', 1 + AWAY_MS + 1]]).locked, true)
  assert.equal(run(open, [['inactive', 0], ['background', 1], ['inactive', 6 * MIN], ['active', 6 * MIN]]).locked, true)
})

test('a short trip away does not lock', () => {
  assert.equal(run(open, [['inactive', 0], ['background', 1], ['active', 4 * MIN]]).locked, false)
  assert.equal(run(open, [['background', 0], ['active', AWAY_MS]]).locked, false) // exactly five minutes
})

test('inactive time never counts: Control Center, the Face ID sheet, Plaid Link, pickers, share sheets', () => {
  const g = run(open, [['inactive', 0], ['active', 30 * MIN], ['inactive', 31 * MIN], ['active', 90 * MIN]])
  assert.deepEqual(g, open)
})

test('each trip to the background is timed on its own', () => {
  // Two short trips adding up to more than five minutes don't lock.
  assert.equal(run(open, [['background', 0], ['active', 4 * MIN], ['background', 5 * MIN], ['active', 9 * MIN]]).locked, false)
})

test('off, nothing locks', () => {
  assert.equal(run(open, [['background', 0], ['active', 60 * MIN]], false).locked, false)
})

test('the sheet closing does not ask again; coming back from the background does', () => {
  const asked: Gate = { locked: true, tried: true, since: null }
  assert.deepEqual(run(asked, [['inactive', 0], ['active', 1]]), asked) // cancelled: the button asks
  assert.deepEqual(run(asked, [['background', 0], ['active', MIN]]), { locked: true, tried: false, since: null })
})

test('a link that comes in before the return locks counts as locked', () => {
  const away: Gate = { ...open, since: 0 }
  assert.equal(lockDue(away, AWAY_MS + 1, true), true)
  assert.equal(lockDue(away, MIN, true), false)
  assert.equal(lockDue(away, AWAY_MS + 1, false), false)
})

test('on by default where Face ID is set up; a cold start locks and asks', async () => {
  await loadLock()
  let s = useLock.getState()
  assert.equal(s.enabled && s.available && s.locked, true)
  assert.equal(s.opened, false) // the screens wait for the unlock
  phone.answers.push(PASS)
  appStateChanged('active', 0)
  await new Promise((r) => setTimeout(r, 0))
  s = useLock.getState()
  assert.equal(phone.asked, 1)
  assert.equal(s.locked || s.asking, false)
  assert.equal(s.opened, true)
})

test('no Face ID set up: off and never locks', async () => {
  phone.enrolled = false
  await loadLock()
  const s = useLock.getState()
  assert.equal(s.available || s.locked, false)
  assert.equal(s.opened, true)
  appStateChanged('background', 0)
  appStateChanged('active', 60 * MIN)
  assert.equal(useLock.getState().locked, false)
})

test('turned off stays off', async () => {
  await storage.setItem('tally.faceid', '0')
  await loadLock()
  assert.equal(useLock.getState().locked, false)
})

test('a cancel keeps the lock and waits for the button; no second sheet on its own', async () => {
  await loadLock()
  phone.answers.push(CANCEL)
  assert.equal(await unlock(), false)
  appStateChanged('active', 1) // the sheet closing
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(phone.asked, 1)
  assert.equal(useLock.getState().locked, true)
  assert.equal(useLock.getState().tried, true)
  phone.answers.push(PASS)
  assert.equal(await unlock(), true)
  assert.equal(useLock.getState().locked, false)
})

test('a phone without a passcode left opens', async () => {
  await loadLock()
  phone.answers.push({ success: false, error: 'passcode_not_set' })
  assert.equal(await unlock(), true)
})

test('turning it on asks first', async () => {
  await storage.setItem('tally.faceid', '0')
  await loadLock()
  phone.answers.push(CANCEL)
  assert.equal(await setFaceId(true), false)
  assert.equal(useLock.getState().enabled, false)
  phone.answers.push(PASS)
  assert.equal(await setFaceId(true), true)
  assert.equal(await storage.getItem('tally.faceid'), '1')
  assert.equal(await setFaceId(false), true)
  assert.equal(await storage.getItem('tally.faceid'), '0')
})

test('links wait until the setting has loaded and while locked', async () => {
  assert.equal(lockedNow(), true) // not loaded yet
  await loadLock()
  assert.equal(lockedNow(), true)
  phone.answers.push(PASS)
  await unlock()
  assert.equal(lockedNow(), false)
})

const held = (path: string) => { useLock.setState({ held: null }); holdLink(path); return useLock.getState().held }

test('a plain launch holds nothing', () => {
  assert.equal(held('tally:///'), null) // was "//", which expo-router opened as https://
  assert.equal(held('tally://'), null)
  assert.equal(held('/'), null)
})

test('a link is kept as a route', () => {
  assert.equal(held('tally://add?amount=1'), '/add?amount=1')
  assert.equal(held('tally:///add?amount=1'), '/add?amount=1')
  assert.equal(held('/check-in'), '/check-in')
  assert.equal(held('add'), '/add')
})
