import * as THREE from 'three'
import { createWorld, groundHeight, SPAWN, PLAY_RADIUS } from './world.js'
import { Effects } from './effects.js'
import { AudioEngine } from './audio.js'
import { Weapon } from './weapon.js'
import { EnemyManager } from './enemies.js'
import { HUD } from './hud.js'

const canvas = document.getElementById('game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.14
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xadc6cc, 95, 470)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.045, 9000)
camera.rotation.order = 'YXZ'
scene.add(camera)

const world = createWorld(scene)
const effects = new Effects(scene)
const audio = new AudioEngine()
const weapon = new Weapon()
const enemies = new EnemyManager(scene, effects, audio)
const hud = new HUD()

const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
const mobileControls = document.getElementById('mobile-controls')

const obstacles = world.collidables.filter((mesh) => mesh !== world.terrain)

const player = {
  pos: SPAWN.clone(),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0.11,
  eye: 1.7,
  eyeTarget: 1.7,
  onGround: true,
  crouch: false,
  shield: 100,
  maxShield: 100,
  health: 100,
  maxHealth: 100,
  lastDamage: -999,
  kills: 0,
  score: 0,
  shotsFired: 0,
  shotsHit: 0,
  grenades: 4,
  shake: 0,
  cameraKick: 0,
  cameraYawKick: 0,
  recharging: false,
  meleePending: 0,
  meleeCooldown: 0,
  grenadeCooldown: 0,
  stepDistance: 0,
  bob: 0,
  distFromCenter: 0
}
window.__game = { scene, camera, world, renderer, player, enemies, weapon, hud }

let state = 'menu'
let started = false
let startedAt = 0
let menuTime = 0
let wave = 0
let nextWaveTimer = 0
let radarTimer = 0
let jumpQueued = false
let lookGuardUntil = 0
let lastShotNotice = 0
let clearedBannerShown = false

const keys = new Set()
const input = { fire: false, ads: false, sprint: false }
const touch = { moveX: 0, moveY: 0, fire: false }

const casings = []
const grenades = []
window.__game.grenades = grenades
const raycaster = new THREE.Raycaster()
raycaster.far = 360
window.__game.raycaster = raycaster
window.__game.obstacles = obstacles
const scratch = {
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  origin: new THREE.Vector3(),
  point: new THREE.Vector3(),
  end: new THREE.Vector3(),
  muzzle: new THREE.Vector3(),
  normal: new THREE.Vector3()
}

const shellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.048, 6)
const shellMat = new THREE.MeshStandardMaterial({ color: 0xcba968, metalness: 0.9, roughness: 0.32 })
const grenadeGeo = new THREE.SphereGeometry(0.115, 12, 10)
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4433, metalness: 0.55, roughness: 0.5, emissive: 0x143b45, emissiveIntensity: 0.8 })

function setObjective(text) {
  const el = document.getElementById('objective-text')
  if (el) el.textContent = text
}

function randomSpread(amount) {
  const theta = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.random()) * amount
  return { x: Math.cos(theta) * r, y: Math.sin(theta) * r }
}

function updateCameraVectors() {
  scratch.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
  scratch.right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw))
}

function applyCamera(dt) {
  const ads = input.ads && !input.sprint && !weapon.reloading
  const baseFov = camera.aspect < 1 ? 84 : 75
  const fovTarget = input.sprint ? baseFov + 5 : ads ? baseFov - 20 : baseFov
  camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-8 * dt))
  camera.updateProjectionMatrix()

  player.eye += (player.eyeTarget - player.eye) * (1 - Math.exp(-11 * dt))
  const walkBob = player.onGround ? Math.sin(player.bob) * 0.018 : 0
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.moveX
  player.shake = Math.max(0, player.shake - dt * 2.8)
  const shake = player.shake * player.shake
  const sx = (Math.random() - 0.5) * shake * 0.12
  const sy = (Math.random() - 0.5) * shake * 0.08
  const sz = (Math.random() - 0.5) * shake * 0.1

  camera.position.set(
    player.pos.x + sx,
    player.pos.y + player.eye + walkBob + sy,
    player.pos.z + sz
  )
  camera.rotation.set(
    player.pitch + player.cameraKick + sy * 0.35,
    player.yaw + player.cameraYawKick,
    -strafe * 0.007 + sx * 0.3,
    'YXZ'
  )

  player.cameraKick *= Math.exp(-13 * dt)
  player.cameraYawKick *= Math.exp(-11 * dt)
}

