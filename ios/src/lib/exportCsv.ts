// CSV exports through the share sheet (save to Files, AirDrop, Numbers). They used to open the server's URL in
// Safari, which sends no token, so with the login on they'd only have shown a 401.
import { Share } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { ApiError, download } from './api'
import { toast } from './toast'

export async function shareCsv(path: string, name: string): Promise<void> {
  try {
    const text = await download(path)
    const file = new File(Paths.cache, name)
    if (file.exists) file.delete()
    file.create()
    file.write(text)
    await Share.share({ url: file.uri, title: name })
  } catch (e) {
    toast({ text: e instanceof ApiError ? e.errors.join(' ') : "Couldn't export: Tally is unreachable.", tone: 'error' })
  }
}
