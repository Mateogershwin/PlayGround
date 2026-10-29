import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  makeCloudTexture,
  makeCrateTexture,
  makeDetailTexture,
  makeGlowTexture,
  makeHazardTexture,
  makeMetalTexture,
  makeScreenTexture
} from './textures.js'

export const PLATFORM = { minX: -13, maxX: 13, minZ: -9, maxZ: 11, top: 0.62 }
export const PLAY_RADIUS = 82
export const SPAWN = new THREE.Vector3(0, 0.62, 8.5)

const SUN_DIR = new THREE.Vector3(-0.48, 0.62, -0.52).normalize()

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function valueNoise(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, y, octaves = 4) {
  let value = 0
  let amp = 0.5
  let freq = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq) * amp
    total += amp
    amp *= 0.5
    freq *= 2.02
  }
  return value / total
}

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z)
  const flat = smoothstep(12, 31, r)
  const rolling = (fbm(x * 0.032, z * 0.032, 4) - 0.5) * 4.4
  const detail = (fbm(x * 0.11 + 11.3, z * 0.11 - 7.1, 3) - 0.5) * 1.15
  let h = (rolling + detail) * (0.035 + 0.965 * flat)
  const ridge = Math.max(0, (r - 84) / 148)
  h += Math.pow(ridge, 1.28) * 32 * (0.62 + 0.38 * fbm(x * 0.018 + 2, z * 0.018 - 4, 3))
  h += Math.max(0, (r - 176) / 92) * 36
  return h
}

export function isOnPlatform(x, z) {
  return x > PLATFORM.minX && x < PLATFORM.maxX && z > PLATFORM.minZ && z < PLATFORM.maxZ
}

export function groundHeight(x, z) {
  const t = terrainHeight(x, z)
  return isOnPlatform(x, z) ? Math.max(t, PLATFORM.top) : t
}

function addColor(geometry, colorFn) {
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    colorFn(c, pos.getX(i), pos.getY(i), pos.getZ(i), i)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function createSky(scene) {
  const vertexShader = /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const fragmentShader = /* glsl */ `
    uniform vec3 uSun;
    uniform float uTime;
    varying vec3 vDir;
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise21(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm21(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise21(p);
        p *= 2.03;
        a *= 0.5;
      }
      return v;
    }
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 zenith = vec3(0.035, 0.14, 0.28);
      vec3 mid = vec3(0.20, 0.42, 0.55);
      vec3 horizon = vec3(0.69, 0.77, 0.77);
      vec3 col = mix(horizon, mid, smoothstep(0.50, 0.62, h));
      col = mix(col, zenith, smoothstep(0.60, 0.94, h));

      float sd = max(dot(d, normalize(uSun)), 0.0);
      col += vec3(1.0, 0.78, 0.46) * pow(sd, 220.0) * 2.2;
      col += vec3(1.0, 0.64, 0.30) * pow(sd, 7.0) * 0.18;
      col += vec3(0.9, 0.55, 0.25) * pow(max(1.0 - abs(d.y), 0.0), 5.0) * 0.06;

      vec2 p = d.xz / max(d.y + 0.20, 0.06);
      float cloud = fbm21(p * 1.15 + vec2(uTime * 0.0035, uTime * 0.0012));
      cloud = smoothstep(0.60, 0.86, cloud) * smoothstep(0.0, 0.035, d.y) * (1.0 - smoothstep(0.075, 0.16, d.y));
      vec3 cloudCol = mix(vec3(0.70, 0.78, 0.82), vec3(1.0, 0.97, 0.92), pow(sd, 2.0));
      col = mix(col, cloudCol, cloud * 0.42);

      float high = fbm21(p * 0.65 + vec2(uTime * 0.0018, 11.3));
      high = smoothstep(0.52, 0.9, high) * smoothstep(0.10, 0.26, d.y) * (1.0 - smoothstep(0.52, 0.82, d.y));
      col = mix(col, vec3(0.84, 0.90, 0.94), high * 0.34);

      col = mix(col, vec3(0.74, 0.81, 0.82), smoothstep(0.09, 0.0, abs(d.y)) * 0.34);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1900, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })
  )
  sky.renderOrder = -100
  sky.frustumCulled = false
  scene.add(sky)
  return sky
}

function createRing(scene) {
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `
  const fragmentShader = /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vWorld;
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise21(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm21(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise21(p);
        p = p * 2.03 + vec2(17.0, 9.0);
        a *= 0.5;
      }
      return v;
    }
    void main() {
      float u = vUv.x;
      float v = vUv.y;
      float land = fbm21(vec2(u * 9.5, v * 3.4));
      float high = fbm21(vec2(u * 20.0 + 4.0, v * 6.5 - 2.0));

      vec3 ocean = vec3(0.020, 0.070, 0.120);
      vec3 low = vec3(0.080, 0.155, 0.085);
      vec3 green = vec3(0.170, 0.300, 0.105);
      vec3 dry = vec3(0.470, 0.385, 0.190);
      vec3 rock = vec3(0.35, 0.35, 0.33);
      vec3 snow = vec3(0.70, 0.76, 0.78);

      vec3 col = mix(ocean, low, smoothstep(0.40, 0.47, land));
      col = mix(col, green, smoothstep(0.47, 0.60, land));
      col = mix(col, dry, smoothstep(0.62, 0.73, land));
      col = mix(col, rock, smoothstep(0.72, 0.82, high) * 0.72);
      col = mix(col, snow, smoothstep(0.83, 0.94, high + land * 0.18) * 0.9);

      float cloud = fbm21(vec2(u * 30.0, v * 14.0 + 3.0));
      col = mix(col, vec3(0.80, 0.83, 0.83), smoothstep(0.60, 0.78, cloud) * 0.42);

      vec2 grid = floor(vec2(u * 340.0, v * 52.0));
      float city = step(0.988, hash21(grid)) * smoothstep(0.46, 0.60, land);
      col += vec3(1.0, 0.62, 0.24) * city * 0.85;

      vec3 V = normalize(cameraPosition - vWorld);
      vec3 N = normalize(vN);
      float rim = pow(1.0 - abs(dot(N, V)), 2.4);
      col = mix(col, vec3(0.26, 0.56, 0.68), rim * 0.42);

      float edge = smoothstep(0.0, 0.11, v) * smoothstep(1.0, 0.89, v);
      float light = 0.62 + 0.44 * abs(dot(N, normalize(vec3(-0.48, 0.62, -0.52))));
      col *= light * (0.58 + 0.42 * edge);
      col += vec3(0.015, 0.04, 0.05);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
  const ringGroup = new THREE.Group()
  const geometry = new THREE.TorusGeometry(1240, 88, 20, 300, Math.PI)
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: false
  })
  const ring = new THREE.Mesh(geometry, material)
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1240, 118, 12, 180, Math.PI),
    new THREE.MeshBasicMaterial({
      color: 0x6fc9e2,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    })
  )
  ringGroup.add(ring, halo)
  ringGroup.position.set(0, -140, -1750)
  ringGroup.rotation.set(0.015, 0.04, 0.55)
  scene.add(ringGroup)
  return { group: ringGroup, material }
}

