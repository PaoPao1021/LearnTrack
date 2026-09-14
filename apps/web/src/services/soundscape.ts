/**
 * LearnTrack 原生声学心流场 (Generative Web Audio Soundscape)
 * 纯原生 Web Audio API 合成，0 外部依赖，0 网络流量，100% 离线可用。
 */

export type SoundType = 'none' | 'rain' | 'ocean' | 'brown';

class SoundscapeService {
  private ctx: AudioContext | null = null;
  private currentType: SoundType = 'none';
  private masterGain: GainNode | null = null;
  private sourceNodes: (AudioNode | number)[] = [];
  private volume: number = 0.5;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = typeof window !== 'undefined'
        ? window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        : null;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public getSound(): SoundType {
    return this.currentType;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public setSound(type: SoundType) {
    if (this.currentType === type) return;
    this.stopSound();

    if (type === 'none') {
      this.currentType = 'none';
      return;
    }

    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    this.currentType = type;

    if (type === 'brown') {
      this.createBrownNoise();
    } else if (type === 'rain') {
      this.createRainSound();
    } else if (type === 'ocean') {
      this.createOceanTide();
    }
  }

  public stopSound() {
    this.sourceNodes.forEach((node) => {
      if (typeof node === 'number') {
        window.clearInterval(node);
      } else {
        try {
          if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
            (node as AudioScheduledSourceNode).stop();
          }
          node.disconnect();
        } catch {
          // ignore disconnect errors
        }
      }
    });
    this.sourceNodes = [];
    this.currentType = 'none';
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  private sfxEnabled = typeof window !== 'undefined' ? localStorage.getItem('learntrack_sfx_enabled') !== 'false' : true;

  public isSfxEnabled(): boolean {
    return this.sfxEnabled;
  }

  public setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    localStorage.setItem('learntrack_sfx_enabled', String(enabled));
  }

  /** 微弱机械轻触音 (Apple-watch style haptic tick) */
  public playTick() {
    if (!this.sfxEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.02);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch {
      // AudioContext might wait for first interaction
    }
  }

  /** 待办/打卡气泡清脆完成音 (Soft bubble pop) */
  public playPop() {
    if (!this.sfxEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(820, now + 0.05);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {}
  }

  /** 达成全量完成/结项和弦音 (Celebration chime) */
  public playSuccess() {
    if (!this.sfxEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const startTime = now + idx * 0.06;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.035, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    } catch {}
  }


  /** 深空棕色噪波 (Deep Brown Noise) —— 柔和低频环境沉浸音 */
  private createBrownNoise() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      const val = (lastOut + 0.02 * white) / 1.02;
      lastOut = val;
      data[i] = val * 3.5; // boost gain
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.masterGain);
    noise.start();

    this.sourceNodes.push(noise, filter);
  }

  /** 柔和雨声 (Gentle Rain) —— 粉红噪声与雨丝微共振 */
  private createRainSound() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // 低通塑造雨丝落地声
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.masterGain);
    noise.start();

    this.sourceNodes.push(noise, filter);
  }

  /** 潮汐海浪 (Ocean Tide) —— 低频正弦波周期调制浪涌 */
  private createOceanTide() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      const val = (lastOut + 0.02 * white) / 1.02;
      lastOut = val;
      data[i] = val * 3.0;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // 浪涌动态滤波器
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, this.ctx.currentTime);

    // 浪涌音量包络
    const tideGain = this.ctx.createGain();
    tideGain.gain.setValueAtTime(0.2, this.ctx.currentTime);

    // 低频震荡器模拟 10 秒一个潮汐周期 (0.1 Hz)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.1, this.ctx.currentTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.45, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(tideGain.gain);

    noise.connect(filter);
    filter.connect(tideGain);
    tideGain.connect(this.masterGain);

    noise.start();
    lfo.start();

    this.sourceNodes.push(noise, filter, tideGain, lfo, lfoGain);
  }
}

export const soundscape = new SoundscapeService();
