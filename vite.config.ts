import { configDefaults, defineConfig } from 'vitest/config'

// 지도 화면: 공개 지도(index.html)와 편집 앱(studio/index.html). 개발 미리보기(npm run dev)용 설정이고,
// 홈페이지로 내보낼 때는 scripts/export-to-site.mjs가 /map-app/ 주소에 맞춰 따로 빌드합니다.
export default defineConfig({
  // Fixed port so this app never shares a port with other local Vite projects.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    rolldownOptions: { input: { map: 'index.html', studio: 'studio/index.html' } },
  },
  test: {
    // vitest 기본 제외 목록에는 .tmp·tmp·output이 없어서, 거기 남겨 둔 복제본 저장소의 테스트까지 함께 돌았습니다.
    exclude: [...configDefaults.exclude, '.tmp/**', 'tmp/**', 'output/**', 'dist/**', 'dist-app/**', 'previews/**'],
  },
})
