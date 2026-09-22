import type { ReactNode } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { GripVertical } from 'lucide-react'
import s from './DragRow.module.css'

/** Reorder row that only drags from its grip, so swiping the rest of the row scrolls the list. */
export function DragRow<T>({ value, className, onDragEnd, children }: { value: T; className?: string; onDragEnd: () => void; children: ReactNode }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={value} as="div" className={className} dragListener={false} dragControls={controls} onDragEnd={onDragEnd}>
      <span className={s.grip} onPointerDown={(e) => { e.preventDefault(); controls.start(e) }} aria-hidden>
        <GripVertical strokeWidth={2} absoluteStrokeWidth />
      </span>
      {children}
    </Reorder.Item>
  )
}
