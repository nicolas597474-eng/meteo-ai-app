# Médias du loader terrestre

## Textures terrestres

Les cinq cartes suivantes proviennent des exemples de **Three.js r180** :
https://github.com/mrdoob/three.js/tree/r180/examples/textures/planets

| Fichier local       | Source dans Three.js      | Transformation                                         |
| ------------------- | ------------------------- | ------------------------------------------------------ |
| `earth-day.webp`    | `earth_atmos_2048.jpg`    | WebP, 2048 × 1024                                      |
| `earth-normal.webp` | `earth_normal_2048.jpg`   | WebP, 1024 × 512                                       |
| `earth-water.webp`  | `earth_specular_2048.jpg` | WebP, 512 × 256                                        |
| `earth-night.webp`  | `earth_lights_2048.png`   | WebP, 1024 × 512                                       |
| `earth-clouds.webp` | `earth_clouds_1024.png`   | Canal alpha converti en carte de gris WebP, 1024 × 512 |

Distribution source : licence MIT de Three.js, reproduite dans `THREE-LICENSE.txt`.
Ces cartes sont des illustrations fixes ; ni la couverture nuageuse ni les lumières
ne représentent des observations météo en direct.

## Nuage d'orage

`storm-cloud.webp` (724 × 400, alpha) : illustration générée par IA pour cette
interface, puis détourée et compressée. Elle est compositée sur trois sprites
avec pluie et éclairs, pour retrouver les nuages en relief de la référence JPG.
Elle n'est pas une donnée météorologique.

## Poster statique

`earth-poster.webp` (720 × 720, alpha) : capture de la scène
`earthLoaderScene.ts` au temps **0 seconde**, sans les panneaux HTML ni le texte.
Elle fournit le rendu immédiat et le repli sans WebGL. Régénérer cette capture
si la composition de la scène change (voir `docs/earth-loader.md`).

Le JPG partagé dans la conversation sert de référence artistique. Il n'est pas
converti en texture sphérique : le globe et les trajectoires sont reconstruits
en vraie 3D ; la ressemblance porte sur la composition, la palette et les éléments.

Tous les médias sont servis localement et renommés avec une empreinte par Vite.
Aucun CDN, générateur d'images ou service tiers n'est appelé au chargement.
