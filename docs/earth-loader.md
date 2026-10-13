# Globe terrestre 3D de chargement

Le visuel de `WeatherAILoader` est désormais une scène WebGL Three.js : surface
terrestre texturée, relief léger, reflets océaniques, nuages indépendants,
atmosphère bleue, éclairage solaire et lumières nocturnes. Trois orbites inclinées
portent des particules animées, avec occultation réelle par la Terre.

## Comportement conservé

- Les variantes `full`, `light`, `compact`, messages et trois phases restent disponibles.
- Aucun appel météo/IA supplémentaire et aucun délai de chargement imposé.
- La scène est libérée à la disparition du loader ; la sortie conserve ses 340 ms.
- Les textures sont locales, avec attribution dans `client/public/textures/earth/`.

## Performance et accessibilité

Le moteur est importé à la demande dans un chunk séparé, seulement lorsque le
loader animé est monté. Le rendu est plafonné à 30 images/s et au DPR 1,5 ; il
s’arrête quand le document est caché ou le globe hors écran. Géométries, matériaux,
textures, contexte WebGL, observateurs et écouteurs sont libérés au démontage.

`prefers-reduced-motion` et la prop `reducedMotion` affichent un globe fixe sans
initialiser WebGL. Ce même visuel sert de repli pendant le chargement du moteur,
en cas d’import/texture principale indisponible ou si WebGL est indisponible/perdu.
La scène est décorative (`aria-hidden`), les informations du loader restent accessibles.

## Aperçu indépendant

Lancer `pnpm exec vite --host 0.0.0.0` et ouvrir `/earth-preview.html`.
Cette entrée de développement n’est pas incluse dans le build de production.
Elle permet de voir l’animation sans attendre un appel météo, de choisir les
formats, de passer au mode fixe et de simuler la fin du chargement.

## Validation

- `pnpm check` : réussi.
- `pnpm build` : réussi (avertissements préexistants sur les variables analytics
  non définies et un ancien asset `manus-storage`).
- Tests ciblés `WeatherAILoader.test.ts` + `Dashboard.test.ts` : 19 réussis.
- Vérification Chromium/Playwright à 390 × 844 et 1280 × 900 : rendu WebGL et
  rotation effectifs, aucun débordement horizontal mobile, mode fixe sans canvas,
  repli après perte simulée du contexte, sortie et remontage, variantes compactes,
  aucune erreur JavaScript/console. Préférence système de mouvement réduit et
  pause/reprise lors du masquage du document également vérifiées.

Il s’agit d’une animation 3D en direct, pas d’une vidéo MP4.
