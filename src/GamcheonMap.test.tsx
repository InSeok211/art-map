// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { GamcheonMap, STREET_LAYER_FALLBACK_MS } from './GamcheonMap'
import { ARTIST_WORKSHOP_MODEL, ARTIST_WORKSHOP_PLACE } from './artistWorkshop'
import { ModelLayer } from './ModelLayer'
import type { Place } from './types'

const mapOptions = vi.hoisted(() => [] as unknown[])
const mapFlyTo = vi.hoisted(() => [] as unknown[])
const mapEaseTo = vi.hoisted(() => [] as unknown[])
const styleLoad = vi.hoisted(() => ({ current: null as null | (() => void) }))
const markerRotations = vi.hoisted(() => [] as number[])
const layerVisibility = vi.hoisted(() => ({} as Record<string, unknown>))
const mapClick = vi.hoisted(() => ({ current: null as null | ((event: { lngLat: { lng: number; lat: number }; originalEvent?: { target: unknown } }) => void) }))

// These tests exercise map controls against a mocked MapLibre canvas. Real
// district geometry is checked separately and in the browser.
vi.mock('./StreetSceneLayer', () => ({ StreetSceneLayer: class { id = 'gamcheon-photographed-street-3d'; setOtherBuildingsHidden() {}; setBuildingOpacity() {} } }))

vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(options: unknown) { mapOptions.push(options) }
    addControl() { return this }
    resize() {}
    setPadding() {}
    remove() {}
    flyTo(options: unknown) { mapFlyTo.push(options) }
    easeTo(options: unknown) { mapEaseTo.push(options) }
    moveLayer() {}
    addLayer() {}
    fitBounds(bounds: unknown, options: unknown) { mapFlyTo.push({ bounds, ...(options as object) }) }
    getContainer() { return { clientWidth: 1280 } }
    getZoom() { return 15 }
    triggerRepaint() {}
    getLayer() { return {} }
    getSource() { return { setData() {} } }
    setLayoutProperty(id: string, _name: string, value: unknown) { layerVisibility[id] = value }
    on(event: string, listener: typeof mapClick.current) { if (event === 'click') mapClick.current = listener; if (event === 'style.load') styleLoad.current = listener as unknown as () => void }
    off(event: string) { if (event === 'click') mapClick.current = null }
    once() { return this }
  },
  Marker: class {
    element = document.createElement('div')
    setLngLat() { return this }
    setRotation(degrees: number) { markerRotations.push(degrees); return this }
    getElement() { return this.element }
    addTo() { return this }
    on() { return this }
    getLngLat() { return { lng: 129.01, lat: 35.097 } }
    remove() {}
  },
  NavigationControl: class {},
  LngLatBounds: class { extend() { return this } },
  MercatorCoordinate: { fromLngLat: () => ({ x: 0, y: 0, z: 0, meterInMercatorCoordinateUnits: () => 1 }) },
  setWorkerUrl() {},
}))

const places: Place[] = [
  { id: 'view', name: '테스트 전망대', category: 'attraction', latitude: 35.0975, longitude: 129.0103 },
  { id: 'cafe', name: '테스트 카페', category: 'shop', latitude: 35.0978, longitude: 129.0105, address: '감내2로 10' },
]

