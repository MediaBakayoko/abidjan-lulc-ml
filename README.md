# Cartographie LULC du District d'Abidjan par Machine Learning (Random Forest)

Classification de l'occupation du sol (Land Use / Land Cover) du District d'Abidjan par apprentissage supervisé, à partir d'imagerie satellite Sentinel-2 et d'un classificateur Random Forest natif à Google Earth Engine.

## Méthode

### 1. Image source et prédicteurs

Composite médian Sentinel-2 SR Harmonized (résolution 10m), construit sur 81 scènes couvrant janvier 2025 à mars 2026, filtrées à moins de 40% de nébulosité et masquées des nuages/cirrus (bande QA60). Cette fenêtre élargie a été nécessaire pour obtenir une couverture spatiale complète (voir section Limites).

9 bandes prédictrices ont été utilisées :
- 6 bandes spectrales brutes : B2 (bleu), B3 (vert), B4 (rouge), B8 (proche infrarouge), B11, B12 (infrarouge court)
- 3 indices spectraux dérivés : NDVI (végétation), NDWI (eau), NDBI (bâti)

### 2. Points d'entraînement

Les classes de référence ont été dérivées d'ESA WorldCover (10m, 2021), regroupées en 6 classes LULC pertinentes pour le contexte urbain/périurbain d'Abidjan : Eau, Végétation dense, Végétation herbeuse/arbustive, Cultures, Bâti, Sol nu. 3000 points ont été échantillonnés de façon stratifiée (proportionnelle à la surface de chaque classe), puis séparés en 70% entraînement (2095 points) / 30% validation (905 points).

**Important** : WorldCover est utilisé ici comme référence de vraisemblance pour générer des points d'entraînement à grande échelle, pas comme vérité terrain vérifiée. C'est une limite méthodologique assumée (voir section Limites).

### 3. Classification

Un classificateur Random Forest (100 arbres, `ee.Classifier.smileRandomForest`) a été entraîné sur les 2095 points d'entraînement, puis appliqué à l'ensemble de la zone d'étude.

### 4. Validation

La performance a été évaluée sur les 905 points de validation indépendants (non vus pendant l'entraînement), via une matrice de confusion, la précision globale et l'indice Kappa.

## Résultats

| Indicateur | Valeur |
|---|---|
| Précision globale | 57,5 % |
| Indice Kappa | 0,49 |
| Variable la plus discriminante | NDVI |

### Précision par classe (précision producteur)

| Classe | Précision |
|---|---|
| Eau | 92,5 % |
| Végétation dense | 60,0 % |
| Végétation herbeuse/arbustive | 36,5 % |
| Cultures | 34,5 % |
| Bâti | 64,4 % |
| Sol nu | 52,7 % |

### Surface par classe (km²)

| Classe | Surface (km²) |
|---|---|
| Eau | 312,5 |
| Végétation dense | 504,9 |
| Végétation herbeuse/arbustive | 311,0 |
| Cultures | 143,8 |
| Bâti | 297,5 |
| Sol nu | 146,0 |

## Limites méthodologiques

Cette section documente honnêtement les contraintes et choix de compromis faits au cours de l'étude.

**Précision modérée (Kappa 0,49).** Ce niveau de précision, bien qu'exploitable pour une vue d'ensemble, reste nettement inférieur à celui obtenu sur nos analyses de classification d'habitat précédentes (Kappa 0,85 sur la qualité du logement du Grand Abidjan). Les classes "Végétation herbeuse/arbustive" et "Cultures" sont les plus confondues entre elles et avec le bâti, ce qui est cohérent avec la difficulté bien documentée de distinguer ces types de couverture par signature spectrale seule dans un paysage urbain/périurbain mixte et fragmenté.

**Compromis couverture spatiale vs précision temporelle.** Un premier essai avec une fenêtre temporelle resserrée à une seule saison sèche (novembre 2025 - mars 2026, filtre nuage strict à 20%) donnait une précision globale plus élevée (63,5%, Kappa 0,56) mais laissait un trou de données sur environ 35% de la zone d'étude (nord du cadrage), faute de scènes Sentinel-2 suffisamment dégagées sur cette période précise. L'élargissement à 15 mois avec un seuil de nébulosité plus permissif (40%) a permis d'atteindre une couverture quasi complète (99,9%) au prix d'une légère baisse de précision, probablement liée à l'introduction de variabilité saisonnière (végétation en phase de croissance vs sénescence) dans un composite censé représenter un état unique. Ce compromis a été choisi délibérément : une carte complète mais légèrement moins précise est plus utile qu'une carte précise mais trouée.

**Dépendance à ESA WorldCover comme référence d'entraînement.** Faute de points de vérité terrain collectés physiquement sur le District d'Abidjan, les points d'entraînement et de validation reposent tous deux sur la même source (WorldCover), ce qui ne constitue pas une validation indépendante au sens strict. La précision rapportée mesure donc la capacité du modèle Random Forest à reproduire la classification WorldCover à partir des bandes Sentinel-2, pas sa conformité à une réalité de terrain vérifiée de façon indépendante.

**Confusion bâti / sol nu / végétation rase.** Comme documenté dans nos travaux précédents sur le cropland de Korhogo, la distinction entre sol nu, bâti diffus et végétation herbeuse rase est structurellement difficile par télédétection optique seule dans les paysages ouest-africains, où ces trois classes partagent des signatures spectrales proches en saison sèche.

## Fichiers

- `scripts/lulc_random_forest_abidjan.js` — script Google Earth Engine complet (préparation des données, entraînement Random Forest, validation, statistiques, export GeoTIFF)
- `maps/lulc_classification_rf.png` — carte de classification LULC finale
- `maps/composite_vraies_couleurs.png` — composite Sentinel-2 vraies couleurs de référence

## Auteur

Media Marcel Bakayoko — Géomaticien, expert SIG, GeoAI & MRV
