// ============================================================
//  DIGITAL BLOOM — tudo que é fácil de editar fica aqui
// ============================================================

/** Textos da experiência. */
export const TEXT = {
  greeting: 'Oiiii! 💜',
  reportTitle: 'Relatório do dia:',
  reportLines: [
    ['Sentimentalismo', '100%'],
    ['Necessidade de carinho', 'detectada.'],
    ['Presente preparado', '1 unidade.'],
  ] as [string, string][],
  button: 'Abrir presente',
  loading: 'Processando carinho...',
  finalMessage: 'Entre tantos zeros e uns, escolhi criar algo único. 💜',
};

/** Arquivo de áudio em /public. Se não existir no build, a experiência roda em modo demonstrativo. */
export const AUDIO_FILE = 'musica.mp3';

/**
 * LINHA DO TEMPO — em segundos, contados a partir do clique em "Abrir presente"
 * (a música começa nesse mesmo clique, então é o tempo da música).
 * Cada fase vai de `start` até `end`. Ajuste aqui sem mexer na lógica.
 */
export interface Timeline {
  loading: { start: number; end: number }; // "Processando carinho..."
  stem: { start: number; end: number };    // caule nasce de baixo para cima
  bud: { start: number; end: number };     // botão fechado se forma
  petals: { start: number; end: number };  // camadas de pétalas são construídas
  bloom: { start: number; end: number };   // pétalas abrem
  message: number;                          // mensagem final aparece
  waves: number[];                          // ondas de partículas nos picos da música
  finale: number;                           // pequena explosão final de partículas
}

/**
 * Linha do tempo sincronizada com "Emotional Ambient Cinematic Piano" (2:52).
 * Marcos tirados da análise de energia da faixa (RMS por segundo):
 *   0–12 s introdução calma · 13 s primeiro acento forte do piano · 22 s e 30 s acentos
 *   57 s primeiro clímax · 67–86 s trecho calmo · 114–118 s clímax principal
 *   131–135 s segunda onda · 141–161 s suave · 162 s fade final
 *
 * Ritmo rápido: caule e botão se montam em poucos segundos e o botão EXPLODE
 * no acento de 13 s, abrindo a flor de uma vez.
 */
export const MUSIC_TIMELINE: Timeline = {
  loading: { start: 2.2, end: 5.4 },  // "Processando carinho..." (introdução)
  stem: { start: 5.7, end: 9.2 },     // caule sobe rápido
  bud: { start: 8.4, end: 11.6 },     // miolo e pétalas internas formam o botão
  petals: { start: 9.2, end: 12.7 },  // camadas externas fecham o botão
  bloom: { start: 13.0, end: 17.5 },  // EXPLODE no acento de 13 s e abre
  message: 22,                        // mensagem aparece no acento seguinte
  waves: [57, 114, 131],              // 1º clímax, clímax principal e segunda onda
  finale: 160,                        // explosão final antes do fade
};

/** Modo demonstrativo (sem áudio): mesmo ritmo, com ondas espaçadas. */
export const DEMO_TIMELINE: Timeline = { ...MUSIC_TIMELINE, waves: [40, 75], finale: 110 };
