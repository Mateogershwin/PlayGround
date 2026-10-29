import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { groundHeight, terrainHeight } from './world.js'
import { makeGlowTexture } from './textures.js'

const TYPES = {
  grunt: {
    label: 'UNGGoy',
    hp: 58,
    shield: 0,
    speed: 3.35,
    preferred: 15,
    height: 1.45,
    damage: 8,
    cooldown: 2.15,
    projectileSpeed: 26,
    color: 0x7cd8ff,
    deathColor: 0x8fe1ff,
    score: 100
  },
  elite: {
    label: 'SANGHEILI',
    hp: 105,
    shield: 90,
    speed: 4.35,
    preferred: 11.5,
    height: 2.35,
    damage: 11,
    cooldown: 2.4,
    projectileSpeed: 34,
    color: 0xff7a5e,
    deathColor: 0x9a7bff,
    score: 220
  },
  brute: {
    label: 'JIRALHANAE',
    hp: 220,
    shield: 0,
    speed: 3.75,
    preferred: 9,
    height: 2.62,
    damage: 13,
    cooldown: 2.0,
    projectileSpeed: 31,
    color: 0xffb256,
    deathColor: 0xff7b45,
    score: 300
  },
  chief: {
    label: 'WAR CHIEF',
    hp: 320,
    shield: 320,
    speed: 4.6,
    preferred: 10,
    height: 3.2,
    damage: 17,
    cooldown: 1.45,
    projectileSpeed: 39,
    color: 0xffd36e,
    deathColor: 0xffcf61,
    score: 1200
  }
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

function dampAngle(current, target, lambda, dt) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * dt))
}

function rounded(w, h, d, r, mat) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat)
}

function glow(color, size, opacity = 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  }))
  sprite.scale.set(size, size, 1)
  return sprite
}

function limb(from, to, radius, material) {
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius * 0.82, len, 7, 1)
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.copy(from).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

function makeHealthBar(height) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 20
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true, toneMapped: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.05, 0.16, 1)
  sprite.position.y = height + 0.42
  return { sprite, canvas, ctx: canvas.getContext('2d'), texture, material }
}

class Enemy {
  constructor(manager, type, position) {
    this.manager = manager
    this.type = type
    this.def = TYPES[type]
    this.hp = this.def.hp
    this.maxHp = this.def.hp
    this.shield = this.def.shield
    this.maxShield = this.def.shield
    this.speed = this.def.speed
    this.dead = false
    this.age = 0
    this.materialize = 0.7
    this.attackCooldown = 1.2 + Math.random() * 1.4
    this.damageTimer = 0
    this.shieldTimer = 0
    this.shieldRegen = 0
    this.flash = 0
    this.walkPhase = Math.random() * Math.PI * 2
    this.strafePhase = Math.random() * Math.PI * 2
    this.strafeDir = Math.random() > 0.5 ? 1 : -1
    this.burstLeft = 0
    this.burstTimer = 0
    this.hitMeshes = []
    this.flashMats = []
    this.legs = []
    this.arms = []
    this.gunRecoil = 0
    this.basePosition = position.clone()
    this.model = this.build()
    this.model.position.copy(position)
    this.model.scale.setScalar(0.02)
    this.healthBar = makeHealthBar(this.def.height)
    this.model.add(this.healthBar.sprite)
    this.updateHealthBar()
    this.manager.scene.add(this.model)
  }

