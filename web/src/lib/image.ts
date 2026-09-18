/** Downscale a photo to ≤ maxEdge px and re-encode as JPEG before upload. PDFs and undecodable files pass through. */
export async function shrinkImage(file: File, maxEdge = 1600, quality = 0.85): Promise<{ blob: Blob; name: string }> {
  if (!file.type.startsWith('image/')) return { blob: file, name: file.name }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return { blob: file, name: file.name }
    return { blob, name: file.name.replace(/\.\w+$/, '') + '.jpg' }
  } catch {
    return { blob: file, name: file.name }
  }
}