beforeEach(() => {
  mapOptions.length = 0
  mapFlyTo.length = 0
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
  it('offers an overview of the entire map', () => {
    render(<GamcheonMap />)
    fireEvent.click(screen.getByRole('button', { name: '전체 지도 보기' }))
    expect(mapFlyTo.at(-1)).toMatchObject({ pitch: 38, bearing: 0, padding: { left: 420 } })
  })
  it('zooms close enough to inspect the artist workshop from the place list', () => {
    render(<GamcheonMap places={[ARTIST_WORKSHOP_PLACE]} />)
    fireEvent.click(screen.getByRole('button', { name: /작가님 공방.*옥천로101번길 23/ }))
    expect(mapFlyTo.at(-1)).toMatchObject({
      center: [ARTIST_WORKSHOP_MODEL.longitude, ARTIST_WORKSHOP_MODEL.latitude],
      zoom: 19,
      pitch: 63,
    })
  })

  it('zooms close enough to inspect the artist workshop from the 3D editor', () => {
    render(<GamcheonMap models={[ARTIST_WORKSHOP_MODEL]} editable />)
    fireEvent.click(screen.getByRole('button', { name: '3D 배치' }))
    fireEvent.click(screen.getByRole('button', { name: /01작가님 공방/ }))
    expect(mapFlyTo.at(-1)).toMatchObject({ zoom: 19 })
  })

  it('shows only models inside Gamcheon 2-dong even when the map rectangle is wider', () => {
    const setItems = vi.spyOn(ModelLayer.prototype, 'setItems')
    const outside = { ...ARTIST_WORKSHOP_MODEL, id: 'outside-dong', longitude: 129.011, latitude: 35.098 }
    render(<GamcheonMap models={[ARTIST_WORKSHOP_MODEL, outside]} editable />)
    expect(setItems).toHaveBeenLastCalledWith([ARTIST_WORKSHOP_MODEL])
    fireEvent.click(screen.getByRole('button', { name: '3D 배치' }))
    expect(screen.queryByText('outside-dong')).toBeNull()
    setItems.mockRestore()
  })

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
    fireEvent.click(screen.getByRole('button', { name: '기본 에셋' }))
    fireEvent.click(screen.getByRole('button', { name: /지도에 배치/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0105, lat: 35.0978 } }))

    expect(onModelsChange).toHaveBeenCalledWith([expect.objectContaining({
      assetId: 'artist-workshop', longitude: 129.0105, latitude: 35.0978,
    })])
    fireEvent.change(screen.getByRole('slider', { name: '모델 크기' }), { target: { value: '30' } })
    expect(onModelsChange).toHaveBeenLastCalledWith([expect.objectContaining({ widthMeters: 30 })])
    fireEvent.click(screen.getByRole('button', { name: '위치 변경' }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.0107, lat: 35.0976 } }))
    expect(onModelsChange).toHaveBeenLastCalledWith([expect.objectContaining({ longitude: 129.0107, latitude: 35.0976 })])
  })

  it('tells the user while the 3D street is still being built after the base map', () => {
    render(<GamcheonMap />)
    // 바탕 지도가 다 그려진 뒤(idle)에야 3D 거리를 만들기 시작하므로, 그 전에는 안내 문구가 보입니다.
    expect(screen.getByRole('status').textContent).toContain('3D 거리를 불러오는 중')
  })

  it('toggles a workshop-only view that hides the other 3D buildings', () => {
    render(<GamcheonMap />)
    const button = screen.getByRole('button', { name: '작가님 공방만 보기' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: '다른 건물 다시 보기' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('finds a walking route from the current GPS position to the artist workshop', () => {
    let report: ((position: { coords: { longitude: number; latitude: number; accuracy: number; heading: number | null; speed: number | null } }) => void) | undefined
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, geolocation: {
      watchPosition: (success: typeof report) => { report = success; return 7 },
      clearWatch,
    } })
    const { unmount, container } = render(<GamcheonMap places={[ARTIST_WORKSHOP_PLACE]} />)
    // 넓은 화면의 옆 패널로 확인합니다(휴대폰 화면 MobileMapUI는 따로 시험).
    const panel = within(container.querySelector('.gamcheon-map__panel') as HTMLElement)
    // 지도를 열자마자 위치 추적을 시작합니다(길찾기 탭을 열지 않아도).
    expect(report).toBeDefined()
    fireEvent.click(panel.getByRole('button', { name: '길찾기' }))
    expect((panel.getByLabelText('출발지') as HTMLSelectElement).value).toBe('gps')
    expect((panel.getByLabelText('도착지') as HTMLSelectElement).value).toBe(`place:${ARTIST_WORKSHOP_PLACE.id}`)
    expect(panel.getByText('내 위치를 찾는 중입니다…')).toBeTruthy()
    // 촬영 거리 남쪽 끝에 있다고 알려 줍니다.
    act(() => report!({ coords: { longitude: 129.00884, latitude: 35.0943657, accuracy: 8, heading: null, speed: null } }))
    const result = panel.getByRole('region', { name: '찾은 길' })
    expect(result.textContent).toMatch(/\d+분/)
    expect(result.textContent).toContain('목적지')
    expect(panel.getByRole('button', { name: '내 위치를 따라가는 중' }).getAttribute('aria-pressed')).toBe('true')
    // 북쪽으로 약 10m 걸으면 지도가 따라오고, 화살표가 북쪽(0도 근처)을 가리킵니다.
    const easeCount = mapEaseTo.length
    act(() => report!({ coords: { longitude: 129.00884, latitude: 35.0944557, accuracy: 8, heading: null, speed: null } }))
    expect(mapEaseTo.length).toBeGreaterThan(easeCount)
    expect(mapEaseTo.at(-1)).toMatchObject({ center: [129.00884, 35.0944557] })
    const heading = markerRotations.at(-1)!
    expect(Math.min(heading, 360 - heading)).toBeLessThan(5)
    // 다른 탭으로 가도 내 위치는 계속 보이고, 지도를 닫으면 추적을 멈춥니다.
    fireEvent.click(screen.getByRole('button', { name: '장소' }))
    expect(clearWatch).not.toHaveBeenCalled()
    unmount()
    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  it('lets a host page select a place and pick a location on the map (embedded mode)', () => {
    const onMapClick = vi.fn()
    const { rerender } = render(<GamcheonMap compact places={places} onMapClick={onMapClick} />)
    act(() => mapClick.current!({ lngLat: { lng: 129.0103, lat: 35.0975 }, originalEvent: { target: document.body } }))
    expect(onMapClick).toHaveBeenCalledWith(129.0103, 35.0975)
    // 표식을 누른 것은 지도 클릭으로 알리지 않습니다.
    const marker = document.createElement('button')
    marker.className = 'gamcheon-map__marker'
    act(() => mapClick.current!({ lngLat: { lng: 129.0104, lat: 35.0976 }, originalEvent: { target: marker } }))
    expect(onMapClick).toHaveBeenCalledTimes(1)

    rerender(<GamcheonMap compact places={places} onMapClick={onMapClick} selectedPlaceId="cafe" />)
    expect(mapFlyTo.at(-1)).toMatchObject({ center: [129.0105, 35.0978] })
  })

  it('builds the 3D street even if the base map never finishes loading its tiles', () => {
    vi.useFakeTimers()
    try {
      render(<GamcheonMap />)
      expect(screen.getByRole('status').textContent).toContain('3D 거리를 불러오는 중')
      // 스타일은 준비됐지만 타일이 오지 않아 'idle'이 끝내 오지 않는 경우
      act(() => styleLoad.current!())
      act(() => { vi.advanceTimersByTime(STREET_LAYER_FALLBACK_MS + 10) })
      expect(screen.queryByText('3D 거리를 불러오는 중입니다.')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens at an angled 3D view that the user can rotate', () => {
    render(<GamcheonMap />)

    expect(mapOptions[0]).toMatchObject({
      pitch: 61,
      bearing: -8,
      dragRotate: true,
      pitchWithRotate: true,
    })
    const bounds = (mapOptions[0] as { maxBounds: number[][] }).maxBounds
    expect(bounds[0][0]).toBeCloseTo(128.9998058, 7)
    expect(bounds[0][1]).toBeCloseTo(35.0867957, 7)
    expect(bounds[1][0]).toBeCloseTo(129.0173734, 7)
    expect(bounds[1][1]).toBeCloseTo(35.1022347, 7)
  })

  it('filters the list by category and search text', () => {
    const { container } = render(<GamcheonMap places={places} />)
    const panel = within(container.querySelector('.gamcheon-map__panel') as HTMLElement)

    expect(panel.getByText('2곳')).toBeTruthy()
    fireEvent.click(panel.getByRole('button', { name: '가게' }))
    expect(panel.getByText('1곳')).toBeTruthy()
    expect(panel.queryByText('테스트 전망대')).toBeNull()

    fireEvent.change(panel.getByRole('searchbox', { name: '장소 검색' }), { target: { value: '없는 장소' } })
    expect(panel.getByText('검색 결과가 없어요')).toBeTruthy()
  })

  it('shows the phone layout: search, category chips with counts, place card, list and route views', () => {
    const { container } = render(<GamcheonMap places={[ARTIST_WORKSHOP_PLACE, ...places]} />)
    const mobile = within(container.querySelector('.gm-mobile') as HTMLElement)
    // 처음에는 작가님 공방 카드가 보입니다.
    expect(mobile.getByRole('region', { name: '장소 정보' }).textContent).toContain(ARTIST_WORKSHOP_PLACE.name)
    expect(mobile.getByRole('button', { name: '가게 1' })).toBeTruthy()
    // 주변 장소 → 목록, 검색하면 목록이 좁혀집니다.
    fireEvent.click(mobile.getByRole('button', { name: /주변 장소/ }))
    expect(mobile.getByRole('region', { name: '장소 목록' })).toBeTruthy()
    fireEvent.change(mobile.getByRole('searchbox', { name: '장소 검색' }), { target: { value: '카페' } })
    expect(mobile.getByRole('button', { name: /테스트 카페/ })).toBeTruthy()
    expect(mobile.queryByRole('button', { name: /테스트 전망대/ })).toBeNull()
    // 하단 메뉴의 길찾기는 길찾기 화면을 엽니다.
    fireEvent.click(within(mobile.getByRole('navigation', { name: '지도 메뉴' })).getByRole('button', { name: /길찾기/ }))
    expect(mobile.getByRole('region', { name: '길찾기' })).toBeTruthy()
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
    expect(within(screen.getByRole('region', { name: '선택한 장소' })).getByText('새 카페')).toBeTruthy()
  })

  it('shows a newly saved place even when a previous search hid it', () => {
    render(<GamcheonMap places={[]} editable />)
    fireEvent.change(screen.getByRole('searchbox', { name: '장소 검색' }), { target: { value: '다른 이름' } })
    fireEvent.click(screen.getByRole('button', { name: /장소 추가/ }))
    act(() => mapClick.current?.({ lngLat: { lng: 129.01, lat: 35.09 } }))
    fireEvent.change(screen.getByRole('textbox', { name: '장소 이름' }), { target: { value: '새 장소' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(within(screen.getByRole('region', { name: '선택한 장소' })).getByText('새 장소')).toBeTruthy()
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