function createTerrain(scene) {
  const detail = makeDetailTexture()
  const geometry = new THREE.PlaneGeometry(560, 560, 230, 230)
  geometry.rotateX(-Math.PI / 2)

  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const grassA = new THREE.Color('#4f6a3a')
  const grassB = new THREE.Color('#738f4d')
  const dry = new THREE.Color('#7d7448')
  const dirt = new THREE.Color('#645741')
  const rock = new THREE.Color('#66645e')
  const snow = new THREE.Color('#d6dfe2')
  const c = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)

    const eps = 1.6
    const dx = (terrainHeight(x + eps, z) - terrainHeight(x - eps, z)) / (2 * eps)
    const dz = (terrainHeight(x, z + eps) - terrainHeight(x, z - eps)) / (2 * eps)
    const slope = Math.min(1, Math.hypot(dx, dz))
    const n = fbm(x * 0.055 + 9, z * 0.055 - 4, 3)
    const r = Math.hypot(x, z)

    c.copy(grassA).lerp(grassB, n)
    c.lerp(dry, smoothstep(0.44, 0.68, fbm(x * 0.023 - 3, z * 0.023 + 8, 2)) * 0.6)
    c.lerp(dirt, smoothstep(24, 10, r) * 0.62)
    c.lerp(rock, smoothstep(0.24, 0.62, slope) * 0.82)
    c.lerp(snow, smoothstep(42, 88, h + n * 12) * 0.9)
    c.multiplyScalar(0.84 + n * 0.28)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.02,
    bumpMap: detail,
    bumpScale: 0.34
  })
  const terrain = new THREE.Mesh(geometry, material)
  terrain.receiveShadow = true
  scene.add(terrain)
  return terrain
}

function createPineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 1.9, 5, 1)
  trunk.translate(0, 0.95, 0)
  addColor(trunk, (c) => c.set('#4b3928'))
  const layers = []
  const defs = [
    [1.05, 2.0, 2.35],
    [0.82, 1.75, 3.55],
    [0.58, 1.5, 4.55]
  ]
  for (const [radius, height, y] of defs) {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1)
    cone.translate(0, y, 0)
    addColor(cone, (c, x, yy) => {
      const t = Math.min(1, Math.max(0, (yy - (y - height / 2)) / height))
      c.set('#2b422a').lerp(new THREE.Color('#557048'), t * 0.6 + hash2(x * 4, yy * 3) * 0.16)
    })
    layers.push(cone)
  }
  return mergeGeometries([trunk, ...layers], false)
}

