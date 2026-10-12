import { MODEL_FILE_ID, sanitizeBuildingEdits } from './buildingEdits'
import type { BuildingEdits } from './buildingEdits'
import { sanitizeAlleys } from '../alleys/alleys'
import type { Alley } from '../alleys/alleys'
import type { ModelFile, StoredFile } from './modelLibrary'
import { createArchive, readArchive } from './projectArchive'
import { checkGlb, MAX_GLB_BYTES } from './glbCheck'
import { polygonArea } from '../scene/planGeometry'
import { streetMeters } from '../map/streetCoordinates'

const json = (value: unknown) => new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
export interface ProjectBackup {
  format: 'gamcheon-map-project'
  version: 1
  exportedAt: string
  draft: BuildingEdits
  published: BuildingEdits
  alleys: Alley[]
  models: ModelFile[]
}
export const modelFilesFor = (edits: BuildingEdits, files: StoredFile[]) => {
  const ids = new Set(edits.models.map((model) => model.modelId))
  const available = new Map(files.map((file) => [file.id, file]))
  return [...ids].map((id) => {
    const file = available.get(id)
    if (!file) throw new Error(`모델 파일 ${id}가 없습니다. 해당 GLB를 복원한 뒤 내보내세요.`)
    return file
  })
}

export async function createProjectBackup(draft: BuildingEdits, published: BuildingEdits, alleys: Alley[], files: StoredFile[]) {
  modelFilesFor(draft, files); modelFilesFor(published, files)
  const project: ProjectBackup = { format: 'gamcheon-map-project', version: 1, exportedAt: new Date().toISOString(),
    draft: sanitizeBuildingEdits(draft), published: sanitizeBuildingEdits(published), alleys: sanitizeAlleys(alleys),
    models: files.map(({ id, name, size }) => ({ id, name, size })) }
  return createArchive([{ name: 'project.json', data: json(project) }, ...files.map((file) => ({ name: `models/${file.id}.glb`, data: file.file }))])
}

function strictEdits(value: unknown): BuildingEdits {
  const input = value as BuildingEdits | null
  if (!input || typeof input.overrides !== 'object' || !input.overrides || !Array.isArray(input.added) || !Array.isArray(input.models))
    throw new Error('백업의 건물 데이터 형식이 잘못되었습니다.')
  const clean = sanitizeBuildingEdits(input)
  if (Object.keys(clean.overrides).length !== Object.keys(input.overrides).length || clean.added.length !== input.added.length || clean.models.length !== input.models.length)
    throw new Error('백업에 유효하지 않은 건물·모델 데이터가 있습니다.')
  if (new Set(clean.added.map((b) => b.id)).size !== clean.added.length || new Set(clean.models.map((m) => m.id)).size !== clean.models.length)
    throw new Error('백업의 건물 ID가 중복되었습니다.')
  if (clean.added.some((building) => polygonArea(building.outline.map(streetMeters)) < 4))
    throw new Error('백업에 면적이 너무 작거나 일직선인 건물 윤곽이 있습니다.')
  return clean
}

export async function readProjectBackup(file: Blob): Promise<{ project: ProjectBackup; files: StoredFile[] }> {
  const archive = await readArchive(file), metadata = archive.get('project.json')
  const decode = (bytes: Uint8Array | undefined) => {
    if (!bytes || bytes.length > 8 * 1024 * 1024) throw new Error('백업 메타데이터가 없거나 너무 큽니다.')
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  let raw: ProjectBackup
  if (metadata) raw = decode(metadata) as ProjectBackup
  else {
    const manifest = decode(archive.get('manifest.json')) as { format: string; version: number; exportedAt: string;
      files?: { buildings: string; alleys: string; models: Record<string, string> } }
    if (manifest.format !== 'gamcheon-map-public' || manifest.version !== 1 || !manifest.files)
      throw new Error('편집기 백업 또는 공개본 ZIP을 선택하세요.')
    const published = strictEdits(decode(archive.get(manifest.files.buildings)).edits)
    const alleys = decode(archive.get(manifest.files.alleys)).alleys
    const models = Object.entries(manifest.files.models ?? {}).map(([id, path]) => {
      if (!MODEL_FILE_ID.test(id) || path !== `models/${id}.glb`) throw new Error('공개 모델 파일 경로가 잘못되었습니다.')
      return { id, name: published.models.find((model) => model.modelId === id)?.name || id, size: archive.get(path)?.length ?? 0 }
    })
    raw = { format: 'gamcheon-map-project', version: 1, exportedAt: manifest.exportedAt, draft: published, published, alleys, models }
  }
  if (raw.format !== 'gamcheon-map-project' || raw.version !== 1 || !Array.isArray(raw.models) || raw.models.length > 100 || !Array.isArray(raw.alleys))
    throw new Error('지원하지 않는 프로젝트 백업 형식입니다.')
  const draft = strictEdits(raw.draft), published = strictEdits(raw.published), alleys = sanitizeAlleys(raw.alleys)
  if (alleys.length !== raw.alleys.length) throw new Error('백업의 골목길 데이터가 잘못되었습니다.')
  const ids = new Set<string>()
  const files: StoredFile[] = raw.models.map((model) => {
    if (!model || typeof model.id !== 'string' || !MODEL_FILE_ID.test(model.id) || ids.has(model.id) || typeof model.name !== 'string')
      throw new Error('백업의 모델 ID가 잘못되었거나 중복되었습니다.')
    ids.add(model.id)
    const bytes = archive.get(`models/${model.id}.glb`)
    if (!bytes || bytes.length !== model.size || bytes.length > MAX_GLB_BYTES) throw new Error(`모델 파일 ${model.id}가 없거나 손상되었습니다.`)
    const buffer = new Uint8Array(bytes).buffer
    const problem = checkGlb(buffer)
    if (problem) throw new Error(`${model.id}: ${problem}`)
    return { id: model.id, name: model.name.slice(0, 80), size: bytes.length, file: new Blob([buffer], { type: 'model/gltf-binary' }) }
  })
  modelFilesFor(draft, files); modelFilesFor(published, files)
  return { project: { ...raw, draft, published, alleys, models: files.map(({ id, name, size }) => ({ id, name, size })) }, files }
}

export function downloadWorkspaceFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
