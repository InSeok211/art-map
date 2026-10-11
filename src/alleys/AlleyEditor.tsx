import { ALLEY_WIDTH_RANGE, alleyLengthMeters } from './alleys'
import type { Alley } from './alleys'

interface AlleyEditorProps {
  alleys: Alley[]
  selectedId: string | null
  drawing: boolean
  draftCount: number
  error: string
  onStartDrawing: () => void
  onUndoPoint: () => void
  onFinishDrawing: () => void
  onCancelDrawing: () => void
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<Alley>) => void
  onDelete: (id: string) => void
}

const alleyLabel = (alley: Alley, index: number) => alley.name || `골목길 ${index + 1}`

export function AlleyEditor({
  alleys, selectedId, drawing, draftCount, error,
  onStartDrawing, onUndoPoint, onFinishDrawing, onCancelDrawing, onSelect, onUpdate, onDelete,
}: AlleyEditorProps) {
  const selectedIndex = alleys.findIndex((alley) => alley.id === selectedId)
  const selected = alleys[selectedIndex]

  return <div className="gamcheon-map__model-editor">
    <p className="gamcheon-map__model-help">
      {drawing
        ? '지도를 차례로 클릭해 길이 지나갈 점을 찍으세요. 두 점 이상 찍은 뒤 완료를 누르면 골목길이 됩니다.'
        : '새 골목길을 그리거나, 목록에서 길을 골라 점을 드래그해 모양을 고치세요.'}
    </p>
    {drawing ? <div className="gamcheon-map__model-primary-actions">
      <button type="button" className="gamcheon-map__model-place" disabled={draftCount < 2} onClick={onFinishDrawing}>완료 ({draftCount}점)</button>
      <button type="button" disabled={draftCount === 0} onClick={onUndoPoint}>마지막 점 취소</button>
      <button type="button" onClick={onCancelDrawing}>그리기 취소</button>
    </div> : <div className="gamcheon-map__model-primary-actions">
      <button type="button" className="gamcheon-map__model-place" onClick={onStartDrawing}>＋ 새 골목길 그리기</button>
    </div>}
    {error && <p className="gamcheon-map__model-error" role="alert">{error}</p>}
    <div className="gamcheon-map__model-section-title">골목길 목록 <strong>{alleys.length}개</strong></div>
    <div className="gamcheon-map__model-placed">
      {alleys.map((alley, index) => <button key={alley.id} type="button" className={selectedId === alley.id ? 'is-selected' : ''} onClick={() => onSelect(alley.id)}>
        <span>{String(index + 1).padStart(2, '0')}</span>{alleyLabel(alley, index)}
      </button>)}
      {alleys.length === 0 && <p className="gamcheon-map__model-empty">아직 골목길이 없습니다.</p>}
    </div>
    {selected && !drawing && <div className="gamcheon-map__model-inspector">
      <strong>{alleyLabel(selected, selectedIndex)} 수정</strong>
      <label>이름<input className="gamcheon-map__alley-name" aria-label="골목길 이름" value={selected.name ?? ''} maxLength={60} placeholder={`골목길 ${selectedIndex + 1}`} onChange={(event) => onUpdate(selected.id, { name: event.target.value })} /></label>
      <label>폭 <span>{selected.widthMeters}m</span><input aria-label="골목길 폭" type="range" min={ALLEY_WIDTH_RANGE.min} max={ALLEY_WIDTH_RANGE.max} step="0.5" value={selected.widthMeters} onChange={(event) => onUpdate(selected.id, { widthMeters: Number(event.target.value) })} /></label>
      <div className="gamcheon-map__model-coordinates">점 {selected.coordinates.length}개 · 길이 약 {Math.round(alleyLengthMeters(selected.coordinates))}m</div>
      <p className="gamcheon-map__model-help gamcheon-map__alley-tip">흰 점을 드래그해 옮기고, 점을 더블클릭하면 지웁니다. 점 사이의 작은 ＋를 누르면 점이 추가됩니다.</p>
      <div className="gamcheon-map__model-item-actions">
        <button type="button" className="is-danger" onClick={() => onDelete(selected.id)}>골목길 삭제</button>
      </div>
    </div>}
  </div>
}
