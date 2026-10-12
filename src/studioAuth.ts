// 홈페이지 운영자 화면(/admin/map-editor)이 편집 앱 주소의 #editToken=으로 넘긴 편집 허가증을 받아 둡니다.
// 주소창에서는 바로 지우고(화면 공유·복사로 새지 않게) 이 탭의 sessionStorage에만 두며, 이 앱 서버의 /api/로
// 보내는 요청에만 Authorization 머리글로 붙입니다(서버가 확인: server/auth.ts의 verifyEditToken).
const KEY = 'gamcheon-map-edit-token'

function readToken() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const fromHash = hash.get('editToken')
  if (fromHash) {
    hash.delete('editToken')
    const rest = hash.toString()
    window.history.replaceState(null, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''))
    try { sessionStorage.setItem(KEY, fromHash) } catch { /* 저장하지 못해도 이 화면에서는 씁니다. */ }
    return fromHash
  }
  try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' }
}

// 허가증이 있으면 true(이때는 로그인·로그아웃이 필요 없음)
export function installEditToken() {
  const token = readToken()
  if (!token) return false
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (!headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
    return original(input, { ...init, headers })
  }
  return true
}
