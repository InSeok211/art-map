// 긴 작업을 조각내어 만들 때 한 조각이 끝난 뒤 브라우저에 차례를 넘깁니다(화면 그리기·입력 처리).
// setTimeout(0)은 중첩되면 브라우저가 4ms 이상으로 늘려 2천 조각이면 벽시계가 작업 시간의 1.5~2배가 됐습니다.
// scheduler.yield()가 있으면 그것을, 없으면 MessageChannel(지연 없음)을, 둘 다 없으면 setTimeout을 씁니다.
type Scheduler = { yield?: () => Promise<void> }

export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler
  if (typeof scheduler?.yield === 'function') return scheduler.yield()
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve() }
      channel.port2.postMessage(null)
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}