function createVegetation(scene, collidables) {
  const pine = createPineGeometry()
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0 })
  const count = 190
  const pines = new THREE.InstancedMesh(pine, pineMat, count)
  pines.castShadow = true
  pines.receiveShadow = true
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  let placed = 0
  let attempt = 0
  while (placed < count && attempt < count * 24) {
    attempt++
    const angle = hash2(attempt * 1.7, 2.3) * Math.PI * 2
    const radius = 27 + Math.pow(hash2(attempt, 9.1), 0.72) * 148
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (Math.hypot(x - 14, z + 36) < 10) continue
    if (Math.hypot(x + 32, z + 28) < 8) continue
    const scale = 0.72 + hash2(attempt, 4.5) * 1.15
    dummy.position.set(x, terrainHeight(x, z) - 0.22, z)
    dummy.rotation.set(0, hash2(attempt, 6.2) * Math.PI * 2, 0)
    dummy.scale.set(scale * (0.82 + hash2(attempt, 8) * 0.3), scale, scale * (0.82 + hash2(attempt, 3) * 0.3))
    dummy.updateMatrix()
    pines.setMatrixAt(placed, dummy.matrix)
    color.setHSL(0.24 + hash2(attempt, 7) * 0.05, 0.22 + hash2(attempt, 2) * 0.12, 0.34 + hash2(attempt, 11) * 0.1)
    pines.setColorAt(placed, color)
    placed++
  }
  pines.count = placed
  pines.instanceMatrix.needsUpdate = true
  if (pines.instanceColor) pines.instanceColor.needsUpdate = true
  scene.add(pines)
  collidables.push(pines)

  const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6b63, roughness: 0.94, metalness: 0.04, flatShading: true })
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMat, 150)
  rocks.castShadow = true
  rocks.receiveShadow = true
  for (let i = 0; i < 150; i++) {
    const angle = hash2(i * 3.1, 8.2) * Math.PI * 2
    const radius = 19 + Math.pow(hash2(i, 2.7), 0.65) * 170
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const s = 0.34 + hash2(i, 5.8) * 1.9
    dummy.position.set(x, terrainHeight(x, z) + s * 0.28, z)
    dummy.rotation.set(hash2(i, 1) * 2.4, hash2(i, 9) * Math.PI * 2, hash2(i, 4) * 1.8)
    dummy.scale.set(s * (0.8 + hash2(i, 6) * 0.7), s * (0.6 + hash2(i, 3) * 0.6), s * (0.8 + hash2(i, 7) * 0.7))
    dummy.updateMatrix()
    rocks.setMatrixAt(i, dummy.matrix)
    color.setHSL(0.1, 0.03 + hash2(i, 13) * 0.06, 0.32 + hash2(i, 14) * 0.14)
    rocks.setColorAt(i, color)
  }
  rocks.instanceMatrix.needsUpdate = true
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true
  scene.add(rocks)
  collidables.push(rocks)

  const bladeGeom = new THREE.BufferGeometry()
  const verts = []
  const cols = []
  const dark = new THREE.Color('#2c3d23')
  const light = new THREE.Color('#71834e')
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + hash2(b, 3) * 0.8
    const ox = Math.cos(a) * 0.16
    const oz = Math.sin(a) * 0.16
    const leanX = Math.cos(a) * 0.16
    const leanZ = Math.sin(a) * 0.16
    const h = 0.35 + hash2(b, 6) * 0.42
    const w = 0.035 + hash2(b, 9) * 0.035
    verts.push(
      ox - w, 0, oz,
      ox + w, 0, oz,
      ox + leanX, h, oz + leanZ
    )
    cols.push(dark.r, dark.g, dark.b, dark.r, dark.g, dark.b, light.r, light.g, light.b)
  }
  bladeGeom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  bladeGeom.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  bladeGeom.computeVertexNormals()
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })
  const grass = new THREE.InstancedMesh(bladeGeom, grassMat, 2400)
  for (let i = 0; i < 2400; i++) {
    const angle = hash2(i * 1.3, 4.1) * Math.PI * 2
    const radius = 14 + Math.pow(hash2(i, 5.1), 0.55) * 92
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (isOnPlatform(x, z)) { dummy.scale.setScalar(0.001); dummy.position.set(0, -10, 0); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); continue }
    const s = 0.65 + hash2(i, 7.7) * 1.4
    dummy.position.set(x, terrainHeight(x, z) - 0.02, z)
    dummy.rotation.set(0, hash2(i, 2.2) * Math.PI * 2, 0)
    dummy.scale.set(s, s * (0.8 + hash2(i, 8.4) * 0.7), s)
    dummy.updateMatrix()
    grass.setMatrixAt(i, dummy.matrix)
  }
  grass.instanceMatrix.needsUpdate = true
  grass.receiveShadow = true
  scene.add(grass)
}

