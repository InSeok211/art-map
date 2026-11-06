import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './MapErrorBoundary.css'

// 지도 화면에서 잡히지 않은 오류를 받아 흰 화면 대신 다음 행동을 알려 줍니다. 그래픽(WebGL)을 쓸 수 없어 지도를
// 만들지 못한 경우와, 배포 직후 오래된 화면 조각을 받지 못한 경우도 여기로 옵니다. 안내 화면이 다시 깨지지 않도록
// 지도 모듈에 기대지 않습니다.
type Variant = 'public' | 'studio'

const TEXT: Record<Variant, { title: string; message: string }> = {
  public: {
    title: '지도를 열지 못했습니다',
    message: '이 기기나 브라우저에서 3D 지도를 그릴 수 없거나 화면을 불러오지 못했습니다. 새로고침해 보시고, 계속되면 작가 목록에서 작가를 찾아보세요.',
  },
  studio: {
    title: '편집 화면을 열지 못했습니다',
    message: '화면 오류가 났거나 새 배포 때문에 화면을 불러오지 못했습니다. 새로고침해 주세요. 저장되지 않은 수정이 있으면 사라질 수 있습니다.',
  },
}

interface Props {
  variant: Variant
  children: ReactNode
}

export class MapErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('map screen failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const { variant } = this.props
    const { title, message } = TEXT[variant]
    return <main className="map-error" role="alert">
      <div className="map-error__box">
        <h1>{title}</h1>
        <p>{message}</p>
        <button type="button" onClick={() => window.location.reload()}>새로고침</button>
        {/* 공개 지도는 홈페이지 안에 끼워져 있을 수 있어, 좁은 틀이 아니라 화면 전체에서 엽니다. */}
        {variant === 'public' && <a href="/artists" target="_top">작가 목록 보기</a>}
      </div>
    </main>
  }
}
