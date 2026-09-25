// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GamcheonMap } from './GamcheonMap'
import { ModelLayer } from './ModelLayer'
import type { Place } from './types'

const mapOptions = vi.hoisted(() => [] as unknown[])
const layerVisibility = vi.hoisted(() => ({} as Record<string, unknown>))
const mapClick = vi.hoisted(() => ({ current: null as null | ((event: { lngLat: { lng: number; lat: number } }) => void) }))

vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(options: unknown) { mapOptions.push(options) }
    addControl() { return this }
    resize() {}
    setPadding() {}
    remove() {}
    flyTo() {}
    getZoom() { return 15 }
    triggerRepaint() {}
    getLayer() { return {} }
    getSource() { return { setData() {} } }
    setLayoutProperty(id: string, _name: string, value: unknown) { layerVisibility[id] = value }
    on(event: string, listener: typeof mapClick.current) { if (event === 'click') mapClick.current = listener }
    off(event: string) { if (event === 'click') mapClick.current = null }
  },
  Marker: class {
    setLngLat() { return this }
    addTo() { return this }
    on() { return this }
    getLngLat() { return { lng: 129.01, lat: 35.097 } }
    remove() {}
  },
  NavigationControl: class {},
  MercatorCoordinate: { fromLngLat: () => ({ x: 0, y: 0, z: 0, meterInMercatorCoordinateUnits: () => 1 }) },
  setWorkerUrl() {},
}))

const places: Place[] = [
  { id: 'view', name: '테스트 전망대', category: 'attraction', latitude: 35.0975, longitude: 129.0103 },
  { id: 'cafe', name: '테스트 카페', category: 'shop', latitude: 35.0978, longitude: 129.0105, address: '감내2로 10' },
]

