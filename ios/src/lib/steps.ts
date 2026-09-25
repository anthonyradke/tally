// The new-entry flow's steps. Which ones a kind has comes from its From/To rules, and Next goes to the first one
// still missing something, so whatever a quick action or a past entry filled in gets skipped.
import type { CatType } from './api'
import type { Draft } from './draft'
import { SHAPES } from './shapes'

export type Step = 'amount' | 'what' | 'category' | 'from' | 'to' | 'review'

export function stepsFor(kind: CatType): Step[] {
  const s = SHAPES[kind]
  return ['amount', 'what', 'category', ...(s.from !== 'blank' ? ['from' as const] : []), ...(s.to !== 'blank' ? ['to' as const] : []), 'review']
}

/** A step counts as done once it's been shown, or when the draft already has its answer. */
export function filled(step: Step, d: Draft, seen: ReadonlySet<Step>): boolean {
  if (seen.has(step)) return true
  if (step === 'what') return !!d.what.trim()
  if (step === 'category') return !!d.category_id
  if (step === 'from') return !!d.from_id
  if (step === 'to') return !!d.to_id
  return false
}

export function nextStep(from: Step, d: Draft, seen: ReadonlySet<Step>): Step {
  const steps = stepsFor(d.kind)
  return steps.slice(steps.indexOf(from) + 1).find((s) => !filled(s, d, seen)) ?? 'review'
}
