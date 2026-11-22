// Closing an editor with changes unsaved (the X, or a swipe down) never asks first. A toast says "Changes not saved",
// and its Restore opens the editor again with the draft as it was left. One toast for every editor: the entry editor
// (useUnsaved) and the Settings editors (useOfferBack).
import { useEffect, useRef, type RefObject } from 'react'
import { router } from 'expo-router'
import { toCents, useDraft, type Draft } from './draft'
import { toast } from './toast'

/** A draft as far as "has it changed" goes: which split line or figure the keypad is on doesn't count, and "5.4"
 *  is the same amount as "5.40". */
export const snap = (x: Draft) => JSON.stringify({ ...x, target: undefined, amount: toCents(x.amount),
  split: x.split?.map((l) => [l.category_id, toCents(l.amount)]) ?? null })

/** What a closed editor held, and what it had been filled from, so the reopened one still knows what's changed. */
export interface Unsaved { d: Draft; seed: string | null; from: string | null; dup: boolean }
let kept: Unsaved | null = null

/** The draft waiting for Restore. Read while the reopened editor starts; `forgetUnsaved` once it has it. */
export const peekUnsaved = (): Unsaved | null => kept
export const forgetUnsaved = () => { kept = null }

/** What the editor knows when it closes: whether it's leaving on purpose (saved, saving or deleted: nothing to
 *  offer back), whether it had loaded, the snap it was filled with, the row it came from, and the route params that
 *  reopen it (id, mode, fav, from). */
export interface Closing { leaving: boolean; loaded: boolean; seed: string | null; from: string | null; params: Record<string, string | undefined> }

/** For the editor (not when it's embedded in the composer). Both ways of closing just unmount the screen, so this
 *  watches for that. It keeps the last draft the screen owned (a sheet over it may own the store by then) and checks
 *  it a tick later, after anything that only remounts (a dev-mode double effect) is back. */
export function useUnsaved(on: boolean, owner: string, read: () => Closing) {
  const alive = useRef(false) // across effect runs: a remount puts it back before the check
  useEffect(() => {
    if (!on) return
    let mine: Draft | null = null
    alive.current = true
    const note = (s: ReturnType<typeof useDraft.getState>) => { if (s.owner === owner) mine = s.d }
    note(useDraft.getState())
    const unsub = useDraft.subscribe(note)
    return () => {
      unsub()
      alive.current = false
      const last: Draft | null = mine
      const now = read()
      if (now.leaving || !now.loaded || !last || snap(last) === now.seed) return
      const stash: Unsaved = { d: last, seed: now.seed, from: now.from, dup: now.params.mode === 'duplicate' }
      const p = Object.fromEntries(Object.entries({ ...now.params, restore: '1' }).filter(([, v]) => v)) as Record<string, string>
      later(alive, () => { router.push({ pathname: '/entry', params: p }) }, () => { kept = stash })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The one "Changes not saved" toast: Restore opens the editor again as it was left. */
export function offerBack(reopen: () => void) {
  toast({ text: 'Changes not saved', action: { label: 'Restore', run: reopen } })
}

/** Offers the draft back a tick after the screen unmounted, unless it came back meanwhile (a dev-mode double effect
 *  only remounts it). `first` runs just before, once it's sure. */
function later(alive: RefObject<boolean>, reopen: () => void, first?: () => void) {
  setTimeout(() => {
    if (alive.current) return
    first?.()
    offerBack(reopen)
  }, 0)
}

/** For an editor whose fields live in the screen (the Settings editors). `closing` runs as it unmounts and returns
 *  how to reopen it with the draft, or null when there's nothing to offer (unchanged, saved, saving or deleted). */
export function useOfferBack(closing: () => (() => void) | null) {
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      const reopen = closing()
      if (reopen) later(alive, reopen)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
