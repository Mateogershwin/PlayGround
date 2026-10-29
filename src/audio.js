export class AudioEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.noise = null
    this.started = false
    this.lastShot = 0
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.62
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 12
    comp.ratio.value = 5
    comp.attack.value = 0.003
    comp.release.value = 0.25
    this.master.connect(comp).connect(this.ctx.destination)
    this.noise = this.createNoise(2.5)
    this.startAmbient()
  }

  createNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      last = last * 0.86 + white * 0.14
      data[i] = last * 1.9
    }
    return buffer
  }

  startAmbient() {
    if (!this.ctx || this.started) return
    this.started = true
    const t = this.ctx.currentTime

    const wind = this.ctx.createBufferSource()
    wind.buffer = this.noise
    wind.loop = true
    const windFilter = this.ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 420
    windFilter.Q.value = 0.6
    const windGain = this.ctx.createGain()
    windGain.gain.value = 0.035
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = 0.018
    lfo.connect(lfoGain).connect(windGain.gain)
    wind.connect(windFilter).connect(windGain).connect(this.master)
    wind.start(t)
    lfo.start(t)

    const droneGain = this.ctx.createGain()
    droneGain.gain.value = 0.018
    const droneFilter = this.ctx.createBiquadFilter()
    droneFilter.type = 'lowpass'
    droneFilter.frequency.value = 240
    droneFilter.Q.value = 3
    const oscs = [41.2, 61.7, 82.4]
    for (const freq of oscs) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      osc.detune.value = (Math.random() - 0.5) * 8
      const g = this.ctx.createGain()
      g.gain.value = 0.34
      osc.connect(g).connect(droneFilter)
      osc.start(t)
    }
    const drift = this.ctx.createOscillator()
    drift.frequency.value = 0.045
    const driftGain = this.ctx.createGain()
    driftGain.gain.value = 70
    drift.connect(driftGain).connect(droneFilter.frequency)
    drift.start(t)
    droneFilter.connect(droneGain).connect(this.master)

    const air = this.ctx.createBufferSource()
    air.buffer = this.noise
    air.loop = true
    air.playbackRate.value = 0.6
    const airFilter = this.ctx.createBiquadFilter()
    airFilter.type = 'bandpass'
    airFilter.frequency.value = 1250
    airFilter.Q.value = 0.8
    const airGain = this.ctx.createGain()
    airGain.gain.value = 0.012
    air.connect(airFilter).connect(airGain).connect(this.master)
    air.start(t)
  }

  noiseBurst({ duration = 0.15, gain = 0.2, type = 'lowpass', frequency = 1800, q = 0.8, sweep = 0, playbackRate = 1, delay = 0 } = {}) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = playbackRate
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(frequency, t)
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + duration)
    filter.Q.value = q
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(filter).connect(env).connect(this.master)
    src.start(t, Math.random())
    src.stop(t + duration + 0.03)
  }

  tone({ frequency = 440, endFrequency = null, duration = 0.2, gain = 0.1, type = 'sine', delay = 0, attack = 0.005, filter = 0 } = {}) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, t)
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration)
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(gain, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    if (filter) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = filter
      osc.connect(f).connect(env).connect(this.master)
    } else {
      osc.connect(env).connect(this.master)
    }
    osc.start(t)
    osc.stop(t + duration + 0.03)
  }

  shoot() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (now - this.lastShot < 0.055) return
    this.lastShot = now
    this.noiseBurst({ duration: 0.13, gain: 0.22, type: 'bandpass', frequency: 1500, q: 0.7, sweep: 340, playbackRate: 1.4 })
    this.noiseBurst({ duration: 0.07, gain: 0.11, type: 'highpass', frequency: 3200 })
    this.tone({ frequency: 132, endFrequency: 52, duration: 0.14, gain: 0.22, type: 'triangle' })
  }

  enemyShoot() {
    this.tone({ frequency: 1040, endFrequency: 260, duration: 0.17, gain: 0.055, type: 'sawtooth', filter: 1800 })
    this.noiseBurst({ duration: 0.14, gain: 0.045, type: 'bandpass', frequency: 1400, sweep: 500 })
  }

  plasmaImpact() {
    this.tone({ frequency: 820, endFrequency: 240, duration: 0.12, gain: 0.07, type: 'square', filter: 2200 })
  }

  hit() {
    this.noiseBurst({ duration: 0.055, gain: 0.16, type: 'highpass', frequency: 2400 })
    this.tone({ frequency: 210, endFrequency: 130, duration: 0.08, gain: 0.13, type: 'triangle' })
  }

  shieldHit() {
    this.tone({ frequency: 1560, endFrequency: 880, duration: 0.15, gain: 0.09, type: 'triangle' })
    this.noiseBurst({ duration: 0.09, gain: 0.07, type: 'bandpass', frequency: 2200, q: 2 })
  }

  kill() {
    this.tone({ frequency: 740, duration: 0.08, gain: 0.07, type: 'square', filter: 1800 })
    this.tone({ frequency: 1120, duration: 0.14, gain: 0.05, type: 'square', filter: 2200, delay: 0.07 })
  }

  reload() {
    this.noiseBurst({ duration: 0.06, gain: 0.11, type: 'bandpass', frequency: 1800, q: 1.6 })
    this.noiseBurst({ duration: 0.07, gain: 0.1, type: 'bandpass', frequency: 900, q: 1.8, delay: 0.85 })
    this.noiseBurst({ duration: 0.09, gain: 0.12, type: 'bandpass', frequency: 2400, q: 1.4, delay: 1.55 })
    this.tone({ frequency: 320, endFrequency: 200, duration: 0.08, gain: 0.05, type: 'square', delay: 1.6 })
  }

  empty() {
    this.noiseBurst({ duration: 0.035, gain: 0.1, type: 'highpass', frequency: 3000 })
    this.tone({ frequency: 1400, endFrequency: 900, duration: 0.04, gain: 0.04, type: 'square' })
  }

  grenadeThrow() {
    this.noiseBurst({ duration: 0.22, gain: 0.08, type: 'bandpass', frequency: 900, q: 0.6, sweep: 300 })
  }

  explosion(big = true) {
    const dur = big ? 1.1 : 0.6
    this.noiseBurst({ duration: dur, gain: big ? 0.42 : 0.24, type: 'lowpass', frequency: 620, sweep: 90, playbackRate: 0.55 })
    this.tone({ frequency: 78, endFrequency: 34, duration: dur * 0.9, gain: big ? 0.4 : 0.22, type: 'sine' })
    this.noiseBurst({ duration: 0.18, gain: 0.18, type: 'highpass', frequency: 1800 })
  }

  melee() {
    this.noiseBurst({ duration: 0.24, gain: 0.13, type: 'bandpass', frequency: 600, q: 0.8, sweep: 2100 })
    this.tone({ frequency: 160, endFrequency: 60, duration: 0.18, gain: 0.12, type: 'triangle', delay: 0.14 })
  }

  damage() {
    this.noiseBurst({ duration: 0.18, gain: 0.2, type: 'lowpass', frequency: 700, sweep: 200 })
    this.tone({ frequency: 70, endFrequency: 38, duration: 0.3, gain: 0.24, type: 'sine' })
  }

  shieldRecharge() {
    this.tone({ frequency: 420, endFrequency: 980, duration: 0.5, gain: 0.04, type: 'sine', attack: 0.15 })
    this.tone({ frequency: 630, endFrequency: 1470, duration: 0.45, gain: 0.025, type: 'sine', attack: 0.18, delay: 0.08 })
  }

  footstep() {
    this.noiseBurst({ duration: 0.09, gain: 0.035, type: 'lowpass', frequency: 340 + Math.random() * 120, q: 0.7, playbackRate: 0.8 })
  }

  waveStart() {
    this.tone({ frequency: 58, endFrequency: 54, duration: 1.4, gain: 0.12, type: 'sawtooth', filter: 220, attack: 0.3 })
    this.tone({ frequency: 87, endFrequency: 82, duration: 1.2, gain: 0.06, type: 'sawtooth', filter: 260, attack: 0.25, delay: 0.1 })
    this.tone({ frequency: 146, duration: 0.7, gain: 0.05, type: 'triangle', filter: 900, attack: 0.06, delay: 0.5 })
  }

  victory() {
    this.tone({ frequency: 220, duration: 0.25, gain: 0.09, type: 'triangle', filter: 1200 })
    this.tone({ frequency: 330, duration: 0.3, gain: 0.08, type: 'triangle', filter: 1400, delay: 0.16 })
    this.tone({ frequency: 440, duration: 0.5, gain: 0.07, type: 'triangle', filter: 1600, delay: 0.32 })
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.62
    return this.muted
  }
}
