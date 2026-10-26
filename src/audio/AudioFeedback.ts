export type SoundName = 'doorOpen' | 'doorClose' | 'pickup' | 'rare' | 'paper' | 'click';

/**
 * Tiny synthesised sound effects (no audio files to go missing). The AudioContext is only created
 * after a user gesture, and every call is wrapped so audio problems can never break gameplay.
 */
export class AudioFeedback {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Call from a click / key handler to satisfy browser autoplay rules. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(name: SoundName, variation = 0): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || ctx.state !== 'running') return;
    try {
      const t = ctx.currentTime;
      switch (name) {
        case 'doorOpen':
          this.thump(ctx, out, t, 70, 0.18);
          this.tone(ctx, out, t, 'sawtooth', [88, 150, 118], 0.85, 0.07, 520);
          this.tone(ctx, out, t + 0.05, 'sawtooth', [132, 210, 170], 0.7, 0.035, 900);
          break;
        case 'doorClose':
          this.thump(ctx, out, t, 95, 0.4);
          this.hiss(ctx, out, t, 0.14, 380, 0.16);
          this.hiss(ctx, out, t + 0.07, 0.03, 2600, 0.06);
          break;
        case 'pickup': {
          const f = 880 * (1 + variation * 0.12);
          this.bell(ctx, out, t, f, 0.16, 0.45);
          this.bell(ctx, out, t + 0.07, f * 1.5, 0.1, 0.5);
          break;
        }
        case 'rare':
          [523, 659, 784, 1047, 1568].forEach((f, i) => this.bell(ctx, out, t + i * 0.13, f, 0.11, 1.6));
          break;
        case 'paper':
          this.hiss(ctx, out, t, 0.22, 2800, 0.09);
          this.hiss(ctx, out, t + 0.11, 0.14, 3600, 0.06);
          break;
        case 'click':
          this.tone(ctx, out, t, 'square', [1400, 900], 0.03, 0.05, 4000);
          this.thump(ctx, out, t, 180, 0.05);
          break;
      }
    } catch {
      // Ignore: sound is optional.
    }
  }

  private tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, freqs: number[], dur: number, gain: number, lowpass: number): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    freqs.forEach((f, i) => osc.frequency.linearRampToValueAtTime(f, t + (dur * i) / Math.max(1, freqs.length - 1)));
    osc.frequency.setValueAtTime(freqs[0]!, t);
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.05, dur / 3));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private bell(ctx: AudioContext, out: AudioNode, t: number, freq: number, gain: number, dur: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private thump(ctx: AudioContext, out: AudioNode, t: number, freq: number, gain: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.45), t + 0.22);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private hiss(ctx: AudioContext, out: AudioNode, t: number, dur: number, freq: number, gain: number): void {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
