import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { makeGlowTexture } from './textures.js'

const UP = new THREE.Vector3(0, 1, 0)

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

function capsuleBetween(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const length = dir.length()
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 5, 9)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
  return mesh
}

function rounded(w, h, d, radius, material) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), material)
}

export class Weapon {
  constructor() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 8)
    this.scene.add(this.camera)

    this.scene.add(new THREE.AmbientLight(0xa8cbd8, 1.75))
    const key = new THREE.DirectionalLight(0xffe5bd, 4.6)
    key.position.set(-1.9, 2.4, -1.3)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x74e0ff, 2.1)
    rim.position.set(2.1, 0.8, -1.1)
    this.scene.add(rim)
    const fill = new THREE.DirectionalLight(0xa3c7d9, 1.0)
    fill.position.set(0.8, -1.1, -1.3)
    this.scene.add(fill)
    const front = new THREE.DirectionalLight(0xdfefff, 2.2)
    front.position.set(0.35, 0.9, 2.4)
    this.scene.add(front)

    this.hipPos = new THREE.Vector3(0.245, -0.232, -0.78)
    this.hipRot = new THREE.Euler(0.015, -0.055, -0.012)
    this.adsPos = new THREE.Vector3(0.0, -0.145, -0.45)
    this.adsRot = new THREE.Euler(0.0, 0.0, 0.0)

    this.magSize = 36
    this.ammo = 36
    this.reserve = 216
    this.reloading = false
    this.reloadTime = 0
    this.reloadDuration = 1.95
    this.cooldown = 0
    this.adsBlend = 0
    this.sprintBlend = 0
    this.kick = 0
    this.flashTime = 0
    this.meleeTime = 0
    this.throwTime = 0
    this.bobTime = 0
    this.triggerHeld = false
    this.onReloadComplete = null

    this.group = new THREE.Group()
    this.group.rotation.order = 'YXZ'
    this.scene.add(this.group)

    this.buildModel()
    this.applyPose(0)
  }

  buildModel() {
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x707d84, metalness: 0.7, roughness: 0.34 })
    const gunmetalDark = new THREE.MeshStandardMaterial({ color: 0x454f55, metalness: 0.68, roughness: 0.42 })
    const polymer = new THREE.MeshStandardMaterial({ color: 0x2e373c, metalness: 0.3, roughness: 0.64 })
    const rubber = new THREE.MeshStandardMaterial({ color: 0x101215, metalness: 0.15, roughness: 0.9 })
    const accent = new THREE.MeshStandardMaterial({ color: 0xc99b3f, metalness: 0.62, roughness: 0.31 })
    const accentDim = new THREE.MeshStandardMaterial({ color: 0x6d5729, metalness: 0.55, roughness: 0.44 })
    const armor = new THREE.MeshStandardMaterial({ color: 0x7b8c62, metalness: 0.36, roughness: 0.5 })
    const armorDark = new THREE.MeshStandardMaterial({ color: 0x47553d, metalness: 0.38, roughness: 0.56 })
    const glove = new THREE.MeshStandardMaterial({ color: 0x191e20, metalness: 0.2, roughness: 0.82 })
    const glow = new THREE.MeshBasicMaterial({ color: 0x8ef2ff, toneMapped: false })

    const receiver = rounded(0.155, 0.175, 0.54, 0.018, gunmetal)
    receiver.position.set(0, 0.015, -0.27)
    this.group.add(receiver)

    const lower = rounded(0.13, 0.11, 0.32, 0.014, gunmetalDark)
    lower.position.set(0, -0.085, -0.33)
    this.group.add(lower)

    const upperRail = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.03, 0.46), polymer)
    upperRail.position.set(0, 0.12, -0.26)
    this.group.add(upperRail)
    for (let i = 0; i < 9; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.022), new THREE.MeshStandardMaterial({ color: 0x101416, metalness: 0.6, roughness: 0.5 }))
      slot.position.set(0, 0.135, -0.05 - i * 0.048)
      this.group.add(slot)
    }

    const handguard = rounded(0.125, 0.12, 0.35, 0.022, gunmetal)
    handguard.position.set(0, 0.012, -0.61)
    this.group.add(handguard)
    const guardAccent = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.026, 0.18), accent)
    guardAccent.position.set(0, 0.025, -0.62)
    this.group.add(guardAccent)
    const guardVent = new THREE.Mesh(new THREE.BoxGeometry(0.134, 0.045, 0.2), polymer)
    guardVent.position.set(0, -0.035, -0.62)
    this.group.add(guardVent)
    for (let i = 0; i < 4; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.022), new THREE.MeshBasicMaterial({ color: 0x060809 }))
      vent.position.set(0, -0.032, -0.54 - i * 0.045)
      this.group.add(vent)
    }

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.031, 0.32, 10), gunmetalDark)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.018, -0.87)
    this.group.add(barrel)
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 16), polymer)
      ring.position.set(0, 0.018, -0.79 - i * 0.045)
      this.group.add(ring)
    }
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.1, 8), gunmetalDark)
    brake.rotation.x = Math.PI / 2
    brake.position.set(0, 0.018, -1.02)
    this.group.add(brake)
    for (let i = 0; i < 3; i++) {
      const cut = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.014, 0.05), new THREE.MeshBasicMaterial({ color: 0x050707 }))
      cut.position.set(0, 0.018, -1.0 + i * 0.028)
      cut.rotation.z = (i * Math.PI) / 3
      this.group.add(cut)
    }

    this.mag = rounded(0.088, 0.21, 0.145, 0.014, gunmetalDark)
    this.mag.position.set(0, -0.19, -0.2)
    this.mag.rotation.x = -0.12
    this.group.add(this.mag)
    const magAccent = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.147), accentDim)
    magAccent.position.set(0, -0.072, 0)
    magAccent.rotation.x = -0.12
    this.mag.add(magAccent)
    this.magAccent = magAccent

    const grip = rounded(0.068, 0.19, 0.105, 0.016, polymer)
    grip.position.set(0, -0.16, -0.005)
    grip.rotation.x = 0.32
    this.group.add(grip)
    const gripPlate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.107), accentDim)
    gripPlate.position.set(0, -0.245, 0.03)
    gripPlate.rotation.x = 0.32
    this.group.add(gripPlate)

    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 5, 12, Math.PI * 1.1), gunmetalDark)
    triggerGuard.position.set(0, -0.105, -0.115)
    triggerGuard.rotation.x = Math.PI / 2
    triggerGuard.rotation.z = 0.2
    this.group.add(triggerGuard)

    const stock = rounded(0.105, 0.15, 0.24, 0.018, gunmetalDark)
    stock.position.set(0, 0.008, 0.09)
    this.group.add(stock)
    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.035), rubber)
    stockPad.position.set(0, 0.002, 0.215)
    this.group.add(stockPad)
    const cheek = rounded(0.11, 0.05, 0.17, 0.014, polymer)
    cheek.position.set(0, 0.088, 0.08)
    this.group.add(cheek)

    const sideAccent = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.055, 0.24), accent)
    sideAccent.position.set(0.08, 0.015, -0.26)
    this.group.add(sideAccent)
    const sideAccent2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.035, 0.1), accentDim)
    sideAccent2.position.set(-0.078, -0.01, -0.23)
    this.group.add(sideAccent2)

    const ejection = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.045, 0.11), new THREE.MeshBasicMaterial({ color: 0x080a0b }))
    ejection.position.set(0.079, 0.06, -0.23)
    this.group.add(ejection)
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.09), gunmetal)
    bolt.position.set(0.085, 0.062, -0.32)
    this.group.add(bolt)

    this.sight = new THREE.Group()
    const sightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.035), polymer)
    sightFrame.position.set(0, 0.185, -0.16)
    this.sight.add(sightFrame)
    const lens = new THREE.Mesh(
      new THREE.PlaneGeometry(0.058, 0.058),
      new THREE.MeshBasicMaterial({ color: 0x081b21, transparent: true, opacity: 0.75 })
    )
    lens.position.set(0, 0.185, -0.141)
    this.sight.add(lens)
    const reticleDot = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 10), glow)
    reticleDot.position.set(0, 0.185, -0.139)
    this.sight.add(reticleDot)
    const reticleRing = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.0205, 22), new THREE.MeshBasicMaterial({ color: 0x65e5ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false }))
    reticleRing.position.set(0, 0.185, -0.139)
    this.sight.add(reticleRing)
    const sightGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0x6fe8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    sightGlow.position.set(0, 0.185, -0.137)
    sightGlow.scale.set(0.07, 0.07, 1)
    this.sight.add(sightGlow)
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.05), polymer)
    hood.position.set(0, 0.228, -0.16)
    this.sight.add(hood)
    this.group.add(this.sight)

    this.screenCanvas = document.createElement('canvas')
    this.screenCanvas.width = 128
    this.screenCanvas.height = 64
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas)
    this.screenTexture.colorSpace = THREE.SRGBColorSpace
    this.updateScreen()
    const screenMat = new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false })
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.082, 0.041), screenMat)
    screen.position.set(0.042, 0.111, -0.006)
    screen.rotation.x = -0.62
    screen.rotation.y = 0.06
    this.group.add(screen)
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.051, 0.014), polymer)
    screenFrame.position.set(0.042, 0.107, 0.003)
    screenFrame.rotation.x = -0.62
    screenFrame.rotation.y = 0.06
    this.group.add(screenFrame)

    const slingMount = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 5, 12), accentDim)
    slingMount.position.set(0.075, -0.045, -0.5)
    slingMount.rotation.y = Math.PI / 2
    this.group.add(slingMount)

    const rightShoulder = new THREE.Vector3(0.44, -0.48, 0.10)
    const rightElbow = new THREE.Vector3(0.26, -0.32, -0.08)
    const rightWrist = new THREE.Vector3(0.055, -0.2, -0.08)
    const leftShoulder = new THREE.Vector3(-0.46, -0.5, 0.08)
    const leftElbow = new THREE.Vector3(-0.2, -0.245, -0.33)
    const leftWrist = new THREE.Vector3(-0.045, -0.14, -0.61)

    const rightArm = capsuleBetween(rightElbow, rightShoulder, 0.057, armor)
    this.group.add(rightArm)
    const rightForearm = capsuleBetween(rightWrist, rightElbow, 0.051, armorDark)
    this.group.add(rightForearm)
    const rightPlate = capsuleBetween(
      new THREE.Vector3(0.19, -0.26, -0.05),
      new THREE.Vector3(0.09, -0.19, -0.09),
      0.062,
      armor
    )
    this.group.add(rightPlate)

    const leftForearm = capsuleBetween(leftWrist, leftElbow, 0.046, armorDark)
    this.group.add(leftForearm)
    const leftBracer = capsuleBetween(
      new THREE.Vector3(-0.185, -0.205, -0.38),
      new THREE.Vector3(-0.075, -0.155, -0.575),
      0.052,
      armor
    )
    this.group.add(leftBracer)

    const rightGlove = rounded(0.09, 0.09, 0.13, 0.02, glove)
    rightGlove.position.set(0.055, -0.205, -0.075)
    rightGlove.rotation.x = 0.12
    this.group.add(rightGlove)
    const leftGlove = rounded(0.085, 0.075, 0.16, 0.019, glove)
    leftGlove.position.set(-0.048, -0.14, -0.6)
    leftGlove.rotation.x = -0.16
    leftGlove.rotation.z = 0.14
    this.group.add(leftGlove)
    for (let i = 0; i < 3; i++) {
      const finger = rounded(0.022, 0.022, 0.08, 0.009, glove)
      finger.position.set(-0.095 + i * 0.027, -0.1, -0.64)
      finger.rotation.z = 0.2
      this.group.add(finger)
    }

    const band = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.05), accentDim)
    band.position.set(0.0, -0.123, -0.6)
    band.rotation.z = 0.235
    this.group.add(band)

    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0, 0.018, -1.075)
    this.group.add(this.muzzle)

    this.flashGroup = new THREE.Group()
    this.flashGroup.position.copy(this.muzzle.position)
    this.group.add(this.flashGroup)
    const flashCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.42, 7, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    )
    flashCone.rotation.x = -Math.PI / 2
    flashCone.position.z = -0.18
    this.flashGroup.add(flashCone)
    this.flashCone = flashCone
    const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xfff0c4, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    flashCore.scale.set(0.35, 0.35, 1)
    this.flashGroup.add(flashCore)
    this.flashCore = flashCore
    const flashHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffaa4f, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    flashHalo.scale.set(0.65, 0.65, 1)
    this.flashGroup.add(flashHalo)
    this.flashHalo = flashHalo
    this.flashLight = new THREE.PointLight(0xffbc6b, 0, 3.5, 2)
    this.flashGroup.add(this.flashLight)
    this.flashGroup.visible = false
  }

  updateScreen() {
    if (!this.screenCanvas) return
    const ctx = this.screenCanvas.getContext('2d')
    ctx.fillStyle = '#03141b'
    ctx.fillRect(0, 0, 128, 64)
    ctx.strokeStyle = 'rgba(110,232,255,0.32)'
    ctx.lineWidth = 1
    ctx.strokeRect(2.5, 2.5, 123, 59)
    ctx.fillStyle = '#9af4ff'
    ctx.font = '700 34px Oxanium, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(String(this.ammo).padStart(2, '0'), 88, 42)
    ctx.fillStyle = 'rgba(150,230,245,0.55)'
    ctx.font = '600 12px Rajdhani, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('MA40', 8, 20)
    ctx.fillStyle = 'rgba(110,232,255,0.2)'
    ctx.fillRect(8, 48, 60, 5)
    const ratio = this.ammo / this.magSize
    ctx.fillStyle = ratio < 0.25 ? '#ff9e52' : '#65e5ff'
    ctx.fillRect(8, 48, 60 * ratio, 5)
    ctx.fillStyle = 'rgba(255,177,74,0.85)'
    ctx.fillRect(112, 14, 7, 3)
    ctx.fillRect(112, 20, 7, 3)
    if (this.screenTexture) this.screenTexture.needsUpdate = true
  }

  reset() {
    this.ammo = this.magSize
    this.reserve = 216
    this.reloading = false
    this.reloadTime = 0
    this.cooldown = 0
    this.kick = 0
    this.adsBlend = 0
    this.sprintBlend = 0
    this.meleeTime = 0
    this.throwTime = 0
    this.updateScreen()
  }

  addAmmo(amount = 108) {
    this.reserve = Math.min(324, this.reserve + amount)
    if (!this.reloading && this.ammo === 0) this.startReload()
    this.updateScreen()
  }

  tryFire() {
    if (this.reloading) return { ok: false, reason: 'reloading' }
    if (this.cooldown > 0) return { ok: false, reason: 'cooldown' }
    if (this.ammo <= 0) {
      this.cooldown = 0.22
      return { ok: false, reason: 'empty' }
    }
    this.ammo--
    this.cooldown = 0.09
    this.kick = 1
    this.flashTime = 0.055
    this.updateScreen()
    return { ok: true, ammo: this.ammo, empty: this.ammo === 0 }
  }

  startReload() {
    if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return false
    this.reloading = true
    this.reloadTime = 0
    return true
  }

  playMelee() {
    this.meleeTime = 0.36
  }

  playThrow() {
    this.throwTime = 0.5
  }

  update(dt, { ads = false, sprinting = false, moving = false, grounded = true, speed = 0, time = 0 } = {}) {
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.kick = damp(this.kick, 0, 16, dt)

    const adsTarget = ads && !sprinting && !this.reloading ? 1 : 0
    this.adsBlend = damp(this.adsBlend, adsTarget, 13, dt)
    this.sprintBlend = damp(this.sprintBlend, sprinting ? 1 : 0, 10, dt)

    if (this.reloading) {
      this.reloadTime += dt
      if (this.reloadTime >= this.reloadDuration) {
        const needed = this.magSize - this.ammo
        const taken = Math.min(needed, this.reserve)
        this.ammo += taken
        this.reserve -= taken
        this.reloading = false
        this.reloadTime = 0
        this.updateScreen()
        this.onReloadComplete?.()
      }
    }
    this.meleeTime = Math.max(0, this.meleeTime - dt)
    this.throwTime = Math.max(0, this.throwTime - dt)

    const motion = moving && grounded ? Math.min(1, speed / 7) : 0
    this.bobTime += dt * (sprinting ? 13.2 : 8.8) * (0.4 + motion)
    this.applyPose(time, motion)
    this.updateFlash(dt)
    return { reloading: this.reloading, adsBlend: this.adsBlend }
  }

  applyPose(time, motion = 0) {
    const ads = this.adsBlend
    const sprint = this.sprintBlend

    const pos = new THREE.Vector3().lerpVectors(this.hipPos, this.adsPos, ads)
    const rot = new THREE.Euler(
      THREE.MathUtils.lerp(this.hipRot.x, this.adsRot.x, ads),
      THREE.MathUtils.lerp(this.hipRot.y, this.adsRot.y, ads),
      THREE.MathUtils.lerp(this.hipRot.z, this.adsRot.z, ads)
    )

    const bobAmp = (1 - ads * 0.85) * (0.35 + motion * 0.65)
    const bobX = Math.sin(this.bobTime) * 0.012 * bobAmp
    const bobY = Math.abs(Math.cos(this.bobTime)) * 0.009 * bobAmp
    const breatheX = Math.sin(time * 1.25) * 0.0018
    const breatheY = Math.cos(time * 1.55) * 0.0024
    pos.x += bobX + breatheX
    pos.y += bobY + breatheY - sprint * 0.16
    pos.z += this.kick * 0.065 + sprint * 0.08
    pos.x += sprint * 0.06

    rot.x += this.kick * 0.07 + sprint * -0.42
    rot.y += this.kick * 0.012 + sprint * 0.42
    rot.z += this.kick * 0.02 + sprint * 0.55 + Math.sin(this.bobTime * 0.5) * 0.01 * bobAmp

    if (this.reloading) {
      const p = Math.min(1, this.reloadTime / this.reloadDuration)
      const wave = Math.sin(Math.min(1, p * 1.05) * Math.PI)
      const shake = Math.sin(p * Math.PI * 8) * 0.01 * wave
      pos.y -= wave * 0.16
      pos.x -= wave * 0.055
      pos.z += wave * 0.02
      rot.x += wave * 0.28 + shake
      rot.z += wave * 0.42
      const magDrop = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.2
      this.mag.position.y = -0.19 - magDrop
      this.mag.rotation.z = magDrop * 1.2
    } else {
      this.mag.position.y = -0.19
      this.mag.rotation.z = 0
    }

    if (this.meleeTime > 0) {
      const p = 1 - this.meleeTime / 0.36
      const swing = Math.sin(p * Math.PI)
      pos.x -= swing * 0.34
      pos.y -= swing * 0.1
      pos.z -= swing * 0.26
      rot.y += swing * 0.75
      rot.z -= swing * 0.55
      rot.x += swing * 0.22
    }

    if (this.throwTime > 0) {
      const p = 1 - this.throwTime / 0.5
      const swing = Math.sin(Math.min(1, p * 1.8) * Math.PI)
      pos.y -= swing * 0.18
      pos.x -= swing * 0.12
      rot.z += swing * 0.5
      rot.x += swing * 0.3
    }

    this.group.position.copy(pos)
    this.group.rotation.copy(rot)

    this.camera.fov = THREE.MathUtils.lerp(this.baseFov || 68, (this.baseFov || 68) - 9, ads)
    this.camera.updateProjectionMatrix()
  }

  updateFlash(dt) {
    if (this.flashTime > 0) {
      this.flashTime -= dt
      this.flashGroup.visible = true
      const f = Math.max(0, this.flashTime / 0.055)
      this.flashCone.material.opacity = f * 0.9
      this.flashCone.scale.setScalar(0.7 + Math.random() * 0.65)
      this.flashCone.rotation.z = Math.random() * Math.PI
      this.flashCore.material.opacity = f
      this.flashCore.scale.setScalar(0.26 + Math.random() * 0.22)
      this.flashHalo.material.opacity = f * 0.55
      this.flashHalo.scale.setScalar(0.55 + Math.random() * 0.3)
      this.flashLight.intensity = f * (18 + Math.random() * 18)
    } else {
      this.flashGroup.visible = false
      this.flashLight.intensity = 0
    }
  }

  muzzleWorldPosition(camera, target = new THREE.Vector3()) {
    this.scene.updateMatrixWorld(true)
    this.muzzle.getWorldPosition(target)
    target.applyQuaternion(camera.quaternion).add(camera.position)
    return target
  }

  resize(aspect) {
    this.camera.aspect = aspect
    this.baseFov = aspect < 1 ? 78 : 68
    this.group.scale.setScalar(aspect < 1 ? 0.55 : 0.78)
    this.camera.updateProjectionMatrix()
  }

  render(renderer) {
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.autoClear = true
  }
}
