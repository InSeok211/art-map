// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { useGeomanGeometry } from './useGeomanGeometry'

const state = vi.hoisted(() => ({ instances: [] as any[] }))
vi.mock('@geoman-io/maplibre-geoman-free', () => ({ Geoman: class {
  destroyed = false
  handlers: Record<string, (event: any) => void> = {}
  actionInstances: Record<string, any> = {}
  features = { deleteAll: vi.fn(), importGeoJsonFeature: vi.fn() }
  mapAdapter = { on: (name: string, callback: (event: any) => void) => { this.handlers[name] = callback } }
  disableAllModes = vi.fn()
  enableMode = vi.fn()
  enableGlobalEditMode = vi.fn()
  disableDraw = vi.fn(async () => { this.actionInstances = {} })
  destroy = vi.fn(async () => { this.destroyed = true })
  setGlobalEventsListener() {}
  waitForGeomanLoaded = async () => this
  constructor() { state.instances.push(this) }
  enableDraw = vi.fn(async (shape: string) => {
    const line = { shapeLngLats: [] as number[][],
      startShape: async (p: number[]) => { line.shapeLngLats = [p] },
      handleNextVertex: async (p: number[]) => { line.shapeLngLats.push(p) } }
    this.actionInstances[`draw__${shape}`] = { lineDrawer: line }
  })
} }))

const points: [number, number][] = [[129.0100, 35.0970], [129.0102, 35.0970], [129.0102, 35.0972]]
const options = () => ({ active: true, drawing: true, shape: 'polygon' as const, feature: null,
  onCreate: vi.fn(), onEdit: vi.fn(), onDraft: vi.fn(), onCancel: vi.fn(), onError: vi.fn() })
function mapRef() {
  const map = { getTerrain: () => null, getPitch: () => 60, getLayer: () => ({}), getSource: () => ({}),
    getLayoutProperty: () => 'none', setLayoutProperty: vi.fn(), setTerrain: vi.fn(), easeTo: vi.fn(), on: vi.fn(), off: vi.fn() }
  return { current: map as unknown as Map }
}
afterEach(() => { cleanup(); state.instances.length = 0 })

describe('Geoman editor lifecycle', () => {
  it('finishes a native draft, rebuilds it after undo, and cancels with Escape', async () => {
    const input = options()
    const { result } = renderHook(() => useGeomanGeometry(mapRef(), input))
    await waitFor(() => expect(result.current.ready).toBe(true))
    const gm = state.instances[0]
    await waitFor(() => expect(gm.enableDraw).toHaveBeenCalledWith('polygon'))
    gm.actionInstances.draw__polygon.lineDrawer.shapeLngLats = points
    act(() => result.current.finish())
    expect(input.onCreate).toHaveBeenCalledWith(points)
    act(() => result.current.undo())
    await waitFor(() => expect(input.onDraft).toHaveBeenLastCalledWith(points.slice(0, 2)))
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(input.onCancel).toHaveBeenCalledOnce()
  })
  it('rolls an invalid edit back and restores the camera when the tool closes', async () => {
    const ref = mapRef()
    const feature = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: points.slice(0, 2) } }
    const input = { ...options(), drawing: false, shape: 'line' as const, feature }
    const { result, rerender } = renderHook(({ active }) => useGeomanGeometry(ref, { ...input, active }), { initialProps: { active: true } })
    await waitFor(() => expect(result.current.ready).toBe(true))
    const gm = state.instances[0]
    await waitFor(() => expect(gm.enableGlobalEditMode).toHaveBeenCalled())
    const updateGeometry = vi.fn()
    act(() => gm.handlers['gm:editend']({ feature: { getGeoJson: () => ({ geometry: { type: 'LineString', coordinates: [[129.01, 35.08], points[0]] } }), updateGeometry } }))
    await waitFor(() => expect(updateGeometry).toHaveBeenCalledWith(feature.geometry))
    expect(input.onEdit).not.toHaveBeenCalled()
    expect(input.onError).toHaveBeenCalledWith(expect.stringContaining('사각형'))
    rerender({ active: false })
    expect(gm.destroy).toHaveBeenCalledWith({ removeSources: true })
    expect(ref.current.easeTo).toHaveBeenLastCalledWith({ pitch: 60, duration: 200 })
  })
})