function groundRay(origin, dir) {
  const maxDist = 340
  if (dir.y > 0.25) return null
  let prev = 0
  let prevY = origin.y - groundHeight(origin.x, origin.z)
  if (prevY <= 0) {
    return { dist: 0.1, point: origin.clone() }
  }
  for (let d = 1.4; d < maxDist; d += 1.4) {
    const x = origin.x + dir.x * d
    const y = origin.y + dir.y * d
    const z = origin.z + dir.z * d
    const g = groundHeight(x, z)
    if (y <= g) {
      let lo = prev
      let hi = d
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        const my = origin.y + dir.y * mid
        const mg = groundHeight(origin.x + dir.x * mid, origin.z + dir.z * mid)
        if (my <= mg) hi = mid
        else lo = mid
      }
      const dist = (lo + hi) / 2
      return { dist, point: origin.clone().addScaledVector(dir, dist) }
    }
    prev = d
  }
  return null
}

function groundNormal(point, target = new THREE.Vector3()) {
  const eps = 0.55
  const hL = groundHeight(point.x - eps, point.z)
  const hR = groundHeight(point.x + eps, point.z)
  const hD = groundHeight(point.x, point.z - eps)
  const hU = groundHeight(point.x, point.z + eps)
  return target.set(hL - hR, eps * 2, hD - hU).normalize()
}

function spawnCasing() {
  const mesh = new THREE.Mesh(shellGeo, shellMat)
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate()
  mesh.position.copy(camera.position).addScaledVector(right, 0.2).addScaledVector(up, -0.12).addScaledVector(forward, 0.65)
  mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
  scene.add(mesh)
  casings.push({
    mesh,
    vel: right.clone().multiplyScalar(2.1 + Math.random() * 1.4).addScaledVector(up, 1.3 + Math.random() * 1.2).addScaledVector(forward, 0.3),
    spin: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16),
    life: 1.9
  })
}

function performShot() {
  player.shotsFired++
  const origin = camera.position.clone()
  camera.getWorldDirection(scratch.dir)
  const moving = Math.hypot(player.vel.x, player.vel.z) > 0.6
  const spread = weapon.adsBlend > 0.55 ? 0.0018 : input.sprint ? 0.022 : moving ? 0.009 : 0.0052
  const offset = randomSpread(spread)
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  scratch.dir.addScaledVector(right, offset.x).addScaledVector(up, offset.y).normalize()

  raycaster.set(origin, scratch.dir)
  const targets = [...enemies.hitMeshes, ...obstacles]
  const hits = raycaster.intersectObjects(targets, false)
  const nearest = hits[0] || null
  const ground = groundRay(origin, scratch.dir)
  let endDistance = 340
  let hitEnemy = null
  let hitPoint = null
  let hitNormal = null

  if (nearest && (!ground || nearest.distance < ground.dist)) {
    endDistance = nearest.distance
    hitPoint = nearest.point.clone()
    hitEnemy = nearest.object.userData.enemy || null
    if (nearest.face) {
      hitNormal = nearest.face.normal.clone().transformDirection(nearest.object.matrixWorld)
    } else {
      hitNormal = new THREE.Vector3(0, 1, 0)
    }
  } else if (ground) {
    endDistance = ground.dist
    hitPoint = ground.point
    hitNormal = groundNormal(hitPoint)
  }

  const muzzle = weapon.muzzleWorldPosition(camera, scratch.muzzle.clone())
  scratch.end.copy(origin).addScaledVector(scratch.dir, endDistance)
  effects.tracer(muzzle, scratch.end, 0xffd79a, 0.013, 0.055)
  effects.muzzleDust(muzzle, 0xffcb7a)
  spawnCasing()

  if (hitEnemy && hitPoint) {
    player.shotsHit++
    const result = hitEnemy.damage(34, nearest.object.userData.part || 'body', hitPoint, scratch.dir)
    if (result.shielded) {
      effects.shieldHit(hitPoint)
      audio.shieldHit()
    } else {
      effects.impact(hitPoint, hitNormal || new THREE.Vector3(0, 1, 0), result.killed ? 0xa5deff : 0xffb070, result.killed ? 14 : 8, false)
      audio.hit()
    }
    hud.hitmarker(result.killed ? 'kill' : result.headshot ? 'headshot' : 'hit')
  } else if (hitPoint) {
    effects.impact(hitPoint, hitNormal || new THREE.Vector3(0, 1, 0), 0xffc778, 7, true)
  }

  audio.shoot()
  player.cameraKick += weapon.adsBlend > 0.55 ? 0.0028 : 0.0052
  player.cameraYawKick += (Math.random() - 0.5) * 0.0028
  player.shake = Math.min(1.4, player.shake + 0.045)
  if (weapon.ammo === 0) lastShotNotice = performance.now()
}

