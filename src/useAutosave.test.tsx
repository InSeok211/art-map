// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAutosave } from './useAutosave'

// 저장 요청 자리에 두는 가짜입니다. 받은 값을 기록하고, 응답은 시험에서 직접 끝냅니다.
function fakeSave() {
  const sent: string[] = []
  const finish: { ok: () => void; fail: (message: string) => void }[] = []
  const save = (value: string) => {
    sent.push(value)
    return new Promise<void>((resolve, reject) => {
      finish.push({ ok: resolve, fail: (message) => reject(new Error(message)) })
    })
  }
  return { sent, finish, save }
}

function setup(delayMs = 800) {
  const fake = fakeSave()
  const onSaved = vi.fn()
  const onError = vi.fn()
  const hook = renderHook(() => useAutosave<string>({ delayMs, save: fake.save, onSaved, onError }))
  return { ...fake, onSaved, onError, ...hook, autosave: () => hook.result.current }
}

const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('묶음 저장', () => {
  it('연속 수정은 마지막 수정에서 delayMs 뒤 최신 값 한 번으로 저장한다', async () => {
    const { autosave, sent } = setup()
    autosave().change('a')
    await tick(500)
    autosave().change('b')
    await tick(799)
    expect(sent).toEqual([])
    await tick(1)
    expect(sent).toEqual(['b'])
  })

  it('저장이 끝나면 onSaved로 알린다', async () => {
    const { autosave, finish, onSaved, onError } = setup()
    autosave().change('a')
    await tick(800)
    expect(onSaved).not.toHaveBeenCalled()
    finish[0].ok()
    await tick()
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('다시 그려져도 새로 받은 save와 알림을 쓴다', async () => {
    const first = fakeSave()
    const second = fakeSave()
    const hook = renderHook(({ save }) => useAutosave<string>({ delayMs: 800, save }), { initialProps: { save: first.save } })
    const before = hook.result.current
    hook.rerender({ save: second.save })
    expect(hook.result.current).toBe(before)
    hook.result.current.change('a')
    await tick(800)
    expect(first.sent).toEqual([])
    expect(second.sent).toEqual(['a'])
  })
})

describe('떠나기 전 경고', () => {
  const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('수정이 없으면 경고하지 않는다', () => {
    setup()
    expect(leaving()).toBe(false)
  })

  it('저장 예약 중과 저장 중에는 경고하고, 저장이 끝나면 경고하지 않는다', async () => {
    const { autosave, finish } = setup()
    autosave().change('a')
    expect(leaving()).toBe(true)
    await tick(800)
    expect(leaving()).toBe(true)
    finish[0].ok()
    await tick()
    expect(leaving()).toBe(false)
  })

  it('저장 중에 또 고쳤으면 앞선 저장이 끝나도 계속 경고한다', async () => {
    const { autosave, finish } = setup()
    autosave().change('a')
    await tick(800)
    autosave().change('b')
    finish[0].ok()
    await tick()
    expect(leaving()).toBe(true)
  })

  it('저장에 실패한 내용이 남아 있으면 계속 경고한다', async () => {
    const { autosave, finish } = setup()
    autosave().change('a')
    await tick(800)
    finish[0].fail('일시 오류')
    await tick()
    expect(leaving()).toBe(true)
  })

  it('화면에서 사라지면 경고를 떼고, 예약된 저장은 그대로 보낸다', async () => {
    const { autosave, sent, unmount } = setup()
    autosave().change('a')
    unmount()
    expect(leaving()).toBe(false)
    await tick(800)
    expect(sent).toEqual(['a'])
  })

  it('버린 수정은 경고하지 않는다', async () => {
    const { autosave } = setup()
    autosave().change('a')
    await act(async () => { await autosave().discard() })
    expect(leaving()).toBe(false)
  })
})

describe('flush: 지금까지의 수정을 끝까지 저장', () => {
  // 끝났는지 볼 수 있게 flush의 결과를 기록합니다.
  const track = (promise: Promise<void>) => {
    const state = { done: false, error: null as Error | null }
    promise.then(() => { state.done = true }, (error: Error) => { state.error = error })
    return state
  }

  it('예약된 저장을 기다리지 않고 바로 보내고, 저장이 끝나야 끝난다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    const state = track(autosave().flush())
    await tick()
    expect(sent).toEqual(['a'])
    expect(state.done).toBe(false)

    finish[0].ok()
    await tick(800)
    expect(state.done).toBe(true)
    expect(sent).toEqual(['a'])
  })

  it('저장 중이면 끝나기를 기다렸다가 그동안의 최신 값을 보낸다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    await tick(800)
    autosave().change('b')
    const state = track(autosave().flush())
    await tick()
    expect(sent).toEqual(['a'])

    finish[0].ok()
    await tick()
    expect(sent).toEqual(['a', 'b'])
    expect(state.done).toBe(false)
    finish[1].ok()
    await tick()
    expect(state.done).toBe(true)
  })

  it('저장 중인 값이 최신이면 기다리기만 하고 다시 보내지 않는다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    await tick(800)
    const state = track(autosave().flush())
    finish[0].ok()
    await tick()
    expect(state.done).toBe(true)
    expect(sent).toEqual(['a'])
  })

  it('기다리는 동안 고친 값도 함께 저장하고, 나중에 같은 값을 또 보내지 않는다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    await tick(800)
    const state = track(autosave().flush())
    autosave().change('b')
    finish[0].ok()
    await tick()
    expect(sent).toEqual(['a', 'b'])

    finish[1].ok()
    await tick(800)
    expect(state.done).toBe(true)
    expect(sent).toEqual(['a', 'b'])
  })

  it('저장할 수정이 없으면 보내지 않는다', async () => {
    const { autosave, sent } = setup()
    await autosave().flush()
    expect(sent).toEqual([])
  })

  it('실패하면 호출한 쪽에 실패를 돌려주고 onError는 부르지 않으며, 다음 flush가 다시 보낸다', async () => {
    const { autosave, sent, finish, onError } = setup()
    autosave().change('a')
    const state = track(autosave().flush())
    await tick()
    finish[0].fail('공개 전 저장 실패')
    await tick()
    expect(state.error?.message).toBe('공개 전 저장 실패')
    expect(onError).not.toHaveBeenCalled()
    // 지워진 예약이 나중에 저절로 다시 보내지 않는다
    await tick(800)
    expect(sent).toEqual(['a'])

    const retry = track(autosave().flush())
    await tick()
    expect(sent).toEqual(['a', 'a'])
    finish[1].ok()
    await tick()
    expect(retry.done).toBe(true)
  })
})

