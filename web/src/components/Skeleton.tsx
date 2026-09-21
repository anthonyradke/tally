import s from './Skeleton.module.css'

/** Placeholder with the real page's rough shape, so the first frame's layout is already final. */
export function Skeleton() {
  return (
    <div className={s.root} aria-busy="true" aria-label="Loading">
      <i className={s.label} />
      <i className={s.hero} />
      <i className={s.rule} />
      <div className={s.pair}><i /><i /></div>
      {[0, 1, 2, 3, 4].map((n) => <i key={n} className={s.row} />)}
    </div>
  )
}