function createMountains(scene) {
  const geo = new THREE.ConeGeometry(1, 1, 9, 4)
  geo.translate(0, 0.5, 0)
  addColor(geo, (c, x, y) => {
    const n = hash2(x * 7.3, y * 9.1)
    if (y > 0.62) c.set('#cbd6d8').lerp(new THREE.Color('#8c9c9d'), 1 - y)
    else c.set('#475550').lerp(new THREE.Color('#6d7167'), y + n * 0.2)
  })
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })
  const count = 34
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + hash2(i, 2) * 0.13
    const radius = 275 + hash2(i, 6) * 150
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const h = 52 + hash2(i, 4) * 105
    dummy.position.set(x, -22 + hash2(i, 9) * 14, z)
    dummy.rotation.set(0, hash2(i, 1) * Math.PI, 0)
    dummy.scale.set(70 + hash2(i, 7) * 120, h, 70 + hash2(i, 8) * 120)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  scene.add(mesh)
}

function createClouds(scene) {
  const tex = makeCloudTexture()
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.22, depthWrite: false, color: 0xdfeef1, fog: false })
  const group = new THREE.Group()
  for (let i = 0; i < 9; i++) {
    const sprite = new THREE.Sprite(mat.clone())
    const angle = (i / 9) * Math.PI * 2 + hash2(i, 3) * 0.4
    const radius = 620 + hash2(i, 2) * 420
    sprite.position.set(Math.cos(angle) * radius, 130 + hash2(i, 5) * 170, Math.sin(angle) * radius)
    const s = 250 + hash2(i, 7) * 330
    sprite.scale.set(s, s * 0.5, 1)
    sprite.material.opacity = 0.1 + hash2(i, 9) * 0.16
    sprite.material.rotation = hash2(i, 1) * Math.PI
    group.add(sprite)
  }
  scene.add(group)
}

function glowSprite(color, scale, opacity = 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }))
  sprite.scale.set(scale, scale, 1)
  return sprite
}

function createSun(scene) {
  const sun = glowSprite(0xffd9a0, 420, 0.72)
  sun.position.copy(SUN_DIR).multiplyScalar(1700)
  sun.material.fog = false
  scene.add(sun)
}

function panel(width, height, depth, color = 0x46555c, metalness = 0.72, roughness = 0.42) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  )
}

function createCrate(x, y, z, size = 1.2, rotation = 0) {
  const group = new THREE.Group()
  const tex = makeCrateTexture('#4a533c')
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size, size * 0.88, size * 0.78),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xd9e2cf, metalness: 0.32, roughness: 0.62 })
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x222c22, metalness: 0.55, roughness: 0.5 })
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, size * 0.9, size * 0.8), edgeMat)
    edge.position.x = (sx * size) / 2
    edge.castShadow = true
    group.add(edge)
  }
  group.position.set(x, y + (size * 0.88) / 2, z)
  group.rotation.y = rotation
  return group
}

function createWarthog() {
  const group = new THREE.Group()
  const olive = new THREE.MeshStandardMaterial({ color: 0x697654, metalness: 0.36, roughness: 0.56 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x171c18, metalness: 0.55, roughness: 0.55 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101210, roughness: 0.92 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x2b535f, metalness: 0.6, roughness: 0.18, transparent: true, opacity: 0.72 })
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe4ad })

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.72, 4.15), olive)
  body.position.y = 0.92
  body.castShadow = true
  group.add(body)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 1.5), olive)
  hood.position.set(0, 1.24, -1.32)
  hood.castShadow = true
  group.add(hood)

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.5), olive)
  bed.position.set(0, 1.16, 1.25)
  group.add(bed)

  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.42, 0.26), dark)
  grille.position.set(0, 0.98, -2.08)
  group.add(grille)

  for (const sx of [-0.72, 0.72]) {
    for (const sz of [-1.25, 1.32]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.36, 14), rubber)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(sx, 0.5, sz)
      wheel.castShadow = true
      group.add(wheel)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.38, 8), dark)
      hub.rotation.z = Math.PI / 2
      hub.position.copy(wheel.position)
      group.add(hub)
    }
  }

  const cageMat = dark
  for (const sx of [-0.86, 0.86]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), cageMat)
    post.position.set(sx, 1.9, 0.16)
    group.add(post)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.5), cageMat)
    rail.position.set(sx, 2.32, 0.68)
    group.add(rail)
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.45), cageMat)
  roof.position.set(0, 2.36, 0.65)
  group.add(roof)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.6, 0.06), glass)
  windshield.position.set(0, 1.72, -0.62)
  windshield.rotation.x = -0.32
  group.add(windshield)

  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.3, 10), dark)
  turretBase.position.set(0, 1.52, 1.15)
  group.add(turretBase)
  const turret = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.8), olive)
  turret.position.set(0, 1.8, 1.15)
  group.add(turret)
  for (const sx of [-0.15, 0.15]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 7), dark)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(sx, 1.84, 0.6)
    group.add(barrel)
  }

  for (const sx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.05), lightMat)
    lamp.position.set(sx, 1.02, -2.23)
    group.add(lamp)
  }
  const gunLight = glowSprite(0xffe2a4, 1.3, 0.5)
  gunLight.position.set(0, 1.03, -2.3)
  group.add(gunLight)

  return group
}

