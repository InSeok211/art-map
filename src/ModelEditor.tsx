import type { ChangeEvent } from 'react'
import type { MapModel, ModelAsset, ModelStyle } from './modelCatalog'

interface ModelEditorProps {
  assets: ModelAsset[]
  models: MapModel[]
  selectedId: string | null
  chosenAssetId: string | null
  movingId: string | null
  styleFilter: ModelStyle
  error: string
  onStyleFilter: (style: ModelStyle) => void
  onChooseAsset: (id: string) => void
  onPlace: () => void
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<MapModel>) => void
  onMove: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onImport: (files: FileList) => void
}

const categoryIcon = { building: '⌂', nature: '♣', street: '✧' }

export function ModelEditor({
  assets, models, selectedId, chosenAssetId, movingId, styleFilter, error,
  onStyleFilter, onChooseAsset, onPlace, onSelect, onUpdate, onMove, onDuplicate, onDelete, onImport,
}: ModelEditorProps) {
  const selected = models.find((item) => item.id === selectedId)
  const selectedAsset = assets.find((asset) => asset.id === selected?.assetId)
  const chosenAsset = assets.find((asset) => asset.id === chosenAssetId)

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) onImport(event.target.files)
    event.target.value = ''
  }

  return <div className="gamcheon-map__model-editor">
    <p className="gamcheon-map__model-help">모델을 고른 뒤 지도를 클릭해 배치하세요. 배치한 모델은 위치·크기·방향을 직접 수정할 수 있습니다.</p>
    <div className="gamcheon-map__model-styles" role="group" aria-label="3D 에셋 스타일">
      {(['rounded', 'custom'] as const).map((style) => <button key={style} type="button" className={styleFilter === style ? 'is-active' : ''} onClick={() => onStyleFilter(style)}>{style === 'rounded' ? '기본 에셋' : '내 에셋'}</button>)}
    </div>
    <div className="gamcheon-map__model-assets">
      {assets.filter((asset) => asset.style === styleFilter).map((asset) => <button key={asset.id} type="button" className={chosenAssetId === asset.id ? 'is-selected' : ''} onClick={() => onChooseAsset(asset.id)} aria-pressed={chosenAssetId === asset.id}>
        <span className="gamcheon-map__model-icon" aria-hidden="true">{categoryIcon[asset.category]}</span>
        <span>{asset.name}</span>
      </button>)}
      {styleFilter === 'custom' && assets.every((asset) => asset.style !== 'custom') && <p className="gamcheon-map__model-empty">가져온 GLB 에셋이 없습니다.</p>}
    </div>
    <div className="gamcheon-map__model-primary-actions">
      <button type="button" className="gamcheon-map__model-place" disabled={!chosenAsset} onClick={onPlace}>{chosenAsset ? `${chosenAsset.name} 지도에 배치` : '에셋을 선택해 주세요'}</button>
      <label className="gamcheon-map__model-import">＋ 내 GLB 불러오기<input type="file" accept=".glb,model/gltf-binary" multiple onChange={handleImport} /></label>
    </div>
    {error && <p className="gamcheon-map__model-error" role="alert">{error}</p>}
    <div className="gamcheon-map__model-section-title">배치한 모델 <strong>{models.length}개</strong></div>
    <div className="gamcheon-map__model-placed">
      {models.map((item, index) => <button key={item.id} type="button" className={selectedId === item.id ? 'is-selected' : ''} onClick={() => onSelect(item.id)}>
        <span>{String(index + 1).padStart(2, '0')}</span>{assets.find((asset) => asset.id === item.assetId)?.name ?? '에셋 찾는 중'}
      </button>)}
      {models.length === 0 && <p className="gamcheon-map__model-empty">아직 지도에 배치한 모델이 없습니다.</p>}
    </div>
    {selected && <div className="gamcheon-map__model-inspector">
      <strong>{selectedAsset?.name ?? '선택한 모델'} 수정</strong>
      <label>크기 <span>{selected.widthMeters}m</span><input aria-label="모델 크기" type="range" min="2" max="80" step="1" value={selected.widthMeters} onChange={(event) => onUpdate(selected.id, { widthMeters: Number(event.target.value) })} /></label>
      <label>회전 <span>{selected.rotation}°</span><input aria-label="모델 회전" type="range" min="0" max="359" step="1" value={selected.rotation} onChange={(event) => onUpdate(selected.id, { rotation: Number(event.target.value) })} /></label>
      <label>높이 <span>{selected.altitudeMeters}m</span><input aria-label="모델 높이" type="range" min="-10" max="100" step="1" value={selected.altitudeMeters} onChange={(event) => onUpdate(selected.id, { altitudeMeters: Number(event.target.value) })} /></label>
      <div className="gamcheon-map__model-coordinates">{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</div>
      <div className="gamcheon-map__model-item-actions">
        <button type="button" onClick={() => onMove(selected.id)}>{movingId === selected.id ? '지도에서 새 위치 선택 중' : '위치 변경'}</button>
        <button type="button" onClick={() => onDuplicate(selected.id)}>복제</button>
        <button type="button" className="is-danger" onClick={() => onDelete(selected.id)}>삭제</button>
      </div>
    </div>}
  </div>
}
