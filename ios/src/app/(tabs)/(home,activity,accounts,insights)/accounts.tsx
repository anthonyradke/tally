import { RefreshControl, ScrollView, View } from 'react-native'
import { Glow } from '@/components/Glow'
import { Icon } from '@/components/Icon'
import { Mark } from '@/components/Mark'
import { Money } from '@/components/Money'
import { Hairline, Panel } from '@/components/Panel'
import { RollingMoney } from '@/components/Rolling'
import { StateView } from '@/components/StateView'
import { Tap } from '@/components/Tap'
import { Txt } from '@/components/Txt'
import { KIND_LABEL, KIND_SYMBOL } from '@/icons/categories'
import type { Account, Bootstrap, Kind } from '@/lib/api'
import { groupTotal, split, useBalancesToday } from '@/lib/balances'
import { formatCents } from '@/lib/money'
import { monthsNow } from '@/lib/months'
import { usePullRefresh } from '@/lib/refresh'
import { useTally } from '@/lib/tally'
import { font as ramp, radius, space, useTheme } from '@/theme'

const ORDER: Kind[] = ['cash', 'card', 'investment', 'loan']

export const bankKey = (a: Pick<Account, 'bank' | 'kind'>) => a.bank ?? (a.kind === 'investment' ? 'roth' : 'hsa')

export default function Accounts() {
  const { q, b } = useTally()
  const pull = usePullRefresh(q.refetch)
  const { c } = useTheme()
  const bal = useBalancesToday(b)
  return (
    <>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space.l, paddingBottom: 120, gap: space.xxl }}
        refreshControl={<RefreshControl {...pull} />}>
        <Glow />
        {b ? <Body b={b} bal={bal} /> : <StateView q={q} />}
      </ScrollView>
    </>
  )
}

function Body({ b, bal }: { b: Bootstrap; bal: Map<number, number> }) {
  const { c } = useTheme()
  const { assets, debts, net } = split(b, bal)
  const { prev } = monthsNow(b)
  const total = assets + debts || 1
  return (
    <>
      <View style={{ gap: space.m, paddingHorizontal: space.xs }}>
        <View style={{ gap: 2 }}>
          <Txt variant="sub" tone="label2" style={{ fontSize: 15 }}>Net worth today</Txt>
          <RollingMoney cents={net} style={{ ...ramp.hero, color: c.label }} />
        </View>
        {/* What you own against what you owe, one bar. */}
        <View style={{ height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden', gap: 2 }}>
          <View style={{ flex: assets / total, backgroundColor: c.pos }} />
          <View style={{ flex: debts / total, backgroundColor: c.neg }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ gap: 1 }}>
            <Txt variant="foot" tone="label2">Assets</Txt>
            <Money cents={assets} whole variant="headline" />
          </View>
          <View style={{ gap: 1, alignItems: 'flex-end' }}>
            <Txt variant="foot" tone="label2">Debts</Txt>
            <Money cents={debts} whole variant="headline" />
          </View>
        </View>
      </View>
      {ORDER.map((k) => {
        const list = b.accounts.filter((a) => a.kind === k && a.active)
        if (!list.length) return null
        const sum = list.reduce((n, a) => n + (bal.get(a.id) ?? 0), 0)
        return (
          <View key={k} style={{ gap: space.s }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.xs }}>
              <Txt variant="title2" accessibilityRole="header">{KIND_LABEL[k]}</Txt>
              <Txt variant="callout" tone="label2" num>{groupTotal(sum, k)}</Txt>
            </View>
            <Panel pad={false} style={{ paddingVertical: space.xs }}>
              {list.map((a, i) => (
                <View key={a.id}>
                  {i > 0 && <Hairline inset={space.l + 40 + space.m} />}
                  <AccountRow a={a} bal={bal.get(a.id) ?? 0} prev={prev?.balances[String(a.id)]} ef={b.ef} />
                </View>
              ))}
            </Panel>
          </View>
        )
      })}
      <Tap href="/settings/accounts" feedback="opacity" style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, padding: space.s }}>
        <Icon sf="slider.horizontal.3" md="tune" size={14} color={c.label2} />
        <Txt variant="callout" tone="label2">Manage accounts</Txt>
      </Tap>
    </>
  )
}

function AccountRow({ a, bal, prev }: { a: Account; bal: number; prev?: number; ef: Bootstrap['ef'] }) {
  const { c, bank } = useTheme()
  const owed = a.kind === 'card' || a.kind === 'loan'
  const delta = prev != null ? bal - prev : null
  // For debts, going down is good.
  const good = delta != null && (owed ? delta < 0 : delta > 0)
  const sub = a.apy ? `${+(a.apy * 100).toFixed(2)}% APY` : a.loan_rate ? `${+(a.loan_rate * 100).toFixed(2)}% interest` : a.ef ? 'Emergency fund' : a.kind === 'investment' ? 'Updated at month end' : null
  return (
    <Tap feedback="highlight" href={{ pathname: '/account/[id]', params: { id: String(a.id) } }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m }}>
      <Mark kind="glyph" sf={KIND_SYMBOL[a.kind][0]} md={KIND_SYMBOL[a.kind][1]} tint={bank(bankKey(a))} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="row" numberOfLines={1}>{a.name}</Txt>
        {(sub || a.ef) && (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {sub && <Txt variant="sub" tone="label2">{sub}</Txt>}
            {a.ef && !!a.apy && <View style={{ paddingHorizontal: 6, height: 18, borderRadius: radius.pill, backgroundColor: c.fill, justifyContent: 'center' }}><Txt variant="foot" tone="label2">Emergency fund</Txt></View>}
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Money cents={bal} />
        {delta != null && delta !== 0 && (
          <Txt variant="sub" num tone={good ? 'pos' : 'neg'}>{delta > 0 ? '+' : '−'}{formatCents(Math.abs(delta), { cents: false })}</Txt>
        )}
      </View>
    </Tap>
  )
}
