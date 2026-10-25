// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileMapUI } from './MobileMapUI'
import type { ComponentProps } from 'react'

afterEach(cleanup)
const place = { id: 'studio', name: '작가 공방', category: 'attraction' as const, latitude: 35.1, longitude: 129, description: '공방 소개', address: '감천2동' }
function setup(overrides: Partial<ComponentProps<typeof MobileMapUI>> = {}) {
  const props: ComponentProps<typeof MobileMapUI> = { query: '', category: 'all', counts: { all: 1, attraction: 1, shop: 0, toilets: 0, bus_stop: 0 }, places: [place], selected: place, view: 'map', onQueryChange: vi.fn(), onCategoryChange: vi.fn(), onView: vi.fn(), onSelect: vi.fn(), onRouteTo: vi.fn(), onLocate: vi.fn(), located: false, headingUp: false, route: null, ...overrides }
  return { ...render(<MobileMapUI {...props} />), props }
}
describe('모바일 탐색 흐름', () => {
  it('검색창에 진입하면 장소 목록을 열고, 분류를 선택할 수 있다', () => {
    const { props } = setup()
    fireEvent.focus(screen.getByRole('searchbox', { name: '장소 검색' }))
    expect(props.onView).toHaveBeenCalledWith('list')
    fireEvent.click(screen.getByRole('button', { name: '화장실 0곳' }))
    expect(props.onCategoryChange).toHaveBeenCalledWith('toilets')
  })
  it('검색 결과가 없으면 검색어와 분류를 함께 초기화한다', () => {
    const { props } = setup({ view: 'list', places: [], query: '없는 장소', category: 'shop' })
    fireEvent.click(screen.getByRole('button', { name: '검색·분류 초기화' }))
    expect(props.onQueryChange).toHaveBeenCalledWith('')
    expect(props.onCategoryChange).toHaveBeenCalledWith('all')
  })
  it('선택한 항목을 표시하고 장소 선택 후 지도 화면으로 돌아간다', () => {
    const { props } = setup({ view: 'list' })
    const item = screen.getByRole('button', { name: /작가 공방 · 명소/ })
    expect(item.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(item)
    expect(props.onSelect).toHaveBeenCalledWith(place)
    expect(props.onView).toHaveBeenCalledWith('map')
  })
  it('장소 안내와 길찾기를 따로 제공하고 사진이 없으면 사진 안내를 표시하지 않는다', () => {
    const { props } = setup()
    const region = screen.getByRole('region', { name: '장소 정보' })
    fireEvent.click(within(region).getByRole('button', { name: '장소 안내 보기 ⌄' }))
    expect(within(region).getByText('공방 소개')).toBeTruthy()
    fireEvent.click(within(region).getByRole('button', { name: '길찾기' }))
    expect(props.onRouteTo).toHaveBeenCalledWith(place)
    expect(region.querySelector('.gm-mobile__place-scroll .gm-mobile__actions')).toBeNull()
  })
})
