import { createContext, useContext } from 'react'
import type { Favorite, Txn } from '@/api/client'

export interface AddApi {
  /** Open the entry sheet: blank, from a quick-action favorite, or editing an existing row. */
  open: (seed?: { favorite?: Favorite; edit?: Txn }) => void
  close: () => void
}

export const AddContext = createContext<AddApi>({ open: () => {}, close: () => {} })
export const useAdd = () => useContext(AddContext)
