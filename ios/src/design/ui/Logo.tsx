// A place's or a bank's real logo in a circle, over the symbol that stands in for it. The symbol shows at once; the
// logo fades in on top when the server has one (it answers 404 when it doesn't, and the symbol simply stays). A name
// being typed waits until the typing pauses before asking for its logo.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import type { SFSymbol } from 'expo-symbols'
import { api } from '@/lib/api'
import { authHeaders, useServer } from '@/lib/server'
import { useLogoEpoch } from '../actions'
import { useLedger } from '../ledger'
import { usePalette } from '../theme'
import { SF } from './SF'
import { Txt } from './Txt'

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const
/** Logos the server said it doesn't have (404) this session, by server, token and what was asked. A failure that
 *  wasn't a 404 (offline, a refused token) isn't remembered, so the logo is asked for again later. */
const missed = new Set<string>()

/** Forget this session's misses: one (by its key), or all. */
export const forgetLogo = (key?: string) => (key === undefined ? missed.clear() : missed.delete(key))

/** Whether an image error means the server has no logo (as opposed to not answering). */
export const isMissing = (error: string | undefined) => /\b(404|410)\b/.test(error ?? '')

/** `value`, but a change only shows once it has held for `ms` (the first value shows at once). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/** `onFound`: called once the server's logo has loaded (a screen offers Hide Logo only then).
 *  `ink`: the color of the stand-in symbol or letter (white by default; dark on a light card face). */
export function Logo({ name, account, item, size = 40, symbol, color, letter, ink = '#FFFFFF', onFound }: {
  name?: string; account?: number; item?: number; size?: number; symbol?: SFSymbol; color?: string; letter?: boolean; ink?: string; onFound?: () => void
}) {
  const p = usePalette()
  const server = useServer((s) => s.url)
  const token = useServer((s) => s.token)
  const epoch = useLogoEpoch((s) => s.n)
  const L = useLedger()
  const settledName = useSettled(name, 400)
  const typing = settledName !== name // a name still changing: the symbol, no request yet
  const tag = account !== undefined ? `${L.acct.get(account)?.name ?? ''}|${L.acct.get(account)?.bank ?? ''}` : item !== undefined ? name ?? '' : undefined
  const key = `${server}|${token}|${epoch}|${item ?? ''}|${account ?? ''}|${(name ?? '').toLowerCase()}|${tag ?? ''}`
  const want = !typing && (item !== undefined || account !== undefined || !!name?.trim()) && !missed.has(key)
  // Shown for the image it loaded only: a new name or account starts on its symbol again, never a blank circle.
  const [loaded, setLoaded] = useState<string | null>(null)
  const shown = want && loaded === key
  const initial = (name ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase()
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <View style={{ ...FILL, alignItems: 'center', justifyContent: 'center', backgroundColor: letter || !symbol ? p.monogram[0] : (color ?? p.gray) }}>
        {letter || !symbol
          ? <Txt v="headline" color={ink} style={{ fontSize: size * 0.42, lineHeight: size * 0.5, fontWeight: '600' }}>{initial || '·'}</Txt>
          : <SF name={symbol} size={size * 0.46} color={ink} weight="semibold" />}
      </View>
      {want && (
        <Image key={key} source={{ uri: `${api.logoUrl(item !== undefined ? { item, tag } : account !== undefined ? { account, tag } : { name })}&v=${epoch}`, headers: authHeaders() }}
          cachePolicy="disk" transition={180} contentFit="cover"
          style={{ ...FILL, opacity: shown ? 1 : 0, backgroundColor: shown ? '#FFFFFF' : 'transparent' }}
          onLoad={() => { setLoaded(key); onFound?.() }}
          onError={(e) => { if (isMissing(e?.error)) missed.add(key); setLoaded(null) }} />
      )}
      <View pointerEvents="none" style={{ ...FILL, borderRadius: size / 2, borderWidth: 0.5, borderColor: p.separator, opacity: shown ? 1 : 0 }} />
    </View>
  )
}
