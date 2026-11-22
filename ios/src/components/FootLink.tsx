// A quiet link under a section to the Settings page behind it ("Manage accounts", "Customize Home").
import type { Href } from 'expo-router'
import type { SFSymbol } from 'expo-symbols'
import { space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

export function FootLink({ label, href, sf = 'slider.horizontal.3', md = 'tune' }: { label: string; href: Href; sf?: SFSymbol; md?: string }) {
  const { c } = useTheme()
  return (
    <Tap href={href} feedback="opacity" style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, padding: space.s }}>
      <Icon sf={sf} md={md} size={14} color={c.label2} />
      <Txt variant="callout" tone="label2">{label}</Txt>
    </Tap>
  )
}
