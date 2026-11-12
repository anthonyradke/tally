// Links into Tally (tally://new?amount=…, from a Wallet automation or anywhere) while Face ID lock is on: they wait
// until Tally is unlocked (LockScreen opens them), since a sheet opened straight away sat above the lock.
import { holdLink, lockedNow } from '@/lib/lock'

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (!lockedNow()) return path
    holdLink(path)
    return null
  } catch {
    return path
  }
}
