import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

// Nome do repositório no GitHub Pages: https://thiagos0uza-dev.github.io/digital-bloom/
export default defineConfig(({ mode }) => {
  // Modo "pages" (npm run deploy): versão publicada SEMPRE sem música e sem copiar o MP3.
  // Nos outros modos, se public/musica.mp3 existir, a experiência usa a música.
  const hasAudio = mode !== 'pages' && existsSync('public/musica.mp3') && !process.env.NO_AUDIO;
  return {
    base: '/digital-bloom/',
    define: { __HAS_AUDIO__: JSON.stringify(hasAudio) },
    build: { copyPublicDir: hasAudio },
  };
});
