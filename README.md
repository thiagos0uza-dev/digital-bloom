# Digital Bloom 💜

Um presente feito de códigos: uma carta botânica que se abre em um céu noturno,
onde uma flor vermelha nasce de milhares de zeros e uns.

**Site:** https://thiagos0uza-dev.github.io/digital-bloom/

## Rodar localmente

```bash
npm install
npm run dev
```

## Editar

- Textos (carta e mensagem final): `src/config.ts` → `TEXT`
- Momentos da flor (caule, botão, explosão, mensagem): `src/config.ts` → `MUSIC_TIMELINE`

## Música

A versão publicada roda sem música (modo demonstrativo, mesmo ritmo).
Para usar música localmente, coloque o arquivo em `public/musica.mp3`
(ele é ignorado pelo Git e não vai para o repositório).

## Publicar uma atualização

```bash
npm run deploy
```

Compila a versão sem música e envia a pasta `dist` para a branch `gh-pages`,
de onde o GitHub Pages serve o site (leva ~1 minuto para aparecer).
Para guardar o código-fonte: `git add -A && git commit -m "..." && git push`.
