// What each api.ts call promises its caller, by name, for test/contract.ts. Keep in step with `api` in src/lib/api.ts.
import type { api } from '@/lib/api'

type R<K extends keyof typeof api> = Awaited<ReturnType<(typeof api)[K]>>

export interface Shapes {
  bootstrap: R<'bootstrap'>
  admin: R<'admin'>
  page: R<'transactions'>
  txn: R<'createTxn'>
  txns: R<'createSplit'>
  bulk: R<'bulk'>
  reconciliations: R<'reconciliations'>
  diagnosis: R<'reconcile'>
  monthEnd: R<'monthEnd'>
  backups: R<'backups'>
  account: R<'saveAccount'>
  category: R<'saveCategory'>
  favorite: R<'saveFavorite'>
  recurring: R<'saveRecurring'>
  view: R<'saveView'>
  settings: R<'putSettings'>
  ok: unknown
}
