// Inset grouped lists the way iOS 26 draws them: rounded cards on the grouped background, rows with a separator
// that starts where the text does, section titles above and notes below.
import { Children, Fragment, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { SFSymbol } from 'expo-symbols'
import { radius, space, usePalette } from '../theme'
import { Press } from './Press'
import { SF } from './SF'
import { Txt } from './Txt'

export function Card({ children, style, pad }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const p = usePalette()
  return <View style={[{ backgroundColor: p.card, borderRadius: radius.card, borderCurve: 'continuous', overflow: 'hidden' }, pad ? { padding: space.l } : null, style]}>{children}</View>
}

/** A titled group of rows. `inset`: where each separator starts (after a row's icon). */
export function Section({ title, aside, action, footer, inset = space.l, children, style }: {
  title?: string; aside?: string; action?: { label: string; onPress: () => void }; footer?: string; inset?: number; children: ReactNode; style?: StyleProp<ViewStyle>
}) {
  const p = usePalette()
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <View style={[{ gap: space.s }, style]}>
      {(title || action || aside) && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.xs }}>
          {title ? <Txt v="title3" weight="700">{title}</Txt> : <View />}
          {action ? <Press feel="none" haptic={false} onPress={action.onPress} hitSlop={10}><Txt v="body" tone="blue">{action.label}</Txt></Press>
            : aside ? <Txt v="body" tone="label2" num>{aside}</Txt> : null}
        </View>
      )}
      {rows.length > 0 && (
        <Card>
          {rows.map((r, i) => (
            <Fragment key={i}>
              {i > 0 && <View style={{ height: 0.5, backgroundColor: p.separator, marginLeft: inset }} />}
              {r}
            </Fragment>
          ))}
        </Card>
      )}
      {footer && <Txt v="footnote" tone="label2" style={{ paddingHorizontal: space.l }}>{footer}</Txt>}
    </View>
  )
}

/** One row: an optional leading view, a title with an optional subtitle, and a value or accessory on the right. */
export function Row({ leading, title, subtitle, value, valueTone = 'label2', trailing, chevron, destructive, tint, onPress, disabled }: {
  leading?: ReactNode; title: string; subtitle?: string; value?: string; valueTone?: 'label' | 'label2' | 'green' | 'blue'
  trailing?: ReactNode; chevron?: boolean; destructive?: boolean; tint?: boolean; onPress?: () => void; disabled?: boolean
}) {
  const p = usePalette()
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: subtitle ? 60 : 52, paddingVertical: space.s, opacity: disabled ? 0.4 : 1 }}>
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt v="body" numberOfLines={1} color={destructive ? p.red : tint ? p.blue : undefined}>{title}</Txt>
        {subtitle ? <Txt v="subhead" tone="label2" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {value !== undefined && <Txt v="body" tone={valueTone} num numberOfLines={1}>{value}</Txt>}
      {trailing}
      {chevron && <SF name="chevron.right" size={13} color={p.label3} weight="semibold" />}
    </View>
  )
  return onPress && !disabled ? <Press feel="highlight" haptic={false} onPress={onPress}>{body}</Press> : body
}

/** A round colored tile with a white symbol, for categories and kinds. */
export function Tile({ symbol, color, size = 36 }: { symbol: SFSymbol; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <SF name={symbol} size={size * 0.48} color="#FFFFFF" weight="semibold" />
    </View>
  )
}

/** Big friendly empty state, like ContentUnavailableView. */
export function Empty({ symbol, title, body, children }: { symbol: SFSymbol; title: string; body?: string; children?: ReactNode }) {
  const p = usePalette()
  return (
    <View style={{ alignItems: 'center', gap: space.s, paddingVertical: 48, paddingHorizontal: space.xxl }}>
      <SF name={symbol} size={48} color={p.label3} weight="regular" />
      <Txt v="title2" center style={{ marginTop: space.s }}>{title}</Txt>
      {body ? <Txt v="body" tone="label2" center>{body}</Txt> : null}
      {children}
    </View>
  )
}
