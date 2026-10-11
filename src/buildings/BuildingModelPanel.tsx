import type { ChangeEvent } from 'react'
import { MODEL_WIDTH_RANGE } from './buildingEdits'
import type { PlacedModel } from './buildingEdits'
import type { ModelFile } from './modelLibrary'

// 작업실 '건물' 탭에서 올린 3D 모델(GLB)을 다루는 부분: 파일 올리기·목록, 고른 모델 조절.
export interface ModelTools {
  // 고른 모델과 초안에 둔 모델 전체
  selected: PlacedModel | null
  placed: PlacedModel[]
  // 지도를 눌러 모델 둘 곳을 고르는 중이면 안내 문구
  placing: string
  files: ModelFile[]
  // 초안이나 공개본에 쓰인 파일(지울 수 없음)
  usedIds: ReadonlySet<string>
  uploading: boolean
  error: string
  onUpload: (file: File) => void
  onDeleteFile: (id: string) => void
  // 고른 건물을 이 모델로 바꾸기 / 빈 땅에 두기
  onReplace: (file: ModelFile) => void
  onPlace: (file: ModelFile) => void
  onCancelPlacing: () => void
  onChange: (patch: Partial<PlacedModel>) => void
  onMove: () => void
  onRemove: () => void
  onSelect: (id: string) => void
}

const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`

// 올린 모델 파일 목록과 올리기. mode가 'replace'면 각 파일에 '이 모델로 바꾸기', 'place'면 '빈 곳에 두기'를 붙입니다.
export function ModelFiles({ tools, mode }: { tools: ModelTools; mode: 'replace' | 'place' }) {
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) tools.onUpload(file)
  }
  return <div className="gamcheon-map__building-models">
    <div className="gamcheon-map__model-primary-actions">
      <label className="gamcheon-map__model-import">{tools.uploading ? '올리는 중…' : '＋ GLB 모델 올리기'}
        <input type="file" accept=".glb,model/gltf-binary" disabled={tools.uploading} onChange={upload} />
      </label>
    </div>
    <p className="gamcheon-map__model-help">텍스처를 포함한 .glb 한 파일, 20MB까지 올릴 수 있습니다. 직접 만들었거나 쓸 권리가 있는 모델만 올려 주세요.</p>
    {tools.error && <p className="gamcheon-map__model-error" role="alert">{tools.error}</p>}
    {tools.files.map((file) => {
      const used = tools.usedIds.has(file.id)
      return <div key={file.id} className="gamcheon-map__building-model-file">
        <span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span>
        <div className="gamcheon-map__model-item-actions">
          {mode === 'replace'
            ? <button type="button" className="gamcheon-map__model-place" onClick={() => tools.onReplace(file)}>이 모델로 바꾸기</button>
            : <button type="button" onClick={() => tools.onPlace(file)}>빈 곳에 두기</button>}
          <button type="button" disabled={used} title={used ? '지도에 둔 모델은 먼저 지도에서 지워야 합니다' : undefined}
            onClick={() => { if (window.confirm(`'${file.name}' 파일을 지울까요?`)) tools.onDeleteFile(file.id) }}>파일 지우기</button>
        </div>
      </div>
    })}
    {!tools.files.length && <p className="gamcheon-map__model-empty">아직 올린 모델이 없습니다.</p>}
  </div>
}

export function PlacingBanner({ tools }: { tools: ModelTools }) {
  if (!tools.placing) return null
  return <div className="gamcheon-map__model-inspector">
    <strong>{tools.placing}</strong>
    <div className="gamcheon-map__model-item-actions"><button type="button" onClick={tools.onCancelPlacing}>취소</button></div>
  </div>
}

// 고른 모델의 크기·방향·위치 조절
export function ModelInspector({ model, tools, onClose }: { model: PlacedModel; tools: ModelTools; onClose: () => void }) {
  return <div className="gamcheon-map__model-inspector">
    <strong>3D 모델 · {model.name || model.modelId}</strong>
    {model.replaces.length > 0 && <p className="gamcheon-map__model-help">원래 건물 {model.replaces.length}채를 대신합니다. 모델을 지우면 원래 건물이 다시 보입니다.</p>}
    <label>크기(긴 쪽) <span>{model.widthMeters.toFixed(1)}m</span>
      <input aria-label="모델 크기" type="range" min={MODEL_WIDTH_RANGE.min} max={MODEL_WIDTH_RANGE.max} step={0.5} value={model.widthMeters}
        onChange={(event) => tools.onChange({ widthMeters: Number(event.target.value) })} />
    </label>
    <label>방향 <span>{Math.round(model.rotation)}°</span>
      <input aria-label="모델 방향" type="range" min={0} max={359} step={1} value={Math.round(model.rotation)}
        onChange={(event) => tools.onChange({ rotation: Number(event.target.value) })} />
    </label>
    <div className="gamcheon-map__model-item-actions">
      <button type="button" onClick={() => tools.onChange({ rotation: (model.rotation + 90) % 360 })}>90° 돌리기</button>
      <button type="button" onClick={() => tools.onChange({ rotation: (model.rotation + 180) % 360 })}>앞뒤 바꾸기</button>
    </div>
    <p className="gamcheon-map__model-help">모델의 긴 쪽이 '크기'가 되고, 바닥은 땅 높이에 맞춰 놓입니다.</p>
    <div className="gamcheon-map__model-item-actions">
      <button type="button" onClick={tools.onMove}>위치 옮기기</button>
      <button type="button" onClick={() => { if (window.confirm('이 모델을 지도에서 지울까요?')) tools.onRemove() }}>모델 지우기</button>
      <button type="button" onClick={onClose}>선택 해제</button>
    </div>
  </div>
}
