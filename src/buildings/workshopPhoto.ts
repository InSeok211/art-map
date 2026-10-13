// 작가님 공방 사진 올리기입니다. 휴대폰 사진은 수 MB라 브라우저에서 긴 변을 줄인 JPEG로 바꾼 뒤 올립니다.
//  - 지도 앱 서버(홈페이지)에서는 /api/admin/map-images에 올리고 사진 번호(i-…)를 받습니다.
//  - 서버가 없는 개발 미리보기에서는 더 작게 줄여 data 주소로 초안에 바로 넣습니다.

export async function shrinkPhoto(file: Blob, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('사진을 읽지 못했습니다. JPEG·PNG·WebP 사진을 골라 주세요.') })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 줄이지 못했습니다.')), 'image/jpeg', quality))
}

const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
  reader.readAsDataURL(blob)
})

// 사진을 올리고 공방 장소 정보에 넣을 값(사진 번호 또는 data 주소)을 돌려줍니다.
export async function uploadWorkshopPhoto(file: File, server: boolean): Promise<string> {
  if (!server) return readDataUrl(await shrinkPhoto(file, 800, 0.8))
  const form = new FormData()
  form.append('file', new File([await shrinkPhoto(file, 1280, 0.85)], 'workshop.jpg', { type: 'image/jpeg' }))
  const response = await fetch('/api/admin/map-images', { method: 'POST', body: form })
  const body = await response.json().catch(() => ({})) as { photo?: string; error?: string }
  if (!response.ok || !body.photo) throw new Error(body.error || `사진을 올리지 못했습니다(${response.status}).`)
  return body.photo
}
