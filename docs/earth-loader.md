# Loader MeteoAI — Terre 3D et orbites en sens inverse

## Direction artistique et périmètre

Le visuel remplace la sphère CSS du loader commun (`WeatherAILoader`), déjà
utilisé par le fallback des routes, le Dashboard et les prévisions détaillées.
Aucun routage, calcul météo, appel API, timeout réseau ou état d'erreur n'est modifié.

La composition reprend au plus près les éléments du JPG de référence :

- Europe et Afrique visibles au départ, surface terrestre texturée et relief ;
- atmosphère bleu électrique, soleil rayonnant en haut à droite ;
- trois nuages d'orage détaillés, pluie et éclairs discrets (sans flash) ;
- satellite modélisé, étoiles, anneaux lumineux et socle holographique ;
- panneaux fixes « Stations locales », « Modèles météo », « Données radar »,
  « Sources multiples », avec goutte, flocons et vent ;
- messages applicatifs et barre d'attente **indéterminée** sous la scène.

Ce n'est **pas un JPG tourné en CSS** : la Terre est une sphère 3D, avec carte
normale, réflexion des océans, lumières nocturnes et une coquille nuageuse.
Les trois gros nuages sont des sprites illustrés, afin de conserver leur
silhouette détaillée sans simulation volumétrique coûteuse.

Le JPG sert de référence artistique ; la reconstruction n'est pas une copie
pixel à pixel. La scène est entièrement décorative, **pas une carte météo en
direct**. Les phases textuelles préexistantes restent indicatives, sans prétendre
mesurer l'avancement des requêtes.

## Animation véritablement tridimensionnelle

`earthLoaderMotion.ts` centralise le mouvement :

- Terre : **+0,065 rad/s**, environ un tour en 97 secondes ;
- particules : **−0,24 rad/s**, modulé par orbite ;
- coquille nuageuse : même sens que la Terre, avec une légère dérive.

Les vitesses utilisent la même convention d'axe. Elles sont indépendantes de la
cadence des frames. Les particules suivent des cercles dans trois plans inclinés,
avec une vraie coordonnée de profondeur. Le test de profondeur reste activé :
les particules à l'arrière sont occultées par la Terre opaque. Les panneaux ne
tournent pas, afin de rester lisibles.

## Amélioration progressive et maîtrise du coût

1. Un poster local de **la même scène au temps zéro** fournit le rendu initial.
2. Si le loader reste visible pendant 350 ms, le moteur Three.js est importé
   dynamiquement. Ce délai ne retarde **jamais** l'affichage des données.
3. La scène remplace le poster par un fondu, sans attendre une phase visuelle.
4. La disponibilité des données arrête la scène ; la sortie existante de 340 ms
   est conservée si le composant reste monté. Les pages peuvent toujours démonter
   le loader immédiatement, comme auparavant.

Les chargements brefs n'importent donc pas le moteur. La préférence système de
réduction des mouvements (ou la prop `reducedMotion`), `Save-Data` et les connexions
`2g`/`slow-2g` gardent le poster **sans importer Three.js ni télécharger ses cartes**.
Une erreur de texture, d'import ou de WebGL conserve également le poster. Une
perte de contexte GPU ne déclenche pas une boucle de réinitialisation.

### Budget constaté sur le build de cette modification

| Ressource                                 | Coût approximatif |
| ----------------------------------------- | ----------------: |
| Poster statique 720 × 720                 |           126 Kio |
| Ensemble des six cartes / sprites 3D WebP |           327 Kio |
| Total des sept images locales             |       **453 Kio** |
| Chunk Three.js + scène, différé           |   **130 ko gzip** |

Le chunk 3D reste relativement lourd (environ 514 ko minifiés) : Vite signale
son seuil de 500 ko. Il est volontairement isolé du bundle initial, non préchargé
dans le HTML et inutile en mode statique. La scène précédente supprimée par
l'audit de performance demandait environ 1,71 Mo de textures ; cette version ne
réintroduit pas ces fichiers lourds.