describe('discard: 남은 수정을 버림', () => {
  it('예약된 저장을 보내지 않는다', async () => {
    const { autosave, sent } = setup()
    autosave().change('a')
    await autosave().discard()
    await tick(800)
    expect(sent).toEqual([])
  })

  it('저장 중이면 끝나기를 기다리고, 기다리던 수정은 보내지 않는다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    await tick(800)
    autosave().change('b')
    await tick(800)
    let done = false
    void autosave().discard().then(() => { done = true })
    await tick()
    expect(done).toBe(false)

    finish[0].ok()
    await tick(800)
    expect(done).toBe(true)
    expect(sent).toEqual(['a'])
  })

  it('저장 중이던 요청이 실패해도 버리기는 실패하지 않는다', async () => {
    const { autosave, finish } = setup()
    autosave().change('a')
    await tick(800)
    const discarding = autosave().discard()
    finish[0].fail('일시 오류')
    await expect(discarding).resolves.toBeUndefined()
  })

  it('버린 뒤의 수정은 평소처럼 저장한다', async () => {
    const { autosave, sent } = setup()
    autosave().change('a')
    await autosave().discard()
    autosave().change('b')
    await tick(800)
    expect(sent).toEqual(['b'])
  })
})

describe('저장 순서', () => {
  it('앞선 저장이 끝나기 전에는 다음 저장을 보내지 않고, 끝나면 최신 값 하나만 보낸다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    await tick(800)
    autosave().change('b')
    await tick(800)
    autosave().change('c')
    await tick(800)
    expect(sent).toEqual(['a'])

    finish[0].ok()
    await tick()
    expect(sent).toEqual(['a', 'c'])
  })

  it('앞선 저장이 실패하면 onError로 알리고, 기다리던 수정은 이어서 저장한다', async () => {
    const { autosave, sent, finish, onError } = setup()
    autosave().change('a')
    await tick(800)
    autosave().change('b')
    await tick(800)

    finish[0].fail('일시 오류')
    await tick()
    expect(onError.mock.calls[0][0].message).toBe('일시 오류')
    expect(sent).toEqual(['a', 'b'])
  })

  it('실패한 뒤 저절로 다시 보내지 않고, 다음 수정이 최신 값을 보낸다', async () => {
    const { autosave, sent, finish } = setup()
    autosave().change('a')
    await tick(800)
    finish[0].fail('일시 오류')
    await tick(60_000)
    expect(sent).toEqual(['a'])

    autosave().change('b')
    await tick(800)
    expect(sent).toEqual(['a', 'b'])
  })

  it('save가 바로 오류를 던져도 저장 순서가 막히지 않는다', async () => {
    const onError = vi.fn()
    const sent: string[] = []
    const save = (value: string) => {
      sent.push(value)
      if (value === 'a') throw new Error('바로 실패')
      return Promise.resolve()
    }
    const { result } = renderHook(() => useAutosave<string>({ delayMs: 800, save, onError }))
    result.current.change('a')
    await tick(800)
    expect(onError).toHaveBeenCalledTimes(1)
    result.current.change('b')
    await tick(800)
    expect(sent).toEqual(['a', 'b'])
  })
})
