// The home screen icon: the glowing t in each color, on black or on white.
import { ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { DEFAULT_ICON, ICON_GROUPS, useAppIcon, type AppIcon } from '@/lib/appIcon'
import { success } from '@/design/haptics'
import { space, usePalette } from '@/design/theme'
import { Press } from '@/design/ui/Press'
import { Section } from '@/design/ui/List'
import { SF } from '@/design/ui/SF'
import { Txt } from '@/design/ui/Txt'

function Choice({ icon, on }: { icon: AppIcon; on: boolean }) {
  const p = usePalette()
  const set = useAppIcon((s) => s.set)
  return (
    <Press onPress={() => { if (!on) set(icon.name).then(success).catch(() => {}) }} accessibilityLabel={icon.label}
      style={{ width: '25%', alignItems: 'center', gap: 6, paddingVertical: space.s }}>
      <View>
        <View style={{ width: 60, height: 60, borderRadius: 13.5, borderCurve: 'continuous', overflow: 'hidden' }}>
          <Image source={icon.source} style={{ width: 60, height: 60 }} />
        </View>
        {on && (
          <View style={{ position: 'absolute', right: -6, bottom: -6, backgroundColor: p.card, borderRadius: 12 }}>
            <SF name="checkmark.circle.fill" size={24} color={p.tint} />
          </View>
        )}
      </View>
      <Txt v="caption" tone={on ? 'label' : 'label2'} numberOfLines={1}>{icon.label}</Txt>
    </Press>
  )
}

export default function IconPicker() {
  const p = usePalette()
  const name = useAppIcon((s) => s.name)
  const groups = [{ title: 'On Black', icons: [DEFAULT_ICON, ...ICON_GROUPS[0].icons.filter((i) => i.name !== 'ClassicBlack')] }, { ...ICON_GROUPS[1], title: 'On White' }]
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: space.l, gap: space.xxl }}>
      {groups.map((g) => (
        <Section key={g.title} title={g.title} compact>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: space.s }}>
            {g.icons.map((i) => <Choice key={i.name ?? 'default'} icon={i} on={i.name === name} />)}
          </View>
        </Section>
      ))}
    </ScrollView>
  )
}
