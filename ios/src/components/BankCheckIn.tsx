// Opening Tally on a server with bank sync checks the banks and, when something is waiting,
// brings up the check-in: once on the first open of the day, and again whenever a new row has come in since.
// It only interrupts someone still on the tab's main screen where the look began, never over a sheet, the composer
// or a screen opened since; coming back from Control Center or Face ID doesn't count as opening, and the banks are
// looked at no more than every few minutes.
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { router, usePathname } from 'expo-router'
import { freshBank, newestId, shouldCheckIn } from '@/lib/bank'
import { todayISO } from '@/lib/dates'
import { getServer } from '@/lib/server'
import { loadSeenFor, mayPop, saveSeenFor, shouldLook } from '@/design/checkin'

const ROOTS = new Set(['/', '/activity', '/insights', '/accounts'])

export function BankCheckIn() {
  const pathname = usePathname()
  const path = useRef(pathname)
  path.current = pathname // eslint-disable-line react-hooks/refs

  useEffect(() => {
    let running = false
    let last = 0
    let wasBackground = false
    const check = async () => {
      if (running || AppState.currentState !== 'active' || !ROOTS.has(path.current)) return
      running = true
      const startPath = path.current
      const startedAt = Date.now()
      last = startedAt
      try {
        const got = await freshBank()
        if (!got) return
        const server = getServer()
        const today = todayISO()
        if (!shouldCheckIn(got.rows, got.status.ask.length, await loadSeenFor(server), today)) return
        if (!mayPop({ roots: ROOTS, startPath, path: path.current, startedAt, now: Date.now(), active: AppState.currentState === 'active' })) return
        await saveSeenFor(server, { day: today, maxId: newestId(got.rows) })
        router.push('/check-in')
      } catch {
        // offline or the server is down: the next open tries again
      } finally { running = false }
    }
    const first = setTimeout(check, 1600) // after the launch animation has lifted
    let later: ReturnType<typeof setTimeout> | undefined
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') wasBackground = true
      if (s !== 'active') { clearTimeout(later); return }
      const go = shouldLook(wasBackground, last, Date.now())
      wasBackground = false
      if (go) { clearTimeout(later); later = setTimeout(check, 900) }
    })
    return () => { clearTimeout(first); clearTimeout(later); sub.remove() }
  }, [])

  return null
}
