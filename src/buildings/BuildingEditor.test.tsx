// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { BuildingEditor } from './BuildingEditor'
import { NEW_BUILDING_DEFAULTS } from './buildingEdits'
import { ARTIST_WORKSHOP_PLACE } from '../places/artistWorkshop'
import type { StreetBuilding } from '../scene/streetSceneData'

function fixture(patch: Partial<ComponentProps<typeof BuildingEditor>> = {}): ComponentProps<typeof BuildingEditor> {
  return {
    local: true, canUndo: true, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn(), terrainMode: false,
    settings: {}, elevationInfo: '', onChangeSettings: vi.fn(), onPlacement: vi.fn(), onMoveBuilding: vi.fn(), onPickEntrance: vi.fn(), onDuplicate: vi.fn(),
    selected: null, workshop: null, added: null, onRoad: false, drawingPoints: null,
    models: { selected: null, placed: [], placing: '', files: [], usedIds: new Set(), uploading: false, error: '',
      onUpload: vi.fn(), onDeleteFile: vi.fn(), onReplace: vi.fn(), onPlace: vi.fn(), onCancelPlacing: vi.fn(), onChange: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onSelect: vi.fn() },
    notice: '', editedIds: [], addedIds: [], editedCount: 0, publishedCount: 0, dirty: true, busy: false, status: '초안을 저장했습니다.',
    onChange: vi.fn(), onChangeAdded: vi.fn(), onRemoveAdded: vi.fn(), onTrimRoad: vi.fn(), onSelect: vi.fn(), onSelectAdded: vi.fn(), onStartDrawing: vi.fn(),
    onUndoPoint: vi.fn(), onFinishDrawing: vi.fn(), onCancelDrawing: vi.fn(), onClose: vi.fn(), onPublish: vi.fn(), onDiscard: vi.fn(), ...patch,
  }
}
const added = { id: 'b-test', outline: [[129.01, 35.097], [129.0102, 35.097], [129.0102, 35.0972]] as [number, number][], ...NEW_BUILDING_DEFAULTS }
afterEach(cleanup)

describe('selected building properties', () => {
  it('shows a selection prompt and keeps publishing and history accessible', () => {
    const props = fixture()
    render(<BuildingEditor {...props} />)
    expect(screen.getByText('고칠 대상을 선택하세요')).toBeTruthy()
    expect(screen.queryByText('배치', { selector: 'summary' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '공개본 확정' }))
    fireEvent.click(screen.getByRole('button', { name: '실행 취소 · Ctrl+Z' }))
    expect(props.onPublish).toHaveBeenCalledOnce()
    expect(props.onUndo).toHaveBeenCalledOnce()
  })
  it('edits appearance in its own group and keeps that group open after saving', () => {
    const props = fixture({ added, addedIds: [added.id] })
    const { rerender } = render(<BuildingEditor {...props} />)
    expect(screen.getByText('배치', { selector: 'summary' }).parentElement?.hasAttribute('open')).toBe(true)
    const appearance = screen.getByText('외관', { selector: 'summary' })
    expect(appearance.parentElement?.hasAttribute('open')).toBe(false)
    fireEvent.click(appearance)
    fireEvent.change(screen.getByRole('slider', { name: '층수' }), { target: { value: '3' } })
    expect(props.onChangeAdded).toHaveBeenCalledWith({ heightMeters: 8.75 })
    rerender(<BuildingEditor {...props} added={{ ...added, heightMeters: 8.75 }} />)
    expect(appearance.parentElement?.hasAttribute('open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }))
    expect(props.onClose).toHaveBeenCalledOnce()
  })
  it('provides place information for the workshop and hides unsupported appearance', () => {
    const workshop = { info: {}, defaults: ARTIST_WORKSHOP_PLACE, photoUrl: null, photoStatus: '', photoBusy: false,
      onChange: vi.fn(), onPhoto: vi.fn(), onRemovePhoto: vi.fn() }
    render(<BuildingEditor {...fixture({ selected: { building: { id: 1468590644 } as StreetBuilding, override: {} }, workshop })} />)
    expect(screen.queryByText('외관', { selector: 'summary' })).toBeNull()
    fireEvent.click(screen.getByText('장소 정보', { selector: 'summary' }))
    const name = screen.getByRole('textbox', { name: '공방 이름' })
    fireEvent.change(name, { target: { value: '새 공방 이름' } })
    fireEvent.blur(name)
    expect(workshop.onChange).toHaveBeenCalledWith({ name: '새 공방 이름' })
    expect(screen.getByText('3D 모델 교체', { selector: 'summary' })).toBeTruthy()
  })
  it('shows GLB placement fields and omits building appearance and replacement tools', () => {
    const props = fixture()
    props.models.selected = { id: 'p-test', modelId: 'm-abcdefgh', name: '작품', longitude: 129.01, latitude: 35.097, rotation: 0, widthMeters: 4, replaces: [] }
    render(<BuildingEditor {...props} />)
    expect(screen.getByRole('spinbutton', { name: '모델 폭(m)' })).toBeTruthy()
    expect(screen.queryByText('외관', { selector: 'summary' })).toBeNull()
    expect(screen.queryByText('3D 모델 교체', { selector: 'summary' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '90° 돌리기' }))
    expect(props.models.onChange).toHaveBeenCalledWith({ rotation: 90 })
    expect(screen.getAllByRole('button', { name: '선택 해제' })).toHaveLength(1)
  })
})