function tryShoot() {
  if (state !== 'playing' && state !== 'cleared') return
  if (weapon.reloading) return
  const shot = weapon.tryFire()
  if (shot.ok) {
    performShot()
    if (shot.empty) {
      audio.empty()
    }
  } else if (shot.reason === 'empty') {
    if (performance.now() - lastShotNotice > 500) {
      audio.empty()
      lastShotNotice = performance.now()
    }
  }
}

function throwGrenade() {
  if ((state !== 'playing' && state !== 'cleared') || player.grenades <= 0 || player.grenadeCooldown > 0) return
  player.grenades--
  player.grenadeCooldown = 0.7
  weapon.playThrow()
  audio.grenadeThrow()
  const group = new THREE.Group()
  const body = new THREE.Mesh(grenadeGeo, grenadeMat)
  group.add(body)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.015, 5, 16),
    new THREE.MeshBasicMaterial({ color: 0x6fe6ff, toneMapped: false })
  )
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGrenadeGlow(), color: 0x5fe0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  glow.scale.set(0.45, 0.45, 1)
  group.add(glow)
  const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate()
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  group.position.copy(camera.position).addScaledVector(forward, 0.55).addScaledVector(up, -0.12)
  scene.add(group)
  grenades.push({
    group,
    ring,
    vel: forward.multiplyScalar(13.5).addScaledVector(up, 4.8),
    fuse: 2.5,
    spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8)
  })
}

let grenadeGlowTexture = null
function makeGrenadeGlow() {
  if (!grenadeGlowTexture) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(120,230,255,0.6)')
    g.addColorStop(1, 'rgba(120,230,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    grenadeGlowTexture = new THREE.CanvasTexture(c)
  }
  return grenadeGlowTexture
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i]
    g.fuse -= dt
    g.vel.y -= 14 * dt
    g.group.position.addScaledVector(g.vel, dt)
    g.group.rotation.x += g.spin.x * dt
    g.group.rotation.y += g.spin.y * dt
    g.group.rotation.z += g.spin.z * dt
    g.ring.rotation.z += dt * 9
    const ground = groundHeight(g.group.position.x, g.group.position.z) + 0.11
    if (g.group.position.y < ground) {
      g.group.position.y = ground
      g.vel.y = Math.abs(g.vel.y) * 0.42
      g.vel.x *= 0.72
      g.vel.z *= 0.72
      if (Math.abs(g.vel.y) < 0.45) g.vel.y = 0
    }
    if (g.fuse <= 0) {
      const point = g.group.position.clone()
      scene.remove(g.group)
      grenades.splice(i, 1)
      explodeGrenade(point)
    }
  }
}

function explodeGrenade(point) {
  effects.explosion(point, 8, true)
  audio.explosion(true)
  const distToPlayer = player.pos.distanceTo(point)
  player.shake = Math.min(2, player.shake + Math.max(0, 1 - distToPlayer / 32) * 1.2)
  enemies.damageArea(point, 8.5, 230)
  if (distToPlayer < 9) damagePlayer(58 * (1 - distToPlayer / 9), point)
}