Toutes les images sont importées depuis `client/src/assets/earth-loader` : Vite
leur donne des noms avec empreinte. Le cache `immutable` existant du serveur
s'applique donc sans modification du backend. Aucune URL distante n'est appelée
par le loader. Three.js et ses types sont réintroduits pour ce seul rendu, après leur retrait
du nettoyage récent des dépendances inutilisées sur `main`. Les autres
dépendances supprimées par ce nettoyage restent supprimées.

### Travail GPU et nettoyage

- Cadence plafonnée à **30 images/s**, DPR à **1,5**, canvas à **900 × 900** maximum.
- Pas de passe de bloom/post-traitement, pas d'ombres calculées, pas de simulation
  de nuages volumétriques ; les halos utilisent de petits shaders et sprites.
- Boucle arrêtée quand le document est masqué ou le visuel hors viewport.
- Reprise avec une horloge bornée, sans bond de rotation.
- `ResizeObserver`, observateur d'intersection, timers et RAF nettoyés au démontage.
- Fetchs annulables, bitmaps décodés tardivement fermés, géométries, matériaux,
  textures et contexte GPU libérés. Chaque montage possède son propre canvas.

## Accessibilité et variantes

Le visuel et les panneaux sont décoratifs (`aria-hidden`, image à `alt=""`).
Le conteneur garde `role="status"`, `aria-live="polite"`, `aria-busy`, un message
personnalisable et les textes accessibles. Aucun `aria-valuenow` fictif.

Les variantes `full`, `light`, `compact` restent compatibles. Le mode compact
masque panneaux et pictogrammes trop petits. La réduction des mouvements couvre
**tout** le loader, indicateur et transition compris.

## Aperçu isolé pour relecture

```sh
pnpm exec vite --host 0.0.0.0
# Ouvrir /loader-preview.html
```

Cette entrée est réservée au développement, sans API ni authentification et sans
import dans `App`. Elle n'est pas une route de production et n'est pas incluse
dans le build standard. Elle permet de tester les variantes, le mode statique,
la fin du chargement et son redémarrage. `?capture=1` masque les contrôles.

## Validation

Résultat local : **265 fichiers de tests validés, 1 398 tests réussis, 2 ignorés**.
La compilation TypeScript et le build de production passent également.
Une [capture mobile](images/earth-loader-mobile.webp) accompagne la relecture ;
elle est statique, contrairement au rendu WebGL dans l’aperçu.

- `pnpm check` et `pnpm build`.
- Suite Vitest complète ; tests de mouvement, rendu HTML, cycle de vie et budget
  des assets. `happy-dom` est ajouté **uniquement comme dépendance de test**.
- Tests du composant : chargement bref, animation, arrêt hors viewport/onglet,
  mode réduit, économie de données, erreur WebGL/texture, perte de contexte,
  résolution asynchrone après démontage, sortie et redémarrage.
- Vérifications Chromium/WebGL (SwiftShader dans l'environnement de validation) :
  320 × 640, 390 × 844, 768 × 1024 et 1440 × 900, sans débordement horizontal ;
  arrêt effectif des appels de dessin hors viewport ; perte réelle de contexte ;
  mode réduit, Save-Data, WebGL indisponible et texture bloquée ; fin/redémarrage ;
  aucune erreur JavaScript non interceptée.
- Ces essais ne mesurent pas la cadence sur un téléphone physique et ne testent
  pas les fournisseurs météo réels : le périmètre est le loader.

## Régénérer le poster

Sur l'aperçu Vite, dans la console navigateur :

```js
const { createEarthLoaderScene } = await import(
  "/src/components/weather/earthLoaderScene.ts"
);
const canvas = document.createElement("canvas");
const controller = new AbortController();
const scene = await createEarthLoaderScene(canvas, controller.signal);
scene.resize(720);
scene.render(0);
// Lire le framebuffer dans la même tâche que render(), avant son effacement.
const poster = document.createElement("canvas");
poster.width = poster.height = 720;
poster.getContext("2d").drawImage(canvas, 0, 0, 720, 720);
const link = document.createElement("a");
link.download = "earth-poster.webp";
link.href = poster.toDataURL("image/webp", 0.8);
link.click();
scene.dispose();
```

Remplacer ensuite le WebP dans `client/src/assets/earth-loader` et relancer le
test du budget des images. Crédits et licence : `assets/earth-loader/ATTRIBUTION.md`.
