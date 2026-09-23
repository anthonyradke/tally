import type { CatType } from '@/lib/api'

// Mirrors engine.SHAPES: which of From / To a category type needs. The server re-validates.
export type Rule = 'required' | 'blank' | 'optional'
export const SHAPES: Record<CatType, { from: Rule; to: Rule }> = {
  'Money in': { from: 'blank', to: 'required' },
  'Spending': { from: 'required', to: 'blank' },
  'Transfer': { from: 'required', to: 'required' },
  'Saving':   { from: 'required', to: 'optional' },
  'Loan':     { from: 'required', to: 'optional' },
}
export const HINT: Record<CatType, string> = {
  'Money in': 'Where did it land?',
  'Spending': 'What paid for it?',
  'Transfer': 'From one account to another.',
  'Saving': 'Leaves From; To is optional.',
  'Loan': 'Leaves From; To is the loan if you track one.',
}

/** Whether an entry's From/To satisfy a category type's rules (mirrors engine.validate). */
export function fits(t: { from_id: number | null; to_id: number | null }, type: CatType): boolean {
  const r = SHAPES[type]
  const ok = (rule: Rule, v: number | null) => (rule === 'required' ? !!v : rule === 'blank' ? !v : true)
  return ok(r.from, t.from_id) && ok(r.to, t.to_id) && !(t.from_id && t.from_id === t.to_id)
}
