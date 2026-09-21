import * as si from 'simple-icons'
import { tintVar, type Tint } from './glyphs'

/** A row's leading mark: a real brand glyph where simple-icons has one, otherwise a brand-colored monogram. */
export type MarkSpec =
  | { kind: 'brand'; path: string; color: string; title: string }
  | { kind: 'mono'; letter: string; color: string; title: string }

type SI = { path: string; hex: string; title: string }
const brand = (i: SI, color?: string, title?: string): MarkSpec => ({ kind: 'brand', path: i.path, color: color ?? `#${i.hex}`, title: title ?? i.title })
const mono = (letter: string, color: string, title: string): MarkSpec => ({ kind: 'mono', letter, color, title })

// id → [pattern, mark]. First match wins, so specific names sit above generic words (Uber Eats before Uber).
// Ids are stored in the `merchant_marks` setting; never rename one.
const REGISTRY: Array<[string, RegExp, MarkSpec]> = [
  // Real glyphs (simple-icons, bundled)
  ['mcdonalds', /mcdonald/i, brand(si.siMcdonalds)],
  ['tesla', /tesla/i, brand(si.siTesla)],
  ['icloud', /icloud/i, brand(si.siIcloud)],
  ['appletv', /apple tv/i, brand(si.siAppletv, 'var(--fg)')],
  ['applemusic', /apple music/i, brand(si.siApplemusic)],
  ['apple', /\bapple\b/i, brand(si.siApple, 'var(--fg)')],
  ['claude', /claude|anthropic/i, brand(si.siClaude)],
  ['venmo', /venmo/i, brand(si.siVenmo)],
  ['robinhood', /robinhood/i, brand(si.siRobinhood)],
  ['target', /\btarget\b/i, brand(si.siTarget)],
  ['chase', /\bchase\b/i, brand(si.siChase, 'var(--bank-chase)')],
  ['amex', /\bamex\b|american express/i, brand(si.siAmericanexpress, 'var(--bank-amex)')],
  ['spotify', /spotify/i, brand(si.siSpotify)],
  ['netflix', /netflix/i, brand(si.siNetflix)],
  ['youtube', /youtube/i, brand(si.siYoutube)],
  ['hbomax', /\bhbo\b/i, brand(si.siHbomax, 'var(--fg)')],
  ['ubereats', /uber ?eats/i, brand(si.siUbereats)],
  ['uber', /\buber\b/i, brand(si.siUber, 'var(--fg)')],
  ['lyft', /\blyft\b/i, brand(si.siLyft)],
  ['doordash', /door ?dash/i, brand(si.siDoordash)],
  ['instacart', /instacart/i, brand(si.siInstacart)],
  ['starbucks', /starbucks/i, brand(si.siStarbucks)],
  ['burgerking', /burger king/i, brand(si.siBurgerking)],
  ['tacobell', /taco bell/i, brand(si.siTacobell)],
  ['kfc', /\bkfc\b/i, brand(si.siKfc)],
  ['shell', /\bshell\b/i, brand(si.siShell)],
  ['ikea', /\bikea\b/i, brand(si.siIkea)],
  ['ebay', /\bebay\b/i, brand(si.siEbay)],
  ['etsy', /\betsy\b/i, brand(si.siEtsy)],
  ['paypal', /paypal/i, brand(si.siPaypal)],
  ['cashapp', /cash ?app/i, brand(si.siCashapp)],
  ['zelle', /\bzelle\b/i, brand(si.siZelle)],
  ['googleplay', /google play/i, brand(si.siGoogleplay)],
  ['google', /\bgoogle\b/i, brand(si.siGoogle)],
  ['steam', /\bsteam\b/i, brand(si.siSteam, 'var(--fg)')],
  ['playstation', /playstation|\bpsn\b/i, brand(si.siPlaystation)],
  ['airbnb', /airbnb/i, brand(si.siAirbnb)],
  ['delta', /\bdelta\b/i, brand(si.siDelta)],
  ['united', /united airlines/i, brand(si.siUnitedairlines)],
  ['southwest', /southwest/i, brand(si.siSouthwestairlines)],
  ['verizon', /verizon/i, brand(si.siVerizon)],
  ['att', /\bat&t\b|\batt\b/i, brand(si.siAtandt)],
  ['audible', /audible/i, brand(si.siAudible)],
  ['twitch', /twitch/i, brand(si.siTwitch)],
  ['patreon', /patreon/i, brand(si.siPatreon, 'var(--fg)')],
  ['github', /github/i, brand(si.siGithub, 'var(--fg)')],
  ['discord', /discord/i, brand(si.siDiscord)],
  ['coinbase', /coinbase/i, brand(si.siCoinbase)],
  ['wellsfargo', /wells fargo/i, brand(si.siWellsfargo)],
  ['bofa', /bank of america|\bbofa\b/i, brand(si.siBankofamerica)],
  ['discover', /\bdiscover\b/i, brand(si.siDiscover)],
  ['peloton', /peloton/i, brand(si.siPeloton, 'var(--fg)')],
  ['nike', /\bnike\b/i, brand(si.siNike, 'var(--fg)')],
  ['lidl', /\blidl\b/i, brand(si.siLidl)],
  ['toyota', /toyota/i, brand(si.siToyota)],
  ['honda', /honda/i, brand(si.siHonda)],
  ['ford', /\bford\b/i, brand(si.siFord)],
  ['kia', /\bkia\b/i, brand(si.siKia, 'var(--fg)')],
  ['tailscale', /tailscale/i, brand(si.siTailscale, 'var(--fg)')],
  ['cloudflare', /cloudflare/i, brand(si.siCloudflare)],
  // Monograms in brand color (no glyph in simple-icons)
  ['amazon', /amazon/i, mono('a', '#FF9900', 'Amazon')],
  ['costco', /costco/i, mono('C', '#E31837', 'Costco')],
  ['walmart', /walmart/i, mono('W', '#0071CE', 'Walmart')],
  ['kingsoopers', /king soopers|kroger/i, mono('K', '#E4002B', 'King Soopers')],
  ['chickfila', /chick-?fil-?a/i, mono('C', '#DD0031', 'Chick-fil-A')],
  ['jimmyjohns', /jimmy john/i, mono('J', '#C8102E', "Jimmy John's")],
  ['littlecaesars', /little caesars/i, mono('L', '#FF6900', 'Little Caesars')],
  ['texasroadhouse', /texas roadhouse/i, mono('T', '#A3261F', 'Texas Roadhouse')],
  ['xcel', /\bxcel\b/i, mono('X', '#1F6FB2', 'Xcel Energy')],
  ['xfinity', /xfinity|comcast/i, mono('X', '#7B2CBF', 'Xfinity')],
  ['vasa', /\bvasa\b/i, mono('V', '#2F5BEA', 'Vasa Fitness')],
  ['sofi', /\bsofi\b/i, mono('S', 'var(--bank-sofi)', 'SoFi')],
  ['betr', /\bbetr\b/i, mono('B', '#16A34A', 'Betr')],
  ['liberty', /liberty health/i, mono('L', '#0E7490', 'Liberty HealthShare')],
  ['hulu', /\bhulu\b/i, mono('h', '#1CE783', 'Hulu')],
  ['disney', /disney/i, mono('D', '#113CCF', 'Disney+')],
  ['chipotle', /chipotle/i, mono('C', '#A81612', 'Chipotle')],
  ['subway', /\bsubway\b/i, mono('S', '#008C15', 'Subway')],
  ['wendys', /wendy/i, mono('W', '#E2203D', "Wendy's")],
  ['dominos', /domino/i, mono('D', '#006491', "Domino's")],
  ['pizzahut', /pizza hut/i, mono('P', '#EE3124', 'Pizza Hut')],
  ['sonic', /\bsonic\b/i, mono('S', '#0065A4', 'Sonic')],
  ['dunkin', /dunkin/i, mono('D', '#FF671F', "Dunkin'")],
  ['panera', /panera/i, mono('P', '#4A6B2B', 'Panera')],
  ['fiveguys', /five guys/i, mono('5', '#D52B1E', 'Five Guys')],
  ['chevron', /chevron/i, mono('C', '#0054A4', 'Chevron')],
  ['exxon', /exxon|\bmobil\b/i, mono('E', '#ED1B2D', 'Exxon')],
  ['seveneleven', /7-?eleven/i, mono('7', '#008061', '7-Eleven')],
  ['circlek', /circle k/i, mono('K', '#DA291C', 'Circle K')],
  ['bestbuy', /best buy/i, mono('B', '#0046BE', 'Best Buy')],
  ['homedepot', /home depot/i, mono('H', '#F96302', 'Home Depot')],
  ['lowes', /\blowe'?s\b/i, mono('L', '#004990', "Lowe's")],
  ['walgreens', /walgreens/i, mono('W', '#E31837', 'Walgreens')],
  ['cvs', /\bcvs\b/i, mono('C', '#CC0000', 'CVS')],
  ['wholefoods', /whole foods/i, mono('W', '#00674B', 'Whole Foods')],
  ['traderjoes', /trader joe/i, mono('T', '#CE1126', "Trader Joe's")],
  ['aldi', /\baldi\b/i, mono('A', '#00005F', 'Aldi')],
  ['safeway', /safeway/i, mono('S', '#E51937', 'Safeway')],
  ['openai', /openai|chatgpt/i, mono('O', 'var(--fg)', 'OpenAI')],
  ['microsoft', /microsoft|\bxbox\b/i, mono('M', '#107C10', 'Microsoft')],
  ['nintendo', /nintendo/i, mono('N', '#E60012', 'Nintendo')],
  ['adobe', /adobe/i, mono('A', '#FA0F00', 'Adobe')],
  ['tmobile', /t-?mobile/i, mono('T', '#E20074', 'T-Mobile')],
  ['geico', /geico/i, mono('G', '#154B8B', 'GEICO')],
  ['statefarm', /state farm/i, mono('S', '#E31837', 'State Farm')],
  ['progressive', /progressive/i, mono('P', '#0077C8', 'Progressive')],
  ['fidelity', /fidelity/i, mono('F', '#368727', 'Fidelity')],
  ['vanguard', /vanguard/i, mono('V', '#96151D', 'Vanguard')],
  ['schwab', /schwab/i, mono('S', '#00A0DF', 'Schwab')],
  ['capitalone', /capital one/i, mono('C', '#004977', 'Capital One')],
  ['planetfitness', /planet fitness/i, mono('P', '#5C2D91', 'Planet Fitness')],
  ['sephora', /sephora/i, mono('S', 'var(--fg)', 'Sephora')],
  ['ulta', /\bulta\b/i, mono('U', '#F58025', 'Ulta')],
  ['paycheck', /paycheck/i, mono('$', 'var(--pos)', 'Paycheck')],
]
const BY_ID = new Map(REGISTRY.map(([id, , spec]) => [id, spec]))

/** Every known mark, for the logo picker. */
export const MARK_OPTIONS = REGISTRY.filter(([id]) => id !== 'paycheck').map(([id, , spec]) => ({ id, spec }))
  .sort((a, b) => a.spec.title.localeCompare(b.spec.title))

/** The part of a description that names the merchant: lowercased, parentheticals dropped. "Costco gas (trip)" → "costco gas". */
export const merchantKey = (what: string) => what.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}&'+ -]/gu, '').replace(/\s+/g, ' ').trim()

