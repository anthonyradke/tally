// A reconciliation saved in one tap (a match in Reconcile, "Bank says the same" in Catch up) says so in a toast with
// Undo, like any other change that doesn't ask first. One that matched also counts as catching the account up.
import { api, ApiError, type Account, type Diagnosis } from './api'
import { markCaughtUp, unmarkCaughtUp } from './caughtUp'
import { queryClient } from './data'
import { formatCents } from './money'
import { toast } from './toast'

const refresh = () => queryClient.invalidateQueries({ queryKey: ['reconciliations'] }).catch(() => {})

/** Toasts a saved reconciliation of `a`; Undo deletes it and then runs `undone`. */
export function toastReconciled(a: Pick<Account, 'id' | 'name'>, r: Diagnosis, undone?: () => void) {
  refresh()
  if (r.id == null) return
  const id = r.id
  const before = r.gap === 0 ? markCaughtUp(a.id) : null
  toast({
    text: r.gap === 0 ? `${a.name} reconciled` : `Saved with a ${formatCents(Math.abs(r.gap))} gap`,
    action: { label: 'Undo', run: async () => {
      try {
        await api.deleteReconciliation(id)
        refresh()
        if (before !== null) unmarkCaughtUp(a.id, before)
        undone?.()
      } catch (e) {
        toast({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable.", tone: 'error' })
      }
    } },
  })
}