function createFob(scene, collidables, animated) {
  const group = new THREE.Group()
  const metal = makeMetalTexture('#4a565c')
  const deckMat = new THREE.MeshStandardMaterial({ map: metal, color: 0xc4d1d2, metalness: 0.68, roughness: 0.46 })
  const trim = new THREE.MeshStandardMaterial({ color: 0x3b4a50, metalness: 0.76, roughness: 0.36 })
  const cyan = new THREE.MeshBasicMaterial({ color: 0x7ce9ff })

  const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 0.62, 20), deckMat)
  deck.position.set(0, PLATFORM.top - 0.31, 1)
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  for (const [x, z, w, d] of [[0, -9.05, 26.4, 0.35], [0, 11.05, 26.4, 0.35], [-13.15, 1, 0.35, 20.3], [13.15, 1, 0.35, 20.3]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), trim)
    rail.position.set(x, PLATFORM.top + 0.05, z)
    rail.castShadow = true
    group.add(rail)
  }
  for (const [x, z, w, d] of [[0, -8.8, 20, 0.08], [0, 10.8, 20, 0.08], [-12.9, 1, 0.08, 15], [12.9, 1, 0.08, 15]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), cyan)
    strip.position.set(x, PLATFORM.top + 0.02, z)
    group.add(strip)
  }

  const rampGeo = new THREE.BoxGeometry(4.4, 0.18, 3.6)
  const ramp = new THREE.Mesh(rampGeo, deckMat)
  ramp.position.set(0, 0.28, 12.5)
  ramp.rotation.x = 0.16
  ramp.castShadow = true
  ramp.receiveShadow = true
  group.add(ramp)

  const cratePositions = [
    [8.6, 1.2, 2.0, 1.25, 0.1],
    [9.8, 1.2, 3.3, 1.0, -0.35],
    [8.8, 2.42, 2.1, 0.86, 0.22],
    [-9.6, 1.1, 4.4, 1.1, 0.3],
    [-10.2, 2.25, 4.25, 0.8, -0.1],
    [5.9, 1.1, 7.8, 1.15, 0.55],
    [-3.4, 1.08, 8.5, 1.0, -0.2]
  ]
  for (const [x, y, z, s, r] of cratePositions) {
    const crate = createCrate(x, y - 0.6, z, s, r)
    group.add(crate)
    crate.traverse((o) => { if (o.isMesh) collidables.push(o) })
  }

  const warthog = createWarthog()
  warthog.position.set(-6.4, PLATFORM.top, -1.6)
  warthog.rotation.y = 0.32
  warthog.scale.setScalar(0.96)
  group.add(warthog)
  warthog.traverse((o) => { if (o.isMesh && o.geometry.type !== 'Sprite') collidables.push(o) })

  const barricadeMat = new THREE.MeshStandardMaterial({ map: makeHazardTexture(), color: 0xd6d6c8, metalness: 0.45, roughness: 0.62 })
  for (const [x, z, r] of [[-3.2, -4.5, 0.3], [3.3, -5.4, -0.18], [-5.7, 6.2, 1.24]]) {
    const barrier = new THREE.Group()
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 0.24), barricadeMat)
    top.position.y = 1.0
    top.castShadow = true
    barrier.add(top)
    for (const sx of [-0.82, 0.82]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.5), trim)
      leg.position.set(sx, 0.5, 0)
      leg.castShadow = true
      barrier.add(leg)
    }
    barrier.position.set(x, PLATFORM.top, z)
    barrier.rotation.y = r
    group.add(barrier)
    barrier.traverse((o) => { if (o.isMesh) collidables.push(o) })
  }

  const antenna = new THREE.Group()
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 7.4, 7), trim)
  mast.position.y = 3.7
  mast.castShadow = true
  antenna.add(mast)
  for (let i = 0; i < 3; i++) {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 5), trim)
    brace.rotation.z = Math.PI / 2
    brace.rotation.y = (i / 3) * Math.PI * 2
    brace.position.y = 2.2 + i * 1.6
    antenna.add(brace)
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8b9698, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }))
  dish.rotation.x = -1.1
  dish.rotation.z = 0.3
  dish.position.set(0.55, 5.6, 0)
  antenna.add(dish)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff6f55 }))
  beacon.position.y = 7.44
  antenna.add(beacon)
  const beaconGlow = glowSprite(0xff5a3c, 1.4, 0.65)
  beaconGlow.position.copy(beacon.position)
  antenna.add(beaconGlow)
  antenna.position.set(-10.6, PLATFORM.top, -5.6)
  group.add(antenna)

  const table = new THREE.Group()
  const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 0.55, 12), trim)
  tableBase.position.y = 0.28
  tableBase.castShadow = true
  table.add(tableBase)
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x17262b, metalness: 0.6, roughness: 0.35 }))
  tableTop.position.y = 0.6
  table.add(tableTop)
  const tableRing = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.025, 6, 40), cyan)
  tableRing.rotation.x = Math.PI / 2
  tableRing.position.y = 0.67
  table.add(tableRing)
  const holo = new THREE.Group()
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(2.25, 1.35),
    new THREE.MeshBasicMaterial({ map: makeScreenTexture('ZETA // OPS', '07'), transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
  )
  map.rotation.x = -Math.PI / 2
  holo.add(map)
  const holoRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.018, 5, 40), cyan)
  holoRing.rotation.x = Math.PI / 2
  holoRing.position.y = 0.04
  holo.add(holoRing)
  const holoCone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.25, 1.3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x54dffa, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }))
  holoCone.position.y = 0.6
  holo.add(holoCone)
  holo.position.y = 1.42
  table.add(holo)
  const tableLight = new THREE.PointLight(0x62dff7, 6, 9, 2)
  tableLight.position.y = 1.5
  table.add(tableLight)
  table.position.set(4.4, PLATFORM.top, 3.4)
  group.add(table)

  const monitorMat = new THREE.MeshBasicMaterial({ map: makeScreenTexture('UNSC // FOB', '09'), transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  for (const [x, z, ry] of [[-6.9, -8.1, 0.1], [6.9, -8.0, -0.15]]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), trim)
    stand.position.set(x, PLATFORM.top + 0.75, z)
    group.add(stand)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.15), monitorMat)
    screen.position.set(x, PLATFORM.top + 1.65, z)
    screen.rotation.y = ry
    group.add(screen)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.25, 0.08), trim)
    frame.position.set(x, PLATFORM.top + 1.65, z - 0.05)
    frame.rotation.y = ry
    group.add(frame)
  }

  const lightPole = new THREE.Group()
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.1, 6), trim)
    pole.position.set(sx * 2.6, 1.55, 0)
    lightPole.add(pole)
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 0.08), trim)
  crossbar.position.y = 3.05
  lightPole.add(crossbar)
  for (const sx of [-2.1, 0, 2.1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0xffe3b3 }))
    lamp.position.set(sx, 2.94, -0.1)
    lightPole.add(lamp)
    const glow = glowSprite(0xffd28a, 1.8, 0.4)
    glow.position.set(sx, 2.92, -0.1)
    lightPole.add(glow)
  }
  lightPole.position.set(7.2, PLATFORM.top, -7.1)
  group.add(lightPole)

  const baseLight = new THREE.PointLight(0xffcf9c, 12, 16, 2)
  baseLight.position.set(6.4, PLATFORM.top + 3.1, -6.6)
  group.add(baseLight)

  scene.add(group)
  collidables.push(deck)
  animated.push({
    update(time) {
      holo.rotation.y = time * 0.55
      holoRing.rotation.z = time * 0.9
      map.material.opacity = 0.75 + Math.sin(time * 4.6) * 0.16
      beaconGlow.material.opacity = 0.25 + (Math.sin(time * 3.2) > 0.55 ? 0.6 : 0)
      tableLight.intensity = 5.4 + Math.sin(time * 3.6) * 1.1
    }
  })
  return group
}