function melee() {
  if ((state !== 'playing' && state !== 'cleared') || player.meleeCooldown > 0) return
  player.meleeCooldown = 0.55
  player.meleePending = 0.13
  weapon.playMelee()
  audio.melee()
}

function resolveMelee() {
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
  const origin = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z)
  let hits = 0
  for (const enemy of [...enemies.enemies]) {
    if (enemy.dead) continue
    const chest = enemy.getChest()
    const to = chest.clone().sub(origin)
    const dist = to.length()
    if (dist > 3.5) continue
    to.normalize()
    if (to.dot(forward) < 0.25) continue
    const result = enemy.damage(120, 'body', chest, forward)
    effects.impact(chest, forward.clone().negate(), 0xa7e7ff, 8, false)
    getHudHit(result)
    hits++
  }
  if (hits) {
    audio.hit()
    player.shake = Math.min(1.5, player.shake + 0.4)
  }
}

function getHudHit(result) {
  hud.hitmarker(result.killed ? 'kill' : result.headshot ? 'headshot' : 'hit')
}

function damagePlayer(amount, source) {
  if (state !== 'playing' && state !== 'cleared') return
  if (player.health <= 0) return
  player.lastDamage = performance.now() / 1000
  player.recharging = false
  let left = amount
  let shielded = false
  if (player.shield > 0) {
    shielded = true
    const absorbed = Math.min(player.shield, left)
    player.shield -= absorbed
    left -= absorbed
  }
  if (left > 0) player.health -= left
  player.health = Math.max(0, player.health)
  hud.flashDamage(shielded && left <= 0 ? 'shield' : 'health')
  hud.setVitals(player.shield, player.maxShield, player.health, player.maxHealth)
  if (player.health <= 0) {
    die()
    return
  }
  if (!shielded || left > 0) audio.damage()
  else audio.damage()
  player.shake = Math.min(2, player.shake + Math.min(0.9, amount * 0.024))
  if (source) {
    const dx = source.x - player.pos.x
    const dz = source.z - player.pos.z
    const len = Math.hypot(dx, dz) || 1
    player.cameraYawKick += (dx / len) * 0.008
    player.cameraKick += (dz / len) * 0.003
  }
}

function die() {
  if (state === 'dead') return
  state = 'dead'
  input.fire = false
  input.ads = false
  touch.fire = false
  document.exitPointerLock?.()
  hud.setClickHint(false)
  hud.showDeath({
    wave: Math.max(1, wave),
    kills: player.kills,
    score: player.score,
    accuracy: player.shotsFired ? (player.shotsHit / player.shotsFired) * 100 : 0
  })
}

function resetPlayer() {
  player.pos.copy(SPAWN)
  const ground = groundHeight(SPAWN.x, SPAWN.z)
  player.pos.y = ground
  player.vel.set(0, 0, 0)
  player.yaw = 0
  player.pitch = isTouch ? 0.08 : 0.045
  player.eye = 1.7
  player.eyeTarget = 1.7
  player.crouch = false
  player.onGround = true
  player.shield = player.maxShield
  player.health = player.maxHealth
  player.lastDamage = -999
  player.kills = 0
  player.score = 0
  player.shotsFired = 0
  player.shotsHit = 0
  player.grenades = 4
  player.shake = 0
  player.cameraKick = 0
  player.cameraYawKick = 0
  player.recharging = false
  player.meleePending = 0
  player.meleeCooldown = 0
  player.grenadeCooldown = 0
  player.stepDistance = 0
  player.bob = 0
  keys.clear()
  input.fire = false
  input.ads = false
  jumpQueued = false
}

