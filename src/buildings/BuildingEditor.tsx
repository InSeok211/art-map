import { floorsToHeight, heightToFloors } from './buildingEdits'
import type { AddedBuilding, BuildingOverride, RoofStyle } from './buildingEdits'
import { ModelFiles, ModelInspector, PlacingBanner } from './BuildingModelPanel'
import type { ModelTools } from './BuildingModelPanel'
import type { StreetBuilding } from '../scene/streetSceneData'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NumberField, PlacementProperties, TerrainProperties } from './BuildingProperties'
import { WorkshopInfoEditor } from './WorkshopEditor'
import type { WorkshopTools } from './WorkshopEditor'
import type { BuildingPlacement, BuildingSettings } from './buildingSettings'

// 작업실 '건물' 탭의 패널입니다. 고친 내용은 초안에만 들어가고 '공개하기'를 눌러야 공개 지도에 나갑니다.
interface BuildingEditorProps {
  local: boolean
  workspace?: ReactNode
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  terrainMode: boolean
  settings: BuildingSettings
  elevationInfo: string
  placement?: BuildingPlacement
  onChangeSettings: (patch: Partial<BuildingSettings>) => void
  onPlacement: (placement: BuildingPlacement) => void
  onMoveBuilding: () => void
  onPickEntrance: () => void
  onDuplicate: () => void
  selected: { building: StreetBuilding; override: BuildingOverride } | null
  // 작가님 공방을 골랐을 때(전용 모델: 위치·크기, 3D 모델 교체, 장소 정보만 고침)
  workshop: WorkshopTools | null
  // 새로 그린 건물을 골랐을 때
  added: AddedBuilding | null
  // 고른 새 건물이 차도·보행로와 겹치는지
  onRoad: boolean
  // 새 건물을 그리는 중이면 찍은 꼭짓점 수
  drawingPoints: number | null
  // 올린 3D 모델(BuildingModelPanel)
  models: ModelTools
  // 3D 거리에 모델을 불러오지 못했을 때
  sceneError?: string
  notice: string
  editedIds: number[]
  addedIds: string[]
  editedCount: number
  publishedCount: number
  dirty: boolean
  busy: boolean
  status: string
  onChange: (override: BuildingOverride | null) => void
  onChangeAdded: (patch: Partial<AddedBuilding>) => void
  onRemoveAdded: () => void
  onTrimRoad: () => void
  onSelect: (id: number) => void
  onSelectAdded: (id: string) => void
  onStartDrawing: () => void
  onUndoPoint: () => void
  onFinishDrawing: () => void
  onCancelDrawing: () => void
  onClose: () => void
  onPublish: () => void
  onDiscard: () => void
}

