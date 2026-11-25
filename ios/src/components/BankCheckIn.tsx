// Opening Tally on a server with bank sync checks the banks and, when something is waiting,
// brings up the check-in: once on the first open of the day, and again whenever a new row has come in since.
// It only interrupts from a tab's main screen, never over a sheet or the composer.
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { router, usePathname } from 'expo-router'
import { freshBank, loadSeen, newestId, saveSeen, shouldCheckIn } from '@/lib/bank'
import { todayISO } from '@/lib/dates'

const ROOTS = new Set(['/', '/activity', '/accounts'])

export function BankCheckIn() {
  const pathname = usePathname()
  const path = useRef(pathname)
  path.current = pathname // eslint-disable-line react-hooks/refs

  useEffect(() => {
    let running = false
    const check = async () => {
      if (running || AppState.currentState !== 'active') return
      running = true
      try {
        const got = await freshBank()
        if (!got) return
        const today = todayISO()
        if (!shouldCheckIn(got.rows, got.status.ask.length, await loadSeen(), today)) return
        if (!ROOTS.has(path.current)) return
        await saveSeen({ day: today, maxId: newestId(got.rows) })
        router.push('/check-in')
      } catch {
        // offline or the server is down: the next open tries again
      } finally { running = false }
    }
    const first = setTimeout(check, 1600) // after the launch animation has lifted
    let later: ReturnType<typeof setTimeout> | undefined
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { clearTimeout(later); later = setTimeout(check, 900) }
    })
    return () => { clearTimeout(first); clearTimeout(later); sub.remove() }
  }, [])

  return null
}
