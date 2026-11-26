// Links into Tally (tally://add?amount=…, from a Wallet automation or anywhere) wait while Face ID is still to pass,
// or before its setting has loaded, and open once Tally is unlocked (app/_layout.tsx, HeldLink): a sheet opened
// straight away sat above the lock.
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
