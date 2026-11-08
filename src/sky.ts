// Fundo: estrelas piscando + zeros e uns flutuando em profundidades diferentes.
// Um único canvas, sem elementos DOM por partícula.

interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface Bit { x: number; y: number; z: number; ch: string; vy: number; vx: number; flip: number; bx: number; by: number; }

const BIT_PX = 36;
function bitSprite(ch: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = BIT_PX;
  const g = c.getContext('2d')!;
  g.font = `${BIT_PX * 0.6}px 'JetBrains Mono', monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(ch, BIT_PX / 2, BIT_PX / 2);
  return c;
}

export class Sky {
  private sprites: Record<string, HTMLCanvasElement> = {};
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1;
  stars: Star[] = [];
  bits: Bit[] = [];
  /** 0..1 — quão visíveis/rápidos os códigos de fundo estão. */
  bitLevel = 0.35;
  /** brilho geral do fundo (0..1). */
  glow = 0;
  /** 0..1 — códigos sendo puxados para o centro (transição). */
  converge = 0;
  /** ponto de convergência */
  focusX = 0; focusY = 0;
  reduced: boolean;

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.reduced = reduced;
    this.resize();
    void document.fonts?.ready.then(() => { this.sprites = {}; });
  }

  resize() {
    // celulares: resolução limitada a 1,5x (nitidez boa, bem menos pixels para pintar)
    this.dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.5 : 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const area = this.w * this.h;
    const nStars = Math.round(Math.min(220, area / 6500));
    const nBits = Math.round(Math.min(110, area / 14000));
    this.stars = Array.from({ length: nStars }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: Math.random() * 1.1 + 0.25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.4,
    }));
    this.bits = Array.from({ length: nBits }, () => this.newBit(true));
    this.focusX = this.w / 2;
    this.focusY = this.h * 0.45;
  }

  /** os códigos se espalham a partir do centro, dando origem ao universo */
  spread() {
    for (const b of this.bits) {
      const a = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * Math.max(this.w, this.h) * 0.9;
      b.x = this.focusX + Math.cos(a) * 10;
      b.y = this.focusY + Math.sin(a) * 10;
      b.bx = Math.cos(a) * sp;
      b.by = Math.sin(a) * sp;
    }
  }

  private newBit(anywhere: boolean): Bit {
    const z = Math.random(); // 0 = longe, 1 = perto
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 20,
      z,
      ch: Math.random() < 0.5 ? '0' : '1',
      vy: -(4 + z * 14),
      vx: (Math.random() - 0.5) * 3,
      flip: Math.random() * 6,
      bx: 0,
      by: 0,
    };
  }

  /** Desenha o fundo. `t` em segundos, `dt` em segundos, `energy` 0..1 vindo do áudio. */
  draw(t: number, dt: number, energy = 0) {
    const { ctx, w, h } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    // leve nebulosa central — ganha força com `glow`
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
    const a = 0.10 + this.glow * 0.22 + energy * 0.06;
    g.addColorStop(0, `rgba(60, 40, 140, ${a})`);
    g.addColorStop(0.5, `rgba(20, 24, 70, ${a * 0.5})`);
    g.addColorStop(1, 'rgba(5, 6, 15, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // estrelas
    for (const s of this.stars) {
      const tw = this.reduced ? 0.7 : 0.45 + 0.55 * Math.sin(t * s.speed + s.phase) ** 2;
      ctx.globalAlpha = tw * 0.9;
      ctx.fillStyle = '#e8e6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // zeros e uns flutuando
    const speedMul = this.reduced ? 0.25 : 0.6 + this.bitLevel * 0.8 + energy * 0.8;
    const conv = this.reduced ? 0 : this.converge;
    for (const b of this.bits) {
      b.y += b.vy * dt * speedMul + b.by * dt;
      b.x += b.vx * dt * speedMul + b.bx * dt;
      const damp = Math.exp(-2.2 * dt);
      b.bx *= damp;
      b.by *= damp;
      if (conv > 0) {
        const pull = conv * conv * 3.2 * dt;
        b.x += (this.focusX - b.x) * pull;
        b.y += (this.focusY - b.y) * pull;
      }
      b.flip -= dt;
      if (b.flip < 0) { b.ch = b.ch === '0' ? '1' : '0'; b.flip = 2 + Math.random() * 6; }
      if (b.y < -20 || b.x < -40 || b.x > this.w + 40 || b.y > this.h + 60) Object.assign(b, this.newBit(false));
      const size = (9 + b.z * 9) * 1.65;
      let a = (0.05 + b.z * 0.16) * (0.5 + this.bitLevel) * (1 + conv * 2.5);
      if (conv > 0) {
        const d = Math.hypot(b.x - this.focusX, b.y - this.focusY);
        a *= Math.min(1, d / 40);
      }
      ctx.globalAlpha = Math.min(1, a);
      const key = (b.z > 0.6 ? 'n' : 'f') + b.ch;
      const spr = this.sprites[key] ??= bitSprite(b.ch, b.z > 0.6 ? '#b8a6ff' : '#6f7bd8');
      ctx.drawImage(spr, b.x - size / 2, b.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