  build() {
    const root = new THREE.Group()
    root.rotation.order = 'YXZ'
    const cfg = this.def
    const isElite = this.type === 'elite' || this.type === 'chief'
    const isBrute = this.type === 'brute'

    let armorColor = 0x596b8d
    let armorDark = 0x27324d
    let skinColor = 0x6c7b8a
    let trimColor = 0x2d3648
    if (this.type === 'grunt') {
      armorColor = 0x9a5f31
      armorDark = 0x4f321f
      skinColor = 0x9d8a6a
      trimColor = 0x2c2620
    } else if (this.type === 'elite') {
      armorColor = 0x4b628f
      armorDark = 0x222f4f
      skinColor = 0x4f5a68
      trimColor = 0x1b2334
    } else if (this.type === 'brute') {
      armorColor = 0x6d3b31
      armorDark = 0x39201a
      skinColor = 0x655d58
      trimColor = 0x241816
    } else if (this.type === 'chief') {
      armorColor = 0xb18a3e
      armorDark = 0x4e3a17
      skinColor = 0x6a5b49
      trimColor = 0x2b2111
    }

    const armor = new THREE.MeshStandardMaterial({ color: armorColor, metalness: 0.55, roughness: 0.46 })
    const armorDarkMat = new THREE.MeshStandardMaterial({ color: armorDark, metalness: 0.5, roughness: 0.55 })
    const skin = new THREE.MeshStandardMaterial({ color: skinColor, metalness: 0.12, roughness: 0.82 })
    const trim = new THREE.MeshStandardMaterial({ color: trimColor, metalness: 0.6, roughness: 0.45 })
    const black = new THREE.MeshStandardMaterial({ color: 0x101316, metalness: 0.55, roughness: 0.6 })
    const eyeMat = new THREE.MeshBasicMaterial({ color: isElite ? 0xffb15c : 0x86ecff, toneMapped: false })
    this.flashMats.push(armor, armorDarkMat, skin, trim)

    const bodyRoot = new THREE.Group()
    root.add(bodyRoot)
    this.bodyRoot = bodyRoot

    let head, torso, gun

    if (this.type === 'grunt') {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 10), skin)
      belly.scale.set(1.05, 1.1, 0.86)
      belly.position.y = 0.74
      bodyRoot.add(belly)
      torso = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), armor)
      torso.scale.set(1.08, 0.85, 0.9)
      torso.position.y = 0.94
      bodyRoot.add(torso)
      const chest = rounded(0.36, 0.24, 0.18, 0.06, armorDarkMat)
      chest.position.set(0, 0.95, 0.2)
      bodyRoot.add(chest)
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.56, 10), trim)
      tank.position.set(0, 0.94, -0.32)
      tank.rotation.x = 0.12
      bodyRoot.add(tank)
      const tankCap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), armorDarkMat)
      tankCap.position.set(0, 1.22, -0.35)
      bodyRoot.add(tankCap)
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 5, 12, Math.PI), black)
      hose.position.set(0.08, 1.09, -0.2)
      hose.rotation.y = 0.6
      bodyRoot.add(hose)

      head = new THREE.Group()
      head.position.set(0, 1.3, 0.05)
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin)
      skull.scale.set(1, 0.95, 1.08)
      head.add(skull)
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), armor)
      helmet.position.y = 0.035
      head.add(helmet)
      const mask = rounded(0.24, 0.17, 0.13, 0.03, trim)
      mask.position.set(0, -0.055, 0.16)
      head.add(mask)
      const breather = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), black)
      breather.rotation.x = Math.PI / 2
      breather.position.set(0, -0.1, 0.24)
      head.add(breather)
      for (const sx of [-0.075, 0.075]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), eyeMat)
        eye.position.set(sx, 0.025, 0.18)
        head.add(eye)
        const eyeGlow = glow(0x7fe5ff, 0.085, 0.85)
        eyeGlow.position.copy(eye.position)
        head.add(eyeGlow)
      }
      bodyRoot.add(head)

      for (const side of [-1, 1]) {
        const armPivot = new THREE.Group()
        armPivot.position.set(side * 0.34, 0.94, 0.02)
        const upper = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.12, -0.28, 0.13), 0.072, skin)
        armPivot.add(upper)
        const fore = limb(new THREE.Vector3(side * 0.12, -0.28, 0.13), new THREE.Vector3(side * 0.05, -0.42, 0.3), 0.06, skin)
        armPivot.add(fore)
        const glove = rounded(0.1, 0.08, 0.1, 0.025, trim)
        glove.position.set(side * 0.05, -0.42, 0.3)
        armPivot.add(glove)
        bodyRoot.add(armPivot)
        this.arms.push(armPivot)
        if (side === 1) {
          gun = this.makePlasmaPistol(trim, armorDarkMat)
          gun.position.set(0.05, -0.42, 0.36)
          gun.userData.baseZ = gun.position.z
          armPivot.add(gun)
        }
      }

      for (const side of [-1, 1]) {
        const legPivot = new THREE.Group()
        legPivot.position.set(side * 0.15, 0.58, 0)
        const thigh = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.26, 0.02), 0.085, skin)
        legPivot.add(thigh)
        const shin = limb(new THREE.Vector3(0, -0.26, 0.02), new THREE.Vector3(0, -0.5, 0.04), 0.065, armorDarkMat)
        legPivot.add(shin)
        const foot = rounded(0.13, 0.07, 0.23, 0.02, trim)
        foot.position.set(0, -0.53, 0.08)
        legPivot.add(foot)
        bodyRoot.add(legPivot)
        this.legs.push(legPivot)
      }
    } else if (isElite || isBrute) {
      const scale = isBrute ? 1.12 : 1
      const hipY = isBrute ? 1.08 : 1.0
      const torsoY = isBrute ? 1.72 : 1.48
      const shoulderY = isBrute ? 2.0 : 1.72
      const headY = isBrute ? 2.45 : 2.06
      const torsoW = isBrute ? 0.72 : 0.5
      const torsoH = isBrute ? 0.9 : 0.72

      torso = rounded(torsoW * scale, torsoH, isBrute ? 0.52 : 0.4, 0.09, armor)
      torso.position.y = torsoY
      bodyRoot.add(torso)
      const abdomen = rounded(torsoW * 0.68 * scale, 0.38, isBrute ? 0.42 : 0.34, 0.07, armorDarkMat)
      abdomen.position.y = hipY
      bodyRoot.add(abdomen)
      const chestPlate = rounded(torsoW * 0.86 * scale, torsoH * 0.7, 0.14, 0.05, armorDarkMat)
      chestPlate.position.set(0, torsoY + 0.06, isBrute ? 0.25 : 0.2)
      bodyRoot.add(chestPlate)
      const backPlate = rounded(torsoW * 0.84 * scale, torsoH * 0.8, 0.12, 0.04, trim)
      backPlate.position.set(0, torsoY, isBrute ? -0.26 : -0.21)
      bodyRoot.add(backPlate)

      for (const side of [-1, 1]) {
        const pauldron = rounded(isBrute ? 0.4 : 0.28, isBrute ? 0.3 : 0.22, isBrute ? 0.46 : 0.34, 0.07, armorDarkMat)
        pauldron.position.set(side * (torsoW * 0.72 + (isBrute ? 0.12 : 0.08)), shoulderY, 0)
        pauldron.rotation.z = side * -0.15
        bodyRoot.add(pauldron)
        if (this.type === 'chief') {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.4, 6), trim)
          spike.position.set(side * 0.32, shoulderY + 0.26, 0)
          spike.rotation.z = side * -0.3
          bodyRoot.add(spike)
        }
      }

      head = this.makeEliteHead(headY, isBrute, armor, trim, skin, eyeMat)
      bodyRoot.add(head)

      for (const side of [-1, 1]) {
        const armPivot = new THREE.Group()
        armPivot.position.set(side * (torsoW * 0.62 + 0.16), shoulderY - 0.06, 0)
        const upper = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.16, -0.36, 0.06), isBrute ? 0.14 : 0.09, skin)
        armPivot.add(upper)
        const fore = limb(new THREE.Vector3(side * 0.16, -0.36, 0.06), new THREE.Vector3(side * 0.08, -0.58, 0.42), isBrute ? 0.115 : 0.075, armorDarkMat)
        armPivot.add(fore)
        const hand = rounded(isBrute ? 0.17 : 0.11, isBrute ? 0.13 : 0.09, isBrute ? 0.18 : 0.12, 0.03, trim)
        hand.position.set(side * 0.08, -0.58, 0.42)
        armPivot.add(hand)
        bodyRoot.add(armPivot)
        this.arms.push(armPivot)
        if (side === 1) {
          gun = this.makePlasmaRifle(trim, armorDarkMat, this.type === 'chief' ? 0xffd268 : isBrute ? 0xff9c4a : 0xff6b52)
          gun.position.set(side * 0.08, -0.57, 0.48)
          gun.userData.baseZ = gun.position.z
          armPivot.add(gun)
        }
      }

      for (const side of [-1, 1]) {
        const legPivot = new THREE.Group()
        legPivot.position.set(side * (isBrute ? 0.28 : 0.19), hipY - 0.12, 0)
        const thigh = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.44, 0.03), isBrute ? 0.15 : 0.1, skin)
        legPivot.add(thigh)
        const shin = limb(new THREE.Vector3(0, -0.44, 0.03), new THREE.Vector3(0, -0.86, -0.02), isBrute ? 0.12 : 0.08, armorDarkMat)
        legPivot.add(shin)
        const foot = rounded(isBrute ? 0.22 : 0.14, isBrute ? 0.12 : 0.08, isBrute ? 0.4 : 0.28, 0.03, trim)
        foot.position.set(0, -0.9, 0.08)
        legPivot.add(foot)
        bodyRoot.add(legPivot)
        this.legs.push(legPivot)
      }

      if (this.shield > 0) {
        const shieldMat = new THREE.MeshBasicMaterial({
          color: this.type === 'chief' ? 0xffd36e : 0x63cfff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false
        })
        const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(isBrute ? 1.4 : 1.08, 16, 12), shieldMat)
        shieldMesh.position.y = torsoY - 0.1
        shieldMesh.scale.set(1, isBrute ? 1.25 : 1.35, 0.82)
        shieldMesh.visible = false
        bodyRoot.add(shieldMesh)
        this.shieldMesh = shieldMesh
        this.shieldMat = shieldMat
      }
    }

    this.gun = gun
    if (torso) this.registerHit(torso, 'body')
    if (head) {
      this.registerHit(head, 'head')
      head.traverse((child) => { if (child.isMesh) this.registerHit(child, 'head') })
    }
    if (this.gun) this.gun.traverse((child) => { if (child.isMesh) this.registerHit(child, 'limb') })
    bodyRoot.traverse((child) => {
      if (child.isMesh && !child.userData.enemy) this.registerHit(child, this.type === 'grunt' ? 'body' : 'limb')
    })

    root.scale.setScalar(this.type === 'chief' ? 1.15 : this.type === 'brute' ? 1.08 : 1)
    return root
  }

  makeEliteHead(y, isBrute, armor, trim, skin, eyeMat) {
    const head = new THREE.Group()
    head.position.set(0, y, 0.02)
    const skull = new THREE.Mesh(new THREE.SphereGeometry(isBrute ? 0.24 : 0.19, 12, 10), skin)
    skull.scale.set(1, isBrute ? 1.25 : 1.12, 1.2)
    head.add(skull)
    const helmet = rounded(isBrute ? 0.4 : 0.31, isBrute ? 0.3 : 0.24, isBrute ? 0.46 : 0.36, 0.06, armor)
    helmet.position.set(0, isBrute ? 0.07 : 0.06, -0.02)
    head.add(helmet)
    const brow = rounded(isBrute ? 0.42 : 0.34, 0.09, 0.18, 0.03, trim)
    brow.position.set(0, isBrute ? 0.14 : 0.12, isBrute ? 0.22 : 0.18)
    head.add(brow)
    const jaw = rounded(isBrute ? 0.28 : 0.2, 0.13, 0.2, 0.04, skin)
    jaw.position.set(0, isBrute ? -0.12 : -0.09, isBrute ? 0.16 : 0.14)
    head.add(jaw)
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(isBrute ? 0.035 : 0.027, 8, 8), eyeMat)
      eye.position.set(sx * (isBrute ? 0.1 : 0.075), isBrute ? 0.03 : 0.02, isBrute ? 0.19 : 0.16)
      head.add(eye)
      const eyeGlow = glow(isBrute ? 0xffa24d : 0xffb15c, 0.12, 0.85)
      eyeGlow.position.copy(eye.position)
      head.add(eyeGlow)
    }
    if (!isBrute) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const mandible = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.13, 5), skin)
          mandible.position.set(sx * 0.07, -0.14, 0.13 + sz * 0.035)
          mandible.rotation.x = 0.28
          mandible.rotation.z = sx * 0.12
          head.add(mandible)
        }
      }
    }
    return head
  }

  makePlasmaPistol(trim, dark) {
    const gun = new THREE.Group()
    const body = rounded(0.09, 0.12, 0.28, 0.02, trim)
    gun.add(body)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.14, 8), dark)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.015, 0.19)
    gun.add(barrel)
    const glowMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 8), new THREE.MeshBasicMaterial({ color: 0x79e6ff, toneMapped: false }))
    glowMesh.rotation.x = Math.PI / 2
    glowMesh.position.set(0, 0.015, 0.2)
    gun.add(glowMesh)
    const glowSprite = glow(0x6fe2ff, 0.28, 0.55)
    glowSprite.position.set(0, 0.015, 0.28)
    gun.add(glowSprite)
    const grip = rounded(0.07, 0.14, 0.09, 0.02, dark)
    grip.position.set(0, -0.1, -0.06)
    grip.rotation.x = -0.32
    gun.add(grip)
    gun.userData.tip = new THREE.Object3D()
    gun.userData.tip.position.set(0, 0.015, 0.28)
    gun.add(gun.userData.tip)
    return gun
  }

  makePlasmaRifle(trim, dark, color) {
    const gun = new THREE.Group()
    const body = rounded(0.11, 0.16, 0.62, 0.025, trim)
    gun.add(body)
    const top = rounded(0.07, 0.06, 0.4, 0.02, dark)
    top.position.set(0, 0.1, -0.02)
    gun.add(top)
    for (const sx of [-1, 1]) {
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.34, 6), dark)
      prong.rotation.x = Math.PI / 2
      prong.position.set(sx * 0.1, 0.02, 0.4)
      gun.add(prong)
      const energy = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }))
      energy.rotation.x = Math.PI / 2
      energy.position.set(sx * 0.1, 0.02, 0.42)
      gun.add(energy)
    }
    const core = glow(color, 0.42, 0.55)
    core.position.set(0, 0.02, 0.5)
    gun.add(core)
    const grip = rounded(0.08, 0.16, 0.1, 0.02, dark)
    grip.position.set(0, -0.12, -0.15)
    grip.rotation.x = -0.3
    gun.add(grip)
    gun.userData.tip = new THREE.Object3D()
    gun.userData.tip.position.set(0, 0.02, 0.52)
    gun.add(gun.userData.tip)
    gun.userData.glow = core
    return gun
  }

  registerHit(mesh, part) {
    mesh.userData.enemy = this
    mesh.userData.part = part
    this.hitMeshes.push(mesh)
    this.manager.hitMeshes.push(mesh)
  }

  updateHealthBar() {
    const { ctx, texture, material } = this.healthBar
    ctx.clearRect(0, 0, 128, 20)
    ctx.fillStyle = 'rgba(2,8,11,0.75)'
    ctx.fillRect(2, 2, 124, 16)
    ctx.strokeStyle = 'rgba(120,232,255,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(2.5, 2.5, 123, 15)
    const hpRatio = Math.max(0, this.hp / this.maxHp)
    const shieldRatio = this.maxShield ? Math.max(0, this.shield / this.maxShield) : 0
    if (this.maxShield) {
      ctx.fillStyle = 'rgba(99,213,255,0.9)'
      ctx.fillRect(5, 5, 118 * shieldRatio, 4)
      ctx.fillStyle = 'rgba(255,92,74,0.95)'
      ctx.fillRect(5, 11, 118 * hpRatio, 4)
    } else {
      ctx.fillStyle = 'rgba(255,92,74,0.95)'
      ctx.fillRect(5, 6, 118 * hpRatio, 8)
    }
    texture.needsUpdate = true
    const damaged = this.hp < this.maxHp || (this.maxShield && this.shield < this.maxShield)
    material.opacity = damaged || this.type === 'chief' ? 1 : 0
    material.visible = material.opacity > 0
  }

  getEyePosition(target = new THREE.Vector3()) {
    return target.set(this.model.position.x, this.model.position.y + this.def.height * 0.72, this.model.position.z)
  }

  getChest(target = new THREE.Vector3()) {
    return target.set(this.model.position.x, this.model.position.y + this.def.height * 0.55, this.model.position.z)
  }

  damage(amount, part, point, direction) {
    if (this.dead) return { killed: false, shielded: false, headshot: false }
    const headshot = part === 'head'
    const multiplier = headshot ? 2.35 : part === 'limb' ? 0.72 : 1
    let dmg = amount * multiplier
    let shielded = false
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg)
      this.shield -= absorbed
      dmg -= absorbed
      shielded = true
      this.shieldTimer = 0
      this.shieldRegen = 4
      if (this.shieldMat) {
        this.shieldMesh.visible = true
        this.shieldMat.opacity = 0.55
      }
      if (this.shield <= 0) {
        this.manager.effects.shieldHit(point)
        this.manager.audio.shieldHit()
      }
    }
    if (dmg > 0) {
      this.hp -= dmg
      this.damageTimer = 0
      this.flash = 0.1
      for (const m of this.flashMats) {
        m.emissive.setHex(0xffffff)
        m.emissiveIntensity = 1.1
      }
    }
    this.updateHealthBar()
    if (this.hp <= 0) {
      this.die(headshot, direction)
      return { killed: true, shielded, headshot }
    }
    return { killed: false, shielded, headshot }
  }

  die(headshot, direction) {
    if (this.dead) return
    this.dead = true
    const point = this.getChest()
    this.manager.effects.deathBurst(point, this.def.deathColor, this.type === 'chief' ? 42 : 20)
    if (this.shield > 0) this.manager.effects.shieldHit(point)
    this.manager.removeEnemy(this)
    this.manager.onKill?.(this, { headshot })
    this.manager.audio.kill()
    const knock = direction ? direction.clone().setY(0.4).normalize() : new THREE.Vector3(0, 1, 0)
    this.model.position.addScaledVector(knock, 0.4)
  }

  shootAt(targetPos) {
    const tip = new THREE.Vector3()
    if (this.gun?.userData.tip) this.gun.userData.tip.getWorldPosition(tip)
    else tip.copy(this.model.position).add(new THREE.Vector3(0, this.def.height * 0.7, 0))
    const target = targetPos.clone()
    target.y = this.model.position.y + 1.15
    const dir = target.sub(tip).normalize()
    dir.x += (Math.random() - 0.5) * 0.045
    dir.y += (Math.random() - 0.5) * 0.03
    dir.z += (Math.random() - 0.5) * 0.045
    dir.normalize()
    this.manager.spawnProjectile(tip, dir, this)
    this.gunRecoil = 1
    this.manager.effects.muzzleDust(tip, this.def.color)
    if (this.gun?.userData.glow) this.gun.userData.glow.material.opacity = 1
  }

  update(dt, time, playerPos, playerEye) {
    if (this.dead) return
    this.age += dt
    this.attackCooldown -= dt
    this.damageTimer += dt
    this.flash = Math.max(0, this.flash - dt)
    this.gunRecoil = Math.max(0, this.gunRecoil - dt * 9)

    if (this.flash <= 0) {
      for (const m of this.flashMats) {
        m.emissiveIntensity = Math.max(0, m.emissiveIntensity - dt * 12)
        if (m.emissiveIntensity <= 0) m.emissive.setHex(0x000000)
      }
    }
    if (this.shieldMat) {
      if (this.shieldMat.opacity > 0) {
        this.shieldMat.opacity = Math.max(0, this.shieldMat.opacity - dt * 2.6)
        if (this.shieldMat.opacity <= 0) this.shieldMesh.visible = false
      }
      if (this.maxShield > 0 && this.shield < this.maxShield && this.damageTimer > 3.4) {
        this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.22 * dt)
        this.updateHealthBar()
      }
    }

    if (this.materialize > 0) {
      this.materialize -= dt
      const t = Math.max(0, Math.min(1, 1 - this.materialize / 0.7))
      const ease = 1 - Math.pow(1 - t, 3)
      this.model.scale.setScalar(0.05 + ease * 0.95)
      this.healthBar.sprite.material.opacity = 0
      this.model.position.y = this.basePosition.y + Math.sin(t * Math.PI) * 0.5
      return
    }
    this.model.scale.setScalar(this.type === 'chief' ? 1.15 : this.type === 'brute' ? 1.08 : 1)

    const dx = playerPos.x - this.model.position.x
    const dz = playerPos.z - this.model.position.z
    const dist = Math.hypot(dx, dz)
    const targetAngle = Math.atan2(dx, dz)
    this.model.rotation.y = dampAngle(this.model.rotation.y, targetAngle, 7, dt)

    let moveX = 0
    let moveZ = 0
    if (dist > this.def.preferred) {
      moveX += (dx / dist) * this.speed
      moveZ += (dz / dist) * this.speed
    } else if (dist < this.def.preferred * 0.62) {
      moveX -= (dx / dist) * this.speed * 0.65
      moveZ -= (dz / dist) * this.speed * 0.65
    }
    this.strafePhase += dt * (1.5 + this.def.speed * 0.16)
    const strafeStrength = dist < this.def.preferred * 1.2 ? this.speed * 0.42 : this.speed * 0.16
    moveX += (-dz / (dist || 1)) * Math.sin(this.strafePhase) * strafeStrength * this.strafeDir
    moveZ += (dx / (dist || 1)) * Math.sin(this.strafePhase) * strafeStrength * this.strafeDir

    for (const other of this.manager.enemies) {
      if (other === this || other.dead) continue
      const ox = this.model.position.x - other.model.position.x
      const oz = this.model.position.z - other.model.position.z
      const od = Math.hypot(ox, oz)
      if (od > 0.001 && od < 1.5) {
        const push = (1.5 - od) * 2.2
        moveX += (ox / od) * push
        moveZ += (oz / od) * push
      }
    }

    const nx = this.model.position.x + moveX * dt
    const nz = this.model.position.z + moveZ * dt
    const rr = Math.hypot(nx, nz)
    if (rr < 96) {
      this.model.position.x = nx
      this.model.position.z = nz
    }
    const ground = groundHeight(this.model.position.x, this.model.position.z)
    this.model.position.y = damp(this.model.position.y, ground, 16, dt)

    this.walkPhase += dt * (4.2 + Math.hypot(moveX, moveZ) * 0.45)
    const walk = Math.min(1, Math.hypot(moveX, moveZ) / this.speed)
    const swing = Math.sin(this.walkPhase) * 0.55 * walk
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = swing * (i === 0 ? 1 : -1)
    }
    for (let i = 0; i < this.arms.length; i++) {
      if (i === 1) continue
      this.arms[i].rotation.x = swing * (i === 0 ? -0.5 : 0.5)
    }
    if (this.bodyRoot) this.bodyRoot.rotation.z = Math.sin(this.walkPhase) * 0.035 * walk
    if (this.gun) {
      this.gun.position.z = (this.gun.userData.baseZ ?? this.gun.position.z) - this.gunRecoil * 0.06
      if (this.gun.userData.glow) this.gun.userData.glow.material.opacity = 0.4 + this.gunRecoil * 0.6
    }

    if (dist < 34 && dist > 3.4) {
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.def.cooldown * (0.8 + Math.random() * 0.45)
        this.burstLeft = this.type === 'grunt' ? 1 : this.type === 'brute' ? 2 : 3
        this.burstTimer = 0
      }
      if (this.burstLeft > 0) {
        this.burstTimer -= dt
        if (this.burstTimer <= 0) {
          this.shootAt(playerEye)
          this.burstLeft--
          this.burstTimer = 0.13
          this.manager.audio.enemyShoot()
        }
      }
    }

    if (dist < 2.6 && this.damageTimer > 1.1) {
      this.damageTimer = 0
      this.manager.onMeleePlayer?.(this.def.damage * 1.5, this.model.position)
      this.arms.forEach((a) => { a.rotation.x = -1.2 })
    }

    this.healthBar.sprite.material.rotation = 0
  }
}

