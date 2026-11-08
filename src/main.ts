import './style.css';
import { TEXT, AUDIO_FILE, DEMO_TIMELINE, MUSIC_TIMELINE } from './config';
import { Sky } from './sky';
import { Flower } from './flower';
import { Soundtrack } from './audio';
import { phasesAt } from './timeline';

declare const __HAS_AUDIO__: boolean;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ---------- cena ----------
const canvas = document.getElementById('sky') as HTMLCanvasElement;
const sky = new Sky(canvas, reduced);
const flower = new Flower(reduced);
flower.layout(sky.w, sky.h);
const music = new Soundtrack(__HAS_AUDIO__ ? import.meta.env.BASE_URL + AUDIO_FILE : null);

window.addEventListener('resize', () => {
  sky.resize();
  flower.layout(sky.w, sky.h);
});

let started = false;
let prevT = 0;
let spreadDone = false;
let prevWaveT = 0;
let slowAvg = 1 / 60, slowFrames = 0, last0 = performance.now();

// ---------- transição: "Processando carinho..." ----------
const loading = $('#loading');
const bitbar = $('.bitbar');
const pct = $('.pct');
$('.loading-text').textContent = TEXT.loading;
const BAR = window.innerWidth < 480 ? 16 : 24;
const barBits = Array.from({ length: BAR }, () => (Math.random() < 0.5 ? '0' : '1'));
let barFlip = 0;
function drawBar(p: number, dt: number) {
  const n = Math.round(p * BAR);
  barFlip += dt;
  if (barFlip > 0.08) {
    barFlip = 0;
    barBits[Math.floor(Math.random() * BAR)] = Math.random() < 0.5 ? '0' : '1';
  }
  bitbar.innerHTML = `<b>${barBits.slice(0, n).join('')}</b>${barBits.slice(n).join('')}`;
  pct.textContent = `${Math.round(p * 100)}%`;
}

// ---------- mensagem final e controles ----------
const finalMsg = $('#final');
// espaço inseparável: o 💜 nunca fica sozinho na linha de baixo
finalMsg.textContent = TEXT.finalMessage.replace(/ (\S+)$/, ' $1');
const controls = $('#controls');
const playBtn = $<HTMLButtonElement>('#play');
const vol = $<HTMLInputElement>('#vol');
if (!__HAS_AUDIO__) vol.remove(); // sem música, volume não faz sentido

function setPlayIcon(paused: boolean) {
  playBtn.textContent = paused ? '▶' : '❚❚';
  playBtn.setAttribute('aria-label', paused ? 'Reproduzir' : 'Pausar');
}
playBtn.addEventListener('click', () => setPlayIcon(music.toggle()));
vol.addEventListener('input', () => music.setVolume(+vol.value));
$('#restart').addEventListener('click', () => {
  music.restart();
  flower.reset();
  spreadDone = false;
  prevT = 0;
  setPlayIcon(false);
});

// ---------- laço principal ----------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // qualidade automática: se a média de quadros ficar lenta (< ~32 fps) com a flor na tela, alivia
  if (started && !flower.lowPower) {
    slowAvg = slowAvg * 0.97 + ((now - last0) / 1000) * 0.03;
    if (slowAvg > 0.031 && ++slowFrames > 90) flower.lowPower = true;
  }
  last0 = now;
  music.tick(dt);
  const lv = music.levels;
  const tl = music.hasAudio ? MUSIC_TIMELINE : DEMO_TIMELINE;
  const t = started ? music.time : 0;
  const ph = phasesAt(t, tl);
  const frozen = music.paused && started;

  // voltou no tempo (reinício ou salto) → limpa gatilhos não determinísticos
  if (t < prevT - 0.5) {
    flower.reset();
    spreadDone = t >= tl.loading.end;
  }
  prevT = t;

  if (started) {
    const inLoading = t > tl.loading.start && t < tl.loading.end + 0.25;
    loading.classList.toggle('hidden', !inLoading);
    if (inLoading) drawBar(ph.loading, frozen ? 0 : dt);
    sky.converge = t < tl.loading.end ? ph.loading : 0;
    if (!spreadDone && t >= tl.loading.end) {
      spreadDone = true;
      sky.spread();
      flower.burst(90, 0.8);
    }
    const flash = ph.bloom > 0 ? Math.exp(-ph.sinceBloom * 2.2) : 0;
    sky.glow = (t < tl.loading.end ? 0.5 * ph.loading : 0) + 0.3 * ph.bud + 0.5 * ph.bloom + 0.8 * flash;
    sky.bitLevel = 0.35 + 0.4 * ph.petals + 0.3 * lv.energy;
    finalMsg.classList.toggle('hidden', !ph.message);
    if (t >= tl.finale) flower.finale();
    for (const w of tl.waves) if (prevWaveT < w && t >= w && t - w < 1) flower.burst(110, 1.1);
    prevWaveT = t;
  }

  sky.draw(now / 1000, frozen ? dt * 0.3 : dt, lv.energy);
  if (started) flower.draw(sky.ctx, t, frozen ? 0 : dt, ph, lv);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- tela 1 ----------
const report = $('#report');
const greet = $('.greet');
const title = $('.title');
const lines = $('.lines');
const btn = $<HTMLButtonElement>('#open');

// separa o emoji para poder suavizar o tom dele (o texto continua idêntico)
const heartAt = TEXT.greeting.lastIndexOf('💜');
if (heartAt >= 0) {
  greet.textContent = TEXT.greeting.slice(0, heartAt).trimEnd() + ' ';
  const heart = document.createElement('span');
  heart.className = 'heart';
  heart.textContent = '💜';
  greet.appendChild(heart);
} else greet.textContent = TEXT.greeting;
title.textContent = TEXT.reportTitle;
btn.textContent = TEXT.button;
for (const [k, v] of TEXT.reportLines) {
  const li = document.createElement('li');
  li.className = 'reveal';
  li.innerHTML = `<span class="k"></span><span class="dots" aria-hidden="true"></span><span class="v"></span>`;
  (li.firstChild as HTMLElement).textContent = `${k}:`;
  (li.lastChild as HTMLElement).textContent = v;
  lines.appendChild(li);
}

// textos surgem com pequenos intervalos
const reveals = [greet, title, ...Array.from(lines.children), $('.seal'), btn] as HTMLElement[];
reveals.forEach((el, i) => setTimeout(() => el.classList.add('on'), (reduced ? 100 : 3300) + i * (reduced ? 60 : 320)));

btn.addEventListener('click', () => {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('pressed');
  void music.start(); // dentro do gesto do usuário (regra de autoplay)
  started = true;
  // o papel se recolhe em direção ao botão
  const r = btn.getBoundingClientRect();
  report.style.setProperty('--cx', `${r.left + r.width / 2}px`);
  report.style.setProperty('--cy', `${r.top + r.height / 2}px`);
  setTimeout(() => report.classList.add('leaving'), 300);
  setTimeout(() => report.classList.add('closing'), reduced ? 500 : 900);
  setTimeout(() => {
    report.classList.add('gone');
    controls.classList.remove('hidden');
  }, reduced ? 1000 : 2600);
});

// gancho para testes automatizados: ?debug permite pular no tempo
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__bloom = {
    seek: (s: number) => music.seek(s),
    get t() { return music.time; },
    get info() { return music.info; },
  };
}
