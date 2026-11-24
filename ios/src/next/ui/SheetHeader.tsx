import { View } from 'react-native'
import { router } from 'expo-router'
import { space, usePalette } from '../theme'
import { Press } from './Press'
import { Symbol } from './Symbol'
import { Txt } from './Txt'

/** The top of a sheet: a large title and the round close button iOS 26 sheets carry. */
export function SheetHeader({ title, subtitle, onClose = () => router.back() }: { title: string; subtitle?: string; onClose?: () => void }) {
  const p = usePalette()
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.l, gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', height: 36 }}>
        <Press onPress={onClose} accessibilityLabel="Close" hitSlop={10}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.fill3, alignItems: 'center', justifyContent: 'center' }}>
          <Symbol name="xmark" size={15} color={p.label2} weight="bold" />
        </Press>
      </View>
      <Txt v="largeTitle">{title}</Txt>
      {subtitle ? <Txt v="subhead" tone="label2">{subtitle}</Txt> : null}
    </View>
  )
}