function createSpires(scene) {
  const group = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: 0x4b585d, metalness: 0.48, roughness: 0.52, flatShading: true })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b363b, metalness: 0.62, roughness: 0.44 })
  const cyan = new THREE.MeshBasicMaterial({ color: 0x74e6ff, transparent: true, opacity: 0.82 })
  const specs = [
    [-118, -92, 32, 0.4],
    [128, -108, 40, -0.3],
    [-62, -168, 24, 0.8]
  ]
  for (const [x, z, height, rot] of specs) {
    const spire = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 5.2, height * 0.24, 6), dark)
    base.position.y = height * 0.12
    spire.add(base)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.4, height * 0.56, 4), stone)
    shaft.position.y = height * 0.52
    shaft.rotation.y = Math.PI / 4
    spire.add(shaft)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.3, height * 0.08, 4), dark)
    neck.position.y = height * 0.84
    neck.rotation.y = Math.PI / 4
    spire.add(neck)
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.9, height * 0.14, 4), stone)
    crown.position.y = height * 0.93
    crown.rotation.y = Math.PI / 4
    spire.add(crown)
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.11, 6, 24), cyan)
    band.rotation.x = Math.PI / 2
    band.position.y = height * 0.74
    spire.add(band)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, height * 0.4, 0.12), cyan)
    strip.position.set(1.35, height * 0.5, 0.25)
    strip.rotation.z = -0.1
    spire.add(strip)
    const halo = glowSprite(0x6fe8ff, 5.2, 0.26)
    halo.position.y = height * 0.92
    spire.add(halo)
    spire.position.set(x, terrainHeight(x, z) - 1.5, z)
    spire.rotation.y = rot
    spire.rotation.z = rot * 0.05
    group.add(spire)
  }
  scene.add(group)
  return group
}

