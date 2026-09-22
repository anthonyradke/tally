import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, X } from 'lucide-react'
import { discard, flush, useOutbox } from '@/lib/outbox'
import { dayLabel } from '@/lib/dates'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import s from './Outbox.module.css'

/** Mounted once in App: posts queued entries on launch, when the device comes back online, when the app returns
 *  to the foreground, and every 20 s while anything is waiting. */
export function OutboxSync() {
  const pending = useOutbox().length > 0
  const qc = useQueryClient()
  const toast = useToast()
  useEffect(() => {
    if (!pending) return
    const go = () => flush().then((n) => {
      if (!n) return
      qc.invalidateQueries({ queryKey: ['transactions'] }); qc.invalidateQueries({ queryKey: ['bootstrap'] })
      toast.show({ message: n === 1 ? 'Synced 1 offline entry' : `Synced ${n} offline entries` })
    })
    const onVisible = () => { if (document.visibilityState === 'visible') go() }
    go()
    window.addEventListener('online', go)
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(go, 20_000)
    return () => { window.removeEventListener('online', go); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(id) }
  }, [pending, qc, toast])
  return null
}

/** "2 entries waiting to sync" above Home and Activity; tap for the list, with Discard for ones Tally refused. */
export function OutboxNotice() {
  const items = useOutbox()
  const [open, setOpen] = useState(false)
  const [trying, setTrying] = useState(false)
  const failed = items.filter((q) => q.error).length
  return (
    <>
      {items.length > 0 && <button type="button" className={`${s.notice} ${failed ? s.failed : ''}`} onClick={() => setOpen(true)}>
        <CloudOff strokeWidth={2} absoluteStrokeWidth />
        {failed ? `${failed === 1 ? '1 entry' : `${failed} entries`} couldn't sync` : `${items.length === 1 ? '1 entry' : `${items.length} entries`} waiting to sync`}
      </button>}
      {/* Stays mounted so it slides away when the last entry syncs. */}
      <Sheet open={open && items.length > 0} onClose={() => setOpen(false)} title="Waiting to sync"
        action={<button type="button" className={s.retry} disabled={trying} onClick={() => { setTrying(true); flush().finally(() => setTrying(false)) }}>{trying ? 'Trying…' : 'Try now'}</button>}>
        <p className="secondary">Saved on this device while Tally was out of reach. They post themselves once it's back, and won't be added twice.</p>
        <ul className={s.list}>
          {items.map((q) => (
            <li key={q.cid} className={s.item}>
              <span className={s.text}>
                <span className={s.label}>{q.label}</span>
                <span className="secondary">{dayLabel(q.lines[0].date)}</span>
                {q.error && <span className={s.error}>{q.error}</span>}
              </span>
              <button type="button" className={s.discard} onClick={() => discard(q.cid)} aria-label={`Discard ${q.label}`}><X strokeWidth={2.5} absoluteStrokeWidth /></button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
