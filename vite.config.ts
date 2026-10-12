import { defineConfig } from 'vite'

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
})
