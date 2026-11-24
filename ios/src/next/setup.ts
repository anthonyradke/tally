// The welcome setup's shared state: the connected banks as setup would make them, and your choices so far.
import { useEffect } from 'react'
import { router, useIsFocused } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { api } from '@/lib/api'

export const useSetupStatus = () => useQuery({ queryKey: ['setup', 'status'], queryFn: api.setup.status, staleTime: 0 })

/** Closes the whole welcome flow and lands on Summary. (dismissAll only went back to the welcome's first page.) */
export const leaveWelcome = () => router.dismissTo('/next')

/** A welcome page in front on a ledger that's already set up (setup finished on another try, or the flow came back
 *  up) leaves at once instead of offering setup again. Only the page in front: the ones under the last page see the
 *  ledger become set up too, and must not close the flow under it. */
export function useLeaveIfSetUp() {
  const s = useSetupStatus()
  const focused = useIsFocused()
  useEffect(() => { if (focused && s.data && !s.data.needed) leaveWelcome() }, [s.data, focused])
}

interface Choices { names: Record<number, string>; off: Record<number, boolean>; history: 'all' | 'month' }
export const useChoices = create<Choices>(() => ({ names: {}, off: {}, history: 'all' }))
