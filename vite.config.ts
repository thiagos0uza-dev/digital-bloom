import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

// Se a música estiver em /public, a experiência usa ela; senão roda em modo demonstrativo
// (sem pedir um arquivo inexistente e sem erro 404 no console).
// NO_AUDIO=1 força o modo demonstrativo (para testar localmente como no GitHub Pages).
const hasAudio = existsSync('public/musica.mp3') && !process.env.NO_AUDIO;

// Nome do repositório no GitHub Pages: https://thiagos0uza-dev.github.io/digital-bloom/
export default defineConfig({
  base: '/digital-bloom/',
  define: { __HAS_AUDIO__: JSON.stringify(hasAudio) },
});