function createMonolith(scene, collidables, animated) {
  const group = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: 0x3e464a, metalness: 0.42, roughness: 0.55 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x171e21, metalness: 0.65, roughness: 0.35 })
  const cyan = new THREE.MeshBasicMaterial({ color: 0x75e9ff })
  const cyanSoft = new THREE.MeshBasicMaterial({ color: 0x55d8f4, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false })

  const base = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.0, 5.2), dark)
  base.position.y = 1.0
  base.rotation.y = 0.18
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)
  collidables.push(base)

  const mid = new THREE.Mesh(new THREE.BoxGeometry(4.7, 9.5, 3.4), stone)
  mid.position.y = 6.4
  mid.rotation.y = 0.18
  mid.castShadow = true
  group.add(mid)
  collidables.push(mid)

  const collar = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.55, 4.1), dark)
  collar.position.y = 11.3
  collar.rotation.y = 0.18
  collar.castShadow = true
  group.add(collar)

  const upper = new THREE.Mesh(new THREE.BoxGeometry(2.9, 7.4, 2.2), stone)
  upper.position.y = 15.1
  upper.rotation.y = 0.18
  upper.castShadow = true
  group.add(upper)

  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.1, 4), dark)
  crown.position.y = 20.9
  crown.rotation.y = 0.18 + Math.PI / 4
  crown.castShadow = true
  group.add(crown)

  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 8.2, 0.06), cyan)
    strip.position.set(side * 1.02, 6.2, 1.78)
    strip.rotation.y = 0.18
    group.add(strip)
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, 0.05), cyan)
    strip2.position.set(side * 0.56, 15.0, 1.17)
    strip2.rotation.y = 0.18
    group.add(strip2)
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.35), cyanSoft)
    vent.position.set(side * 3.2, 3.0, 0.4)
    group.add(vent)
  }

  const portalRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.11, 8, 40), cyan)
  portalRing.position.set(0, 6.7, 1.86)
  portalRing.rotation.y = 0.18
  group.add(portalRing)
  const portalCore = new THREE.Mesh(new THREE.CircleGeometry(1.38, 32), new THREE.MeshBasicMaterial({ color: 0x57dff6, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }))
  portalCore.position.set(0, 6.7, 1.9)
  portalCore.rotation.y = 0.18
  group.add(portalCore)

  const floating = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 6, 48), cyan)
  floating.rotation.x = Math.PI / 2.4
  floating.rotation.z = 0.2
  floating.position.y = 13.2
  group.add(floating)

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.7, 16, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x6ce8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }))
  beam.position.y = 29
  group.add(beam)

  const light = new THREE.PointLight(0x62ddf7, 24, 34, 2)
  light.position.set(0, 8, 2.2)
  group.add(light)

  const topGlow = glowSprite(0x62ddff, 4.2, 0.5)
  topGlow.position.set(0, 13.3, 0)
  group.add(topGlow)

  const groundRing = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.9, 48), new THREE.MeshBasicMaterial({ color: 0x52cee8, transparent: true, opacity: 0.26, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
  groundRing.rotation.x = -Math.PI / 2
  groundRing.position.y = 0.08
  group.add(groundRing)

  const x = 14
  const z = -36
  group.position.set(x, terrainHeight(x, z) - 0.35, z)
  scene.add(group)
  animated.push({
    update(time) {
      floating.rotation.y = time * 0.5
      floating.position.y = 13.2 + Math.sin(time * 0.9) * 0.24
      portalRing.rotation.z = time * 0.25
      portalCore.material.opacity = 0.15 + Math.sin(time * 2.6) * 0.07
      light.intensity = 20 + Math.sin(time * 3.1) * 6
      topGlow.material.opacity = 0.34 + Math.sin(time * 2.2) * 0.12
      groundRing.rotation.z = time * 0.08
    }
  })
}

function createArch(scene, collidables, animated) {
  const group = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: 0x41494c, metalness: 0.4, roughness: 0.6 })
  const cyan = new THREE.MeshBasicMaterial({ color: 0x6ee5ff })
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.3, 12, 1.45), stone)
    pylon.position.set(side * 4.6, 6, 0)
    pylon.rotation.z = side * -0.1
    pylon.castShadow = true
    group.add(pylon)
    collidables.push(pylon)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 9, 1.0), cyan)
    strip.position.set(side * 4.03, 6, 0)
    group.add(strip)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.2, 1.15, 1.6), stone)
  lintel.position.y = 12.1
  lintel.castShadow = true
  group.add(lintel)
  const lintelStrip = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.07, 1.62), cyan)
  lintelStrip.position.y = 11.56
  group.add(lintelStrip)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 6, 44), cyan)
  ring.position.y = 10.9
  group.add(ring)
  const x = -32
  const z = -28
  group.position.set(x, terrainHeight(x, z), z)
  group.rotation.y = 0.62
  scene.add(group)
  animated.push({ update(time) { ring.rotation.z = time * 0.22; ring.rotation.x = Math.PI / 2 + Math.sin(time * 0.3) * 0.1 } })
}