function beginRun() {
  audio.init()
  state = 'playing'
  clearTimeout(nextWaveTimer)
  for (const g of grenades) scene.remove(g.group)
  grenades.length = 0
  for (const c of casings) scene.remove(c.mesh)
  casings.length = 0
  enemies.reset()
  weapon.reset()
  resetPlayer()
  hud.hideDeath()
  hud.showGame()
  hud.setVitals(player.shield, player.maxShield, player.health, player.maxHealth)
  hud.setAmmo(weapon.ammo, weapon.reserve, player.grenades, weapon.reloading)
  hud.setStats(0, 0, null)
  hud.setWave(1, 0)
  setObjective('ELIMINATE THE BANISHED')
  if (isTouch) mobileControls.classList.remove('hidden')
  started = true
  startedAt = performance.now()
  startWave(1)
  if (!isTouch) {
    lookGuardUntil = performance.now() + 900
    try { canvas.requestPointerLock?.() } catch {}
  }
}

function startWave(n) {
  wave = n
  clearedBannerShown = false
  state = 'playing'
  if (n > 1) {
    player.shield = player.maxShield
    player.health = Math.min(player.maxHealth, player.health + 30)
    player.grenades = Math.min(4, player.grenades + 1)
    weapon.reserve = Math.min(324, weapon.reserve + 108)
  }
  const count = enemies.startWave(n, world.spawnPoints)
  hud.setWave(n, count)
  hud.setStats(player.kills, player.score, player.shotsFired ? (player.shotsHit / player.shotsFired) * 100 : null)
  const subtitles = [
    'BANISHED SIGNATURES DETECTED',
    'REINFORCEMENTS INBOUND',
    'HEAVY ASSAULT ELEMENT',
    'COVENANT WAR PARTY',
    'WAR CHIEF SIGNATURE DETECTED'
  ]
  hud.showBanner(`WAVE ${String(n).padStart(2, '0')}`, subtitles[(n - 1) % subtitles.length], n % 5 === 0 ? 'ZETA HALO // PRIORITY TARGET' : 'ZETA HALO // COMBAT ZONE', 2900)
  setObjective('ELIMINATE THE BANISHED')
  audio.waveStart()
}

function handleWaveCleared(n) {
  if (state !== 'playing') return
  state = 'cleared'
  clearedBannerShown = true
  player.score += 250 * n
  hud.setStats(player.kills, player.score, player.shotsFired ? (player.shotsHit / player.shotsFired) * 100 : null)
  hud.showBanner('SECTOR CLEARED', 'RESUPPLY DROP INBOUND', 'ZETA HALO // COMBAT ZONE', 3400)
  setObjective('REGROUP // RESUPPLY')
  audio.victory()
  weapon.reserve = Math.min(324, weapon.reserve + 108)
  player.grenades = Math.min(4, player.grenades + 1)
  player.shield = player.maxShield
  player.health = Math.min(player.maxHealth, player.health + 35)
  nextWaveTimer = setTimeout(() => {
    if (state === 'cleared') startWave(wave + 1)
  }, 5200)
}

