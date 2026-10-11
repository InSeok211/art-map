import { floorsToHeight, heightToFloors } from './buildingEdits'
import type { BuildingOverride } from './buildingEdits'
import type { StreetBuilding } from './streetSceneData'

// 작업실 '건물' 탭의 패널입니다. 고친 내용은 초안에만 들어가고 '공개하기'를 눌러야 공개 지도에 나갑니다.
interface BuildingEditorProps {
  selected: { building: StreetBuilding; override: BuildingOverride } | null
  notice: string
  editedIds: number[]
  editedCount: number
  publishedCount: number
  dirty: boolean
  busy: boolean
  status: string
  onChange: (override: BuildingOverride | null) => void
  onSelect: (id: number) => void
  onClose: () => void
  onPublish: () => void
  onDiscard: () => void
}

// 감천 마을의 벽·지붕에 흔한 색(디자인 값)
const WALL_COLORS = [0xf2efe6, 0xe8d9b5, 0xf3c9a8, 0xf0b9c4, 0xf7dc6f, 0xa8d5c8, 0x9cc7e0, 0xd9d9d9]
const ROOF_COLORS = [0x3f8fb5, 0x2f9e8f, 0x5a7d4d, 0xb5523b, 0xe08a3c, 0x8a8f99, 0x3d4a5c, 0xf2efe6]
const MAX_FLOORS = 20

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

function ColorChoice({ label, value, original, options, onChange }: {
  label: string; value: number; original: number; options: number[]; onChange: (color: number | undefined) => void
}) {
  return <div className="gamcheon-map__building-colors">
    <span>{label}</span>
    <div role="radiogroup" aria-label={label}>
      {options.map((color) => <button key={color} type="button" role="radio" aria-checked={value === color} aria-label={hex(color)}
        className={value === color ? 'is-selected' : ''} style={{ background: hex(color) }} onClick={() => onChange(color === original ? undefined : color)} />)}
      <label className="gamcheon-map__building-color-custom" title="직접 고르기">
        <input type="color" aria-label={`${label} 직접 고르기`} value={hex(value)} onChange={(event) => onChange(parseInt(event.target.value.slice(1), 16))} />
      </label>
    </div>
  </div>
}

export function BuildingEditor({
  selected, notice, editedIds, editedCount, publishedCount, dirty, busy, status,
  onChange, onSelect, onClose, onPublish, onDiscard,
}: BuildingEditorProps) {
  const original = selected?.building
  const override = selected?.override ?? {}
  const change = (patch: Partial<BuildingOverride>) => {
    const next = { ...override, ...patch }
    for (const key of Object.keys(next) as (keyof BuildingOverride)[]) if (next[key] === undefined) delete next[key]
    onChange(Object.keys(next).length ? next : null)
  }
  const height = override.heightMeters ?? original?.heightMeters ?? 0
  const roofStyle = override.roofStyle ?? original?.roofStyle

  return <div className="gamcheon-map__model-editor gamcheon-map__building-editor">
    <div className={`gamcheon-map__building-publish${dirty ? ' is-dirty' : ''}`}>
      <strong>{dirty ? '공개하지 않은 변경이 있습니다' : '공개 지도와 같습니다'}</strong>
      <span>초안에서 고친 건물 {editedCount}채 · 공개된 건물 {publishedCount}채</span>
      <div className="gamcheon-map__model-item-actions">
        <button type="button" className="gamcheon-map__model-place" disabled={!dirty || busy} onClick={onPublish}>공개하기</button>
        <button type="button" disabled={!dirty || busy} onClick={() => { if (window.confirm('공개하지 않은 변경을 모두 버릴까요?')) onDiscard() }}>초안 버리기</button>
      </div>
      {status && <p className="gamcheon-map__model-help" role="status">{status}</p>}
    </div>

    {!original && <p className="gamcheon-map__model-help">
      지도 바닥의 건물 윤곽을 눌러 고를 건물을 정하세요. 높이·색·지붕을 바꾸거나 숨길 수 있습니다.
      바꾼 내용은 초안에만 들어가고, '공개하기'를 눌러야 공개 지도에 나타납니다.
    </p>}
    {notice && <p className="gamcheon-map__model-error" role="alert">{notice}</p>}

    {original && <div className="gamcheon-map__model-inspector">
      <strong>건물 {original.id}{original.concept || original.observed || original.roadview ? ' · 사진 시안 건물' : ''}</strong>
      {(original.concept || original.observed || original.roadview) && <p className="gamcheon-map__model-help">사진을 바탕으로 따로 꾸민 건물이라 색·지붕 일부는 바뀌지 않을 수 있습니다.</p>}
      <label className="gamcheon-map__building-toggle">
        <input type="checkbox" checked={override.hidden === true} onChange={(event) => change({ hidden: event.target.checked || undefined })} />
        이 건물 숨기기
      </label>
      {!override.hidden && <>
        <label>층수 <span>{heightToFloors(height)}층 · {height.toFixed(1)}m</span>
          <input aria-label="층수" type="range" min={1} max={MAX_FLOORS} step={1} value={heightToFloors(height)}
            onChange={(event) => {
              const next = floorsToHeight(Number(event.target.value))
              change({ heightMeters: heightToFloors(original.heightMeters) === Number(event.target.value) ? undefined : next })
            }} />
        </label>
        <ColorChoice label="벽 색" value={override.wallColor ?? original.wallColor} original={original.wallColor} options={WALL_COLORS} onChange={(wallColor) => change({ wallColor })} />
        <ColorChoice label="지붕 색" value={override.roofColor ?? original.roofColor} original={original.roofColor} options={ROOF_COLORS} onChange={(roofColor) => change({ roofColor })} />
        <div className="gamcheon-map__building-roof" role="radiogroup" aria-label="지붕 모양">
          <span>지붕 모양</span>
          {(['flat', 'gable'] as const).map((style) => <button key={style} type="button" role="radio" aria-checked={roofStyle === style}
            className={roofStyle === style ? 'is-active' : ''} onClick={() => change({ roofStyle: style === original.roofStyle ? undefined : style })}>
            {style === 'flat' ? '평지붕' : '박공지붕'}
          </button>)}
        </div>
      </>}
      <div className="gamcheon-map__model-item-actions">
        <button type="button" disabled={!Object.keys(override).length} onClick={() => onChange(null)}>원래대로</button>
        <button type="button" onClick={onClose}>선택 해제</button>
      </div>
    </div>}

    <div className="gamcheon-map__model-section-title">고친 건물 <strong>{editedIds.length}채</strong></div>
    <div className="gamcheon-map__model-placed">
      {editedIds.map((id, index) => <button key={id} type="button" className={original?.id === id ? 'is-selected' : ''} onClick={() => onSelect(id)}>
        <span>{String(index + 1).padStart(2, '0')}</span>건물 {id}
      </button>)}
      {!editedIds.length && <p className="gamcheon-map__model-empty">아직 고친 건물이 없습니다.</p>}
    </div>
  </div>
}
