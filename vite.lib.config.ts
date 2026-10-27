import { defineConfig, type Plugin } from 'vite'

// 라이브러리 빌드(npm run build → dist/gamcheon-map.js). Vite는 lib 모드에서 모든 에셋을 base64로 번들에 넣어 버려서
// 그린하우스·아름다운한글 GLB(약 1.9MB)가 2.6MB 문자열로 들어갔습니다. 모델 파일은 scripts/copy-model-assets.mjs가
// dist/assets/models/ 아래에 따로 복사하므로, 번들에서는 그 위치를 실행 시점에 가리키게 바꿉니다.
function externalModelAssets(): Plugin {
  return {
    name: 'gamcheon:external-model-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/scene/modelFiles.ts')) return
      // new URL('../assets/models/x.glb', import.meta.url) 같은 정적 주소는 Vite가 에셋으로 처리해 인라인합니다.
      // 정적으로 분석되지 않는 꼴(배열 join)로 바꿔 두면 그대로 남고, 실행할 때 dist/assets/models/... 를 가리킵니다.
      return code.replace(/new URL\('\.\.\/assets\/models\/([^']+)', import\.meta\.url\)/g,
        (_match, file: string) => `new URL(['./assets/models/', ${JSON.stringify(file)}].join(''), import.meta.url)`)
    },
  }
}

export default defineConfig({
  plugins: [externalModelAssets()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'gamcheon-map',
      cssFileName: 'gamcheon-map',
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'maplibre-gl', 'three'],
    },
  },
})
