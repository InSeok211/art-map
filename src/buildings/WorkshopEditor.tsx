import { useRef } from 'react'
import { WORKSHOP_TEXT_LIMITS } from './buildingEdits'
import type { WorkshopInfo } from './buildingEdits'
import type { Place } from '../types'

// 작가님 공방을 골랐을 때 건물 탭에 나오는 장소 정보(지도 장소 카드) 편집입니다. 비운 칸은 기본 정보를 씁니다.
// 고친 내용은 건물 초안에 함께 들어가고 '공개하기'를 눌러야 공개 지도에 나갑니다.
export interface WorkshopTools {
  info: WorkshopInfo
  // 기본 정보(비운 칸의 자리표시)
  defaults: Place
  // 사진 주소(미리보기용)
  photoUrl: string | null
  photoStatus: string
  photoBusy: boolean
  onChange: (info: WorkshopInfo) => void
  onPhoto: (file: File) => void
  onRemovePhoto: () => void
}

export function WorkshopInfoEditor({ tools }: { tools: WorkshopTools }) {
  const { info, defaults } = tools
  const input = useRef<HTMLInputElement>(null)
  // 입력할 때마다 저장하지 않고 칸을 벗어날 때 한 번 저장합니다(실행 취소 기록이 글자마다 쌓이지 않게).
  const text = (key: 'name' | 'address' | 'description', value: string) => {
    if ((info[key] ?? '') !== value.trim()) tools.onChange({ ...info, [key]: value.trim() || undefined })
  }
  return <div className="gamcheon-map__property-section">
    <strong>장소 정보</strong>
    <p className="gamcheon-map__model-help">공개 지도의 장소 목록·카드에 보이는 내용입니다. 비우면 기본 정보를 씁니다.</p>
    <label>이름<input type="text" aria-label="공방 이름" key={`name-${info.name ?? ''}`} defaultValue={info.name ?? ''}
      maxLength={WORKSHOP_TEXT_LIMITS.name} placeholder={defaults.name} onBlur={(event) => text('name', event.target.value)} /></label>
    <label>주소<input type="text" aria-label="공방 주소" key={`address-${info.address ?? ''}`} defaultValue={info.address ?? ''}
      maxLength={WORKSHOP_TEXT_LIMITS.address} placeholder={defaults.address} onBlur={(event) => text('address', event.target.value)} /></label>
    <label>설명<textarea aria-label="공방 설명" key={`description-${info.description ?? ''}`} defaultValue={info.description ?? ''} rows={3}
      maxLength={WORKSHOP_TEXT_LIMITS.description} placeholder={defaults.description} onBlur={(event) => text('description', event.target.value)} /></label>
    <div className="gamcheon-map__workshop-photo">
      {tools.photoUrl ? <img src={tools.photoUrl} alt="공방 사진" /> : <span>사진 없음</span>}
      <div className="gamcheon-map__model-item-actions">
        <button type="button" disabled={tools.photoBusy} onClick={() => input.current?.click()}>{tools.photoUrl ? '사진 바꾸기' : '사진 올리기'}</button>
        {tools.photoUrl && <button type="button" disabled={tools.photoBusy} onClick={tools.onRemovePhoto}>사진 빼기</button>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="공방 사진 파일"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) tools.onPhoto(file) }} />
      {tools.photoStatus && <p className="gamcheon-map__model-help" role="status">{tools.photoStatus}</p>}
    </div>
  </div>
}
