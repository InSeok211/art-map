import * as THREE from 'three'

// Display context only; this estimated street slope is not part of the GLB.
export function addDomidoStreet(scene) {
  const street = new THREE.Group()
  street.name = 'estimated-street-context'
  const height = x => .65 + (x + 4.8) * .15
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -7,height(-7),2.24, 7,height(7),2.24, 7,height(7),5.8,
    -7,height(-7),2.24, 7,height(7),5.8, -7,height(-7),5.8,
  ],3))
  geometry.computeVertexNormals()
  const road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color:0x676966,roughness:1,side:THREE.DoubleSide}))
  road.receiveShadow = true; street.add(road)
  const grid=[]
  for(let row=0;row<12;row++){
    const z=2.24+row*.3
    grid.push(-7,height(-7)+.008,z, 7,height(7)+.008,z)
    for(let col=0;col<36;col++){
      const x=-7+col*.4+(row%2)*.2
      grid.push(x,height(x)+.008,z,x,height(x)+.008,z+.3)
    }
  }
  const lines=new THREE.BufferGeometry()
  lines.setAttribute('position',new THREE.Float32BufferAttribute(grid,3))
  street.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:0x4c514e,transparent:true,opacity:.55})))
  const stripe = new THREE.BufferGeometry()
  stripe.setAttribute('position',new THREE.Float32BufferAttribute([
    -7,height(-7)+.012,2.43, 7,height(7)+.012,2.43, 7,height(7)+.012,2.49,
    -7,height(-7)+.012,2.43, 7,height(7)+.012,2.49, -7,height(-7)+.012,2.49,
  ],3))
  stripe.computeVertexNormals()
  street.add(new THREE.Mesh(stripe,new THREE.MeshStandardMaterial({color:0xd3ab48,side:THREE.DoubleSide})))
  scene.add(street)
}
