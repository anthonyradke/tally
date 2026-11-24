// The welcome setup's shared state: the connected banks as setup would make them, and your choices so far.
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { api } from '@/lib/api'

export const useSetupStatus = () => useQuery({ queryKey: ['setup', 'status'], queryFn: api.setup.status, staleTime: 0 })

interface Choices { names: Record<number, string>; off: Record<number, boolean>; history: 'all' | 'month' }
export const useChoices = create<Choices>(() => ({ names: {}, off: {}, history: 'all' }))
