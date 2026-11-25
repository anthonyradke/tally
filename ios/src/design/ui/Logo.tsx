// A place's or a bank's real logo in a circle, over the symbol that stands in for it. The symbol shows at once; the
// logo fades in on top when the server has one (it answers 404 when it doesn't, and the symbol simply stays).
import { useState } from 'react'
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
const missed = new Set<string>()

/** Forget this session's misses (after a logo is hidden or shown again). */
export const forgetLogo = (key: string) => missed.delete(key)

/** `onFound`: called once the server's logo has loaded (a screen offers Hide Logo only then). */
export function Logo({ name, account, item, size = 40, symbol, color, letter, onFound }: {
  name?: string; account?: number; item?: number; size?: number; symbol?: SFSymbol; color?: string; letter?: boolean; onFound?: () => void
}) {
  const p = usePalette()
  const server = useServer((s) => s.url)
  const epoch = useLogoEpoch((s) => s.n)
  const L = useLedger()
  const tag = account !== undefined ? `${L.acct.get(account)?.name ?? ''}|${L.acct.get(account)?.bank ?? ''}` : item !== undefined ? name ?? '' : undefined
  const key = `${server}|${epoch}|${item ?? ''}|${account ?? ''}|${(name ?? '').toLowerCase()}|${tag ?? ''}`
  const want = (item !== undefined || account !== undefined || !!name?.trim()) && !missed.has(key)
  const [shown, setShown] = useState(false)
  const initial = (name ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase()
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <View style={{ ...FILL, alignItems: 'center', justifyContent: 'center', backgroundColor: letter || !symbol ? p.monogram[0] : (color ?? p.gray) }}>
        {letter || !symbol
          ? <Txt v="headline" color="#FFFFFF" style={{ fontSize: size * 0.42, lineHeight: size * 0.5, fontWeight: '600' }}>{initial || '·'}</Txt>
          : <SF name={symbol} size={size * 0.46} color="#FFFFFF" weight="semibold" />}
      </View>
      {want && (
        <Image source={{ uri: `${api.logoUrl(item !== undefined ? { item, tag } : account !== undefined ? { account, tag } : { name })}&v=${epoch}`, headers: authHeaders() }}
          cachePolicy="disk" recyclingKey={key} transition={shown ? 0 : 180} contentFit="cover"
          style={{ ...FILL, opacity: shown ? 1 : 0, backgroundColor: shown ? '#FFFFFF' : 'transparent' }}
          onLoad={() => { setShown(true); onFound?.() }} onError={() => { missed.add(key); setShown(false) }} />
      )}
      <View pointerEvents="none" style={{ ...FILL, borderRadius: size / 2, borderWidth: 0.5, borderColor: p.separator, opacity: shown ? 1 : 0 }} />
    </View>
  )
}
