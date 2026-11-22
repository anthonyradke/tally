// The new-entry flow's steps. Which ones a kind has comes from its From/To rules. Next goes one page on, or straight to
// the review once every step after this one is answered (never to a page in the middle: a leap from the amount to the
// accounts felt like skipping). A shortcut (opening with an amount, a quick action, a past entry) and Done after
// changing one answer from the review go to the first step still missing something.
import type { CatType } from './api'
import type { Draft } from './draft'
import { SHAPES } from './shapes'

export type Step = 'amount' | 'what' | 'category' | 'from' | 'to' | 'review'

export function stepsFor(kind: CatType): Step[] {
  const s = SHAPES[kind]
  return ['amount', 'what', 'category', ...(s.from !== 'blank' ? ['from' as const] : []), ...(s.to !== 'blank' ? ['to' as const] : []), 'review']
}

/** A step that can't be left empty: the category, and an account the kind requires. */
export function needed(step: Step, d: Draft): boolean {
  if (step === 'category') return !d.category_id
  if (step === 'from' || step === 'to') return SHAPES[d.kind][step] === 'required' && !(step === 'from' ? d.from_id : d.to_id)
  return false
}

/** A step counts as done when the draft has its answer, or when it's been shown and may stay empty (a name, an
 *  optional To). Shown but still needed isn't done: going back to page 2 and on again used to jump past a category
 *  you'd looked at and not picked, straight to the review. */
export function filled(step: Step, d: Draft, seen: ReadonlySet<Step>): boolean {
  if (needed(step, d)) return false
  if (seen.has(step)) return true
  if (step === 'what') return !!d.what.trim()
  if (step === 'category') return !!d.category_id
  if (step === 'from') return !!d.from_id
  if (step === 'to') return !!d.to_id
  return false
}

/** The page after `from`, for Next: one on, or the review when nothing after `from` is still to answer (a Coffee chip
 *  with no saved amount, once the amount is typed). */
export function stepAfter(from: Step, d: Draft, seen: ReadonlySet<Step> = new Set()): Step {
  const steps = stepsFor(d.kind)
  const rest = steps.slice(steps.indexOf(from) + 1)
  return rest.every((s) => s === 'review' || filled(s, d, seen)) ? 'review' : rest[0] ?? 'review'
}

/** The first step after `from` still missing something, for a shortcut that fills several at once. */
export function nextStep(from: Step, d: Draft, seen: ReadonlySet<Step>): Step {
  const steps = stepsFor(d.kind)
  return steps.slice(steps.indexOf(from) + 1).find((s) => !filled(s, d, seen)) ?? 'review'
}

/** The steps a quick action or a past entry answers for you: its category and accounts, even an optional To it leaves
 *  empty (a Saving chip with no To walked every page to reach the review). Counted as seen, so Next can pass them; a
 *  step still needed (no category, a required account missing) stays unanswered all the same. */
export const answeredBy = (kind: CatType): Step[] => stepsFor(kind).filter((s) => s === 'category' || s === 'from' || s === 'to')
