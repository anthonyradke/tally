// A sideways row of tags already in use, most used first, for fields that take a tag (the Filters sheet, bulk Add a
// tag). Taps go through with the keyboard up.
import { ScrollView } from 'react-native'
import { space } from '@/theme'
import { Chip } from './Chip'

export function TagChips({ tags, selected, onPick, onDark, inset = space.l }: {
  tags: string[]; selected?: string; onPick: (tag: string) => void; onDark?: boolean; inset?: number
}) {
  if (!tags.length) return null
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.s, paddingHorizontal: inset }}>
      {tags.map((tag) => <Chip key={tag} label={`#${tag}`} selected={tag === selected} onDark={onDark} onPress={() => onPick(tag)} />)}
    </ScrollView>
  )
}
