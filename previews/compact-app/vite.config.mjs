import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.dirname(fileURLToPath(import.meta.url))
const project=path.resolve(root,'../..')
export default defineConfig({
  plugins:[{name:'map-public-index',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/map-app/?'))req.url=req.url.replace('/map-app/?','/map-app/index.html?');next()})}}],
  root, publicDir:path.resolve(project,'../gamcheon-site/public'),
  resolve:{alias:{'next/link':path.join(root,'link.tsx'),react:path.join(project,'node_modules/react'),'react-dom':path.join(project,'node_modules/react-dom')},dedupe:['react','react-dom']},
  esbuild:{jsx:'automatic'},
  server:{host:'127.0.0.1',port:5175,strictPort:true,fs:{allow:[path.resolve(project,'..')]}},
})
