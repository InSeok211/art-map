import { defineConfig } from 'vite'

export default defineConfig({
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
