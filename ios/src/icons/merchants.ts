// Merchant marks: a real brand glyph where simple-icons has one, otherwise a brand-colored monogram. Same registry
// and ids as Tally's web app (ids are stored in the `merchant_marks` setting; never rename one).
import { BRANDS } from './brands'

/** Colors: a hex, 'fg' (label color, for black/white brands), 'pos', 'bank:<bank>' or 'tint:<tint>' (theme resolves). */
export type MarkSpec =
  | { kind: 'brand'; path: string; color: string; title: string }
  | { kind: 'mono'; letter: string; color: string; title: string }

const brand = (name: string, color?: string): MarkSpec => {
  const g = BRANDS[name]
  return { kind: 'brand', path: g.path, color: color ?? g.hex, title: g.title }
}
const mono = (letter: string, color: string, title: string): MarkSpec => ({ kind: 'mono', letter, color, title })

// id → [pattern, mark]. First match wins, so specific names sit above generic words (Uber Eats before Uber).
const REGISTRY: Array<[string, RegExp, MarkSpec]> = [
  ['mcdonalds', /mcdonald/i, brand('siMcdonalds')],
  ['tesla', /tesla/i, brand('siTesla')],
  ['icloud', /icloud/i, brand('siIcloud')],
  ['appletv', /apple tv/i, brand('siAppletv', 'fg')],
  ['applemusic', /apple music/i, brand('siApplemusic')],
  ['apple', /\bapple\b/i, brand('siApple', 'fg')],
  ['claude', /claude|anthropic/i, brand('siClaude')],
  ['venmo', /venmo/i, brand('siVenmo')],
  ['robinhood', /robinhood/i, brand('siRobinhood')],
  ['target', /\btarget\b/i, brand('siTarget')],
  ['chase', /\bchase\b/i, brand('siChase', 'bank:chase')],
  ['amex', /\bamex\b|american express/i, brand('siAmericanexpress', 'bank:amex')],
  ['spotify', /spotify/i, brand('siSpotify')],
  ['netflix', /netflix/i, brand('siNetflix')],
  ['youtube', /youtube/i, brand('siYoutube')],
  ['hbomax', /\bhbo\b/i, brand('siHbomax', 'fg')],
  ['ubereats', /uber ?eats/i, brand('siUbereats')],
  ['uber', /\buber\b/i, brand('siUber', 'fg')],
  ['lyft', /\blyft\b/i, brand('siLyft')],
  ['doordash', /door ?dash/i, brand('siDoordash')],
  ['instacart', /instacart/i, brand('siInstacart')],
  ['starbucks', /starbucks/i, brand('siStarbucks')],
  ['burgerking', /burger king/i, brand('siBurgerking')],
  ['tacobell', /taco bell/i, brand('siTacobell')],
  ['kfc', /\bkfc\b/i, brand('siKfc')],
  ['shell', /\bshell\b/i, brand('siShell')],
  ['ikea', /\bikea\b/i, brand('siIkea')],
  ['ebay', /\bebay\b/i, brand('siEbay')],
  ['etsy', /\betsy\b/i, brand('siEtsy')],
  ['paypal', /paypal/i, brand('siPaypal')],
  ['cashapp', /cash ?app/i, brand('siCashapp')],
  ['zelle', /\bzelle\b/i, brand('siZelle')],
  ['googleplay', /google play/i, brand('siGoogleplay')],
  ['google', /\bgoogle\b/i, brand('siGoogle')],
  ['steam', /\bsteam\b/i, brand('siSteam', 'fg')],
  ['playstation', /playstation|\bpsn\b/i, brand('siPlaystation')],
  ['airbnb', /airbnb/i, brand('siAirbnb')],
  ['delta', /\bdelta\b/i, brand('siDelta')],
  ['united', /united airlines/i, brand('siUnitedairlines')],
  ['southwest', /southwest/i, brand('siSouthwestairlines')],
  ['verizon', /verizon/i, brand('siVerizon')],
  ['att', /\bat&t\b|\batt\b/i, brand('siAtandt')],
  ['audible', /audible/i, brand('siAudible')],
  ['twitch', /twitch/i, brand('siTwitch')],
  ['patreon', /patreon/i, brand('siPatreon', 'fg')],
  ['github', /github/i, brand('siGithub', 'fg')],
  ['discord', /discord/i, brand('siDiscord')],
  ['coinbase', /coinbase/i, brand('siCoinbase')],
  ['wellsfargo', /wells fargo/i, brand('siWellsfargo')],
  ['bofa', /bank of america|\bbofa\b/i, brand('siBankofamerica')],
  ['discover', /\bdiscover\b/i, brand('siDiscover')],
  ['peloton', /peloton/i, brand('siPeloton', 'fg')],
  ['nike', /\bnike\b/i, brand('siNike', 'fg')],
  ['lidl', /\blidl\b/i, brand('siLidl')],
  ['toyota', /toyota/i, brand('siToyota')],
  ['honda', /honda/i, brand('siHonda')],
  ['ford', /\bford\b/i, brand('siFord')],
  ['kia', /\bkia\b/i, brand('siKia', 'fg')],
  ['tailscale', /tailscale/i, brand('siTailscale', 'fg')],
  ['cloudflare', /cloudflare/i, brand('siCloudflare')],
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
  ['sofi', /\bsofi\b/i, mono('S', 'bank:sofi', 'SoFi')],
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
  ['openai', /openai|chatgpt/i, mono('O', 'fg', 'OpenAI')],
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
  ['sephora', /sephora/i, mono('S', 'fg', 'Sephora')],
  ['ulta', /\bulta\b/i, mono('U', '#F58025', 'Ulta')],
  ['paycheck', /paycheck/i, mono('$', 'pos', 'Paycheck')],
]
const BY_ID = new Map(REGISTRY.map(([id, , spec]) => [id, spec]))

/** Every known mark, for the logo picker. */
export const MARK_OPTIONS = REGISTRY.filter(([id]) => id !== 'paycheck').map(([id, , spec]) => ({ id, spec }))
  .sort((a, b) => a.spec.title.localeCompare(b.spec.title))

/** The part of a description that names the merchant: lowercased, parentheticals dropped. "Costco gas (trip)" → "costco gas". */
export const merchantKey = (what: string) =>
  what.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}&'+ -]/gu, '').replace(/\s+/g, ' ').trim()

/** User overrides, keyed by merchantKey. Value: a registry id, `tint:<tint>` (letter tile) or `category` (no mark). */
export type MarkOverrides = Record<string, string>
export function parseOverrides(raw: string | undefined): MarkOverrides {
  try { const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} }
}

/** The override that applies to a description: exact key, else the longest key it starts with ("costco" covers "costco gas"). */
export function overrideKey(what: string, o: MarkOverrides): string | undefined {
  const k = merchantKey(what)
  if (Object.hasOwn(o, k)) return k
  return Object.keys(o).filter((x) => x && k.startsWith(x + ' ')).sort((a, b) => b.length - a.length)[0]
}

export function specFor(value: string, what: string): MarkSpec | null {
  if (typeof value !== 'string' || value === 'category') return null
  if (value.startsWith('tint:')) {
    const letter = merchantKey(what).replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?'
    return mono(letter, value, what)
  }
  return BY_ID.get(value) ?? null
}

/** Override first, then the built-in patterns. null = show the category glyph. */
export function resolveMark(what: string, o: MarkOverrides): MarkSpec | null {
  const k = overrideKey(what, o)
  if (k) return specFor(o[k], what)
  for (const [, re, spec] of REGISTRY) if (re.test(what)) return spec
  return null
}
