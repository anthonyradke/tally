import { createContext, useContext } from 'react'
import type { Favorite, Txn } from '@/api/client'

export interface AddApi {
  /** Open the entry sheet: blank, from a quick-action favorite, editing a row, or duplicating one as a new entry. */
  open: (seed?: { favorite?: Favorite; edit?: Txn; duplicate?: Txn }) => void
  close: () => void
}

export const AddContext = createContext<AddApi>({ open: () => {}, close: () => {} })
export const useAdd = () => useContext(AddContext)
