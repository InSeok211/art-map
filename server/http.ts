// 응답 도우미입니다.
export const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, { ...init, headers: { 'cache-control': 'no-store', ...init.headers } })

export const error = (message: string, status: number) => json({ error: message }, { status })

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

// 다른 사이트가 관리자 브라우저를 시켜 값을 바꾸지 못하게(CSRF), 바꾸는 요청은 이 앱 화면에서 온 것만 받습니다.
export function fromThisApp(request: Request, url: URL) {
  if (request.method === 'GET' || request.method === 'HEAD') return true
  return request.headers.get('origin') === url.origin
}