function EditorSection({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  return <details className="gamcheon-map__inspector-section" open={initiallyOpen || undefined}>
    <summary>{title}</summary>
    <div className="gamcheon-map__inspector-section-body gamcheon-map__model-inspector">{children}</div>
  </details>
}

// 감천 마을의 벽·지붕에 흔한 색(디자인 값)
const WALL_COLORS = [0xf2efe6, 0xe8d9b5, 0xf3c9a8, 0xf0b9c4, 0xf7dc6f, 0xa8d5c8, 0x9cc7e0, 0xd9d9d9]
const ROOF_COLORS = [0x3f8fb5, 0x2f9e8f, 0x5a7d4d, 0xb5523b, 0xe08a3c, 0x8a8f99, 0x3d4a5c, 0xf2efe6]
const MAX_FLOORS = 20

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

function ColorChoice({ label, value, original, options, onChange }: {
  label: string; value: number; original?: number; options: number[]; onChange: (color: number | undefined) => void
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

function FloorsSlider({ height, onChange }: { height: number; onChange: (floors: number) => void }) {
  return <label>층수 <span>{heightToFloors(height)}층 · {height.toFixed(1)}m</span>
    <input aria-label="층수" type="range" min={1} max={MAX_FLOORS} step={1} value={heightToFloors(height)}
      onChange={(event) => onChange(Number(event.target.value))} />
  </label>
}

function RoofChoice({ value, onChange }: { value: RoofStyle | undefined; onChange: (style: RoofStyle) => void }) {
  return <div className="gamcheon-map__building-roof" role="radiogroup" aria-label="지붕 모양">
    <span>지붕 모양</span>
    {(['flat', 'gable'] as const).map((style) => <button key={style} type="button" role="radio" aria-checked={value === style}
      className={value === style ? 'is-active' : ''} onClick={() => onChange(style)}>
      {style === 'flat' ? '평지붕' : '박공지붕'}
    </button>)}
    {value === 'gable' && <p className="gamcheon-map__model-help">박공지붕은 길쭉한 네모 모양 건물에만 올라가고, 그 밖의 모양은 평지붕으로 그립니다.</p>}
  </div>
}

export function BuildingEditor({
  local, workspace, canUndo, canRedo, onUndo, onRedo, terrainMode, settings, elevationInfo, placement, onChangeSettings, onPlacement,
  onMoveBuilding, onPickEntrance, onDuplicate,
  selected, workshop, added, onRoad, drawingPoints, models, sceneError, notice, editedIds, addedIds, editedCount, publishedCount, dirty, busy, status,
  onChange, onChangeAdded, onRemoveAdded, onTrimRoad, onSelect, onSelectAdded, onStartDrawing, onUndoPoint, onFinishDrawing, onCancelDrawing,
  onClose, onPublish, onDiscard,
}: BuildingEditorProps) {
  const model = models.selected
  const scrollRef = useRef<HTMLDivElement>(null)
  const [searchId, setSearchId] = useState('')
  const original = selected?.building
  const override = selected?.override ?? {}
  const change = (patch: Partial<BuildingOverride>) => {
    const next = { ...override, ...patch }
    for (const key of Object.keys(next) as (keyof BuildingOverride)[]) if (next[key] === undefined) delete next[key]
    onChange(Object.keys(next).length ? next : null)
  }
  const height = override.heightMeters ?? original?.heightMeters ?? 0
  const roofStyle = override.roofStyle ?? original?.roofStyle

  const targetId = original?.id ?? added?.id ?? model?.id
  const selectedTitle = workshop ? workshop.info.name || workshop.defaults.name
    : settings.name || model?.name || (added ? `새 건물 ${addedIds.indexOf(added.id) + 1}` : `건물 ${original?.id}`)
  const selectedKind = workshop ? '전용 공방' : model ? '3D 모델' : added ? '새 건물' : '기존 건물'
  const hasSelection = !!(original || added || model)
  const isDrawing = drawingPoints !== null
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [targetId, isDrawing])

  return <div className="gamcheon-map__model-editor gamcheon-map__building-editor">
    <div className={`gamcheon-map__building-publish${dirty ? ' is-dirty' : ''}`} role="region" aria-label="저장과 공개">
      <div className="gamcheon-map__publish-heading">
        <strong>{dirty ? '공개하지 않은 변경' : '공개 지도와 같습니다'}</strong>
        <span>{local ? '브라우저 초안' : '서버 초안'}</span>
      </div>
      <div className="gamcheon-map__model-item-actions">
        <button type="button" className="gamcheon-map__model-place" disabled={!dirty || busy} onClick={onPublish}>{local ? '공개본 확정' : '공개하기'}</button>
        <button type="button" disabled={!dirty || busy} onClick={() => { if (window.confirm('공개하지 않은 변경을 모두 버릴까요?')) onDiscard() }}>초안 버리기</button>
      </div>
      <div className="gamcheon-map__publish-meta">
        <span>초안 {editedCount} · 공개 {publishedCount}</span>
        <div className="gamcheon-map__history-actions">
          <button type="button" aria-label="실행 취소 · Ctrl+Z" title="실행 취소 · Ctrl+Z" disabled={!canUndo || busy} onClick={onUndo}>↶ 취소</button>
          <button type="button" aria-label="다시 실행 · Ctrl+Shift+Z" title="다시 실행 · Ctrl+Shift+Z" disabled={!canRedo || busy} onClick={onRedo}>↷ 다시</button>
        </div>
      </div>
      <p className="gamcheon-map__save-status" role="status" title={status || undefined}>{status || (busy ? '저장 처리 중…' : '수정 내용은 초안에 자동 저장됩니다.')}</p>
    </div>

    <div ref={scrollRef} className="gamcheon-map__building-scroll">
      {sceneError && <p className="gamcheon-map__model-error" role="alert">{sceneError}</p>}
      <PlacingBanner tools={models} />
      {drawingPoints !== null ? <div className="gamcheon-map__model-inspector">
        <strong>새 건물 그리기 · 꼭짓점 {drawingPoints}개</strong>
        <p className="gamcheon-map__model-help">건물 모서리를 차례로 누르세요. 3개 이상 찍고 첫 점이나 '완성'을 누릅니다. Esc로 취소합니다.</p>
        <div className="gamcheon-map__model-primary-actions">
          <button type="button" className="gamcheon-map__model-place" disabled={drawingPoints < 3} onClick={onFinishDrawing}>완성</button>
          <button type="button" disabled={!drawingPoints} onClick={onUndoPoint}>점 하나 지우기</button>
          <button type="button" onClick={onCancelDrawing}>취소</button>
        </div>
      </div> : <>
        <div className="gamcheon-map__model-primary-actions">
          <button type="button" onClick={onStartDrawing}>＋ 새 건물 그리기</button>
        </div>
        {!hasSelection && <div className="gamcheon-map__selection-empty">
          <strong>고칠 대상을 선택하세요</strong>
          <p>지도에서 건물을 누르거나 아래 목록에서 선택하세요. 선택한 대상의 속성이 여기에 나타납니다.</p>
        </div>}
      </>}
      {notice && <p className="gamcheon-map__model-error" role="alert">{notice}</p>}

      {hasSelection && drawingPoints === null && <div key={String(targetId)} className="gamcheon-map__selected-properties">
        <div className="gamcheon-map__selection-heading">
          <div><span>{selectedKind}</span><strong>{selectedTitle}</strong><small>ID {targetId}</small></div>
          <button type="button" onClick={onClose} aria-label="선택 해제">닫기</button>
        </div>
        <EditorSection title="배치" initiallyOpen>
          {!workshop && <label>건물 이름<input type="text" aria-label="건물 이름" key={String(targetId) + (settings.name ?? '')}
            defaultValue={settings.name ?? ''} maxLength={120} placeholder="이름을 입력하세요"
            onBlur={(event) => onChangeSettings({ name: event.target.value || undefined })} /></label>}
          {added && <p className="gamcheon-map__model-help">윤곽은 평면 보기에서 꼭짓점을 드래그해 고칩니다. 중간 손잡이로 점을 추가하고, 오른쪽 클릭으로 삭제합니다. 선택을 닫으면 이전 보기로 돌아갑니다.</p>}
          {placement && <PlacementProperties placement={placement} onChange={onPlacement} onMove={onMoveBuilding} onDuplicate={workshop ? undefined : onDuplicate} />}
          {model && <ModelInspector model={model} tools={models} />}
          {original && <div className="gamcheon-map__model-item-actions">
            <button type="button" disabled={!Object.keys(override).length} onClick={() => onChange(null)}>{workshop ? '원래 자리로' : '원래대로'}</button>
          </div>}
          {added && onRoad && <div className="gamcheon-map__building-road" role="alert"><span>윤곽이 길과 겹칩니다.</span><button type="button" onClick={onTrimRoad}>길 밖으로 깎기</button></div>}
          {added && <div className="gamcheon-map__model-item-actions"><button type="button" className="is-danger" onClick={() => { if (window.confirm('이 새 건물을 지울까요?')) onRemoveAdded() }}>건물 지우기</button></div>}
        </EditorSection>
        <EditorSection title={terrainMode ? '지형과 고도' : '바닥 높이'}>
          <TerrainProperties settings={settings} terrainMode={terrainMode} model={!!model} onChange={onChangeSettings} onPickEntrance={onPickEntrance} />
          {elevationInfo && <p className="gamcheon-map__model-help" role="status">{elevationInfo}</p>}
        </EditorSection>
        {(added || (original && !workshop)) && <EditorSection title="외관">
          {original && (original.concept || original.observed || original.roadview) && <p className="gamcheon-map__model-help">사진 시안 건물은 색·지붕 일부가 바뀌지 않을 수 있습니다.</p>}
          {original && <label className="gamcheon-map__building-toggle"><input type="checkbox" checked={override.hidden === true} onChange={(event) => change({ hidden: event.target.checked || undefined })} />이 건물 숨기기</label>}
          {added ? <>
            <FloorsSlider height={added.heightMeters} onChange={(floors) => onChangeAdded({ heightMeters: floorsToHeight(floors) })} />
            <NumberField label="건물 높이(m)" value={added.heightMeters} min={2.5} max={60} onChange={(heightMeters) => heightMeters !== undefined && onChangeAdded({ heightMeters })} />
            <ColorChoice label="벽 색" value={added.wallColor} options={WALL_COLORS} onChange={(wallColor) => wallColor !== undefined && onChangeAdded({ wallColor })} />
            <ColorChoice label="지붕 색" value={added.roofColor} options={ROOF_COLORS} onChange={(roofColor) => roofColor !== undefined && onChangeAdded({ roofColor })} />
            <RoofChoice value={added.roofStyle} onChange={(roofStyle) => onChangeAdded({ roofStyle })} />
          </> : original && !override.hidden && <>
            <FloorsSlider height={height} onChange={(floors) => change({ heightMeters: heightToFloors(original.heightMeters) === floors ? undefined : floorsToHeight(floors) })} />
            <NumberField label="건물 높이(m)" value={height} min={2.5} max={60} onChange={(heightMeters) => change({ heightMeters })} />
            <ColorChoice label="벽 색" value={override.wallColor ?? original.wallColor} original={original.wallColor} options={WALL_COLORS} onChange={(wallColor) => change({ wallColor })} />
            <ColorChoice label="지붕 색" value={override.roofColor ?? original.roofColor} original={original.roofColor} options={ROOF_COLORS} onChange={(roofColor) => change({ roofColor })} />
            <RoofChoice value={roofStyle} onChange={(style) => change({ roofStyle: style === original.roofStyle ? undefined : style })} />
          </>}
        </EditorSection>}
        {workshop && <EditorSection title="장소 정보"><WorkshopInfoEditor tools={workshop} /></EditorSection>}
        {(original || added) && <EditorSection title="3D 모델 교체">
          {workshop && <p className="gamcheon-map__model-help">올린 모델이 공방 자리를 대신합니다. 모델을 지우면 원래 공방 모델로 돌아갑니다.</p>}
          <ModelFiles tools={models} mode="replace" />
        </EditorSection>}
      </div>}

      <EditorSection key={hasSelection ? 'selected-list' : 'empty-list'} title={`대상 찾기 · ${editedIds.length + addedIds.length + models.placed.length}`} initiallyOpen={!hasSelection}>
        <form className="gamcheon-map__building-search" onSubmit={(event) => { event.preventDefault(); if (/^\d+$/.test(searchId)) onSelect(Number(searchId)) }}>
          <input aria-label="기존 건물 번호 검색" placeholder="기존 건물 ID 입력" value={searchId} onChange={(event) => setSearchId(event.target.value)} />
          <button type="submit">번호로 찾기</button>
        </form>
        <p className="gamcheon-map__model-help">고친 건물·새 건물·배치한 모델 목록입니다.</p>
        <div className="gamcheon-map__model-placed">
          {editedIds.map((id, index) => <button key={id} type="button" className={original?.id === id ? 'is-selected' : ''} onClick={() => onSelect(id)}><span>{String(index + 1).padStart(2, '0')}</span>건물 {id}</button>)}
          {addedIds.map((id, index) => <button key={id} type="button" className={added?.id === id ? 'is-selected' : ''} onClick={() => onSelectAdded(id)}><span>{String(editedIds.length + index + 1).padStart(2, '0')}</span>새 건물 {index + 1}</button>)}
          {models.placed.map((item, index) => <button key={item.id} type="button" className={model?.id === item.id ? 'is-selected' : ''} onClick={() => models.onSelect(item.id)}><span>{String(editedIds.length + addedIds.length + index + 1).padStart(2, '0')}</span>3D 모델 · {item.name || item.modelId}</button>)}
          {!editedIds.length && !addedIds.length && !models.placed.length && <p className="gamcheon-map__model-empty">아직 고치거나 더한 건물이 없습니다.</p>}
        </div>
      </EditorSection>
      {!hasSelection && drawingPoints === null && <EditorSection title={`3D 모델 추가 · ${models.files.length}개`}><ModelFiles tools={models} mode="place" /></EditorSection>}
      {local && workspace && <EditorSection title="백업과 미리보기">{workspace}</EditorSection>}
    </div>
  </div>
}
