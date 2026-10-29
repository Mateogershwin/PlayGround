import * as THREE from 'three'

function canvasTexture(size, draw, { repeat = 1, srgb = true } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 4
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

export function makeGlowTexture(size = 128, core = 'rgba(255,255,255,1)', edge = 'rgba(255,255,255,0)') {
  return canvasTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, core)
    g.addColorStop(0.22, core)
    g.addColorStop(0.55, 'rgba(255,255,255,0.22)')
    g.addColorStop(1, edge)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  }, { srgb: false })
}

export function makeDetailTexture() {
  const tex = canvasTexture(256, (ctx, s) => {
    const img = ctx.createImageData(s, s)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4
        let v = 118 + hash(x, y) * 44
        v += (hash(x * 0.2, y * 0.2) - 0.5) * 34
        const speck = hash(x * 3.1, y * 2.7)
        if (speck > 0.973) v -= 54
        if (speck < 0.02) v += 38
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = v
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, { repeat: 72, srgb: false })
  return tex
}

export function makeMetalTexture(tint = '#4c5a61') {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, s, s)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const px = (x * s) / 4
        const py = (y * s) / 4
        const shade = 0.86 + hash(x, y) * 0.24
        ctx.fillStyle = `rgba(255,255,255,${(shade - 0.86) * 0.16})`
        ctx.fillRect(px + 2, py + 2, s / 4 - 4, s / 4 - 4)
        ctx.strokeStyle = 'rgba(8,16,20,0.55)'
        ctx.lineWidth = 3
        ctx.strokeRect(px + 1, py + 1, s / 4 - 2, s / 4 - 2)
        ctx.strokeStyle = 'rgba(190,225,235,0.09)'
        ctx.lineWidth = 1
        ctx.strokeRect(px + 5, py + 5, s / 4 - 10, s / 4 - 10)
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = 'rgba(8,15,19,0.6)'
          ctx.beginPath()
          ctx.arc(px + 12 + i * 26, py + 12, 2.1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.fillStyle = 'rgba(10, 22, 27, 0.45)'
    for (let i = 0; i < 26; i++) {
      ctx.fillRect(hash(i, 9) * s, hash(i, 4) * s, hash(i, 2) * 90 + 12, 1.5)
    }
    ctx.fillStyle = 'rgba(255,177,74,0.85)'
    ctx.save()
    ctx.translate(20, s - 44)
    ctx.rotate(-0.08)
    ctx.fillRect(0, 0, 140, 8)
    ctx.restore()
  }, { repeat: 2 })
}

export function makeCrateTexture(base = '#47503b', label = 'UNSC') {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    for (let i = 0; i < 12; i++) ctx.fillRect(0, i * 22, s, 1)
    ctx.strokeStyle = 'rgba(12,18,14,0.8)'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, s - 10, s - 10)
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.lineWidth = 2
    ctx.strokeRect(14, 14, s - 28, s - 28)
    ctx.fillStyle = 'rgba(230,236,218,0.72)'
    ctx.font = '700 30px Oxanium, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, s / 2, s / 2 + 4)
    ctx.font = '600 12px Rajdhani, sans-serif'
    ctx.fillStyle = 'rgba(230,236,218,0.38)'
    ctx.fillText('CLASSIFIED // 07', s / 2, s / 2 + 28)
    ctx.fillStyle = 'rgba(255,177,74,0.7)'
    ctx.fillRect(24, s - 46, 62, 5)
    ctx.fillRect(s - 86, 24, 62, 5)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(9,16,12,0.6)'
      ctx.beginPath()
      ctx.arc(22 + i * 70, 22 + (i % 2) * 210, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

export function makeCloudTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    for (let i = 0; i < 26; i++) {
      const x = s * (0.18 + hash(i, 1) * 0.64)
      const y = s * (0.32 + hash(i, 2) * 0.4)
      const r = s * (0.07 + hash(i, 3) * 0.16)
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,0.5)')
      g.addColorStop(0.6, 'rgba(255,255,255,0.18)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }, { srgb: false })
}

export function makeHazardTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b98a33'
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#171a18'
    for (let i = -s; i < s * 2; i += 56) {
      ctx.save()
      ctx.translate(i, 0)
      ctx.rotate(-0.5)
      ctx.fillRect(0, -s, 24, s * 3)
      ctx.restore()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    for (let i = 0; i < 22; i++) ctx.fillRect(hash(i, 5) * s, hash(i, 7) * s, hash(i, 2) * 60, 2)
  }, { repeat: 2 })
}

export function makeScreenTexture(title = 'TACTICAL', value = '07') {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#041419'
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(120,232,255,0.24)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath()
      ctx.moveTo(0, (i * s) / 8)
      ctx.lineTo(s, (i * s) / 8)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo((i * s) / 8, 0)
      ctx.lineTo((i * s) / 8, s)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(120,232,255,0.9)'
    ctx.font = '700 24px Oxanium, sans-serif'
    ctx.fillText(title, 18, 38)
    ctx.font = '700 72px Oxanium, sans-serif'
    ctx.fillStyle = 'rgba(190,248,255,0.95)'
    ctx.fillText(value, 18, 116)
    ctx.strokeStyle = 'rgba(255,177,74,0.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(196, 176, 44, -0.4, 2.1)
    ctx.stroke()
    ctx.fillStyle = 'rgba(120,232,255,0.25)'
    ctx.fillRect(18, 146, 150, 6)
    ctx.fillStyle = 'rgba(120,232,255,0.7)'
    ctx.fillRect(18, 146, 92, 6)
    ctx.font = '600 11px Rajdhani, sans-serif'
    ctx.fillStyle = 'rgba(150,225,237,0.65)'
    ctx.fillText('UNSC // FIREBASE LIBERALITY', 18, 236)
  })
}
