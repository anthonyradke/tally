// Settings' Face ID section: one switch for asking for Face ID when Tally opens (lib/lock.ts), with the footer saying
// what it does. Turning it on asks for Face ID first; the switch shows on while the sheet is up and goes back if it
// fails. A phone without Face ID set up gets the switch off and greyed, and the footer says why. Not on the web.
import { useState } from 'react'
import { Switch } from 'react-native'
import { setFaceId, useLock } from '@/lib/lock'
import { tick } from '../haptics'
import { usePalette } from '../theme'
import { Row, Section, Tile } from './List'

const FOOTER = 'Use Face ID to open Tally. If its icon is set to Require Face ID, turn that off so you’re asked once.'
const MISSING = 'Face ID isn’t set up on this iPhone.'

export function FaceIdRow() {
  const p = usePalette()
  const available = useLock((s) => s.available)
  const enabled = useLock((s) => s.enabled && s.available)
  const [pending, setPending] = useState<boolean | null>(null)
  if (process.env.EXPO_OS === 'web') return null
  const change = (on: boolean) => {
    tick()
    setPending(on)
    setFaceId(on).catch(() => false).finally(() => setPending(null))
  }
  return (
    <Section inset={62} footer={available ? FOOTER : MISSING}>
      <Row leading={<Tile symbol="faceid" color={p.green} size={30} />} title="Face ID" disabled={!available}
        trailing={<Switch value={pending ?? enabled} disabled={!available || pending !== null} onValueChange={change} accessibilityLabel="Face ID" />} />
    </Section>
  )
}
