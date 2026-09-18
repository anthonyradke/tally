import type { CatType } from '@/api/client'

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
