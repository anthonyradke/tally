// The receipt row in the composer and the editor: take or choose a photo, or show the one attached. It edits the draft;
// the photo uploads after the entry saves.
import { View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Icon } from './Icon'
import { Tap } from './Tap'
import { Txt } from './Txt'
import { api } from '@/lib/api'
import { useDraft } from '@/lib/draft'
import { space, useTheme } from '@/theme'

export function Receipt() {
  const { c } = useTheme()
  const { d, set } = useDraft()
  const add = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 }
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
    if (r.canceled || !r.assets[0]) return
    const a = r.assets[0]
    set({ photo: { uri: a.uri, name: a.fileName ?? 'receipt.jpg', type: a.mimeType ?? 'image/jpeg' }, removeReceipt: false })
  }
  const uri = d.photo?.uri ?? (d.receipt && !d.removeReceipt ? api.receiptUrl(d.receipt) : null)
  if (uri) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, paddingLeft: space.l }}>
        <Image source={{ uri }} style={{ width: 48, height: 64, borderRadius: 8 }} contentFit="cover" />
        <Txt variant="body" style={{ flex: 1 }}>Receipt</Txt>
        <Tap feedback="opacity" onPress={() => set({ photo: null, removeReceipt: true })} hitSlop={10}><Txt variant="callout" tone="neg">Remove</Txt></Tap>
      </View>
    )
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, minHeight: 50 }}>
      <Icon sf="doc.text.viewfinder" md="document_scanner" size={18} color={c.label2} />
      <Txt variant="body" tone="label3" style={{ flex: 1 }}>Receipt</Txt>
      {process.env.EXPO_OS === 'ios' && <Tap feedback="opacity" onPress={() => add(true)} hitSlop={8} accessibilityLabel="Take a photo of the receipt"><Icon sf="camera" md="photo_camera" size={20} color={c.label} /></Tap>}
      <Tap feedback="opacity" onPress={() => add(false)} hitSlop={8} accessibilityLabel="Choose a receipt photo"><Icon sf="photo" md="image" size={20} color={c.label} /></Tap>
    </View>
  )
}
