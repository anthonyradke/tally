// Ordering the brand list in a place's logo picker: brands whose name shares a word with the place come first, and a
// search narrows the list to names containing it. Alphabetical "7-Eleven, Adobe, Airbnb…" made the right one a hunt.
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)

/** How well a brand's title matches a place's name: 3 the same, 2 one starts the other, 1 a shared word, 0 none. */
export function matchScore(title: string, place: string): number {
  const t = title.toLowerCase(), p = place.toLowerCase().trim()
  if (!p) return 0
  if (t === p) return 3
  if (t.startsWith(p) || p.startsWith(t)) return 2
  const pw = new Set(words(p))
  return words(t).some((w) => pw.has(w)) ? 1 : 0
}

/** `options` with the best matches for `place` first (the rest keep their order), or only those containing `query`. */
export function rankMarks<T extends { spec: { title: string } }>(options: T[], place: string, query = ''): T[] {
  const q = query.trim().toLowerCase()
  const list = q ? options.filter((o) => o.spec.title.toLowerCase().includes(q)) : options
  return list.map((o, i) => ({ o, i, s: matchScore(o.spec.title, q || place) }))
    .sort((a, z) => z.s - a.s || a.i - z.i).map((x) => x.o)
}
