import type { Timeline } from './config';

export interface Phases {
  loading: number; // 0..1
  stem: number;
  bud: number;
  petals: number;
  bloom: number;
  message: boolean;
  /** segundos desde o início do desabrochar (para pulsação calma no final) */
  sinceBloom: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Converte o tempo atual (s) no progresso de cada fase. Puro e determinístico. */
export function phasesAt(t: number, tl: Timeline): Phases {
  return {
    loading: span(t, tl.loading.start, tl.loading.end),
    stem: span(t, tl.stem.start, tl.stem.end),
    bud: span(t, tl.bud.start, tl.bud.end),
    petals: span(t, tl.petals.start, tl.petals.end),
    bloom: span(t, tl.bloom.start, tl.bloom.end),
    message: t >= tl.message,
    sinceBloom: Math.max(0, t - tl.bloom.start),
  };
}
