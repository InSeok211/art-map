import * as THREE from 'three'
import { loadDomidoDesign as loadSheet } from './domido-design-materials.mjs'

export const loadDomidoDesign = () => loadSheet(new URL('../design/greenhouse-exterior/greenhouse-reference-sheet-v1.png',import.meta.url))
export const designSurface = part => part.name.startsWith('painted_town_utility') ? 'town' : null
export function addDesignUvs(geometry, kind, design) {
  geometry.computeBoundingBox()
  const bounds=geometry.boundingBox, size=bounds.getSize(new THREE.Vector3()), p=geometry.getAttribute('position'), uv=[]
  for(let i=0;i<p.count;i++) uv.push((613+(p.getX(i)-bounds.min.x)/(size.x||1)*95)/design.width,
    (470+(1-(p.getY(i)-bounds.min.y)/(size.y||1))*127)/design.height)
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
}
export function addDesignMural(scene, design) {
  const { createCanvas, ImageData } = design.runtime
  globalThis.ImageData ??= ImageData
  globalThis.document ??= {createElement(kind){
    if(kind!=='canvas')throw new Error(`Unexpected export element: ${kind}`)
    const canvas=createCanvas(1,1)
    canvas.toBlob=callback=>canvas.encode('png').then(bytes=>callback(new Blob([bytes],{type:'image/png'})))
    return canvas
  }}
  function panel(name, region, size, at, texture=design.texture) {
    const [left,top,right,bottom]=region, geometry=new THREE.PlaneGeometry(...size), uv=geometry.getAttribute('uv')
    for(let i=0;i<uv.count;i++)uv.setXY(i,(left+uv.getX(i)*(right-left))/texture.image.width,
      (top+(1-uv.getY(i))*(bottom-top))/texture.image.height)
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:1,
      transparent:name.includes('logo'),alphaTest:name.includes('logo')?.02:0}))
    mesh.name=name;mesh.position.set(...at);scene.add(mesh)
  }
  panel('butterfly_facade_art',[982,375,1127,596],[1.43,2.20],[1.95,1.92,2.505])
  panel('VITO_portrait_art',[1180,375,1319,572],[1.13,2.06],[3.87,1.91,2.507])
  panel('cat_facade_art',[940,528,993,598],[.67,.83],[1.17,1.10,2.512])
  // Split the blue-cloud facade around the CAD window opening. Each segment's
  // UVs derive from one continuous mural rectangle, keeping the opening real.
  const whole={left:-3.90,right:-.90,bottom:.45,top:2.75}
  const source={left:487,top:414,right:744,bottom:603}
  for(const [name,l,r,b,t] of [['left',-3.90,-3.20,.45,2.75],['right',-2.10,-.90,.45,2.75],
    ['lower',-3.20,-2.10,.45,1.50],['upper',-3.20,-2.10,2.60,2.75]]) {
    const u1=source.left+(l-whole.left)/(whole.right-whole.left)*(source.right-source.left)
    const u2=source.left+(r-whole.left)/(whole.right-whole.left)*(source.right-source.left)
    const v1=source.top+(whole.top-t)/(whole.top-whole.bottom)*(source.bottom-source.top)
    const v2=source.top+(whole.top-b)/(whole.top-whole.bottom)*(source.bottom-source.top)
    panel(`blue_cloud_facade_${name}`,[u1,v1,u2,v2],[r-l,t-b],[(l+r)/2,(b+t)/2,2.505])
  }
  const canvas=createCanvas(1000,240), c=canvas.getContext('2d')
  c.strokeStyle='#76863f';c.lineWidth=10;c.lineCap='round'
  c.beginPath();c.moveTo(20,82);c.lineTo(97,22);c.lineTo(173,82);c.lineTo(308,82);c.stroke()
  c.fillStyle='#76863f';c.font='bold 112px Arial';c.fillText('GreenHOUSE',26,190)
  const rgba=c.getImageData(0,0,1000,240).data
  const logo=new THREE.DataTexture(new Uint8Array(rgba),1000,240,THREE.RGBAFormat)
  logo.colorSpace=THREE.SRGBColorSpace;logo.flipY=false;logo.needsUpdate=true
  panel('left_GreenHOUSE_logo',[0,0,1000,240],[2.30,.66],[-2.40,4.60,2.511],logo)
  panel('right_GreenHOUSE_logo',[0,0,1000,240],[1.38,.39],[2.80,3.90,2.511],logo)
}
