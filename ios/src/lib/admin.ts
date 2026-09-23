import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { invalidateAll } from './data'
import { toast } from './toast'

/** Settings data: every account/category including hidden ones, with their sort order. */
export const useAdmin = () => useQuery({ queryKey: ['admin'], queryFn: api.admin })

/** Run a settings write, refresh everything, and report a refusal in words. Returns whether it worked. */
export async function write(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
  try {
    await fn()
    await invalidateAll()
    if (done) toast({ text: done })
    return true
  } catch (e) {
    toast({ text: e instanceof ApiError ? e.errors.join(' ') : 'Tally is unreachable. Check Tailscale.', tone: 'error' })
    return false
  }
}