/** User overrides, keyed by merchantKey. Value: a registry id, `tint:<tint>` (letter tile) or `category` (no mark). */
export type MarkOverrides = Record<string, string>
export function parseOverrides(raw: string | undefined): MarkOverrides {
  try { const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/** The override that applies to a description: exact key, else the longest key it starts with ("costco" covers "costco gas"). */
export function overrideKey(what: string, o: MarkOverrides): string | undefined {
  const k = merchantKey(what)
  if (k in o) return k
  return Object.keys(o).filter((x) => x && k.startsWith(x + ' ')).sort((a, b) => b.length - a.length)[0]
}

export function specFor(value: string, what: string): MarkSpec | null {
  if (value === 'category') return null
  if (value.startsWith('tint:')) {
    const letter = merchantKey(what).replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?'
    return mono(letter, tintVar(value.slice(5) as Tint), what)
  }
  return BY_ID.get(value) ?? null
}

/** Built-in pattern match only. */
export function merchantMark(what: string): MarkSpec | null {
  for (const [, re, spec] of REGISTRY) if (re.test(what)) return spec
  return null
}

/** Override first, then the built-in patterns. null = show the category glyph. */
export function resolveMark(what: string, o: MarkOverrides): MarkSpec | null {
  const k = overrideKey(what, o)
  return k ? specFor(o[k], what) : merchantMark(what)
}
