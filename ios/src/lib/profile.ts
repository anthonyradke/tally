// Switching between the real Tally and Tally Lab (lib/server.ts). Everything the phone holds for one server goes
// before the other's is loaded: the query cache is emptied first, so no screen can show one server's figures as the
// other's, and the outbox and Catch up's marks are reloaded from the new server's own keys. The root layout keys
// the cache saved on the phone by server and remounts on the switch.
import { queryClient } from './data'
import { loadCaughtUp, useCaughtUp } from './caughtUp'
import { loadOutbox, useOutbox } from './outbox'
import { selectServer, useServer, type Profile } from './server'

export async function switchProfile(p: Profile) {
  if (useServer.getState().profile === p) return
  queryClient.clear()
  useOutbox.setState({ items: [] })
  useCaughtUp.setState({ at: {}, off: {} })
  await selectServer(p)
  queryClient.clear() // anything a mounted screen fetched from the old server while the new one was being read
  await Promise.all([loadOutbox(), loadCaughtUp()])
}
