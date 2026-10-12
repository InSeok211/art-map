// Vite 공개 미리보기는 브라우저 데이터를 읽고, 로컬 Worker 화면도 서버 API를 사용합니다.
export const LOCAL_PUBLIC_PREVIEW = import.meta.env?.DEV === true && typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)
export const PUBLISHED_ALLEYS_KEY = 'gamcheon-map-alleys-v1'
