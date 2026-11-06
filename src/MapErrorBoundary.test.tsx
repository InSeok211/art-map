// @vitest-environment jsdom
import { lazy, Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MapErrorBoundary } from './MapErrorBoundary'

const Broken = (): never => { throw new Error('화면 오류') }
const logged = vi.fn()

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(logged) })
afterEach(() => {
  cleanup()
  logged.mockClear()
  vi.restoreAllMocks()
})

describe('지도 오류 경계', () => {
  it('오류가 없으면 화면을 그대로 보여 준다', () => {
    render(<MapErrorBoundary variant="public"><p>지도</p></MapErrorBoundary>)
    expect(screen.getByText('지도')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('공개 지도는 새로고침과, 틀 밖에서 열리는 작가 목록 링크를 보여 준다', () => {
    render(<MapErrorBoundary variant="public"><Broken /></MapErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('지도를 열지 못했습니다')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
    const link = screen.getByRole('link', { name: '작가 목록 보기' })
    expect(link.getAttribute('href')).toBe('/artists')
    expect(link.getAttribute('target')).toBe('_top')
  })

  it('편집 앱은 새로고침을 안내하고 저장되지 않은 수정을 알리며 작가 목록 링크는 없다', () => {
    render(<MapErrorBoundary variant="studio"><Broken /></MapErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('저장되지 않은 수정')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('화면 조각을 받지 못해도 같은 안내를 보여 준다', async () => {
    const Missing = lazy(() => Promise.reject(new Error('조각을 받지 못함')))
    render(<MapErrorBoundary variant="studio"><Suspense fallback="불러오는 중"><Missing /></Suspense></MapErrorBoundary>)
    expect((await screen.findByRole('alert')).textContent).toContain('새로고침')
  })

  it('잡은 오류를 콘솔에 남긴다', () => {
    render(<MapErrorBoundary variant="public"><Broken /></MapErrorBoundary>)
    expect(logged).toHaveBeenCalledWith('map screen failed', expect.objectContaining({ message: '화면 오류' }), expect.anything())
  })
})
