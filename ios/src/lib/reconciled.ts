// A reconciliation saved in one tap (a match in Reconcile, "Bank says the same" in Catch up) says so in a toast with
// Undo, like any other change that doesn't ask first.
import { api, ApiError, type Diagnosis } from './api'
import { queryClient } from './data'
import { formatCents } from './money'
import { toast } from './toast'

const refresh = () => queryClient.invalidateQueries({ queryKey: ['reconciliations'] }).catch(() => {})

/** Toasts a saved reconciliation of `name`; Undo deletes it and then runs `undone`. */
export function toastReconciled(name: string, r: Diagnosis, undone?: () => void) {
  refresh()
  if (r.id == null) return
  const id = r.id
  toast({
    text: r.gap === 0 ? `${name} reconciled` : `Saved with a ${formatCents(Math.abs(r.gap))} gap`,
    action: { label: 'Undo', run: async () => {
      try {
        await api.deleteReconciliation(id)
        refresh()
        undone?.()
      } catch (e) {
        toast({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't undo: Tally is unreachable.", tone: 'error' })
      }
    } },
  })
}
