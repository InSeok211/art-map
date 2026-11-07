// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AlleyEditor } from './AlleyEditor'
import type { Alley } from './alleys'

const alley = (id: string, name?: string): Alley => ({ id, ...(name ? { name } : {}), coordinates: [[129.009, 35.095], [129.0095, 35.0955]], widthMeters: 3 })
// GPS 후보를 그대로 받으면 화면의 그리기 검사를 거치지 않아 이런 골목이 생길 수 있습니다.
const outside: Alley = { id: 'a2', coordinates: [[129.009, 35.095], [129.02, 35.095]], widthMeters: 3 }
const show = (selectedId: string | null, second: Alley = outside) => render(<AlleyEditor
  alleys={[alley('a1', '계단길'), second]} selectedId={selectedId} drawing={false} draftCount={0} error=""
  onStartDrawing={vi.fn()} onUndoPoint={vi.fn()} onFinishDrawing={vi.fn()} onCancelDrawing={vi.fn()} onSelect={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()}
/>)

afterEach(cleanup)

describe('저장이 거부될 골목 표시', () => {
  it('목록에서 문제가 된 골목만 표시한다', () => {
    show(null)
    expect(screen.getByRole('button', { name: /계단길/ }).className).not.toContain('is-problem')
    const flagged = screen.getByRole('button', { name: /골목길 2/ })
    expect(flagged.className).toContain('is-problem')
    expect(flagged.textContent).toContain('저장 안 됨')
  })

  it('고르면 이유를 보여 준다', () => {
    show('a2')
    expect(screen.getByRole('alert').textContent).toContain('지도 범위 밖의 점이 있습니다.')
  })

  it('이름은 규칙과 같은 길이까지만 입력받는다', () => {
    show('a1')
    expect(screen.getByLabelText('골목길 이름').getAttribute('maxlength')).toBe('60')
  })

  it('문제가 없으면 아무것도 표시하지 않는다', () => {
    show('a1', alley('a2'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/저장 안 됨/)).toBeNull()
  })
})
