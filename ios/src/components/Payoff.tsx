// A loan's payoff at the rate it's being paid, and what a little more each month would change. Read-only: it uses the
// same monthly rule as the balances (lib/loans.ts).
import { View } from 'react-native'
import type { Account, Bootstrap, Txn } from '@/lib/api'
import { monthLabel } from '@/lib/dates'
import { extraFor, monthlyPayment, project, span } from '@/lib/loans'
import { formatCents } from '@/lib/money'
import { monthsNow } from '@/lib/months'
import { space } from '@/theme'
import { Hairline, Panel, Section } from './Panel'
import { Txt } from './Txt'

const WHERE = { recurring: 'your recurring payment', average: 'your average', month: 'paid so far this month' }

export function Payoff({ b, a, rows }: { b: Bootstrap; a: Account; rows: Txn[] }) {
  const { cur } = monthsNow(b)
  if (!cur || (a.opened && a.opened > cur.month)) return null
  const balance = cur.balances[String(a.id)] ?? 0
  if (balance <= 0) return null
  const pay = monthlyPayment(b, a, rows)
  const p = pay ? project(balance, a.loan_rate, pay.cents, cur.month) : null
  const extra = pay ? extraFor(pay.cents) : 0
  const faster = pay && p ? project(balance, a.loan_rate, pay.cents + extra, cur.month) : null
  const how = pay ? `${formatCents(pay.cents, { cents: false })} a month, ${pay.from === 'average' && pay.months! > 1 ? `${WHERE.average} over ${pay.months} months` : WHERE[pay.from]}` : ''
  return (
    <Section title="Payoff">
      <Panel style={{ gap: space.m }}>
        {!pay ? (
          <Txt variant="callout" tone="label2">Log a payment to this loan, or add it under Recurring, to see when it will be paid off.</Txt>
        ) : !p ? (
          <View style={{ gap: 2 }}>
            <Txt variant="headline">Not on track to be paid off</Txt>
            <Txt variant="callout" tone="label2" num>At {how}, the interest keeps up with the payments.</Txt>
          </View>
        ) : (
          <>
            <View style={{ gap: 2 }}>
              <Txt variant="headline" num>Paid off by {monthLabel(p.payoff, 'long')}</Txt>
              <Txt variant="callout" tone="label2" num>
                At {how}. That is {span(p.months)} from now{p.interest > 0 ? `, with about ${formatCents(p.interest, { cents: false })} more in interest` : ''}.
              </Txt>
            </View>
            {faster && faster.months < p.months && (
              <>
                <Hairline />
                <Txt variant="callout" tone="label2" num>
                  <Txt variant="callout" style={{ fontWeight: '600' }} num>{formatCents(extra, { cents: false })} more a month</Txt>
                  {` pays it off by ${monthLabel(faster.payoff, 'long')}, ${span(p.months - faster.months)} sooner`}
                  {p.interest - faster.interest > 0 ? `, and saves ${formatCents(p.interest - faster.interest, { cents: false })} of interest.` : '.'}
                </Txt>
              </>
            )}
          </>
        )}
      </Panel>
    </Section>
  )
}
