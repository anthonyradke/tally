// A loan's payoff at the rate it's being paid, and what a little more each month would change. Read-only: it uses the
// same monthly rule as the balances (lib/loans.ts).
import { useState } from 'react'
import { View } from 'react-native'
import type { Account, Bootstrap, Txn } from '@/lib/api'
import { monthLabel } from '@/lib/dates'
import { extraFor, monthlyPayment, project, span, type Projection } from '@/lib/loans'
import { formatCents } from '@/lib/money'
import { monthsNow } from '@/lib/months'
import { space } from '@/theme'
import { Hairline, Panel, Section } from './Panel'
import { Slider } from './Slider'
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
          <>
            <Txt variant="callout" tone="label2">Log a payment to this loan, or add it under Recurring, to see when it will be paid off.</Txt>
            <Hairline />
            <Lump balance={balance} rate={a.loan_rate} payment={0} from={cur.month} base={null} />
          </>
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
            <Hairline />
            <Lump balance={balance} rate={a.loan_rate} payment={pay.cents} from={cur.month} base={p} />
          </>
        )}
      </Panel>
    </Section>
  )
}

/** What if a lump sum went in now (a bonus, or money from selling something): drag to pick it, in round steps. */
function Lump({ balance, rate, payment, from, base }: { balance: number; rate: number | null; payment: number; from: string; base: Projection | null }) {
  const [step, setStep] = useState(0)
  const size = balance <= 500000 ? 10000 : balance <= 5000000 ? 50000 : 100000 // $100, $500 or $1,000 steps
  const steps = Math.ceil(balance / size)
  const lump = Math.min(step * size, balance)
  const q = lump && lump < balance && base ? project(balance - lump, rate, payment, from) : null
  // With no payments yet, the interest a month is what's worth knowing: what's left keeps growing by it.
  const monthly = (cents: number) => Math.round(cents * (rate ?? 0) / 12)
  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt variant="headline">What if you paid some now</Txt>
        <Txt variant="headline" num>{formatCents(lump, { cents: false })}</Txt>
      </View>
      <Slider value={step} steps={steps} onChange={setStep} label="One-time payment" />
      <Txt variant="callout" tone="label2" num>
        {!lump ? 'Drag to try a one-time payment, like a bonus or money from selling something.'
          : lump >= balance ? `That clears it today${base && base.interest > 0 ? ` and saves about ${formatCents(base.interest, { cents: false })} of interest` : rate ? `, and the ${formatCents(monthly(balance))} of interest it adds each month stops` : ''}.`
          : !base ? `${formatCents(balance - lump, { cents: false })} would be left${rate ? `, adding ${formatCents(monthly(balance - lump))} of interest a month instead of ${formatCents(monthly(balance))}` : ''}.`
          : q ? `Paid off by ${monthLabel(q.payoff, 'long')}${base!.months > q.months ? `, ${span(base!.months - q.months)} sooner` : ''}${base!.interest - q.interest > 0 ? `, saving about ${formatCents(base!.interest - q.interest, { cents: false })} of interest` : ''}.`
          : 'Still not on track at the same monthly payment.'}
      </Txt>
    </View>
  )
}
