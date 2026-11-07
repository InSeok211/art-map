import { useEffect, useMemo, useRef, useState } from 'react'

// 편집 내용을 서버에 자동으로 저장합니다(골목길, 건물 초안).
//  - 연속 수정은 delayMs 뒤 최신 값 한 번으로 저장합니다.
//  - 저장은 한 번에 하나씩만 보냅니다. 늦게 끝난 옛 저장이 새 값을 덮지 않게, 그동안 생긴 수정은 끝난 뒤 최신 값으로 보냅니다.
//  - 실패해도 저절로 다시 보내지 않습니다. 다음 수정이 최신 값을 보냅니다.
//  - 저장되지 않은 수정이 있으면 페이지를 떠나기 전에 경고합니다.
export interface AutosaveOptions<T> {
  delayMs: number
  // 실패하면 reject합니다.
  save: (value: T) => Promise<void>
}

export interface Autosave<T> {
  // 최신 값을 맡기고 저장을 예약합니다.
  change: (value: T) => void
  // 지금까지의 수정을 끝까지 저장합니다. 실패하면 onError 대신 호출한 쪽에 reject로 돌려줍니다.
  flush: () => Promise<void>
  // 진행 중인 저장을 기다린 뒤 남은 수정을 버립니다.
  discard: () => Promise<void>
  // 예약된 자동 저장의 마지막 실패입니다. 다음 저장이 성공하거나 flush·discard를 시작하면 지웁니다.
  saveError: Error | null
}

export function useAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
  const [saveError, setSaveError] = useState<Error | null>(null)
  const latestOptions = useRef(options)
  latestOptions.current = options

  const [{ autosave, hasUnsaved }] = useState(() => {
    let value: T
    let timer: ReturnType<typeof setTimeout> | undefined
    let running: Promise<void> | null = null
    let waiting = false
    // 서버에 아직 저장되지 않은 수정이 있는지 알기 위한 수정 횟수입니다.
    let editCount = 0
    let savedCount = 0

    function start() {
      const sending = editCount
      const attempt = new Promise<void>((resolve) => resolve(latestOptions.current.save(value)))
        .then(() => { savedCount = sending })
      running = attempt.catch(() => undefined).then(() => {
        running = null
        if (!waiting) return
        waiting = false
        send()
      })
      return attempt
    }

    function send() {
      if (editCount === savedCount) return
      if (running) {
        waiting = true
        return
      }
      start().then(() => setSaveError(null), (error: Error) => setSaveError(error))
    }

    async function settle() {
      clearTimeout(timer)
      waiting = false
      while (running) await running
    }

    const autosave = {
      change(next: T) {
        value = next
        editCount += 1
        clearTimeout(timer)
        timer = setTimeout(send, latestOptions.current.delayMs)
      },
      async flush() {
        setSaveError(null)
        await settle()
        if (editCount !== savedCount) await start()
      },
      async discard() {
        setSaveError(null)
        await settle()
        savedCount = editCount
      },
    }
    return { autosave, hasUnsaved: () => editCount !== savedCount }
  })

  // 다시 열면 서버 값을 불러오므로, 저장되지 않은 수정이 있으면 떠나기 전에 경고합니다.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  return useMemo(() => ({ ...autosave, saveError }), [autosave, saveError])
}
