// A grouped list's rows from its children: fragments and arrays opened up (so rows written inside a fragment still
// get separators between them), empty slots dropped, and each row keyed by its own key where it has one (so adding
// a row at the top doesn't remount every row under it). A row without a key is keyed by its slot in the JSX, which
// doesn't move when a conditional row before it comes and goes.
import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'

export interface ListRow { key: string; node: ReactNode }

export function sectionRows(children: ReactNode): ListRow[] {
  const out: ListRow[] = []
  const walk = (node: ReactNode, path: string, slot: number) => {
    if (node === null || node === undefined || typeof node === 'boolean' || node === '') return
    // A nested list (rows.map) is told apart by its slot; the rows in it by their own keys.
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, `${path}${slot}.`, i)); return }
    const key = isValidElement(node) && node.key != null ? `${path}$${node.key}` : `${path}#${slot}`
    if (isValidElement(node) && node.type === Fragment) {
      const el = node as ReactElement<{ children?: ReactNode }>
      const inner = el.props.children
      if (Array.isArray(inner)) inner.forEach((n, i) => walk(n, `${key}:`, i))
      else walk(inner, `${key}:`, 0)
      return
    }
    out.push({ key, node })
  }
  if (Array.isArray(children)) children.forEach((n, i) => walk(n, '', i))
  else walk(children, '', 0)
  return out
}
