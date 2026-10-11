# Diagnostic AROME — « est-ce la bonne clé API ? »

Date : 2026-10-11 · branche `arena/ee0b52f7-meteo-ai-app` · HEAD `bb54b14`

## 1. Cartographie : il existe trois « AROME » distincts dans le code

| # | Chemin | Où | Source des données | Clé utilisée |
|---|--------|----|--------------------|--------------|
| 1 | **AROME de production** (fusion horaire/journalière, AI Lab, classement, historique) | `server/weatherServices.ts:47` (`meteofrance_arome_france_hd`), requêtes `?models=` en `:145` (daily) et `:1196` (hourly) | **Open-Meteo** `https://api.open-meteo.com/v1/forecast` | **aucune clé** |
| 2 | **Comparaison shadow AROME WCS** (panneau admin, page Météo détaillée) | `server/aromeHondeghemShadow.ts`, routes `server/routers/weather.ts:679-682` | **Portail Météo-France** `public-api.meteofrance.fr/public/arome/1.0/wcs/MF-NWP-HIGHRES-AROME-001-FRANCE-WCS` | `METEOFRANCE_API_KEY` |
| 3 | `fetchMeteoFrance()` — « prévisions officielles MF » | `server/realWeatherAPIs.ts:143-179` (+ `scripts/test-real-apis.mjs:93+`) | `rpcache-aa.meteofrance.com/internet2018client/2.0/forecast` | `METEOFRANCE_API_KEY` (**mauvais service**) |

### Conséquence directe

**Si AROME manque dans les prévisions affichées (fusion, AI Lab, tableau des modèles), ce n'est pas un problème de clé** : le chemin 1 n'en utilise aucune. La cause est alors l'horizon du modèle — AROME France HD ne couvre que **2 jours** (`server/forecastVariableCoverage.ts:70`, `server/providerRunCapabilities.ts:34`) alors que la collecte demande 16 jours (`weatherServices.ts:145`). AROME est donc normalement absent de J+2 à J+15.

**La clé ne peut être en cause que sur le panneau admin « AROME officiel ↔ Open-Meteo »** (chemin 2) et sur le chemin 3.

## 2. Défaut confirmé : le chemin 3 envoie la clé au mauvais service

`server/realWeatherAPIs.ts` :

1. `getMFBearerToken()` (`:113`) échange `METEOFRANCE_API_KEY` contre un jeton OAuth2 sur `https://portail-api.meteofrance.fr/token` — en-tête `Authorization: Basic <APPLICATION_ID>` (`:122`).
2. Ce jeton **portail-api** est ensuite envoyé à `https://rpcache-aa.meteofrance.com/internet2018client/2.0/forecast` (`:156-165`).

Or `rpcache-aa.meteofrance.com/internet2018client/2.0/*` est l'API **privée du site et de l'appli mobile** Météo-France : elle exige le jeton de l'application (JWT type `__Wj7dVSTjV9…__`, ou `?token=`), pas un jeton OAuth2 du portail. Les deux services ne partagent pas d'autorité d'authentification.

→ **401 garanti**, absorbé silencieusement par `console.warn("[MF] Forecast HTTP 401")` + `return null`, puis repli automatique sur Open-Meteo. C'est exactement un « problème de clé »… mais par construction, pas par mauvaise valeur.

Statut actuel : ce chemin est **mort en production** (les services publics ont été retirés, `WEATHER_SERVICES.public = []`, `server/publicForecastRemoval.test.ts`). Il survit dans `realWeatherAPIs.ts` et dans `scripts/test-real-apis.mjs`. Il faut soit le corriger (endpoint portail officiel), soit le supprimer — mais il ne peut en aucun cas expliquer un dysfonctionnement visible dans l'application.

## 3. Le chemin 2 (shadow AROME) : la clé est techniquement correcte, mais trois pièges la font échouer

L'échange est conforme à la documentation Météo-France :

```
POST https://portail-api.meteofrance.fr/token
Authorization: Basic <APPLICATION_ID>         # base64(client_id:client_secret)
grant_type=client_credentials
→ Authorization: Bearer <access_token> sur le WCS AROME
```

Pièges :

1. **`METEOFRANCE_API_KEY` doit contenir l'`APPLICATION_ID` base64**, tel qu'affiché dans la commande curl du portail (*Mes API › Générer un token*). Un `client_id:client_secret` en clair, un `access_token` (JWT) ou le jeton `__…__` du site mobile produisent tous un 401. Le code ne valide **rien** : il se contente de `if (!oauthApplicationId?.trim())` (`aromeHondeghemShadow.ts:489`).
2. **L'`APPLICATION_ID` est propre à chaque abonnement.** Un identifiant généré pour une autre API du portail (ARPEGE, vigilance, stations…) est refusé, ou donne un jeton valide qui se fait rejeter en 401/403 sur le WCS AROME.
3. **Le compte doit être abonné au paquet AROME haute résolution** (`MF-NWP-HIGHRES-AROME-001-FRANCE-WCS`). Sans abonnement : jeton obtenu, puis 403/401 sur `GetCapabilities`.

