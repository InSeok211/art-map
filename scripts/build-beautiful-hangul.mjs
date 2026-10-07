import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

// Node canvas bridge for GLB export (the model itself no longer embeds photographs).
globalThis.FileReader ??= class {
  result=null; onloadend=null
  readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.()})}
  readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result=`data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;this.onloadend?.()})}
}
const crcTable=Array.from({length:256},(_,i)=>{let v=i;for(let j=0;j<8;j++)v=(v>>>1)^(v&1?0xedb88320:0);return v>>>0})
function pngChunk(type,data){
  const chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length,0);Buffer.from(type).copy(chunk,4);data.copy(chunk,8)
  let crc=0xffffffff;for(let i=4;i<8+data.length;i++)crc=crcTable[(crc^chunk[i])&255]^(crc>>>8)
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,data.length+8);return chunk
}
function encodePng(width,height,rgba){
  const head=Buffer.alloc(13);head.writeUInt32BE(width,0);head.writeUInt32BE(height,4);head[8]=8;head[9]=6
  const rows=Buffer.alloc(height*(width*4+1))
  for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(rows,y*(width*4+1)+1)
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',head),pngChunk('IDAT',deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))])
}
globalThis.ImageData ??= class {constructor(data,width,height){this.data=data;this.width=width;this.height=height}}
globalThis.document ??= {createElement(kind){
  if(kind!=='canvas')throw new Error(`Unsupported DOM node: ${kind}`)
  const canvas={width:1,height:1,pixels:null}
  canvas.getContext=()=>({translate(){},scale(){},putImageData(image){canvas.pixels=image.data}})
  canvas.toBlob=callback=>callback(new Blob([encodePng(canvas.width,canvas.height,canvas.pixels)],{type:'image/png'}))
  return canvas
}}

const scene=new THREE.Scene();scene.name='Beautiful-Hangul-calligraphy-storefront-concept'
const material=(name,color,extra={})=>new THREE.MeshStandardMaterial({name,color,roughness:0.82,side:THREE.DoubleSide,...extra})
const M={
  wall:material('warm-grey-painted-wall',0xc9ccc7),
  metal:material('dark-charcoal-metal',0x32383a,{metalness:0.25,roughness:0.52}),
  roof:material('shallow-standing-seam-roof',0x3f4549,{metalness:0.22,roughness:0.68}),
  glass:material('clear-storefront-glass',0xa5b3ad,{metalness:0.06,roughness:0.16,transparent:true,opacity:0.18,depthWrite:false}),
  warm:material('warm-wood-lined-interior',0xaa815e),
  entryWood:material('honey-coloured-entry-timber',0xc49368),
  entryFloor:material('light-stone-entry-floor',0xd8d0bd),
  wood:material('weathered-wood-display-rail',0x766252),
  soffit:material('pale-wood-soffit',0xc4ae8d),
  teal:material('worn-turquoise-threshold',0x258b83),
  tile:material('dark-mosaic-base',0x3e5c5a),
  paper:material('off-white-calligraphy-paper',0xece5d6),
  notice:material('white-printed-experience-notice',0xf5f1e9),
  ink:material('notice-charcoal-ink',0x45494c,{roughness:1}),
  roseInk:material('notice-muted-rose-ink',0xb66b77,{roughness:1}),
  blueInk:material('notice-muted-blue-ink',0x7796a1,{roughness:1}),
  inner:material('warm-interior-light',0xe0b481,{emissive:0x754221,emissiveIntensity:0.18}),
  slate:material('side-corrugated-steel',0x697780,{metalness:0.20,roughness:0.67}),
  blue:material('mosaic-blue',0x5a8d8d),
  pale:material('mosaic-grey',0xb0b6aa),
  blind:material('pale-fabric-window-blind',0xd3cfbf,{transparent:true,opacity:0.57,depthWrite:false}),
  blindLine:material('blind-fold-shadow',0xaaa89e),
  black:material('black-iron-window-frame',0x252729,{metalness:0.24,roughness:0.49}),
  stone:material('light-concrete-threshold-chip',0x8faaa4),
}
// 유리 안쪽의 서예·액자 작품은 그 작가의 저작물이라 사진을 모델에 넣지 않습니다. 자리마다 사진에서 한 번 구한
// 대표색(보이는 픽셀의 평균)만 남겨 종이 색 단색 면으로 그리고, 사진에서 잘라 냈던 원본은 지웠습니다.
const PAPER_COLORS={
  'brush-bold':0xa4aaae,
  'brush-flower':0xc2b7aa,
  'brush-tall':0xb3afa8,
  'frame-abstract':0xb7c2c5,
  'frame-lettering':0xadb3b0,
  'frame-poem':0xc3c0be,
}
async function paperTexture(name){
  const color=new THREE.Color().setHex(PAPER_COLORS[name]??0xeeeae0,THREE.SRGBColorSpace)
  return new THREE.MeshStandardMaterial({name:`artwork-${name}-plain`,color,roughness:0.9,side:THREE.DoubleSide})
}
const D={}
for(const name of ['brush-flower','brush-tall','brush-bold','frame-lettering','frame-abstract','frame-poem'])D[name]=await paperTexture(name)

function group(name,parent=scene){const object=new THREE.Group();object.name=name;parent.add(object);return object}
function box(parent,name,size,at,mat){const object=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);object.name=name;object.position.set(...at);parent.add(object);return object}
function plane(parent,name,size,at,mat,rotationY=0){const object=new THREE.Mesh(new THREE.PlaneGeometry(...size),mat);object.name=name;object.position.set(...at);object.rotation.y=rotationY;parent.add(object);return object}
function quad(parent,name,corners,mat){
  const geometry=new THREE.BufferGeometry()
  const [a,b,c,d]=corners
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3))
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2))
  geometry.computeVertexNormals()
  const object=new THREE.Mesh(geometry,mat);object.name=name;parent.add(object);return object
}
function triangle(parent,name,corners,mat){
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners.flat(),3))
  geometry.computeVertexNormals()
  const object=new THREE.Mesh(geometry,mat);object.name=name;parent.add(object);return object
}

// Small, crisp printed notices from the photographed shopfront. Keeping the
// lettering as geometry means the labels remain legible when the GLB is zoomed.
const glyphs={
  A:['01110','10001','10001','11111','10001','10001','10001'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10101','10011','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'],
  X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
}
function printedLine(parent,name,label,center,y,z,pixel,mat){
  const width=(label.length*6-1)*pixel,vertices=[]
  for(let n=0;n<label.length;n++){
    const glyph=glyphs[label[n]]||glyphs[' ']
    for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row][col]==='1'){
      const x=center-width/2+(n*6+col)*pixel,top=y+(3.5-row)*pixel
      const a=[x,top,z],b=[x+pixel*0.82,top,z],c=[x+pixel*0.82,top-pixel*0.82,z],d=[x,top-pixel*0.82,z]
      vertices.push(...a,...b,...c,...a,...c,...d)
    }
  }
  const geometry=new THREE.BufferGeometry()
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3))
  geometry.computeVertexNormals()
  const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;parent.add(mesh)
}
function experienceNotice(parent,index,center,y,z){
  box(parent,`experience-notice-paper-${index}`,[1.05,0.57,0.02],[center,y,z],M.notice)
  printedLine(parent,`experience-notice-title-${index}`,'EXPERIENCE',center,y+0.105,z+0.012,0.016,M.roseInk)
  printedLine(parent,`experience-notice-service-${index}`,'HANGEUL CALLIGRAPHY',center,y-0.055,z+0.012,0.0085,M.ink)
  printedLine(parent,`experience-notice-free-${index}`,'FREE',center,y-0.175,z+0.012,0.014,M.blueInk)
}

// x is the long street front; positive z faces the visitor. The photograph
// establishes the front. Unseen side and roof depths are provisional.
const shell=group('loft-shell')
box(shell,'foundation',[12.15,0.16,6.4],[0,0.08,0],M.wall)
box(shell,'rear-wall',[12.1,5.52,0.13],[0,2.89,-3.18],M.wall)
box(shell,'left-wall',[0.13,5.52,6.35],[-6.02,2.89,0],M.wall)
box(shell,'right-corrugated-wall',[0.13,5.52,6.35],[6.02,2.89,0],M.slate)
box(shell,'front-left-pier',[0.36,5.55,0.16],[-5.84,2.90,3.16],M.wall)
box(shell,'front-right-pier',[0.28,5.55,0.16],[5.90,2.90,3.16],M.wall)
box(shell,'front-header',[11.55,0.42,0.18],[0.02,5.49,3.16],M.wall)
for(let z=-3.0;z<3.0;z+=0.28)box(shell,`right-steel-rib-${z.toFixed(2)}`,[0.025,5.38,0.025],[6.11,2.92,z],M.metal)
box(shell,'right-rain-downpipe',[0.11,5.51,0.11],[6.14,2.86,-2.58],M.metal)
triangle(shell,'left-gable-under-roof',[[-6.03,5.62,3.18],[-6.03,6.24,0],[-6.03,5.62,-3.18]],M.wall)
triangle(shell,'right-gable-under-roof',[[6.03,5.62,-3.18],[6.03,6.24,0],[6.03,5.62,3.18]],M.slate)

const roof=group('wide-shallow-roof')
quad(roof,'front-roof-slope',[[-6.44,5.83,3.93],[6.44,5.83,3.93],[6.44,6.24,0],[-6.44,6.24,0]],M.roof)
quad(roof,'rear-roof-slope',[[6.44,6.24,0],[-6.44,6.24,0],[-6.44,5.82,-3.74],[6.44,5.82,-3.74]],M.roof)
box(roof,'long-front-fascia',[12.95,0.21,0.15],[0,5.80,3.91],M.metal)
box(roof,'rear-fascia',[12.95,0.18,0.15],[0,5.79,-3.74],M.metal)
for(const x of [-6.44,6.44])box(roof,`side-eave-${x}`,[0.13,0.15,7.7],[x,5.81,0.08],M.metal)
box(roof,'pale-wood-underside',[12.64,0.06,0.69],[0,5.69,3.56],M.soffit)
for(let x=-6.15;x<6.2;x+=0.24)box(roof,`soffit-board-joint-${x.toFixed(2)}`,[0.012,0.008,0.67],[x,5.653,3.56],M.wood)
box(roof,'ridge-cap',[12.88,0.07,0.15],[0,6.25,0],M.metal)
for(let x=-5.8;x<=5.9;x+=0.49){
  const seam=box(roof,`standing-roof-seam-${x.toFixed(1)}`,[0.018,0.035,3.95],[x,6.04,1.96],M.metal)
  seam.rotation.x=0.104
}

const inside=group('warm-visible-interior')
box(inside,'timber-back-panel',[11.3,2.86,0.08],[0,1.73,-2.66],M.warm)
box(inside,'upper-room-back-wall',[11.3,1.82,0.08],[0,4.07,-2.66],M.wall)
for(let x=-5.55;x<5.6;x+=0.31)box(inside,`interior-wood-board-joint-${x.toFixed(2)}`,[0.012,2.72,0.014],[x,1.72,-2.60],M.wood)
box(inside,'interior-floor',[11.3,0.07,5.8],[0,0.22,0],M.soffit)
// A real intermediate floor is visible through the tall upper glazing.
box(inside,'mezzanine-floor',[10.72,0.18,3.54],[-0.30,3.65,-1.13],M.soffit)
box(inside,'mezzanine-front-edge',[10.72,0.20,0.11],[-0.30,3.66,0.70],M.wood)
for(const x of [-5.40,-3.70,-2.00,-0.30,1.40,3.10,4.80])box(inside,`mezzanine-guard-post-${x}`,[0.055,0.91,0.06],[x,4.22,0.76],M.metal)
for(const y of [4.13,4.67])box(inside,`mezzanine-guardrail-${y}`,[10.32,0.045,0.055],[-0.30,y,0.76],M.metal)
// The real upper glazing has pale blinds and a fine black inner grille.
for(let i=0;i<7;i++){
  const center=-5.66+i*1.46+0.73
  box(inside,`upper-fabric-blind-${i}`,[1.19,1.70,0.026],[center,4.65,2.88],M.blind)
  for(let j=0;j<9;j++)box(inside,`blind-fold-${i}-${j}`,[1.19,0.012,0.028],[center,3.85+j*0.195,2.905],M.blindLine)
}
for(const x of [-5.0,-3.1,-1.2,0.7,2.6,4.5])box(inside,`interior-shelf-${x}`,[1.13,0.06,0.35],[x,1.28,-2.55],M.wood)
box(inside,'low-work-bench',[2.3,0.13,0.75],[3.40,0.96,0.56],M.wood)
for(const x of [2.42,4.37])box(inside,`work-bench-leg-${x}`,[0.09,0.75,0.09],[x,0.54,0.56],M.wood)
for(const x of [-4.25,-1.05,2.05,4.55])box(inside,`warm-ceiling-light-${x}`,[0.55,0.06,0.32],[x,5.27,0.05],M.inner)

const front=group('black-framed-calligraphy-glazing')
const x0=-5.66,bay=1.46,numberOfBays=7,frontZ=3.27
box(front,'glazed-front-bottom-rail',[10.32,0.09,0.11],[-0.55,0.27,frontZ+0.07],M.metal)
box(front,'glazed-front-top-rail',[10.32,0.12,0.11],[-0.55,5.52,frontZ+0.07],M.metal)
// The photographed horizontal divider meets the top of the entrance door.
box(front,'glazed-front-transom',[10.32,0.10,0.11],[-0.55,3.75,frontZ+0.08],M.metal)
for(let i=0;i<numberOfBays;i++){
  const left=x0+i*bay,center=left+bay/2
  box(front,`glass-bay-${i}`,[bay-0.08,5.13,0.035],[center,2.89,frontZ],M.glass)
  box(front,`left-mullion-${i}`,[0.075,5.35,0.11],[left,2.92,frontZ+0.08],M.metal)
  if(i===numberOfBays-1)box(front,'right-final-mullion',[0.075,5.35,0.11],[left+bay,2.92,frontZ+0.08],M.metal)
  // The black inner grid is visible through the upper panes in all four photos.
  for(const offset of [-0.46,-0.39,0.39,0.46])box(front,`upper-lattice-vertical-${i}-${offset}`,[0.018,1.70,0.035],[center+offset,4.65,frontZ+0.11],M.black)
  for(const height of [3.90,4.00,4.18,5.04,5.15,5.30])box(front,`upper-lattice-crossbar-${i}-${height}`,[bay-0.16,0.018,0.035],[center,height,frontZ+0.11],M.black)
  // The reference has large sheets stacked down each pane, including the
  // narrow window immediately beside the separate entrance opening.
  if(i<7){
    const works=[
      ['brush-bold','brush-flower','brush-tall'],
      ['brush-flower','brush-tall','brush-bold'],
      ['brush-tall','brush-bold','brush-flower'],
      ['brush-flower','brush-bold','brush-tall'],
      ['brush-bold','brush-tall','brush-flower'],
      ['brush-tall','brush-flower','brush-bold'],
      ['brush-flower','brush-bold','brush-tall'],
    ][i]
    for(let row=0;row<3;row++){
      if((i===2&&row===1)||(i===4&&row===0)||(i===5&&row===2)||(i===6&&row===1))continue
      const y=2.93-row*0.92,x=center+((i+row)%2===0?-0.045:0.045)
      box(front,`mounted-paper-edge-${i}-${row}`,[0.91,0.82,0.014],[x,y,frontZ+0.147],M.paper)
      plane(front,`photographed-calligraphy-paper-${i}-${row}`,[0.87,0.78],[x,y,frontZ+0.158],D[works[row]])
    }
    if(i===2)experienceNotice(front,i,center,2.03,frontZ+0.15)
    if(i===4)experienceNotice(front,i,center,2.93,frontZ+0.15)
    if(i===5)experienceNotice(front,i,center,1.10,frontZ+0.15)
    if(i===6)experienceNotice(front,i,center,2.03,frontZ+0.15)
  }
  if(i%2===0){
    box(front,`mosaic-base-panel-${i}`,[bay-0.13,0.45,0.035],[center,0.55,frontZ+0.13],M.tile)
    for(let j=0;j<18;j++){
      const px=center-0.59+(j%6)*0.21,py=0.36+Math.floor(j/6)*0.15
      box(front,`mosaic-chip-${i}-${j}`,[0.14+(j%3)*0.017,0.085+(j%2)*0.018,0.012],[px,py,frontZ+0.154],j%4===0?M.pale:j%3===0?M.stone:M.blue)
    }
  }
}

// The door sits at the right end, with warm timber lining visible in the
// opening. A hinged glass leaf projects toward the alley as photographed.
const door=group('outward-opened-right-end-entrance')
box(door,'door-right-jamb',[0.095,5.35,0.13],[5.78,2.92,frontZ+0.06],M.metal)
box(door,'door-head',[1.50,0.10,0.13],[5.04,3.75,frontZ+0.07],M.metal)
box(door,'upper-entry-transom-glass',[1.42,1.66,0.035],[5.04,4.65,frontZ],M.glass)
for(const y of [4.23,4.83,5.52])box(door,`entry-upper-grid-${y}`,[1.42,0.03,0.05],[5.04,y,frontZ+0.12],M.metal)
box(door,'door-threshold',[1.53,0.07,0.20],[5.04,0.27,frontZ+0.13],M.metal)
box(door,'entry-light-stone-floor',[1.43,0.055,1.72],[5.03,0.255,2.45],M.entryFloor)
box(door,'timber-entry-return',[0.07,3.35,1.30],[5.72,2.0,2.49],M.entryWood)
box(door,'entry-left-return',[0.07,3.35,1.30],[4.29,2.0,2.49],M.entryWood)
box(door,'entry-back-timber-wall',[1.42,3.25,0.06],[5.03,2.0,1.82],M.entryWood)
for(let j=0;j<8;j++){
  box(door,`right-entry-lining-board-${j}`,[0.013,3.24,0.017],[5.67,2.0,1.87+j*0.17],M.wood)
  box(door,`back-entry-lining-board-${j}`,[0.012,3.16,0.017],[4.36+j*0.19,2.0,1.87],M.wood)
}
box(door,'interior-art-mat',[0.79,1.04,0.025],[5.03,2.14,1.89],M.paper)
plane(door,'interior-framed-calligraphy',[0.70,0.91],[5.03,2.14,1.91],D['frame-poem'])
box(door,'interior-display-bench-seat',[1.09,0.12,0.43],[5.02,0.94,2.39],M.wood)
for(const x of [4.56,5.49])box(door,`interior-display-bench-leg-${x}`,[0.09,0.63,0.09],[x,0.58,2.39],M.wood)
box(door,'entry-warm-light-strip',[1.21,0.06,0.12],[5.03,3.33,2.33],M.inner)
// The photo shows the leaf hinged on the right edge of the opening and
// swinging out toward the alley, leaving the timber-lined entrance visible.
const leaf=group('open-glass-leaf',door);leaf.position.set(5.78,0,frontZ+0.10);leaf.rotation.y=-0.86
box(leaf,'door-leaf-dark-glass',[1.38,3.38,0.035],[0.69,2.02,0],M.glass)
for(const x of [0,1.38])box(leaf,`door-leaf-vertical-${x}`,[0.085,3.46,0.10],[x,2.02,0.02],M.metal)
for(const y of [0.29,2.26,3.75])box(leaf,`door-leaf-horizontal-${y}`,[1.42,0.08,0.10],[0.69,y,0.02],M.metal)
for(let i=0;i<4;i++)plane(leaf,`calligraphy-on-open-door-${i}`,[0.72,0.62],[0.72,0.71+i*0.71,0.09],D[['brush-flower','brush-tall','brush-bold','brush-flower'][i]])
box(leaf,'silver-door-handle',[0.045,0.33,0.08],[1.20,1.56,0.12],M.pale)
box(door,'door-closer-body',[0.50,0.075,0.09],[5.15,3.61,frontZ+0.18],M.metal)
box(door,'entry-address-plaque',[0.22,0.16,0.022],[5.80,1.83,frontZ+0.13],M.pale)

const threshold=group('turquoise-entrance-edge')
box(threshold,'painted-concrete-strip',[11.88,0.07,0.73],[0,0.15,3.64],M.teal)
for(const x of [-5.4,-3.45,-1.5,0.45,2.4,4.35])box(threshold,`worn-threshold-block-${x}`,[0.64,0.10,0.22],[x,0.21,3.97],M.teal)
box(threshold,'entry-pavement-slope',[1.70,0.065,0.76],[5.02,0.16,3.63],M.teal)
for(let i=0;i<21;i++){
  const x=-5.73+(i%7)*1.72+(i%3)*0.11,z=3.49+Math.floor(i/7)*0.24
  box(threshold,`worn-paint-mark-${i}`,[0.12+(i%3)*0.07,0.008,0.05],[x,0.191,z],i%3===0?M.stone:M.blue)
}

const display=group('weathered-railing-with-framed-works')
for(const x of [-5.34,-3.84,-2.34,-0.84,0.66])box(display,`railing-post-${x}`,[0.105,1.03,0.12],[x,0.68,4.08],M.wood)
for(const y of [0.48,1.05])box(display,`long-timber-rail-${y}`,[6.16,0.085,0.10],[-2.34,y,4.10],M.wood)
for(const x of [-5.34,-3.84,-2.34,-0.84,0.66])box(display,`railing-post-cap-${x}`,[0.17,0.055,0.17],[x,1.22,4.08],M.wood)
const framed=['frame-lettering','frame-abstract','frame-poem','brush-flower']
for(let i=0;i<4;i++){
  const x=-4.63+i*1.44
  box(display,`outer-art-frame-${i}`,[1.08,0.96,0.075],[x,1.01,4.20],i%2?M.wood:M.soffit)
  box(display,`paper-mat-${i}`,[0.93,0.81,0.024],[x,1.01,4.25],M.paper)
  plane(display,`photographed-framed-work-${i}`,[0.80,0.69],[x,1.01,4.27],D[framed[i]])
}

// The site footprint is narrow across the alley and runs farther inward.
// Keep the photographed seven-bay frontage while correcting the overall mass.
const narrowDeepMass=new THREE.Group()
narrowDeepMass.name='narrow-frontage-long-depth-footprint'
for(const part of [...scene.children])narrowDeepMass.add(part)
// The user estimates the door at 2–2.5 m. A 0.70 height scale makes its
// 3.46-unit leaf 2.42 m and brings the photographed eave to about 4.1 m.
narrowDeepMass.scale.set(0.68,0.70,1.72)
scene.add(narrowDeepMass)
scene.updateMatrixWorld(true)

// Fit every facade, roof and detail vertex to the four corners of the OSM
// footprint. OSM supplies the plan only; the photographed door and mezzanine
// heights retain their existing vertical coordinates. The west edge is the
// glazed front facing the alley.
const osm=JSON.parse(await readFile(fileURLToPath(new URL('../src/gamcheon-buildings.json',import.meta.url)),'utf8'))
const footprint=osm.features.find(feature=>feature.properties.id===1468551350)
if(!footprint||footprint.geometry.type!=='Polygon')throw new Error('Beautiful Hangul OSM footprint is missing')
const ring=footprint.geometry.coordinates[0].slice(0,-1)
if(ring.length!==4)throw new Error('Beautiful Hangul OSM footprint is no longer four-sided')
const center=[ring.reduce((sum,point)=>sum+point[0],0)/4,ring.reduce((sum,point)=>sum+point[1],0)/4]
const byEast=[...ring].sort((a,b)=>a[0]-b[0])
const [frontNorth,frontSouth]=byEast.slice(0,2).sort((a,b)=>b[1]-a[1])
const [rearNorth,rearSouth]=byEast.slice(2).sort((a,b)=>b[1]-a[1])
const metresPerLatitude=111320,metresPerLongitude=metresPerLatitude*Math.cos(center[1]*Math.PI/180)
const acrossEast=(frontSouth[0]-frontNorth[0])*metresPerLongitude
const acrossSouth=(frontNorth[1]-frontSouth[1])*metresPerLatitude
const rotation=Math.atan2(-acrossSouth,acrossEast)
function osmLocal([longitude,latitude]){
  const east=(longitude-center[0])*metresPerLongitude,south=(center[1]-latitude)*metresPerLatitude
  return [Math.cos(rotation)*east-Math.sin(rotation)*south,Math.sin(rotation)*east+Math.cos(rotation)*south]
}
const corners={frontNorth:osmLocal(frontNorth),frontSouth:osmLocal(frontSouth),rearNorth:osmLocal(rearNorth),rearSouth:osmLocal(rearSouth)}
const fitted=new THREE.Group();fitted.name='OSM-way-1468551350-fitted-building'
const coreLeft=-6.02*0.68,coreRight=6.02*0.68,coreRear=-3.18*1.72,coreFront=3.16*1.72
const mix=(a,b,t)=>a+(b-a)*t
scene.traverse(object=>{
  if(!object.isMesh)return
  const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld)
  const positions=geometry.getAttribute('position')
  for(let index=0;index<positions.count;index++){
    const u=(positions.getX(index)-coreLeft)/(coreRight-coreLeft),v=(positions.getZ(index)-coreRear)/(coreFront-coreRear)
    const north=[mix(corners.rearNorth[0],corners.frontNorth[0],v),mix(corners.rearNorth[1],corners.frontNorth[1],v)]
    const south=[mix(corners.rearSouth[0],corners.frontSouth[0],v),mix(corners.rearSouth[1],corners.frontSouth[1],v)]
    positions.setX(index,mix(north[0],south[0],u))
    positions.setZ(index,mix(north[1],south[1],u))
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  const mesh=new THREE.Mesh(geometry,object.material);mesh.name=object.name;mesh.renderOrder=object.renderOrder;fitted.add(mesh)
})
scene.clear();scene.add(fitted)
const output=fileURLToPath(new URL('../src/assets/models/custom/beautiful-hangul-studio.glb',import.meta.url))
await mkdir(fileURLToPath(new URL('../src/assets/models/custom/',import.meta.url)),{recursive:true})
const glb=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true})
await writeFile(output,Buffer.from(glb))
console.log(`Wrote ${output} (${Math.round(glb.byteLength/1024)} KiB)`)
