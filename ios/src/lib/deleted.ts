// Recently deleted (Settings): telling the rows one delete removed from the rest.
import type { DeletedTxn } from './api'

/** Deleted rows grouped by the delete that removed them, newest first (the list already comes newest first, a
 *  group's rows next to each other). `batch` marks one delete; rows from before it was kept only have the second
 *  they went, which two separate deletes can share. */
export function byDelete(rows: DeletedTxn[]): DeletedTxn[][] {
  const out: DeletedTxn[][] = []
  for (const r of rows) {
    const last = out[out.length - 1]
    if (last && last[0].deleted_at === r.deleted_at && (last[0].batch ?? null) === (r.batch ?? null)) last.push(r)
    else out.push([r])
  }
  return out
}

/** A listed row as /transactions/restore takes it back. */
export const asEntry = ({ deleted_at: _gone, batch: _batch, ...entry }: DeletedTxn) => entry
