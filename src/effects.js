import * as THREE from 'three'
import { makeGlowTexture } from './textures.js'

const GLOW = makeGlowTexture()
const UP = new THREE.Vector3(0, 1, 0)

function glow(color, size, opacity = 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: GLOW,
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

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose?.()
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.())
      else child.material.dispose?.()
    }
  })
}

export class Effects {
  constructor(scene) {
    this.scene = scene
    this.items = []
    this.sparkGeo = new THREE.OctahedronGeometry(0.055, 0)
    this.debrisGeo = new THREE.IcosahedronGeometry(0.11, 0)
    this.shockGeo = new THREE.RingGeometry(1, 1.08, 56)
    this.portalGeo = new THREE.TorusGeometry(1.3, 0.08, 8, 48)
  }

  add(object, life, update, dispose = true) {
    this.scene.add(object)
    this.items.push({ object, age: 0, life, update, dispose })
  }

  tracer(from, to, color = 0xffdf9a, radius = 0.014, life = 0.055) {
    const dir = new THREE.Vector3().subVectors(to, from)
    const len = dir.length()
    if (len < 0.01) return
    const geo = new THREE.CylinderGeometry(radius, radius * 0.7, len, 5, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
    const beam = new THREE.Mesh(geo, mat)
    beam.position.copy(from).addScaledVector(dir, 0.5)
    beam.quaternion.setFromUnitVectors(UP, dir.clone().normalize())
    const group = new THREE.Group()
    group.add(beam)
    const glowSprite = glow(color, 0.5, 0.45)
    glowSprite.position.copy(from)
    group.add(glowSprite)
    this.add(group, life, (age) => {
      const t = age / life
      mat.opacity = (1 - t) * 0.95
      glowSprite.material.opacity = (1 - t) * 0.4
    })
  }

  impact(point, normal = UP, color = 0xffc76e, count = 8, metal = true) {
    const group = new THREE.Group()
    group.position.copy(point)
    const sparkMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const particles = []
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, sparkMat)
      const dir = normal.clone().multiplyScalar(0.7).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(1.6)).normalize()
      mesh.userData.velocity = dir.multiplyScalar(2 + Math.random() * 5)
      mesh.position.copy(normal).multiplyScalar(0.05)
      particles.push(mesh)
      group.add(mesh)
    }
    const flash = glow(color, 0.9 + Math.random() * 0.5, 0.85)
    group.add(flash)
    const puff = glow(metal ? 0x9fc8d2 : 0xb59a76, 1.2, 0.24)
    puff.material.blending = THREE.NormalBlending
    group.add(puff)
    this.add(group, 0.5, (age) => {
      const t = age / 0.5
      for (const p of particles) {
        p.userData.velocity.y -= 7 * 0.016
        p.position.addScaledVector(p.userData.velocity, 0.016)
        p.scale.setScalar(1 - t * 0.8)
      }
      sparkMat.opacity = 1 - t
      flash.material.opacity = (1 - t) * 0.8
      puff.material.opacity = (1 - t) * 0.2
      puff.scale.setScalar(1.2 + t * 2)
    })
  }

  shieldHit(point) {
    const group = new THREE.Group()
    group.position.copy(point)
    const flash = glow(0x7eeaff, 1.8, 1)
    group.add(flash)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9af2ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.48, 24), ringMat)
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    this.add(group, 0.34, (age) => {
      const t = age / 0.34
      flash.material.opacity = 1 - t
      ring.scale.setScalar(1 + t * 2.4)
      ringMat.opacity = (1 - t) * 0.9
    })
  }

  deathBurst(point, color = 0x7bdcff, count = 18) {
    const group = new THREE.Group()
    group.position.copy(point)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const parts = []
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.debrisGeo, mat)
      mesh.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(4.5)
      parts.push(mesh)
      group.add(mesh)
    }
    const flash = glow(color, 2.4, 0.95)
    group.add(flash)
    this.add(group, 0.75, (age) => {
      const t = age / 0.75
      for (const p of parts) {
        p.userData.velocity.y -= 1.2
        p.position.addScaledVector(p.userData.velocity, 0.016)
        p.rotation.x += 0.15
        p.rotation.y += 0.12
        p.scale.setScalar(1 - t)
      }
      mat.opacity = 1 - t
      flash.material.opacity = (1 - t) * 0.9
      flash.scale.setScalar(2.4 + t * 3)
    })
  }

  explosion(point, radius = 6, big = true) {
    const group = new THREE.Group()
    group.position.copy(point)
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff3cb, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), fireMat)
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), coreMat)
    group.add(fire, core)

    const flash = glow(0xffb35c, radius * 2.3, 1)
    group.add(flash)
    const smokeMat = new THREE.SpriteMaterial({ map: GLOW, color: 0x292422, transparent: true, opacity: 0.55, depthWrite: false })
    const smoke = []
    for (let i = 0; i < 7; i++) {
      const sprite = new THREE.Sprite(smokeMat.clone())
      sprite.position.set((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5)
      sprite.scale.setScalar(2 + Math.random() * 2)
      smoke.push(sprite)
      group.add(sprite)
    }

    const debrisMat = new THREE.MeshBasicMaterial({ color: 0x2c2622, transparent: true, opacity: 0.95 })
    const debris = []
    const debrisGeo = new THREE.TetrahedronGeometry(0.16, 0)
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(debrisGeo, debrisMat)
      mesh.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).multiplyScalar(radius * 0.9)
      debris.push(mesh)
      group.add(mesh)
    }

    const shockMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const shock = new THREE.Mesh(this.shockGeo, shockMat)
    shock.rotation.x = -Math.PI / 2
    shock.position.y = 0.08
    group.add(shock)

    const light = new THREE.PointLight(0xff9d4d, big ? 90 : 40, radius * 4.2, 2)
    light.position.y = 1
    group.add(light)

    this.add(group, 1.35, (age) => {
      const t = age / 1.35
      const burst = Math.min(1, t * 6)
      fire.scale.setScalar(0.4 + burst * radius * 0.42)
      core.scale.setScalar(0.2 + burst * radius * 0.22)
      fireMat.opacity = Math.max(0, 0.95 - t * 1.8)
      coreMat.opacity = Math.max(0, 1 - t * 2.6)
      flash.material.opacity = Math.max(0, 1 - t * 2.2)
      flash.scale.setScalar(radius * 2.3 + t * radius * 1.6)
      for (const s of smoke) {
        s.position.y += 0.012
        s.material.opacity = Math.max(0, 0.55 - t * 0.8)
        s.scale.setScalar(2 + t * 5)
      }
      for (const d of debris) {
        d.userData.velocity.y -= 0.09
        d.position.addScaledVector(d.userData.velocity, 0.016)
        d.rotation.x += 0.13
        d.rotation.z += 0.09
      }
      debrisMat.opacity = Math.max(0, 1 - t * 1.4)
      const st = Math.min(1, t * 2.2)
      shock.scale.setScalar(0.4 + st * radius * 0.62)
      shockMat.opacity = Math.max(0, (1 - st) * 0.9)
      light.intensity = Math.max(0, (big ? 90 : 40) * (1 - t * 2.4))
    })
  }

  spawnPortal(point, color = 0x6fdcff) {
    const group = new THREE.Group()
    group.position.copy(point)
    group.position.y += 1.1
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const ring = new THREE.Mesh(this.portalGeo, mat)
    group.add(ring)
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.045, 6, 40), mat)
    inner.rotation.z = Math.PI / 2
    group.add(inner)
    const columnMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.05, 5.5, 16, 1, true), columnMat)
    column.position.y = 1.3
    group.add(column)
    const flash = glow(color, 4.5, 0.75)
    group.add(flash)
    this.add(group, 1.0, (age) => {
      const t = age / 1.0
      ring.rotation.z = t * 5
      ring.scale.setScalar(0.35 + Math.min(1, t * 3.2) * 0.8)
      inner.rotation.z = -t * 7
      inner.scale.setScalar(0.35 + Math.min(1, t * 2.6) * 0.7)
      mat.opacity = t < 0.6 ? 0.9 : (1 - (t - 0.6) / 0.4) * 0.9
      column.material.opacity = Math.max(0, 0.16 * (1 - t))
      column.scale.x = column.scale.z = 0.7 + t * 0.6
      flash.material.opacity = Math.max(0, 0.75 * (1 - t * 1.4))
    })
  }

  muzzleDust(point, color = 0xffd48e) {
    const group = new THREE.Group()
    group.position.copy(point)
    const flash = glow(color, 0.8, 0.62)
    group.add(flash)
    this.add(group, 0.18, (age) => {
      const t = age / 0.18
      flash.material.opacity = (1 - t) * 0.62
      flash.scale.setScalar(0.8 + t * 1.2)
    })
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      item.age += dt
      if (item.update) item.update(item.age, dt)
      if (item.age >= item.life) {
        this.scene.remove(item.object)
        if (item.dispose) disposeObject(item.object)
        this.items.splice(i, 1)
      }
    }
  }
}
