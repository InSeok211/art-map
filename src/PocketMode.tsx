import { useRef } from 'react'

// 골목길을 기록하며 걸을 때 휴대폰을 주머니에 넣어 두는 화면입니다. 웹 페이지는 화면이 꺼지면 GPS를 멈추므로
// 화면은 켜 둔 채(자동 기록이 화면 꺼짐을 막음) 검게 덮어 배터리 소모와 잘못 누르는 것을 줄입니다.
// 화면을 두 번 누르면 지도로 돌아갑니다(한 번 눌러서는 닫히지 않음).
export function PocketMode({ pointCount, onExit }: { pointCount: number; onExit: () => void }) {
  const lastTap = useRef(0)
  return <div
    className="gamcheon-pocket-mode"
    role="dialog"
    aria-label="주머니 모드: 골목길 기록 중"
    onPointerUp={(event) => {
      event.preventDefault()
      const now = performance.now()
      if (now - lastTap.current < 450) onExit()
      lastTap.current = now
    }}
    onKeyDown={(event) => { if (event.key === 'Escape') onExit() }}
    tabIndex={-1}
  >
    <span className="gamcheon-pocket-mode__dot" aria-hidden="true" />
    <strong>골목길 기록 중 · {pointCount}점</strong>
    <small>화면을 끄지 말고 주머니에 넣어 걸어 주세요.<br />두 번 누르면 지도로 돌아갑니다.</small>
  </div>
}