export class EnemyManager {
  constructor(scene, effects, audio) {
    this.scene = scene
    this.effects = effects
    this.audio = audio
    this.enemies = []
    this.projectiles = []
    this.hitMeshes = []
    this.spawnQueue = []
    this.spawnTimer = 0
    this.wave = 0
    this.state = 'idle'
    this.onKill = null
    this.onMeleePlayer = null
    this.damagePlayer = null
    this.onWaveCleared = null
    this.waveDelay = 0
  }

  reset() {
    for (const enemy of [...this.enemies]) this.removeEnemy(enemy, false)
    for (const p of this.projectiles) this.scene.remove(p.group)
    this.projectiles.length = 0
    this.hitMeshes.length = 0
    this.spawnQueue.length = 0
    this.enemies.length = 0
    this.state = 'idle'
    this.wave = 0
    this.waveDelay = 0
  }

  startWave(wave, spawnPoints) {
    this.wave = wave
    this.state = 'spawning'
    this.spawnQueue.length = 0
    this.spawnTimer = 0
    const count = Math.min(22, 3 + wave * 2)
    const points = [...spawnPoints].sort(() => Math.random() - 0.5)
    for (let i = 0; i < count; i++) {
      let type = 'grunt'
      if (wave >= 3 && i % 5 === 2) type = 'brute'
      else if (wave >= 2 && i % 4 === 1) type = 'elite'
      else if (wave === 1 && i === 1) type = 'elite'
      if (wave % 5 === 0 && i === 0) type = 'chief'
      let pos
      if (wave === 1) {
        if (i === 0) pos = new THREE.Vector3(-3.4, 0, -3.6)
        else if (i === 1) pos = new THREE.Vector3(0, 0, -23)
        else {
          const slot = (i % 2 === 1 ? -1 : 1) * (0.34 + Math.floor(i / 2) * 0.16)
          const a = slot + (Math.random() - 0.5) * 0.06
          const radius = 21 + Math.random() * 6
          pos = new THREE.Vector3(Math.sin(a) * radius, 0, -Math.cos(a) * radius)
        }
      } else {
        const base = points[i % points.length]
        const angle = Math.random() * Math.PI * 2
        const radius = 0.8 + Math.random() * 3.5
        pos = new THREE.Vector3(base.x + Math.cos(angle) * radius, 0, base.z + Math.sin(angle) * radius)
      }
      pos.y = groundHeight(pos.x, pos.z)
      this.spawnQueue.push({ type, pos, delay: i < 2 ? 0 : 0.22 + (i - 2) * 0.46, instant: wave === 1 && i < 2 })
    }
    this.spawnTimer = 0
    return count
  }

