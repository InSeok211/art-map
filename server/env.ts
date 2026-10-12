// 지도 앱 서버(Cloudflare Worker)가 쓰는 자원입니다(wrangler.jsonc).
//  - DB: 골목길·GPS 기록·건물 편집·로그인 실패 기록(D1, migrations/)
//  - MODELS: 관리자가 올린 3D 모델(GLB) 파일(R2, map-models/ 아래)
//  - ASSETS: 빌드한 화면(공개 지도 /, 편집 앱 /studio/)
//  - ADMIN_USERNAME·ADMIN_PASSWORD_HASH·SESSION_SECRET: 편집 앱 관리자 로그인(비밀값, npm run admin:password로 설정)
//  - OPEN_EDITING: "true"면 로그인 없이 누구나 편집 앱을 씀(wrangler.jsonc의 vars). 끄면 다시 로그인해야 편집
export interface Env {
  DB: D1Database
  MODELS: R2Bucket
  ASSETS: Fetcher
  ADMIN_USERNAME?: string
  ADMIN_PASSWORD_HASH?: string
  SESSION_SECRET?: string
  OPEN_EDITING?: string
}