function updatePlayer(dt) {
  const forwardInput = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - touch.moveY
  const rightInput = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.moveX

  const moving = Math.abs(forwardInput) > 0.08 || Math.abs(rightInput) > 0.08
  const sprinting = !player.crouch && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(touch.moveX, touch.moveY) > 0.86) && forwardInput > 0.2 && !input.ads
  const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC')
  player.crouch = crouching
  player.eyeTarget = crouching ? 1.12 : 1.7

  let speed = crouching ? 3.1 : sprinting ? 10.1 : 6.6
  if (input.ads) speed *= 0.55
  if (!player.onGround) speed *= 0.92

  updateCameraVectors()
  let wishX = 0
  let wishZ = 0
  if (moving) {
    const f = forwardInput
    const r = rightInput
    const len = Math.hypot(f, r) || 1
    wishX = (scratch.forward.x * f + scratch.right.x * r) / len
    wishZ = (scratch.forward.z * f + scratch.right.z * r) / len
  }

  const accel = player.onGround ? 13 : 2.8
  const blend = 1 - Math.exp(-accel * dt)
  player.vel.x += (wishX * speed - player.vel.x) * blend
  player.vel.z += (wishZ * speed - player.vel.z) * blend
  if (!moving && player.onGround) {
    const decel = 1 - Math.exp(-11 * dt)
    player.vel.x -= player.vel.x * decel
    player.vel.z -= player.vel.z * decel
  }

  if (jumpQueued && player.onGround) {
    player.vel.y = 5.8
    player.onGround = false
  }
  jumpQueued = false

  player.vel.y -= 16.5 * dt
  player.pos.x += player.vel.x * dt
  player.pos.z += player.vel.z * dt
  player.pos.y += player.vel.y * dt

  const dist = Math.hypot(player.pos.x, player.pos.z)
  player.distFromCenter = dist
  if (dist > PLAY_RADIUS) {
    const scale = PLAY_RADIUS / dist
    player.pos.x *= scale
    player.pos.z *= scale
    player.vel.x *= 0.2
    player.vel.z *= 0.2
  }

  const ground = groundHeight(player.pos.x, player.pos.z)
  if (player.pos.y <= ground + 0.001) {
    player.pos.y = ground
    if (player.vel.y < 0) player.vel.y = 0
    player.onGround = true
  } else if (player.onGround && player.pos.y - ground < 0.72 && player.vel.y <= 0) {
    player.pos.y = ground
    player.vel.y = 0
    player.onGround = true
  } else {
    player.onGround = false
  }

  const horizSpeed = Math.hypot(player.vel.x, player.vel.z)
  if (player.onGround && horizSpeed > 0.4) {
    player.stepDistance += horizSpeed * dt
    player.bob += dt * (sprinting ? 13 : 8.5)
    if (player.stepDistance > (sprinting ? 2.9 : 2.2)) {
      player.stepDistance = 0
      audio.footstep()
    }
  } else {
    player.bob += dt * 1.4
  }

  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt)
  player.grenadeCooldown = Math.max(0, player.grenadeCooldown - dt)
  if (player.meleePending > 0) {
    player.meleePending -= dt
    if (player.meleePending <= 0) resolveMelee()
  }

  const now = performance.now() / 1000
  if (now - player.lastDamage > 3.5 && player.shield < player.maxShield && player.health > 0) {
    if (!player.recharging) {
      player.recharging = true
      audio.shieldRecharge()
    }
    player.shield = Math.min(player.maxShield, player.shield + 34 * dt)
    if (player.shield >= player.maxShield) player.recharging = false
  }
  if (now - player.lastDamage > 6.5 && player.health < player.maxHealth) {
    player.health = Math.min(player.maxHealth, player.health + 4.5 * dt)
  }

  hud.setVitals(player.shield, player.maxShield, player.health, player.maxHealth)
  hud.setStats(player.kills, player.score, player.shotsFired ? (player.shotsHit / player.shotsFired) * 100 : null)
  hud.setSprint(sprinting)
  const adsActive = input.ads && !sprinting && !weapon.reloading
  hud.setAds(adsActive && weapon.adsBlend > 0.55)

  const weaponState = weapon.update(dt, {
    ads: adsActive,
    sprinting,
    moving,
    grounded: player.onGround,
    speed: horizSpeed,
    time: performance.now() / 1000
  })
  hud.setAmmo(weapon.ammo, weapon.reserve, player.grenades, weaponState.reloading)

  if (input.fire || touch.fire) tryShoot()

  applyCamera(dt)

  let prompt = ''
  if (weapon.reloading) prompt = ''
  else if (weapon.ammo === 0 && weapon.reserve > 0) prompt = 'PRESS R TO RELOAD'
  else if (weapon.ammo === 0 && weapon.reserve === 0) prompt = 'OUT OF AMMO // RESUPPLY BETWEEN WAVES'
  else if (dist > PLAY_RADIUS - 3) prompt = 'RETURN TO COMBAT ZONE'
  hud.setPrompt(prompt)

  const nowMs = performance.now()
  const shouldHint = !isTouch && state === 'playing' && document.pointerLockElement !== canvas && nowMs - startedAt > 2600
  hud.setClickHint(shouldHint)
}