  spawnProjectile(origin, direction, owner) {
    const color = owner.def.color
    const group = new THREE.Group()
    group.position.copy(origin)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
    group.add(core)
    const outer = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    group.add(outer)
    const halo = glow(color, 0.85, 0.75)
    group.add(halo)
    const trail = glow(color, 0.35, 0.4)
    trail.position.copy(direction).multiplyScalar(-0.18)
    group.add(trail)
    this.scene.add(group)
    this.projectiles.push({
      group,
      velocity: direction.clone().multiplyScalar(owner.def.projectileSpeed),
      life: 4.2,
      damage: owner.def.damage,
      color
    })
  }

  removeEnemy(enemy, clearHit = true) {
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
    if (clearHit) {
      for (const mesh of enemy.hitMeshes) {
        const i = this.hitMeshes.indexOf(mesh)
        if (i >= 0) this.hitMeshes.splice(i, 1)
      }
    }
    this.scene.remove(enemy.model)
    enemy.model.traverse((child) => {
      if (child.geometry) child.geometry.dispose?.()
      if (child.material && child.material.dispose) child.material.dispose()
    })
  }

  aliveCount() {
    return this.enemies.length
  }

  remainingCount() {
    return this.enemies.length + this.spawnQueue.length
  }

  update(dt, time, playerPos, playerEye) {
    if (this.state === 'spawning' || this.state === 'fighting') {
      this.spawnTimer += dt
      while (this.spawnQueue.length && this.spawnQueue[0].delay <= this.spawnTimer) {
        const item = this.spawnQueue.shift()
        const enemy = new Enemy(this, item.type, item.pos)
        if (item.instant) enemy.materialize = 0
        this.enemies.push(enemy)
        if (!item.instant) this.effects.spawnPortal(item.pos, item.type === 'chief' ? 0xffd36e : item.type === 'elite' ? 0x8f7dff : 0x6fdcff)
      }
      if (this.spawnQueue.length === 0) this.state = 'fighting'
      if (this.state === 'fighting' && this.enemies.length === 0) {
        this.state = 'cleared'
        this.onWaveCleared?.(this.wave)
      }
    }

    for (const enemy of [...this.enemies]) {
      enemy.update(dt, time, playerPos, playerEye)
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      p.life -= dt
      p.group.position.addScaledVector(p.velocity, dt)
      p.group.rotation.z += dt * 6
      const dx = p.group.position.x - playerEye.x
      const dy = p.group.position.y - playerEye.y
      const dz = p.group.position.z - playerEye.z
      if (dx * dx + dy * dy + dz * dz < 0.62 * 0.62) {
        this.effects.impact(playerEye.clone().add(new THREE.Vector3(0, -0.15, 0)), new THREE.Vector3(0, 1, 0), p.color, 7, false)
        this.damagePlayer?.(p.damage, p.group.position)
        this.audio.plasmaImpact()
        this.scene.remove(p.group)
        this.projectiles.splice(i, 1)
        continue
      }
      const ground = groundHeight(p.group.position.x, p.group.position.z)
      if (p.group.position.y <= ground + 0.08) {
        this.effects.impact(p.group.position.clone().setY(ground + 0.05), new THREE.Vector3(0, 1, 0), p.color, 6, false)
        this.scene.remove(p.group)
        this.projectiles.splice(i, 1)
        continue
      }
      if (p.life <= 0) {
        this.scene.remove(p.group)
        this.projectiles.splice(i, 1)
      }
    }
  }

  damageArea(point, radius, damage) {
    const results = []
    for (const enemy of [...this.enemies]) {
      if (enemy.dead) continue
      const dx = enemy.model.position.x - point.x
      const dy = (enemy.model.position.y + enemy.def.height * 0.5) - point.y
      const dz = enemy.model.position.z - point.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > radius) continue
      const falloff = Math.pow(1 - dist / radius, 1.35)
      const result = enemy.damage(damage * falloff, 'body', enemy.getChest(), new THREE.Vector3(dx, 0, dz).normalize())
      results.push({ enemy, ...result })
    }
    return results
  }

  nearestDistance(point) {
    let best = Infinity
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.materialize > 0) continue
      const d = enemy.model.position.distanceTo(point)
      if (d < best) best = d
    }
    return best
  }
}
