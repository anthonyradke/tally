// Settings → App icon: the app's own icon, then the glowing t in each theme on black and on white. iOS confirms the
// change with its own alert.
import { View } from 'react-native'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { canChangeIcon, DEFAULT_ICON, ICON_GROUPS, useAppIcon, type AppIcon } from '@/lib/appIcon'
import { toast } from '@/lib/toast'
import { space, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'

const SIZE = 68

export function AppIconPicker() {
  if (!canChangeIcon) {
    return <Txt variant="callout" tone="label2" style={{ paddingHorizontal: space.xs }}>This build can&apos;t change its icon. Update the app to pick one.</Txt>
  }
  return (
    <View style={{ gap: space.xl }}>
      <Section title="Default" icons={[DEFAULT_ICON]} />
      {ICON_GROUPS.map((g) => <Section key={g.title} title={g.title} icons={g.icons} />)}
    </View>
  )
}

function Section({ title, icons }: { title: string; icons: AppIcon[] }) {
  return (
    <View style={{ gap: space.s }}>
      <Txt variant="sub" tone="label2" style={{ paddingHorizontal: space.xs }}>{title}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.l }}>
        {icons.map((i) => <Tile key={i.name ?? 'default'} icon={i} />)}
      </View>
    </View>
  )
}

function Tile({ icon }: { icon: AppIcon }) {
  const { c } = useTheme()
  const current = useAppIcon((s) => s.name)
  const set = useAppIcon((s) => s.set)
  const on = current === icon.name
  const pick = () => {
    if (on) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    set(icon.name).catch(() => toast({ text: "Couldn't change the icon" }))
  }
  return (
    <Tap onPress={pick} accessibilityLabel={`${icon.label} icon`} accessibilityState={{ selected: on }}
      style={{ width: '33.33%', alignItems: 'center', gap: space.s }}>
      <View style={{ padding: 3, borderRadius: SIZE * 0.225 + 5, borderCurve: 'continuous', borderWidth: 2.5, borderColor: on ? c.ink : 'transparent' }}>
        <View style={{ borderRadius: SIZE * 0.225, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 0.5, borderColor: c.sep }}>
          <Image source={icon.source} style={{ width: SIZE, height: SIZE }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {on && <Icon sf="checkmark.circle.fill" md="check_circle" size={14} color={c.ink} />}
        <Txt variant="foot" tone={on ? 'label' : 'label2'}>{icon.label}</Txt>
      </View>
    </Tap>
  )
}
