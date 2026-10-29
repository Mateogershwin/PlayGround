export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      menu: document.getElementById('menu'),
      death: document.getElementById('death-screen'),
      clickHint: document.getElementById('click-hint'),
      shieldFill: document.getElementById('shield-fill'),
      healthFill: document.getElementById('health-fill'),
      shieldPct: document.getElementById('shield-pct'),
      shieldShell: document.getElementById('shield-shell'),
      ammo: document.getElementById('ammo'),
      reserve: document.getElementById('reserve'),
      grenades: document.getElementById('grenade-pips'),
      weaponName: document.getElementById('weapon-name'),
      wave: document.getElementById('wave-text'),
      hostiles: document.getElementById('hostile-text'),
      score: document.getElementById('score'),
      kills: document.getElementById('kill-count'),
      accuracy: document.getElementById('accuracy'),
      killfeed: document.getElementById('killfeed'),
      radar: document.getElementById('radar'),
      crosshair: document.getElementById('crosshair'),
      hitmarker: document.getElementById('hitmarker'),
      reload: document.getElementById('reload-indicator'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      bannerEyebrow: document.getElementById('banner-eyebrow'),
      damageFlash: document.getElementById('damage-flash'),
      shieldFlash: document.getElementById('shield-flash'),
      prompt: document.getElementById('prompt'),
      deathWave: document.getElementById('death-wave'),
      deathKills: document.getElementById('death-kills'),
      deathScore: document.getElementById('death-score'),
      deathAccuracy: document.getElementById('death-accuracy')
    }
    this.radarCtx = this.el.radar.getContext('2d')
    this.bannerTimer = 0
    this.hitTimer = 0
    this.damageTimer = 0
    this.shieldTimer = 0
    this.feedItems = []
    this.lastGrenades = -1
    this.lastAmmo = -1
    this.lastReserve = -1
    this.lastReloading = null
    this.currentPrompt = ''
    this.time = 0
    this.pulse = 0
    this.deathVisible = false
  }

  showGame() {
    this.el.menu.classList.add('fade-out')
    setTimeout(() => this.el.menu.classList.add('hidden'), 340)
    this.el.hud.classList.remove('hidden')
    this.el.death.classList.add('hidden')
    this.deathVisible = false
  }

  setVitals(shield, maxShield, health, maxHealth) {
    const s = Math.max(0, shield / maxShield)
    const h = Math.max(0, health / maxHealth)
    this.el.shieldFill.style.transform = `scaleX(${s})`
    this.el.healthFill.style.transform = `scaleX(${h})`
    this.el.shieldPct.textContent = `${Math.round(s * 100)}%`
    this.el.shieldPct.style.color = s < 0.3 ? '#ff8a76' : ''
    this.el.shieldShell.style.opacity = s <= 0 ? '0.55' : '1'
  }

  setAmmo(ammo, reserve, grenades, reloading) {
    if (ammo !== this.lastAmmo) {
      this.el.ammo.textContent = String(ammo).padStart(2, '0')
      this.el.ammo.classList.toggle('low', ammo > 0 && ammo <= 9)
      this.el.ammo.classList.toggle('empty', ammo === 0)
      this.lastAmmo = ammo
    }
    if (reserve !== this.lastReserve) {
      this.el.reserve.textContent = String(reserve)
      this.lastReserve = reserve
    }
    if (grenades !== this.lastGrenades) {
      this.el.grenades.innerHTML = ''
      for (let i = 0; i < 4; i++) {
        const pip = document.createElement('i')
        pip.className = `pip${i >= grenades ? ' spent' : ''}`
        this.el.grenades.appendChild(pip)
      }
      this.lastGrenades = grenades
    }
    if (reloading !== this.lastReloading) {
      this.el.reload.classList.toggle('show', reloading)
      this.lastReloading = reloading
    }
  }

  setWave(wave, remaining) {
    this.el.wave.textContent = `WAVE ${String(wave).padStart(2, '0')}`
    this.el.hostiles.textContent = `HOSTILES ${remaining}`
  }

  setStats(kills, score, accuracy) {
    this.el.kills.textContent = String(kills)
    this.el.score.textContent = String(score)
    this.el.accuracy.textContent = accuracy === null ? '--' : `${Math.round(accuracy)}%`
  }

  setAds(ads) {
    this.el.crosshair.classList.toggle('ads', ads)
  }

  setSprint(sprinting) {
    this.el.crosshair.classList.toggle('sprint', sprinting)
  }

  setPrompt(text) {
    if (text === this.currentPrompt) return
    this.currentPrompt = text
    this.el.prompt.textContent = text
    this.el.prompt.classList.toggle('show', Boolean(text))
  }

  setClickHint(visible) {
    this.el.clickHint.classList.toggle('hidden', !visible)
  }

  hitmarker(kind = 'hit') {
    const el = this.el.hitmarker
    el.classList.remove('show', 'kill', 'headshot')
    void el.offsetWidth
    if (kind === 'kill') el.classList.add('kill')
    if (kind === 'headshot') el.classList.add('headshot')
    el.classList.add('show')
    clearTimeout(this.hitTimer)
    this.hitTimer = setTimeout(() => el.classList.remove('show', 'kill', 'headshot'), 200)
  }

  flashDamage(kind = 'health') {
    if (kind === 'shield') {
      this.el.shieldFlash.style.opacity = '1'
      clearTimeout(this.shieldTimer)
      this.shieldTimer = setTimeout(() => { this.el.shieldFlash.style.opacity = '0' }, 120)
    }
    this.el.damageFlash.style.opacity = kind === 'shield' ? '0.5' : '1'
    clearTimeout(this.damageTimer)
    this.damageTimer = setTimeout(() => { this.el.damageFlash.style.opacity = '0' }, kind === 'shield' ? 180 : 260)
  }

  feed(label, headshot = false) {
    const item = document.createElement('div')
    item.className = `feed-item${headshot ? ' headshot' : ''}`
    item.innerHTML = `<span class="feed-icon">&#10005;</span>${label} <b>${headshot ? 'HEADSHOT' : 'ELIMINATED'}</b>`
    this.el.killfeed.prepend(item)
    this.feedItems.push(item)
    while (this.feedItems.length > 4) {
      const old = this.feedItems.shift()
      old.remove()
    }
    setTimeout(() => {
      item.style.transition = 'opacity 300ms'
      item.style.opacity = '0'
      setTimeout(() => item.remove(), 320)
    }, 4200)
  }

  showBanner(title, sub, eyebrow = 'ZETA HALO // COMBAT ZONE', duration = 2800) {
    this.el.bannerTitle.textContent = title
    this.el.bannerSub.textContent = sub
    this.el.bannerEyebrow.textContent = eyebrow
    this.el.banner.classList.remove('hidden')
    void this.el.banner.offsetWidth
    this.el.banner.classList.add('show')
    clearTimeout(this.bannerTimer)
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), duration)
  }

  hideBanner() {
    this.el.banner.classList.remove('show')
  }

  showDeath(stats) {
    this.deathVisible = true
    this.el.deathWave.textContent = String(stats.wave)
    this.el.deathKills.textContent = String(stats.kills)
    this.el.deathScore.textContent = String(stats.score)
    this.el.deathAccuracy.textContent = `${Math.round(stats.accuracy || 0)}%`
    this.el.death.classList.remove('hidden')
    this.el.clickHint.classList.add('hidden')
    this.el.reload.classList.remove('show')
    this.el.banner.classList.remove('show')
  }

  hideDeath() {
    this.deathVisible = false
    this.el.death.classList.add('hidden')
  }

  update(dt) {
    this.time += dt
    this.pulse += dt
  }

  drawRadar(player, enemies, spawnPoints = []) {
    const ctx = this.radarCtx
    const size = 220
    const c = size / 2
    const range = 42
    const scale = (size * 0.46) / range
    ctx.clearRect(0, 0, size, size)

    ctx.save()
    ctx.beginPath()
    ctx.arc(c, c, size * 0.465, 0, Math.PI * 2)
    ctx.clip()

    const bg = ctx.createRadialGradient(c, c, 8, c, c, size * 0.47)
    bg.addColorStop(0, 'rgba(16,71,82,0.36)')
    bg.addColorStop(0.7, 'rgba(5,24,31,0.32)')
    bg.addColorStop(1, 'rgba(2,9,13,0.12)')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)

    ctx.strokeStyle = 'rgba(120,232,255,0.16)'
    ctx.lineWidth = 1
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath()
      ctx.arc(c, c, (size * 0.46 * r) / 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(c, 8)
    ctx.lineTo(c, size - 8)
    ctx.moveTo(8, c)
    ctx.lineTo(size - 8, c)
    ctx.stroke()

    const sweep = (this.time * 0.9) % (Math.PI * 2)
    const grad = ctx.createRadialGradient(c, c, 0, c, c, size * 0.46)
    grad.addColorStop(0, 'rgba(120,232,255,0)')
    grad.addColorStop(1, 'rgba(120,232,255,0.13)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.arc(c, c, size * 0.46, sweep - 0.5, sweep)
    ctx.closePath()
    ctx.fill()

    const yaw = player.yaw
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const rx = Math.cos(yaw)
    const rz = -Math.sin(yaw)

    for (const enemy of enemies) {
      if (enemy.dead) continue
      const dx = enemy.model.position.x - player.pos.x
      const dz = enemy.model.position.z - player.pos.z
      const localX = dx * rx + dz * rz
      const localZ = dx * fx + dz * fz
      const dist = Math.hypot(localX, localZ)
      if (dist > range) continue
      const x = c + localX * scale
      const y = c - localZ * scale
      const boss = enemy.type === 'chief'
      const r = boss ? 5.5 : 3.4
      ctx.beginPath()
      ctx.arc(x, y, r + 3, 0, Math.PI * 2)
      ctx.fillStyle = boss ? 'rgba(255,211,110,0.16)' : 'rgba(255,90,75,0.14)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = boss ? '#ffd36e' : enemy.type === 'elite' ? '#ff876d' : '#ff5a4b'
      ctx.fill()
      if (enemy.maxShield && enemy.shield > 0) {
        ctx.beginPath()
        ctx.arc(x, y, r + 2.6, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(112,226,255,0.85)'
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }

    for (const p of spawnPoints) {
      const dx = p.x - player.pos.x
      const dz = p.z - player.pos.z
      const localX = dx * rx + dz * rz
      const localZ = dx * fx + dz * fz
      if (Math.hypot(localX, localZ) > range) continue
      ctx.fillStyle = 'rgba(120,232,255,0.28)'
      ctx.fillRect(c + localX * scale - 1, c - localZ * scale - 1, 2.5, 2.5)
    }

    ctx.save()
    ctx.translate(c, c)
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(7, 7)
    ctx.lineTo(0, 4)
    ctx.lineTo(-7, 7)
    ctx.closePath()
    ctx.fillStyle = '#d9fbff'
    ctx.shadowColor = '#78e8ff'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.restore()

    ctx.restore()

    ctx.beginPath()
    ctx.arc(c, c, size * 0.465, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(120,232,255,0.3)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}
