import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'

export async function decorateDomido(scene, { design = null } = {}) {
  const require = createRequire(import.meta.url)
  let canvasModule
  try { canvasModule = require('@napi-rs/canvas') } catch {
    const config = JSON.parse(await readFile(new URL('../.tmp/brep-dependencies.json', import.meta.url), 'utf8'))
    canvasModule = require(config.canvasModule)
  }
  const { createCanvas, ImageData, GlobalFonts } = canvasModule
  globalThis.ImageData ??= ImageData
  globalThis.document ??= { createElement(kind) {
    if (kind !== 'canvas') throw new Error(`Unexpected export element: ${kind}`)
    const canvas = createCanvas(1, 1)
    canvas.toBlob = callback => canvas.encode('png').then(bytes => callback(new Blob([bytes], { type: 'image/png' })))
    return canvas
  } }
  GlobalFonts.registerFromPath('C:/Windows/Fonts/georgiab.ttf', 'DomidoSerif')
  function decal(name, canvas, size, at) {
    const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    const texture = new THREE.DataTexture(new Uint8Array(rgba), canvas.width, canvas.height, THREE.RGBAFormat)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.needsUpdate = true
    const geometry = new THREE.PlaneGeometry(...size)
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      map: texture, transparent: true, roughness: 1, alphaTest: .02, depthWrite: false,
    }))
    mesh.name = name
    mesh.position.set(...at)
    scene.add(mesh)
  }
  const sign = createCanvas(1200, 180)
  const s = sign.getContext('2d')
  s.fillStyle = '#713a21'; s.font = 'bold 116px DomidoSerif'; s.fillText('cafe Domido', 6, 127)
  decal('cafe_Domido_lettering', sign, [1.54, .27], [3.80, 5.03, 2.207])
  if (design) return

  // Authored vector interpretation of the blue tiger landmark. It is deliberately
  // simplified, rather than a photographic texture or an exact artwork replica.
  const mural = createCanvas(700, 1000), c = mural.getContext('2d')
  const ink = '#273944', blue = '#3b8bae', pale = '#c2d1bd'
  c.lineWidth = 12; c.lineJoin = 'round'; c.lineCap = 'round'
  function path(draw, fill, stroke = ink, width = 12) {
    c.beginPath(); draw(c); if (fill) { c.fillStyle = fill; c.fill() }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke() }
  }
  function ellipse(x,y,rx,ry,fill,stroke=ink,width=12) {
    path(p=>p.ellipse(x,y,rx,ry,0,0,Math.PI*2),fill,stroke,width)
  }
  path(p=>{p.moveTo(448,696);p.bezierCurveTo(637,773,610,519,625,391);p.bezierCurveTo(650,289,699,349,669,417);
    p.bezierCurveTo(649,474,708,835,488,840);p.closePath()},blue)
  path(p=>{p.moveTo(620,420);p.lineTo(677,441);p.moveTo(618,489);p.lineTo(672,516);
    p.moveTo(613,572);p.lineTo(675,588);p.moveTo(596,661);p.lineTo(655,698)},null,ink,28)
  ellipse(404,716,190,202,blue)
  path(p=>{p.moveTo(300,565);p.bezierCurveTo(301,690,359,823,442,888);p.bezierCurveTo(316,886,260,750,255,598)},pale)
  ellipse(274,892,91,47,blue);ellipse(448,903,93,43,blue)
  for(const x of [218,246,276,395,425,455]) path(p=>{p.moveTo(x,894);p.lineTo(x+8,917)},null,pale,8)
  for(const [x,y] of [[445,621],[473,689],[487,759]]) path(p=>{p.moveTo(x+73,y-15);p.quadraticCurveTo(x+20,y+10,x-9,y+52)},null,ink,21)
  path(p=>{p.moveTo(230,575);p.bezierCurveTo(116,547,93,644,104,682);p.bezierCurveTo(170,742,236,679,282,663)},blue)
  ellipse(131,660,52,43,pale)
  path(p=>{p.moveTo(167,629);p.lineTo(194,653);p.moveTo(204,593);p.lineTo(222,623)},null,ink,20)
  path(p=>{p.moveTo(169,255);p.lineTo(136,117);p.quadraticCurveTo(189,84,233,191)},blue)
  path(p=>{p.moveTo(418,184);p.quadraticCurveTo(465,65,501,104);p.lineTo(495,251)},blue)
  path(p=>{p.moveTo(157,129);p.lineTo(180,202);p.lineTo(212,182);p.closePath()},'#b87b6d',null)
  path(p=>{p.moveTo(456,131);p.lineTo(435,207);p.lineTo(481,220);p.closePath()},'#b87b6d',null)
  ellipse(322,332,194,194,blue)
  path(p=>{p.moveTo(214,180);p.quadraticCurveTo(321,225,430,178);p.lineTo(413,201);p.quadraticCurveTo(315,260,230,207)},pale)
  ellipse(226,325,72,93,'#efb333');ellipse(411,325,72,93,'#efb333')
  ellipse(236,337,15,38,'#b8442b',null);ellipse(401,337,15,38,'#b8442b',null)
  ellipse(239,343,7,29,ink,null);ellipse(397,343,7,29,ink,null)
  ellipse(223,313,8,11,'#fff4d3',null);ellipse(383,313,8,11,'#fff4d3',null)
  path(p=>{p.moveTo(260,394);p.quadraticCurveTo(326,367,370,397);p.lineTo(316,440);p.closePath()},'#714138')
  ellipse(321,472,109,60,pale)
  path(p=>{p.moveTo(228,458);p.quadraticCurveTo(320,505,413,455);p.quadraticCurveTo(357,624,280,575);p.closePath()},'#522b2c')
  path(p=>{p.moveTo(277,485);p.quadraticCurveTo(327,457,371,489);p.quadraticCurveTo(366,606,327,615);p.quadraticCurveTo(291,618,277,485)},'#d94f46')
  path(p=>{p.moveTo(322,503);p.lineTo(323,578)},null,'#a73534',7)
  for(const x of [241,272,365,395]) path(p=>{p.moveTo(x,461);p.lineTo(x+8,483);p.lineTo(x+18,460);p.closePath()},'#eee4c5',null)
  path(p=>{p.moveTo(163,281);p.lineTo(198,298);p.moveTo(144,355);p.lineTo(175,368);p.moveTo(143,397);p.lineTo(186,402);
    p.moveTo(475,273);p.lineTo(447,300);p.moveTo(492,357);p.lineTo(457,368);p.moveTo(487,399);p.lineTo(451,406)},null,ink,15)
  path(p=>{p.moveTo(306,161);p.lineTo(322,213);p.moveTo(276,174);p.lineTo(290,198);p.moveTo(351,175);p.lineTo(342,198)},null,ink,16)
  path(p=>{p.moveTo(225,433);p.lineTo(135,416);p.moveTo(223,454);p.lineTo(137,452);p.moveTo(414,432);p.lineTo(508,412);p.moveTo(418,455);p.lineTo(521,457)},null,pale,5)
  decal('blue_tiger_mural_simplified_vector', mural, [1.22, 2.16], [3.86, 3.52, 2.212])
}
