import { gameEvents, getMachFromSpeed } from './events';

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public muted = false;

  constructor() {
    this.bindGameEvents();
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.42;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private bindGameEvents(): void {
    gameEvents.on('parry', (e) => {
      this.playParryImpact(e.mach, e.batId, e.isEmpowered);
    });
    gameEvents.on('bunt', () => {
      this.playBuntLob();
    });
    gameEvents.on('clash', (e) => {
      this.playClashExplosion(e.mach);
    });
    gameEvents.on('whiff', () => {
      this.playAirWhoosh();
    });
    gameEvents.on('dash', () => {
      this.playDashZip();
    });
    gameEvents.on('jump', (e) => {
      this.playJumpPulse(e.isDoubleJump);
    });
    gameEvents.on('elimination', () => {
      this.playEliminationBuzzer();
    });
    gameEvents.on('wall_hit', (e) => {
      this.playWallPing(getMachFromSpeed(e.speed));
    });
    gameEvents.on('ability_cast', (e) => {
      this.playAbilitySound(e.characterId);
    });
  }

  public playParryImpact(mach: number, batId: string, isEmpowered: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const pitchScale = Math.min(2.6, 1 + mach * 0.16);

    // 1. Metallic Clang / Ping Layer (Bat-specific timbre)
    const clangOsc = ctx.createOscillator();
    const clangGain = ctx.createGain();
    let baseFreq = 520 * pitchScale;

    if (batId === 'solar_bat') {
      // Classic metallic slugger ping signature
      clangOsc.type = 'sine';
      baseFreq = 980 * Math.min(1.8, 1 + mach * 0.09);
    } else if (batId === 'gravity_hammer') {
      clangOsc.type = 'sawtooth';
      baseFreq = 260 * pitchScale;
    } else if (batId === 'void_scythe') {
      clangOsc.type = 'triangle';
      baseFreq = 440 * pitchScale;
    } else {
      // Neon Katana
      clangOsc.type = 'triangle';
      baseFreq = 640 * pitchScale;
    }

    clangOsc.frequency.setValueAtTime(baseFreq, now);
    clangOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.045);
    clangOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, now + 0.28);

    const clangDuration = batId === 'solar_bat' ? 0.42 : 0.26;
    clangGain.gain.setValueAtTime(0.38, now);
    clangGain.gain.exponentialRampToValueAtTime(0.001, now + clangDuration);

    clangOsc.connect(clangGain);
    clangGain.connect(this.masterGain);
    clangOsc.start(now);
    clangOsc.stop(now + clangDuration);

    // Harmonic overtone for metallic ring
    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(baseFreq * 2.41, now);
    overtoneGain.gain.setValueAtTime(batId === 'solar_bat' ? 0.28 : 0.15, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + clangDuration * 0.85);
    overtone.connect(overtoneGain);
    overtoneGain.connect(this.masterGain);
    overtone.start(now);
    overtone.stop(now + clangDuration * 0.85);

    // 2. Anime Sub-Drop & Thunderclap as speed escalates
    const subIntensity = Math.min(1.0, 0.35 + mach * 0.12 + (isEmpowered ? 0.35 : 0));
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    const startSub = 150 + mach * 12;
    subOsc.frequency.setValueAtTime(startSub, now);
    subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.32);

    subGain.gain.setValueAtTime(subIntensity * 0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.36);

    // 3. Thunderclap white-noise burst at higher speeds
    if (mach >= 1.8 || isEmpowered) {
      this.playNoiseBurst(0.18 + Math.min(0.22, mach * 0.025), 900 + mach * 280, 0.28);
    }
  }

  public playAirWhoosh(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playNoiseBurst(0.14, 650, 0.14);
  }

  public playBuntLob(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(490, now + 0.14);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playDashZip(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1420, now + 0.11);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playJumpPulse(isDoubleJump: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = isDoubleJump ? 340 : 210;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.75, now + 0.09);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playClashExplosion(mach: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Massive dual sub-drop + high metallic shatter
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(240 + mach * 20, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.52);
    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.56);

    this.playNoiseBurst(0.38, 1800, 0.42);
  }

  public playEliminationBuzzer(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(165, now);
    osc1.frequency.linearRampToValueAtTime(75, now + 0.48);
    osc2.frequency.setValueAtTime(171, now);
    osc2.frequency.linearRampToValueAtTime(72, now + 0.48);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.52);
    osc2.stop(now + 0.52);
  }

  public playWallPing(mach: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190 + mach * 28, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.08);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playAbilitySound(characterId: string): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    if (characterId === 'chrono') {
      // Time-freeze bass warp
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.45);
      gain.gain.setValueAtTime(0.36, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (characterId === 'volt') {
      // Overdrive Blink electric crackle
      this.playDashZip();
      this.playNoiseBurst(0.16, 2800, 0.26);
    } else if (characterId === 'titan') {
      // Supernova molten power-up chord
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.32);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (characterId === 'phantom') {
      // Stealth shimmer
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(310, now + 0.25);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (characterId === 'aegis') {
      // Kinetic dome hum
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.28);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  }

  private playNoiseBurst(duration: number, filterFreq: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }
}