function updateCasings(dt) {
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i]
    c.life -= dt
    c.vel.y -= 13 * dt
    c.mesh.position.addScaledVector(c.vel, dt)
    c.mesh.rotation.x += c.spin.x * dt
    c.mesh.rotation.y += c.spin.y * dt
    c.mesh.rotation.z += c.spin.z * dt
    const ground = groundHeight(c.mesh.position.x, c.mesh.position.z) + 0.02
    if (c.mesh.position.y < ground) {
      c.mesh.position.y = ground
      c.vel.y = Math.abs(c.vel.y) * 0.32
      c.vel.x *= 0.6
      c.vel.z *= 0.6
      c.spin.multiplyScalar(0.6)
    }
    if (c.life <= 0) {
      scene.remove(c.mesh)
      casings.splice(i, 1)
    }
  }
}

function updateHud(dt) {
  hud.update(dt)
  hud.setWave(wave, enemies.remainingCount())
  radarTimer -= dt
  if (radarTimer <= 0) {
    radarTimer = 0.06
    hud.drawRadar(player, enemies.enemies, world.spawnPoints)
  }
}

function updateMenuCamera(dt) {
  menuTime += dt
  player.yaw = Math.sin(menuTime * 0.055) * 0.075
  player.pitch = 0.055 + Math.sin(menuTime * 0.085) * 0.012
  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z)
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
  const targetFov = 72 + Math.sin(menuTime * 0.07) * 2
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-2 * dt))
  camera.updateProjectionMatrix()
}

const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)

  const dt = Math.min(clock.getDelta(), 0.05)
  const time = clock.elapsedTime

  world.update(dt, time, player.pos)
  effects.update(dt)
  updateCasings(dt)
  updateGrenades(dt)

  if (state === 'menu') {
    updateMenuCamera(dt)
    hud.update(dt)
  } else if (state !== 'dead') {
    updatePlayer(dt)
    enemies.update(dt, time, player.pos, camera.position)
    updateHud(dt)
  } else {
    applyCamera(dt)
    hud.update(dt)
  }

  renderer.render(scene, camera)
  if (started) weapon.render(renderer)
}

enemies.onKill = (enemy, { headshot }) => {
  const bonus = Math.round(enemy.def.score * (headshot ? 1.5 : 1))
  if (state === 'playing') {
    player.kills++
    player.score += bonus
    hud.feed(enemy.def.label, headshot)
    hud.setStats(player.kills, player.score, player.shotsFired ? (player.shotsHit / player.shotsFired) * 100 : null)
  }
}
enemies.onMeleePlayer = (amount, source) => damagePlayer(amount, source)
enemies.damagePlayer = (amount, source) => damagePlayer(amount, source)
enemies.onWaveCleared = (n) => handleWaveCleared(n)

function onKeyDown(event) {
  if (event.repeat) {
    if (event.code === 'Space') event.preventDefault()
    return
  }
  if (event.code === 'Enter' && state === 'menu') {
    beginRun()
    return
  }
  if (event.code === 'KeyM') {
    audio.toggleMute()
    return
  }
  if (state !== 'playing' && state !== 'cleared') return
  keys.add(event.code)
  if (event.code === 'Space') {
    jumpQueued = true
    event.preventDefault()
  }
  if (event.code === 'KeyR') {
    if (weapon.startReload()) {
      audio.reload()
      hud.setPrompt('')
    }
  }
  if (event.code === 'KeyG') throwGrenade()
  if (event.code === 'KeyF') melee()
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') input.sprint = true
}

function onKeyUp(event) {
  keys.delete(event.code)
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') input.sprint = false
}

window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)
window.addEventListener('blur', () => {
  keys.clear()
  input.fire = false
  input.ads = false
  touch.fire = false
})

document.addEventListener('mousemove', (event) => {
  if (state !== 'playing' && state !== 'cleared') return
  if (document.pointerLockElement !== canvas) return
  if (performance.now() < lookGuardUntil) return
  const sensitivity = 0.00215 * (weapon.adsBlend > 0.55 ? 0.72 : 1)
  player.yaw -= event.movementX * sensitivity
  player.pitch -= event.movementY * sensitivity
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.42, 1.42)
})

