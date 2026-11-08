// A FLOR DIGITAL — milhares de zeros e uns que se organizam em caule, botão e pétalas.
//
// Cada glifo tem um "endereço" na flor (parte, posição ao longo dela, posição na largura).
// A cada quadro, a posição-alvo é recalculada a partir da geometria viva (abertura, balanço),
// e o quanto o glifo já "chegou" depende só do progresso das fases da linha do tempo.
// Isso torna tudo determinístico: pausar, voltar ou reiniciar a música mantém a sincronia.

import type { Phases } from './timeline';
import type { Levels } from './audio';

// ---------- paleta (azul, violeta, lilás, branco, toques rosados) ----------
const COLORS = [
  '#57c4a4', // 0 verde-azulado — caule
  '#3e9d84', // 1 verde profundo — folhas
  '#b0123a', // 2 carmim — base das pétalas
  '#e8344e', // 3 vermelho
  '#ffa3b1', // 4 rosa claro — contornos
  '#ff6b87', // 5 rosado — pontas das pétalas
  '#ffffff', // 6 branco
  '#ffe1e6', // 7 branco rosado — miolo
];
const GLYPH_PX = 40;

/** Sprites pré-renderizados (com brilho embutido) — desenhar imagem é muito mais barato que texto. */
function makeSprites(): HTMLCanvasElement[][] {
  return COLORS.map((color) =>
    ['0', '1'].map((ch) => {
      const c = document.createElement('canvas');
      c.width = c.height = GLYPH_PX;
      const g = c.getContext('2d')!;
      g.font = `600 ${GLYPH_PX * 0.56}px 'JetBrains Mono', monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = color;
      g.shadowBlur = GLYPH_PX * 0.18;
      g.fillStyle = color;
      g.fillText(ch, GLYPH_PX / 2, GLYPH_PX / 2 + 1);
      g.shadowBlur = 0;
      g.fillText(ch, GLYPH_PX / 2, GLYPH_PX / 2 + 1);
      return c;
    }),
  );
}

// ---------- tipos ----------
const enum Kind { Stem, Leaf, Core, Petal }

interface Glyph {
  kind: Kind;
  part: number;   // folha / pétala (índice global)
  u: number;      // ao longo (0 = base, 1 = ponta)
  v: number;      // na largura (-1..1)
  order: number;  // ordem de construção dentro da fase (0..1)
  spA: number;    // ângulo de origem
  spR: number;    // distância de origem (em S)
  swirl: number;  // curvatura do trajeto
  size: number;
  color: number;
  seed: number;
  rate: number;   // frequência de troca 0↔1
  prof: number;   // perfil da pétala na posição u (pré-calculado)
}

interface PetalDef {
  layer: number;  // 0 = interna, 1 = média, 2 = externa
  phi: number;    // ângulo ao redor do eixo
  len: number;
  wid: number;
  closed: number; // inclinação fechada (rad, a partir da vertical)
  open: number;   // inclinação aberta
  delay: number;  // atraso de abertura (0..1)
  buildIndex: number;
  buildCount: number;
}

interface Free { x: number; y: number; vx: number; vy: number; life: number; max: number; ch: number; color: number; size: number; dot: boolean; }

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smooth = (x: number) => x * x * (3 - 2 * x);
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Flower {
  private sprites = makeSprites();
  private glyphs: Glyph[] = [];
  private petals: PetalDef[] = [];
  private free: Free[] = [];
  private density = 1;
  private reduced: boolean;
  /** qualidade automática: em aparelhos lentos, desenha 2 de cada 3 glifos */
  lowPower = false;

  // layout em pixels
  private cx = 0; private baseY = 0; private headY = 0; private S = 0;
  // quadro atual
  private hx = 0; private hy = 0; // cabeça (topo do caule) já com balanço
  private time = 0;
  private lastBloom = 0;
  private finaleDone = false;
  private detachAcc = 0;
  // buffers por quadro (sem alocação a cada frame)
  private bx = new Float32Array(0); private by = new Float32Array(0); private ba = new Float32Array(0);
  private bs = new Float32Array(0); private bd = new Float32Array(0); private bc = new Uint8Array(0);
  private keys = new Float64Array(0);

  constructor(reduced: boolean) {
    this.reduced = reduced;
    // refaz os glifos quando a fonte JetBrains Mono terminar de carregar
    void document.fonts?.ready.then(() => { this.sprites = makeSprites(); });
  }

  layout(w: number, h: number) {
    const mobile = w < 640;
    this.density = mobile ? 0.52 : 1;
    this.S = Math.min(w * (mobile ? 1.05 : 0.9), h * 0.6);
    this.cx = w / 2;
    // o pé do caule fica acima da mensagem final (que mora no rodapé)
    const msgSpace = h < 520 ? 70 : mobile ? 150 : 120;
    this.baseY = Math.min(h * (mobile ? 0.83 : 0.84), h - msgSpace);
    this.headY = h * (mobile ? 0.4 : 0.38);
    this.build();
  }

  /** Reinicia efeitos que não são determinísticos (partículas soltas, explosões). */
  reset() {
    this.free.length = 0;
    this.lastBloom = 0;
    this.finaleDone = false;
  }

  // ---------- construção da nuvem de glifos ----------
  private build() {
    const r = rng(20251108);
    const n = (k: number) => Math.round(k * this.density);
    const G: Glyph[] = [];
    const add = (g: Partial<Glyph>) => G.push({
      kind: Kind.Stem, part: 0, u: 0, v: 0, order: 0, spA: r() * TAU, spR: 0.5 + r() * 0.7,
      swirl: (r() - 0.5) * 0.6, size: 1, color: 0, seed: Math.floor(r() * 1e6), rate: 0.05 + r() * 0.3, prof: 0, ...g,
    });

    // caule: 3 "fios" de código, de baixo para cima
    for (let i = 0, N = n(260); i < N; i++) {
      const u = i / N;
      add({ kind: Kind.Stem, u, v: (r() * 2 - 1) * 0.9, order: u, size: 0.75 + r() * 0.3, color: r() < 0.2 ? 1 : 0 });
    }
    // folhas: duas, nascendo do caule
    for (let leaf = 0; leaf < 2; leaf++) {
      for (let i = 0, N = n(110); i < N; i++) {
        const u = Math.sqrt(r());
        const edge = r() < 0.35;
        const v = edge ? (r() < 0.5 ? -1 : 1) : r() * 2 - 1;
        const attach = leaf === 0 ? 0.3 : 0.5;
        add({ kind: Kind.Leaf, part: leaf, u, v, order: clamp01(attach + u * 0.35), size: 0.7 + r() * 0.25, color: edge ? 0 : 1 });
      }
    }
    // miolo
    for (let i = 0, N = n(150); i < N; i++) {
      const u = Math.sqrt(r());
      add({ kind: Kind.Core, u, v: r() * TAU, order: r(), size: 0.6 + r() * 0.35, color: r() < 0.5 ? 7 : 6, spR: 0.1 + r() * 0.4 });
    }

    // pétalas: 3 camadas com profundidade
    const layers = [
      { count: 5, len: 0.19, wid: 0.085, closed: 0.1, open: 0.62, glyphs: 95 },
      { count: 7, len: 0.27, wid: 0.11, closed: 0.18, open: 1.02, glyphs: 140 },
      { count: 8, len: 0.33, wid: 0.125, closed: 0.28, open: 1.38, glyphs: 165 },
    ];
    this.petals = [];
    layers.forEach((L, li) => {
      for (let i = 0; i < L.count; i++) {
        this.petals.push({
          layer: li,
          phi: (i / L.count) * TAU + li * 0.45 + (r() - 0.5) * 0.18,
          len: L.len * (0.92 + r() * 0.16),
          wid: L.wid * (0.9 + r() * 0.2),
          closed: L.closed,
          open: L.open * (0.94 + r() * 0.1),
          delay: (2 - li) * 0.22 + (i / L.count) * 0.12, // externas abrem primeiro
          buildIndex: i,
          buildCount: L.count,
        });
      }
    });
    this.petals.forEach((p, pi) => {
      const L = layers[p.layer];
      for (let i = 0, N = n(L.glyphs); i < N; i++) {
        const edge = r() < 0.5; // contorno marcado deixa o formato reconhecível
        const u = edge ? r() : Math.pow(r(), 0.8);
        const v = edge ? (r() < 0.5 ? -1 : 1) : (r() * 2 - 1) * Math.sqrt(r());
        const tipPink = u > 0.72 && r() < 0.55;
        const color = edge ? (tipPink ? 5 : 4) : u < 0.3 ? 2 : tipPink ? 5 : 3;
        // cada pétala é construída da base para a ponta, uma depois da outra
        const order = clamp01((p.buildIndex / p.buildCount) * 0.55 + u * 0.4 + r() * 0.05);
        add({ kind: Kind.Petal, part: pi, u, v, order, size: (0.62 + r() * 0.3) * (edge ? 1.05 : 1), color, spR: 0.35 + r() * 0.6 });
      }
    });
    // perfil da pétala: arredondada e levemente pontuda
    for (const g of G) g.prof = (Math.pow(g.u, 0.55) * Math.pow(1 - g.u, 0.5)) / 0.46;
    this.glyphs = G;
  }

  // ---------- geometria ----------
  /** ponto no caule (bezier cúbica) com balanço */
  private stemPoint(u: number, out: { x: number; y: number; nx: number; ny: number }) {
    const S = this.S, t = this.time;
    const H = this.baseY - this.headY;
    const sway = Math.sin(t * 0.55) * 0.018 * S + Math.sin(t * 0.23 + 1) * 0.01 * S;
    const p0x = this.cx, p0y = this.baseY;
    const p1x = this.cx + 0.07 * S, p1y = this.baseY - 0.35 * H;
    const p2x = this.cx - 0.06 * S + sway * 0.4, p2y = this.baseY - 0.72 * H;
    const p3x = this.cx + sway, p3y = this.headY;
    const m = 1 - u;
    const a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
    out.x = a * p0x + b * p1x + c * p2x + d * p3x;
    out.y = a * p0y + b * p1y + c * p2y + d * p3y;
    // tangente → normal
    const tx = 3 * m * m * (p1x - p0x) + 6 * m * u * (p2x - p1x) + 3 * u * u * (p3x - p2x);
    const ty = 3 * m * m * (p1y - p0y) + 6 * m * u * (p2y - p1y) + 3 * u * u * (p3y - p2y);
    const l = Math.hypot(tx, ty) || 1;
    out.nx = -ty / l;
    out.ny = tx / l;
  }

  /** abertura de uma pétala (0 = fechada, 1 = aberta), com respiração depois de aberta */
  private openness(p: PetalDef, ph: Phases) {
    const build = 0.06 * smooth(ph.petals); // botão bem fechado enquanto se forma
    const k = clamp01((ph.bloom - p.delay * 0.35) / 0.55);
    // abertura explosiva: passa um pouco do ponto e assenta ("pop")
    const c1 = 1.5, c3 = c1 + 1, q = k - 1;
    const pop = k <= 0 ? 0 : 1 + c3 * q * q * q + c1 * q * q;
    const breathe = ph.bloom >= 1 ? 0.035 * Math.sin(this.time * 0.7 + p.phi * 2) : 0;
    return Math.min(1.2, build + (1 - build) * pop) + breathe;
  }

  /** valores por pétala que mudam a cada quadro (calculados uma vez, não por glifo) */
  private pf = new Float32Array(0);
  private preparePetals(opens: number[]) {
    const n = this.petals.length, S = this.S;
    if (this.pf.length < n * 8) this.pf = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const p = this.petals[i], o = opens[i];
      const theta = p.closed + (p.open - p.closed) * o;
      const phi = p.phi + this.time * 0.04; // gira muito devagar
      const f = this.pf, k = i * 8;
      f[k] = p.len * S;                       // L
      f[k + 1] = p.wid * S * (0.55 + 0.45 * o); // W
      f[k + 2] = Math.sin(theta);
      f[k + 3] = Math.cos(theta);
      f[k + 4] = Math.cos(phi);
      f[k + 5] = Math.sin(phi);
      f[k + 6] = 0.18 + 0.22 * o;             // curvatura da ponta
      f[k + 7] = 0.45 - 0.35 * o;             // quanto as bordas fecham para dentro
    }
  }

  /** projeção de um ponto da pétala (3D simples, câmera levemente de cima) */
  private petalPoint(i: number, u: number, v: number, prof: number, out: { x: number; y: number; z: number }) {
    const f = this.pf, k = i * 8, S = this.S;
    const L = f[k], W = f[k + 1], st = f[k + 2], ct = f[k + 3], cp = f[k + 4], sp = f[k + 5];
    // espinha: sai inclinada e a ponta curva para cima
    const curl = f[k + 6] * u * u;
    const rad = L * u * st - L * curl * st * 0.4;
    const wp = W * prof;
    // largura: bordas sobem (concha) e fecham para dentro quando fechada
    const y = L * u * ct + L * curl + v * v * wp * 0.35;
    const w = v * wp;
    const R = rad - v * v * wp * f[k + 7];
    const x = R * cp - w * sp;
    const z = R * sp + w * cp;
    // câmera inclinada ~22° para ver o interior da flor
    const y2 = y * 0.92866 - z * 0.37092;
    const z2 = y * 0.37092 + z * 0.92866;
    const persp = 1 / (1 - z2 / (5 * S));
    out.x = this.hx + x * persp;
    out.y = this.hy - y2 * persp;
    out.z = z2 / S;
  }

  // ---------- quadro ----------
  draw(ctx: CanvasRenderingContext2D, t: number, dt: number, ph: Phases, lv: Levels) {
    this.time = t;
    const S = this.S;
    const tmp = { x: 0, y: 0, nx: 0, ny: 0 };
    const pp = { x: 0, y: 0, z: 0 };
    this.stemPoint(1, tmp);
    this.hx = tmp.x;
    this.hy = tmp.y;
    if (ph.stem <= 0) { this.drawFree(ctx, dt); return; }

    const energy = lv.energy, bass = lv.bass;
    // clarão da explosão do botão (decai em ~1,5 s) — derivado do tempo, então é determinístico
    const flash = ph.bloom > 0 ? Math.exp(-ph.sinceBloom * 2.2) : 0;
    const glowAmt = 0.25 * ph.bud + 0.55 * ph.bloom + 1.3 * flash;

    // brilho suave no centro (pulsa com os graves)
    if (glowAmt > 0) {
      const R = S * (0.16 + 0.1 * ph.bloom) * (1 + 0.18 * bass);
      const g = ctx.createRadialGradient(this.hx, this.hy - S * 0.03, 0, this.hx, this.hy - S * 0.03, R);
      const a = glowAmt * (0.55 + 0.45 * bass);
      g.addColorStop(0, `rgba(255, 225, 230, ${0.5 * a})`);
      g.addColorStop(0.35, `rgba(235, 70, 100, ${0.22 * a})`);
      g.addColorStop(1, 'rgba(150, 20, 60, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(this.hx - R, this.hy - S * 0.03 - R, R * 2, R * 2);
    }

    // pétalas em pintura normal (cores fiéis, sem estourar em branco), em ordem de profundidade
    ctx.globalCompositeOperation = 'source-over';
    const base = Math.max(7, S * 0.03); // tamanho do glifo em px
    const bright = 0.78 + 0.32 * energy;
    const opens = this.petals.map((p) => this.openness(p, ph));
    this.preparePetals(opens);
    const petalProg = (p: PetalDef) => (p.layer === 0 ? ph.bud : ph.petals);

    const N = this.glyphs.length;
    if (this.bx.length < N) {
      this.bx = new Float32Array(N); this.by = new Float32Array(N); this.ba = new Float32Array(N);
      this.bs = new Float32Array(N); this.bd = new Float32Array(N); this.bc = new Uint8Array(N);
    }
    let count = 0;
    for (let gi = 0; gi < N; gi++) {
      if (this.lowPower && gi % 3 === 2) continue;
      const g = this.glyphs[gi];
      // progresso de construção desta partícula
      let prog: number;
      if (g.kind === Kind.Stem || g.kind === Kind.Leaf) prog = ph.stem;
      else if (g.kind === Kind.Core) prog = ph.bud;
      else prog = petalProg(this.petals[g.part]);
      const k = clamp01((prog * 1.15 - g.order) / 0.15);
      if (k <= 0) continue;

      // alvo
      let tx: number, ty: number, depth = 0;
      if (g.kind === Kind.Stem) {
        this.stemPoint(g.u, tmp);
        const wdt = S * 0.012 * (1 - g.u * 0.45);
        tx = tmp.x + tmp.nx * g.v * wdt;
        ty = tmp.y + tmp.ny * g.v * wdt;
      } else if (g.kind === Kind.Leaf) {
        const attach = g.part === 0 ? 0.3 : 0.5;
        this.stemPoint(attach, tmp);
        const side = g.part === 0 ? 1 : -1;
        const sway = Math.sin(t * 0.8 + g.part * 2) * 0.05;
        const ang = -Math.PI / 2 + side * (0.95 - 0.35 * g.u + sway); // sobe e se afasta
        const Lf = S * 0.2, Wf = S * 0.05 * Math.sin(Math.PI * Math.pow(g.u, 0.8));
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const along = Lf * g.u;
        tx = tmp.x + dx * along - dy * g.v * Wf;
        ty = tmp.y + dy * along + dx * g.v * Wf - side * 0 + S * 0.04 * g.u * g.u;
      } else if (g.kind === Kind.Core) {
        const r = S * 0.045 * g.u * (0.6 + 0.4 * ph.bloom);
        tx = this.hx + Math.cos(g.v + t * 0.2) * r;
        ty = this.hy - S * 0.02 + Math.sin(g.v + t * 0.2) * r * 0.5;
        depth = 0.3;
      } else {
        this.petalPoint(g.part, g.u, g.v, g.prof, pp);
        tx = pp.x; ty = pp.y; depth = pp.z;
        if (flash > 0.01) {
          // na explosão, os códigos são lançados para fora e voltam ao lugar
          const push = flash * 0.55 * (0.4 + (g.seed % 13) / 13);
          tx += (tx - this.hx) * push;
          ty += (ty - this.hy) * push;
        }
      }

      // trajeto: vem de longe, em espiral, até o lugar
      let x = tx, y = ty;
      if (k < 1) {
        let sx: number, sy: number;
        if (g.kind === Kind.Petal || g.kind === Kind.Core) {
          // sobem pelo caule e espiralam até o botão
          this.stemPoint(0.35 + 0.5 * ((g.seed % 100) / 100), tmp);
          sx = tmp.x + Math.cos(g.spA) * S * g.spR * 0.6;
          sy = tmp.y + Math.sin(g.spA) * S * g.spR * 0.3;
        } else {
          sx = tx + Math.cos(g.spA) * S * g.spR;
          sy = ty + Math.sin(g.spA) * S * g.spR * 0.6 + S * 0.25;
        }
        const e = this.reduced ? k : ease(k);
        const bend = Math.sin(Math.PI * e) * g.swirl * S * 0.35;
        const dx = tx - sx, dy = ty - sy, l = Math.hypot(dx, dy) || 1;
        x = sx + dx * e - (dy / l) * bend;
        y = sy + dy * e + (dx / l) * bend;
      }

      // aparência
      let alpha = (0.25 + 0.75 * k) * bright;
      let size = base * g.size;
      if (g.kind === Kind.Petal) {
        alpha *= depth < 0 ? 0.45 + 0.55 * (1 + depth) : 1;
        size *= 1 + depth * 0.25;
        alpha *= g.color === 4 || g.color === 5 ? 1 : 0.62; // contorno mais marcado que o interior
      } else if (g.kind === Kind.Stem) {
        alpha *= 0.35 + 0.65 * Math.min(1, g.u * 3); // nasce da escuridão
      }
      if (g.kind === Kind.Core) alpha *= 0.7 + 0.5 * bass;
      this.bx[count] = x; this.by[count] = y; this.ba[count] = alpha > 1 ? 1 : alpha;
      this.bs[count] = size; this.bd[count] = g.kind === Kind.Petal ? depth : g.kind === Kind.Core ? 0.05 : -9;
      this.bc[count] = g.color * 2 + ((g.seed + Math.floor(t * g.rate)) & 1);
      count++;
    }
    // desenha de trás para frente — ordenação numérica nativa (sem função de comparação)
    if (this.keys.length < count) this.keys = new Float64Array(N);
    const keys = this.keys.subarray(0, count);
    for (let i = 0; i < count; i++) keys[i] = Math.round((this.bd[i] + 10) * 1000) * 65536 + i;
    keys.sort();
    for (let i = 0; i < count; i++) {
      const j = keys[i] % 65536;
      const c = this.bc[j];
      ctx.globalAlpha = this.ba[j];
      const sz = this.bs[j];
      ctx.drawImage(this.sprites[c >> 1][c & 1], this.bx[j] - sz / 2, this.by[j] - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';

    this.spawnAmbient(dt, ph, lv);
    this.drawOrbit(ctx, t, ph, lv, base);
    this.drawFree(ctx, dt);

    // gatilhos (onda ao desabrochar e explosão final)
    if (this.lastBloom <= 0 && ph.bloom > 0) this.burst(230, 1.45);
    this.lastBloom = ph.bloom;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** números circulando em volta do caule e da flor */
  private drawOrbit(ctx: CanvasRenderingContext2D, t: number, ph: Phases, lv: Levels, base: number) {
    const S = this.S;
    const N = Math.round((this.reduced ? 18 : 46) * this.density);
    const vis = Math.min(1, ph.stem * 2);
    const speed = 0.12 + 0.12 * lv.energy;
    for (let i = 0; i < N; i++) {
      const f = i / N;
      const a = f * TAU * 3.7 + t * speed * (i % 2 ? 1 : -0.8);
      const along = (f * 1.7) % 1; // altura ao longo do caule
      const stemY = this.baseY + (this.headY - this.baseY) * along;
      const rx = S * (0.1 + 0.32 * along * (0.5 + 0.5 * ph.bloom));
      const x = this.cx + Math.cos(a) * rx;
      const y = stemY + Math.sin(a) * rx * 0.22;
      const front = Math.sin(a) > 0;
      ctx.globalAlpha = vis * (front ? 0.45 : 0.18) * (0.6 + 0.4 * lv.treble);
      const size = base * (front ? 0.75 : 0.55);
      const ch = (i + Math.floor(t * 0.4 + i)) & 1;
      ctx.drawImage(this.sprites[i % 3 === 0 ? 4 : 0][ch], x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  /** códigos se desprendendo das pétalas e partículas subindo */
  private spawnAmbient(dt: number, ph: Phases, lv: Levels) {
    if (this.reduced) return;
    const S = this.S;
    const rate = (ph.bloom * 10 + ph.petals * 2) * (0.6 + lv.energy) * this.density;
    this.detachAcc += rate * dt;
    while (this.detachAcc > 1 && this.free.length < 220) {
      this.detachAcc -= 1;
      const ang = Math.random() * TAU;
      const r = S * (0.08 + Math.random() * 0.28 * Math.max(0.3, ph.bloom));
      const dot = Math.random() < 0.45;
      this.free.push({
        x: this.hx + Math.cos(ang) * r,
        y: this.hy + Math.sin(ang) * r * 0.45,
        vx: (Math.random() - 0.5) * 10,
        vy: -(8 + Math.random() * 18),
        life: 0, max: 3 + Math.random() * 4,
        ch: Math.random() < 0.5 ? 0 : 1,
        color: dot ? 6 : [3, 4, 5][Math.floor(Math.random() * 3)],
        size: (dot ? 0.35 : 0.6) + Math.random() * 0.3,
        dot,
      });
    }
    if (this.detachAcc > 1) this.detachAcc = 1;
  }

  /** onda de partículas a partir do centro da flor */
  burst(count: number, power: number) {
    if (this.reduced) count = Math.round(count * 0.3);
    const S = this.S || 400;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = S * (0.35 + Math.random() * 0.9) * power;
      this.free.push({
        x: this.hx, y: this.hy - S * 0.03,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - S * 0.1,
        life: 0, max: 2 + Math.random() * 2.5,
        ch: i & 1, color: [4, 5, 6, 3][i % 4], size: 0.5 + Math.random() * 0.5, dot: Math.random() < 0.35,
      });
    }
  }

  finale() {
    if (this.finaleDone) return;
    this.finaleDone = true;
    this.burst(140, 1.2);
  }

  private drawFree(ctx: CanvasRenderingContext2D, dt: number) {
    const base = Math.max(7, this.S * 0.03);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.free.length - 1; i >= 0; i--) {
      const f = this.free[i];
      f.life += dt;
      if (f.life >= f.max) { this.free.splice(i, 1); continue; }
      f.vx *= 1 - 1.2 * dt;
      f.vy = f.vy * (1 - 1.2 * dt) - 4 * dt; // desacelera e sobe devagar
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const k = f.life / f.max;
      ctx.globalAlpha = Math.sin(Math.PI * k) * 0.8;
      const s = base * f.size;
      if (f.dot) {
        ctx.fillStyle = '#fff4fb';
        ctx.beginPath();
        ctx.arc(f.x, f.y, s * 0.12, 0, TAU);
        ctx.fill();
      } else {
        ctx.drawImage(this.sprites[f.color][f.ch], f.x - s / 2, f.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
