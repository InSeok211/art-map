import { defineConfig } from 'vite'

// 지도 앱 화면: 공개 지도(/, index.html)와 편집 앱(/studio/, studio/index.html). 빌드 결과(dist-app)는 지도 앱
// 서버(wrangler.jsonc)가 정적 파일로 줍니다.
export default defineConfig({
  // Fixed port so this app never shares a port with other local Vite projects.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    rolldownOptions: { input: { map: 'index.html', studio: 'studio/index.html' } },
  },
})