canvas.addEventListener('mousedown', (event) => {
  if (state !== 'playing' && state !== 'cleared') return
  if (document.pointerLockElement !== canvas) {
    lookGuardUntil = performance.now() + 650
    try { canvas.requestPointerLock?.() } catch {}
    return
  }
  if (event.button === 0) input.fire = true
  if (event.button === 2) input.ads = true
})
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) input.fire = false
  if (event.button === 2) input.ads = false
})
window.addEventListener('contextmenu', (event) => event.preventDefault())
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    lookGuardUntil = performance.now() + 500
  } else {
    input.fire = false
    input.ads = false
  }
})

document.getElementById('start-button').addEventListener('click', () => {
  audio.init()
  beginRun()
})
document.getElementById('redeploy-button').addEventListener('click', () => {
  audio.init()
  beginRun()
})

const joystick = document.getElementById('joystick')
const knob = document.getElementById('joystick-knob')
let joystickPointer = null
function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  let dx = event.clientX - cx
  let dy = event.clientY - cy
  const max = rect.width * 0.36
  const len = Math.hypot(dx, dy)
  if (len > max) {
    dx = (dx / len) * max
    dy = (dy / len) * max
  }
  touch.moveX = dx / max
  touch.moveY = dy / max
  knob.style.transform = `translate(${dx}px, ${dy}px)`
}
joystick.addEventListener('pointerdown', (event) => {
  joystickPointer = event.pointerId
  joystick.setPointerCapture(event.pointerId)
  updateJoystick(event)
})
joystick.addEventListener('pointermove', (event) => {
  if (event.pointerId === joystickPointer) updateJoystick(event)
})
function resetJoystick(event) {
  if (event.pointerId !== joystickPointer) return
  joystickPointer = null
  touch.moveX = 0
  touch.moveY = 0
  knob.style.transform = ''
}
joystick.addEventListener('pointerup', resetJoystick)
joystick.addEventListener('pointercancel', resetJoystick)

let lookPointer = null
let lastLookX = 0
let lastLookY = 0
canvas.addEventListener('pointerdown', (event) => {
  if (!isTouch || (state !== 'playing' && state !== 'cleared')) return
  lookPointer = event.pointerId
  lastLookX = event.clientX
  lastLookY = event.clientY
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== lookPointer) return
  const dx = event.clientX - lastLookX
  const dy = event.clientY - lastLookY
  lastLookX = event.clientX
  lastLookY = event.clientY
  const sensitivity = 0.0055 * (weapon.adsBlend > 0.55 ? 0.7 : 1)
  player.yaw -= dx * sensitivity
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * sensitivity, -1.42, 1.42)
})
function resetLook(event) {
  if (event.pointerId === lookPointer) lookPointer = null
}
canvas.addEventListener('pointerup', resetLook)
canvas.addEventListener('pointercancel', resetLook)

const fireButton = document.getElementById('touch-fire')
fireButton.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  touch.fire = true
  fireButton.setPointerCapture(event.pointerId)
})
fireButton.addEventListener('pointerup', () => { touch.fire = false })
fireButton.addEventListener('pointercancel', () => { touch.fire = false })
document.getElementById('touch-reload').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  if (weapon.startReload()) audio.reload()
})
document.getElementById('touch-grenade').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  throwGrenade()
})
document.getElementById('touch-jump').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  jumpQueued = true
})

window.addEventListener('resize', () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  weapon.resize(width / height)
})

weapon.onReloadComplete = () => {
  hud.setAmmo(weapon.ammo, weapon.reserve, player.grenades, false)
  hud.setPrompt('')
}

document.fonts?.ready.then(() => weapon.updateScreen())

hud.setVitals(player.shield, player.maxShield, player.health, player.maxHealth)
hud.setAmmo(weapon.ammo, weapon.reserve, player.grenades, weapon.reloading)
hud.setStats(0, 0, null)
hud.setWave(1, 0)
applyCamera(0.016)
animate()