function createPelican(scene, animated) {
  const group = new THREE.Group()
  const hull = new THREE.MeshStandardMaterial({ color: 0x6b7777, metalness: 0.5, roughness: 0.45 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x202a2c, metalness: 0.6, roughness: 0.4 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 7.4), hull)
  body.castShadow = false
  group.add(body)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 2.3), hull)
  nose.position.set(0, -0.1, -4.2)
  nose.rotation.x = -0.16
  group.add(nose)
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 1.05), new THREE.MeshStandardMaterial({ color: 0x2b5c69, metalness: 0.7, roughness: 0.2 }))
  cockpit.position.set(0, 0.65, -3.55)
  group.add(cockpit)
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.24, 2.0), hull)
    wing.position.set(side * 2.5, 0.3, -0.5)
    wing.rotation.z = side * -0.1
    group.add(wing)
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 1.8, 10), dark)
    engine.rotation.x = Math.PI / 2
    engine.position.set(side * 2.2, 0.78, 0.35)
    group.add(engine)
    const thrust = glowSprite(0x8de6ff, 1.6, 0.75)
    thrust.position.set(side * 2.2, 0.78, 1.35)
    group.add(thrust)
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 1.8), hull)
  tail.position.set(0, 0.86, 3.9)
  group.add(tail)
  group.position.set(-120, 68, -180)
  group.scale.setScalar(0.9)
  scene.add(group)
  animated.push({
    update(time) {
      const t = (time * 4.6) % 600
      group.position.x = -260 + t
      group.position.z = -185 + Math.sin(time * 0.14) * 30
      group.position.y = 66 + Math.sin(time * 0.4) * 5
      group.rotation.y = Math.PI / 2 + Math.sin(time * 0.14) * 0.1
      group.rotation.z = Math.sin(time * 0.5) * 0.05
    }
  })
}

function createDust(scene) {
  const count = 420
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (hash2(i, 1) - 0.5) * 90
    positions[i * 3 + 1] = hash2(i, 2) * 22 + 0.5
    positions[i * 3 + 2] = (hash2(i, 3) - 0.5) * 90
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xf2e2c4,
    size: 0.075,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: makeGlowTexture(64),
    sizeAttenuation: true
  })
  const points = new THREE.Points(geo, mat)
  scene.add(points)
  return points
}

function createSpawnPoints() {
  const points = []
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + 0.17
    const radius = 31 + (i % 3) * 10
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    points.push(new THREE.Vector3(x, terrainHeight(x, z), z))
  }
  return points
}

export function createWorld(scene) {
  const collidables = []
  const animated = []
  const sky = createSky(scene)
  const ring = createRing(scene)
  const sun = glowSprite(0xffd9a0, 420, 0.72)
  sun.material.fog = false
  sun.position.copy(SUN_DIR).multiplyScalar(1700)
  scene.add(sun)

  const hemi = new THREE.HemisphereLight(0x9acfe4, 0x3d392b, 0.92)
  scene.add(hemi)
  scene.add(new THREE.AmbientLight(0x324954, 0.72))

  const sunLight = new THREE.DirectionalLight(0xffdfb2, 2.35)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(1536, 1536)
  sunLight.shadow.camera.left = -48
  sunLight.shadow.camera.right = 48
  sunLight.shadow.camera.top = 48
  sunLight.shadow.camera.bottom = -48
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 190
  sunLight.shadow.bias = -0.0006
  sunLight.shadow.normalBias = 0.035
  scene.add(sunLight)
  scene.add(sunLight.target)

  const fill = new THREE.DirectionalLight(0x8cc0d8, 1.15)
  fill.position.set(52, 38, 86)
  scene.add(fill)

  const terrain = createTerrain(scene)
  collidables.push(terrain)
  createMountains(scene)
  createSpires(scene)
  createClouds(scene)
  createVegetation(scene, collidables)
  const fob = createFob(scene, collidables, animated)
  createMonolith(scene, collidables, animated)
  createArch(scene, collidables, animated)
  createPelican(scene, animated)
  const dust = createDust(scene)

  const spawnPoints = createSpawnPoints()

  function update(dt, time, playerPos) {
    sky.position.copy(playerPos)
    sky.material.uniforms.uTime.value = time
    ring.material.uniforms.uTime.value = time
    const portrait = window.innerWidth < window.innerHeight
    ring.group.rotation.z = portrait ? 0.18 : 0.55
    ring.group.position.y = portrait ? -250 : -140

    sunLight.position.set(playerPos.x - 60, 86, playerPos.z - 46)
    sunLight.target.position.set(playerPos.x, 0, playerPos.z)
    sunLight.target.updateMatrixWorld()

    dust.position.set(playerPos.x, 0, playerPos.z)
    dust.rotation.y = time * 0.012
    dust.material.opacity = 0.34 + Math.sin(time * 0.6) * 0.08

    for (const item of animated) item.update(time, dt)
  }

  return { update, collidables, spawnPoints, sunLight, terrain, fob, PLAY_RADIUS, ring }
}
