import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createArchive, crc32, readArchive } from './projectArchive'
import { createProjectBackup, readProjectBackup } from './workspaceFiles'
import { EMPTY_BUILDING_EDITS, setModel, setOverride } from './buildingEdits'

const data = new Uint8Array(readFileSync(new URL('../assets/models/custom/artist-workshop-180.glb', import.meta.url))).buffer
const file = { id: 'm-testmodel123', name: '모델', size: data.byteLength, file: new Blob([data]) }
const model = { id: 'p-model', modelId: file.id, name: '모델', longitude: 129.0095, latitude: 35.096, rotation: 0, widthMeters: 10, replaces: [] }
const published = setModel(EMPTY_BUILDING_EDITS, model.id, model)
const draft = setOverride(published, 123, { heightMeters: 12, terrain: { offsetMeters: 2 } })

describe('workspace archives', () => {
  it('writes standard ZIP data with CRC and round trips Unicode metadata', async () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const archive = await createArchive([{ name: 'project.json', data: new Blob(['{"name":"건물"}']) }])
    expect(new TextDecoder().decode((await readArchive(archive)).get('project.json'))).toBe('{"name":"건물"}')
  })
  it('rejects unsafe paths and damaged file contents', async () => {
    await expect(createArchive([{ name: '../outside.json', data: new Blob(['{}']) }])).rejects.toThrow(/경로/)
    const archive = await createArchive([{ name: 'test.json', data: new Blob(['hello']) }])
    const bytes = new Uint8Array(await archive.arrayBuffer()); bytes[30 + 'test.json'.length] ^= 1
    await expect(readArchive(new Blob([bytes.buffer]))).rejects.toThrow(/손상/)
  })
  it('backs up both revisions and restores the actual GLB bytes', async () => {
    const archive = await createProjectBackup(draft, published, [], [file])
    const restored = await readProjectBackup(archive)
    expect(restored.project.draft).toEqual(draft); expect(restored.project.published).toEqual(published)
    expect(new Uint8Array(await restored.files[0].file.arrayBuffer())).toEqual(new Uint8Array(data))
  })
  it('refuses an incomplete export instead of dropping a missing model', async () => {
    await expect(createProjectBackup(draft, published, [], [])).rejects.toThrow(/모델 파일.*없습니다/)
  })
  it('restores an older public ZIP as both the working and public revision', async () => {
    const restored = await readProjectBackup(await createArchive([
      { name: 'manifest.json', data: new Blob([JSON.stringify({ format: 'gamcheon-map-public', version: 1,
        files: { buildings: 'map-buildings.json', alleys: 'map-alleys.json', models: { [file.id]: `models/${file.id}.glb` } } })]) },
      { name: 'map-buildings.json', data: new Blob([JSON.stringify({ edits: published })]) },
      { name: 'map-alleys.json', data: new Blob(['{"alleys":[]}']) },
      { name: `models/${file.id}.glb`, data: file.file },
    ]))
    expect(restored.project.draft).toEqual(published)
    expect(restored.project.published).toEqual(published)
    expect(restored.files[0].id).toBe(file.id)
  })
  it('rejects a degenerate footprint before restoring the project', async () => {
    const bad = { ...EMPTY_BUILDING_EDITS, added: [{ id: 'b-line', outline: [[129.0095, 35.096], [129.0096, 35.096], [129.0097, 35.096]],
      heightMeters: 6.1, wallColor: 0xffffff, roofColor: 0x5593ad, roofStyle: 'flat' }] }
    const project = { format: 'gamcheon-map-project', version: 1, draft: bad, published: EMPTY_BUILDING_EDITS, alleys: [], models: [] }
    const archive = await createArchive([{ name: 'project.json', data: new Blob([JSON.stringify(project)]) }])
    await expect(readProjectBackup(archive)).rejects.toThrow(/일직선/)
  })
})
