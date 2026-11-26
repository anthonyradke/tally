// Category symbols chosen by the words in a name, and the color arithmetic behind cards, capsules and washes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrast, deepen, DARK_INK, inkFor, LIGHT_INK, luminance, rgbOf, stableColor, washable } from '@/design/color'
import { categoryLook } from '@/design/look'
import { TINT, TINT_FILL } from '@/design/theme'

const sym = (name: string, type: 'Spending' | 'Money in' | 'Saving' | 'Transfer' | 'Loan' = 'Spending') => categoryLook({ name, type }).symbol

test('category words match from the start of a word', () => {
  assert.equal(sym('Entertainment'), 'tv.fill')
  assert.equal(sym('Rent'), 'house.fill')
  assert.equal(sym('Theater'), 'square.grid.2x2.fill')
  assert.equal(sym('Heating'), 'square.grid.2x2.fill')
  assert.equal(sym('Eating Out'), 'fork.knife')
  assert.equal(sym('Emergency Fund', 'Saving'), 'chart.line.uptrend.xyaxis')
  assert.equal(sym('Refunds', 'Money in'), 'arrow.down')
  assert.equal(sym('Fun Money'), 'tv.fill')
  assert.equal(sym('Fees & Charges'), 'exclamationmark.circle.fill')
  assert.equal(sym('Interest charge'), 'exclamationmark.circle.fill')
  assert.equal(sym('EV Charging'), 'bolt.car.fill')
  assert.equal(sym('Flowers'), 'square.grid.2x2.fill')
  assert.equal(sym("Lowe's"), 'square.grid.2x2.fill')
  assert.equal(sym('Petrol'), 'fuelpump.fill')
  assert.equal(sym('Pet Care'), 'pawprint.fill')
  assert.equal(sym('Alphabet'), 'square.grid.2x2.fill')
  assert.equal(sym('Sports Bets'), 'suit.spade.fill')
  assert.equal(sym('Cards & Stationery'), 'square.grid.2x2.fill')
  assert.equal(sym('Car Insurance'), 'car.fill')
  assert.equal(sym('Groceries'), 'cart.fill')
  assert.equal(sym('Credit Card Payment', 'Transfer'), 'creditcard.fill')
  assert.equal(sym('Lent to a friend', 'Loan'), 'arrow.uturn.left')
})

test('contrast and ink', () => {
  assert.ok(Math.abs(contrast('#000000', '#FFFFFF') - 21) < 0.01)
  assert.equal(rgbOf('#abc')?.join(), '170,187,204')
  assert.equal(rgbOf('nope'), null)
  // brand greens and oranges that took white text at under 3:1
  for (const c of ['#00C805', '#34A853', '#FF6000', '#E3E5E8']) assert.equal(inkFor(c), DARK_INK, c)
  for (const c of ['#0D2F6E', '#1C4A78', '#3A3A3C', '#B5442C']) assert.equal(inkFor(c), LIGHT_INK, c)
  for (const c of ['#00C805', '#34A853', '#FF6000', '#E3E5E8', '#0D2F6E']) assert.ok(contrast(c, inkFor(c)) >= 4.5, c)
})

test('filled tint and deepened capsules carry white text', () => {
  assert.ok(contrast(TINT_FILL, '#FFFFFF') >= 4.5)
  assert.ok(contrast(TINT.dark, '#FFFFFF') < 3) // why fills don't use the dark-mode tint
  for (const c of ['#34C759', '#30D158', '#30D398', '#FFCC00', '#007AFF']) {
    const d = deepen(c)
    assert.ok(contrast(d, '#FFFFFF') >= 3, `${c} -> ${d}`)
    assert.ok(luminance(d) <= luminance(c))
  }
  assert.equal(deepen('#0D2F6E'), '#0D2F6E') // already deep: untouched
})

test('a wash only for real colors, and a steady color per bank', () => {
  for (const c of ['#000000', '#111111', '#FFFFFF', '#F5F5F5', '#808080', '#6B6F73', null, 'nope']) assert.equal(washable(c), false, String(c))
  for (const c of ['#E31837', '#00704A', '#1DB954', '#0071CE', '#FF9900']) assert.equal(washable(c), true, c)
  assert.equal(stableColor('Chase'), stableColor(' chase '))
  const seen = new Set(['Chase', 'Wells Fargo', 'SoFi', 'American Express', 'Schwab', 'Discover'].map(stableColor))
  assert.ok(seen.size >= 4)
  for (const c of seen) assert.ok(contrast(c, '#FFFFFF') >= 4.5, c)
})