beforeEach(() => {
  mapOptions.length = 0
  mapClick.current = null
  for (const key of Object.keys(layerVisibility)) delete layerVisibility[key]
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GamcheonMap', () => {
  it('toggles the real building footprints on and off', () => {
    render(<GamcheonMap />)

    fireEvent.click(screen.getByRole('button', { name: '실제 건물 윤곽 보기' }))
    expect(layerVisibility).toEqual({ 'building-footprint-fill': 'visible', 'building-footprint-line': 'visible' })

    fireEvent.click(screen.getByRole('button', { name: '실제 건물 윤곽 숨기기' }))
    expect(layerVisibility).toEqual({ 'building-footprint-fill': 'none', 'building-footprint-line': 'none' })
  })

  it('makes 3D buildings see-through on request and automatically while editing alleys', () => {
    const setOpacity = vi.spyOn(ModelLayer.prototype, 'setOpacity')
    render(<GamcheonMap editable />)
    expect(setOpacity).toHaveBeenLastCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: '3D 건물 모두 반투명하게' }))
    expect(setOpacity).toHaveBeenLastCalledWith(0.35)
    fireEvent.click(screen.getByRole('button', { name: '3D 건물 모두 반투명 끄기' }))
    expect(setOpacity).toHaveBeenLastCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: '골목길' }))
    expect(setOpacity).toHaveBeenLastCalledWith(0.35)
    fireEvent.click(screen.getByRole('button', { name: '장소' }))
    expect(setOpacity).toHaveBeenLastCalledWith(1)
    setOpacity.mockRestore()
  })

  it('draws an alley from map clicks and lets the editor rename and widen it', () => {
    const onAlleysChange = vi.fn()
    render(<GamcheonMap editable onAlleysChange={onAlleysChange} />)

    fireEvent.click(screen.getByRole('button', { name: '골목길' }))
    fireEvent.click(screen.getByRole('button', { name: /새 골목길 그리기/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0100, lat: 35.0970 } }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0104, lat: 35.0972 } }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0107, lat: 35.0975 } }))
    fireEvent.click(screen.getByRole('button', { name: '마지막 점 취소' }))
    fireEvent.click(screen.getByRole('button', { name: /완료/ }))

    expect(onAlleysChange).toHaveBeenCalledWith([expect.objectContaining({
      coordinates: [[129.0100, 35.0970], [129.0104, 35.0972]], widthMeters: 3,
    })])
    fireEvent.change(screen.getByRole('textbox', { name: '골목길 이름' }), { target: { value: '계단 골목' } })
    fireEvent.change(screen.getByRole('slider', { name: '골목길 폭' }), { target: { value: '4.5' } })
    expect(onAlleysChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: '계단 골목', widthMeters: 4.5 })])

    fireEvent.click(screen.getByRole('button', { name: '골목길 삭제' }))
    expect(onAlleysChange).toHaveBeenLastCalledWith([])
  })

  it('ignores alley points outside the map area', () => {
    const onAlleysChange = vi.fn()
    render(<GamcheonMap editable onAlleysChange={onAlleysChange} />)

    fireEvent.click(screen.getByRole('button', { name: '골목길' }))
    fireEvent.click(screen.getByRole('button', { name: /새 골목길 그리기/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.01, lat: 35.08 } }))

    expect(screen.getByRole('alert').textContent).toContain('사각형 지도 안쪽')
    expect(screen.getByRole('button', { name: /완료/ }).hasAttribute('disabled')).toBe(true)
  })

  it('places a 3D asset and lets the editor change its size and position', () => {
    const onModelsChange = vi.fn()
    render(<GamcheonMap editable models={[]} onModelsChange={onModelsChange} />)

    fireEvent.click(screen.getByRole('button', { name: '3D 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '각진형' }))
    fireEvent.click(screen.getByRole('button', { name: /지도에 배치/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0105, lat: 35.0978 } }))

    expect(onModelsChange).toHaveBeenCalledWith([expect.objectContaining({
      assetId: 'angular-house', longitude: 129.0105, latitude: 35.0978,
    })])
    fireEvent.change(screen.getByRole('slider', { name: '모델 크기' }), { target: { value: '30' } })
    expect(onModelsChange).toHaveBeenLastCalledWith([expect.objectContaining({ widthMeters: 30 })])
    fireEvent.click(screen.getByRole('button', { name: '위치 변경' }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0107, lat: 35.0976 } }))
    expect(onModelsChange).toHaveBeenLastCalledWith([expect.objectContaining({ longitude: 129.0107, latitude: 35.0976 })])
  })

  it('opens at an angled 3D view that the user can rotate', () => {
    render(<GamcheonMap />)

    expect(mapOptions[0]).toMatchObject({ pitch: 45, bearing: -25, dragRotate: true, pitchWithRotate: true, maxBounds: expect.any(Array) })
  })

  it('filters the list by category and search text', () => {
    render(<GamcheonMap places={places} />)

    expect(screen.getByText('2곳')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '가게' }))
    expect(screen.getByText('1곳')).toBeTruthy()
    expect(screen.queryByText('테스트 전망대')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: '장소 검색' }), { target: { value: '없는 장소' } })
    expect(screen.getByText('검색 결과가 없어요')).toBeTruthy()
  })

  it('reports the selected place to the host page', () => {
    const onPlaceSelect = vi.fn()
    render(<GamcheonMap places={places} onPlaceSelect={onPlaceSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /테스트 카페/ }))
    expect(onPlaceSelect).toHaveBeenCalledWith(places[1])
  })

  it('adds a place at a map click and reports the updated list', () => {
    const onPlacesChange = vi.fn()
    render(<GamcheonMap places={[]} editable onPlacesChange={onPlacesChange} />)

    fireEvent.click(screen.getByRole('button', { name: /장소 추가/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0105, lat: 35.0978 } }))
    fireEvent.change(screen.getByRole('textbox', { name: '장소 이름' }), { target: { value: '새 카페' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onPlacesChange).toHaveBeenCalledWith([expect.objectContaining({
      name: '새 카페', category: 'shop', longitude: 129.0105, latitude: 35.0978,
    })])
    expect(screen.getByText('새 카페')).toBeTruthy()
  })

  it('shows a newly saved place even when a previous search hid it', () => {
    render(<GamcheonMap places={[]} editable />)
    fireEvent.change(screen.getByRole('searchbox', { name: '장소 검색' }), { target: { value: '다른 이름' } })
    fireEvent.click(screen.getByRole('button', { name: /장소 추가/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.01, lat: 35.09 } }))
    fireEvent.change(screen.getByRole('textbox', { name: '장소 이름' }), { target: { value: '새 장소' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByText('새 장소')).toBeTruthy()
  })

  it('edits an existing place and preserves its id', () => {
    const onPlacesChange = vi.fn()
    render(<GamcheonMap places={places} editable onPlacesChange={onPlacesChange} />)

    fireEvent.click(screen.getByRole('button', { name: /테스트 카페/ }))
    fireEvent.click(screen.getByRole('button', { name: '선택 장소 수정' }))
    fireEvent.change(screen.getByRole('textbox', { name: '장소 이름' }), { target: { value: '수정한 카페' } })
    act(() => mapClick.current?.({ lngLat: { lng: 129.0104, lat: 35.0976 } }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onPlacesChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'cafe', name: '수정한 카페', longitude: 129.0104, latitude: 35.0976 }),
    ]))
  })

  it('hides places outside the rectangular map area and refuses an outside map click', () => {
    const onPlacesChange = vi.fn()
    render(<GamcheonMap places={[...places, { id: 'outside', name: '외부 장소', category: 'shop', latitude: 35.08, longitude: 129.01 }]} editable onPlacesChange={onPlacesChange} />)

    expect(screen.getByText('2곳')).toBeTruthy()
    expect(screen.queryByText('외부 장소')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /장소 추가/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.01, lat: 35.08 } }))
    expect(screen.getByRole('alert').textContent).toContain('사각형 지도 안쪽')
    fireEvent.change(screen.getByRole('textbox', { name: '장소 이름' }), { target: { value: '새 가게' } })
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true)
    expect(onPlacesChange).not.toHaveBeenCalled()
  })
})
