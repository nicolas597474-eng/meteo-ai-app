# Paramètres d’embed Windy vérifiés le 25 août 2026

Le configurateur officiel Windy génère `metricWind=km/h` lorsque l’unité de vent « km/h » est choisie. Avec l’option « Show marker » activée, il ajoute `detailLat`, `detailLon` et `marker=true` à l’URL d’embed.

Le marqueur doit donc être fourni par l’iframe Windy aux coordonnées du lieu actif ; un marqueur HTML centré au-dessus de l’iframe ne doit pas être utilisé, car il resterait au centre de l’écran lors d’un déplacement de carte.

Source : https://embed.windy.com/
