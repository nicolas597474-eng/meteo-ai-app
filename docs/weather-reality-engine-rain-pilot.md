# Weather Reality Engine — pilote pluie

Ce pilote relie le choix de condition déjà utilisé par le tableau de bord à un unique calque de pluie WebGL natif. Il ne modifie ni les données météo, ni leur fusion, ni les prévisions, observations, stations ou scores, et n’ajoute aucune dépendance.

## Entrées et limites

- Le déclenchement reprend uniquement le résultat catégoriel du classifieur visuel existant (libellé ou repli de présence déjà en place), pour pluie/orage. Ce signal ne fournit pas de débit; aucun chiffre n’est utilisé pour l’intensité WebGL.
- Aucun cumul ou nombre de précipitations n’est interprété comme un débit : la période du champ courant n’est pas garantie. `precipitationRateMmPerHour` reste donc `null`.
- Les qualificatifs textuels explicites (« faible », « forte »…) peuvent moduler le nombre et la vitesse des particules comme choix de rendu, pas comme mesure physique. Sans qualificatif, le moteur conserve une densité modérée.
- Le vent est transmis en km/h avec sa direction et ses rafales quand ces valeurs existent. Une direction absente donne une pluie verticale neutre; les valeurs invalides sont ignorées.

## Rendu et dégradation

Le canvas réutilise WebGL natif, limite le nombre de particules et la résolution de dessin, et suspend sa boucle lorsque la page est cachée ou hors écran. Le mode « réduit » baisse fortement la densité et plafonne l’animation; le mode « désactivé » n’initialise pas le renderer. `prefers-reduced-motion` empêche le démarrage de l’animation. Si WebGL ou ses shaders échouent, si le contexte est perdu, ou si la préférence système demande moins de mouvement, l’habillage CSS déjà présent reste le repli; le reste de l’atmosphère n’est pas remplacé.

## Hors périmètre

Les gouttes sur une vitre, la réfraction, la neige, le brouillard, les éclairs, les niveaux graphiques ULTRA/HIGH/LOW, l’instrumentation FPS et la simulation de scènes ne font pas partie de ce premier pilote. Il doit être validé visuellement sur mobile avant d’étendre le moteur.

## Validation visuelle

Le rendu WebGL et le fallback CSS ont été vérifiés dans une émulation Chromium de 390 × 844 px, avec conditions et vent synthétiques, sans appel aux API météo. Cette capture est une émulation, pas un essai sur un téléphone physique; la validation sur appareil réel reste à faire avant d’étendre le périmètre.