Le nom de la variable entretient l'ambiguïté : `.env.example:74` annonce « MeteoFrance API Key — `your_meteofrance_api_key` », ce qui invite à coller autre chose que l'`APPLICATION_ID`.

Autres limites du shadow, indépendantes de la clé (et normales) :

- le dernier run du catalogue est parfois encore incomplet → `GetCoverage` renvoie 403 sur les échéances lointaines, d'où un statut « comparaison partielle » ;
- `MAX_HOURS = 24` et appariement strict des échéances avec Open-Meteo Single Runs : sans intersection, « request-impossible » sans substitution de run.

## 4. Comment savoir dans quel cas vous êtes

Le panneau admin affiche un statut explicite (`client/src/pages/WeatherDetails.tsx:160-163`) :

| Statut affiché | Interprétation |
|----------------|----------------|
| **Clé AROME manquante** (`missing-key`) | `METEOFRANCE_API_KEY` vide/absente côté serveur |
| **Authentification AROME refusée** (`authentication-error`) | 401/403 sur `/token` **ou** sur le WCS ⇒ clé invalide **ou** abonnement AROME absent |
| **Requête impossible** (`request-impossible`) | réseau, catalogue illisible, ou aucune échéance commune aux deux sources |
| **Comparaison partielle** (`partial`) | clé et abonnement OK ; run incomplet ou variable manquante |

Pour trancher entre « clé invalide » et « abonnement absent », lancer :

```bash
node scripts/check-arome-key.mjs            # diagnostic en 4 étapes
node scripts/check-arome-key.mjs --coverage # + un GetCoverage GeoTIFF réel
```

Le script n'affiche jamais la clé ni le jeton (empreintes masquées uniquement) et indique, étape par étape, où ça casse : forme de la valeur → échange OAuth2 → `GetCapabilities` → `DescribeCoverage` → `GetCoverage`. Un 401 à l'étape 1 = clé ; un 401/403 à l'étape 2 avec jeton obtenu = abonnement.

## 5. Correctifs appliqués sur cette branche

1. **Normalisation de `METEOFRANCE_API_KEY`** — nouveau module `server/meteoFranceCredentials.ts` :
   - absent/vide → statut `missing-key` (inchangé) ;
   - JWT ou jeton `__…__` du site mobile → nouveau statut **`invalid-key`**, cause explicite, **aucune requête envoyée** ;
   - paire `client_id:client_secret` en clair → encodée automatiquement en base64 pour l'en-tête `Basic` ;
   - base64 → transmis tel quel ; forme inconnue → transmise telle quelle (comportement historique préservé).
2. **Messages d'authentification précisés** : un 401 sur `/token` indique désormais qu'un `APPLICATION_ID` généré pour une autre API du portail est refusé.
3. **Interface** (`client/src/pages/WeatherDetails.tsx`) : nouveau libellé « Clé AROME inutilisable » (et « Identifiant OAuth inutilisable » pour la vérification DD) ; les deux panneaux admin affichent la cause exacte.
4. **Suppression du chemin 3** : `server/realWeatherAPIs.ts` ne conserve plus que `wmoToConditionFr` ; les adaptateurs morts qui envoyaient un jeton portail-api à l'API privée `rpcache-aa` sont retirés, et `scripts/test-real-apis.mjs` renvoie vers le nouveau diagnostic au lieu de reproduire l'appel fautif.
5. **Documentation** : `.env.example` décrit la valeur attendue (`APPLICATION_ID` base64, abonnement AROME, identifiant propre à chaque API).
6. **Script de diagnostic** `scripts/check-arome-key.mjs` (voir §4).

Non modifié volontairement : le flux AROME de production (Open-Meteo, sans clé). AROME reste absent au-delà de J+1 — horizon documenté de 2 jours du modèle, pas un défaut.

## 6. Validation

- `npx vitest run` : **241 fichiers / 1248 tests verts**, dont 7 nouveaux tests d'identifiant et 2 nouveaux tests shadow (`invalid-key`, encodage de la paire).
- `npx tsc --noEmit` : aucune erreur sur les fichiers modifiés (les 5 erreurs restantes sont préexistantes dans `server/fusionEngine.ts` et `shared/experimentalForecastConfidence.ts`).
