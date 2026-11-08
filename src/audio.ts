// Áudio + relógio da experiência. Separado da lógica de animação:
// a animação só pergunta "que horas são?" (time) e "quanta energia tem agora?" (levels).

export interface Levels { energy: number; bass: number; treble: number; }

export class Soundtrack {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private bins: Uint8Array | null = null;
  private demoTime = 0;
  private endedAt = 0;
  private volume = 0.8;
  /** true quando a música real está tocando a experiência. */
  hasAudio = false;
  paused = true;
  levels: Levels = { energy: 0, bass: 0, treble: 0 };

  constructor(src: string | null) {
    if (src) {
      this.el = new Audio();
      this.el.preload = 'auto';
      this.el.src = src;
    }
  }

  /** Chamado dentro do clique (gesto do usuário) — regra de autoplay dos navegadores. */
  async start() {
    this.paused = false;
    this.demoTime = 0;
    if (!this.el) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        const node = this.ctx.createMediaElementSource(this.el);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.75;
        this.gain = this.ctx.createGain();
        this.gain.gain.value = this.volume;
        node.connect(this.analyser).connect(this.gain).connect(this.ctx.destination);
        this.bins = new Uint8Array(this.analyser.frequencyBinCount);
      }
      this.el.currentTime = 0;
      await this.ctx.resume();
      await this.el.play();
      this.hasAudio = true;
    } catch {
      this.hasAudio = false; // segue em modo demonstrativo
    }
  }

  get duration() { return this.el && isFinite(this.el.duration) ? this.el.duration : 0; }

  /** Tempo atual da experiência em segundos (posição da música, ou relógio próprio no modo demo). */
  get time() {
    if (this.hasAudio && this.el) {
      if (this.el.ended) return this.duration + (performance.now() - this.endedAt) / 1000;
      return this.el.currentTime;
    }
    return this.demoTime;
  }

  tick(dt: number) {
    if (this.hasAudio && this.el) {
      if (this.el.ended && !this.endedAt) this.endedAt = performance.now();
      this.analyse();
    } else {
      if (!this.paused) this.demoTime += dt;
      this.fakeLevels();
    }
  }

  toggle() {
    this.paused = !this.paused;
    if (this.hasAudio && this.el) {
      if (this.paused) this.el.pause();
      else { void this.ctx?.resume(); void this.el.play(); }
    }
    return this.paused;
  }

  restart() {
    this.paused = false;
    this.demoTime = 0;
    this.endedAt = 0;
    if (this.hasAudio && this.el) {
      this.el.currentTime = 0;
      void this.el.play();
    }
  }

  /** estado para diagnóstico (modo ?debug) */
  get info() {
    const e = this.el;
    return { hasAudio: this.hasAudio, paused: this.paused, el: e ? { paused: e.paused, ready: e.readyState, net: e.networkState, t: e.currentTime, err: e.error?.code ?? null, seeking: e.seeking } : null };
  }

  /** pula para um instante (usado em testes e no reinício) */
  seek(s: number) {
    if (this.hasAudio && this.el) this.el.currentTime = s;
    else this.demoTime = s;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }

  private analyse() {
    if (!this.analyser || !this.bins) return;
    this.analyser.getByteFrequencyData(this.bins);
    const b = this.bins;
    const avg = (from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += b[i];
      return s / ((to - from) * 255);
    };
    // ~43 Hz por bin (44.1 kHz / 1024)
    const bass = avg(1, 8);
    const treble = avg(90, 260);
    const energy = avg(1, 260);
    const k = 0.25;
    this.levels.bass += (bass - this.levels.bass) * k;
    this.levels.treble += (treble - this.levels.treble) * k;
    this.levels.energy += (energy - this.levels.energy) * k;
  }

  /** Sem áudio: uma "respiração" suave para os efeitos não ficarem estáticos. */
  private fakeLevels() {
    const t = this.demoTime;
    const breath = 0.5 + 0.5 * Math.sin(t * 1.3);
    const target = this.paused ? 0.15 : 0.25 + 0.2 * breath;
    this.levels.energy += (target - this.levels.energy) * 0.05;
    this.levels.bass += (0.2 + 0.25 * Math.max(0, Math.sin(t * 2.1)) - this.levels.bass) * 0.08;
    this.levels.treble += (0.2 + 0.1 * Math.sin(t * 3.7) - this.levels.treble) * 0.08;
  }
}
