/**
 * ============================================================================
 * CARTE LULC (LAND USE / LAND COVER) PAR MACHINE LEARNING - DISTRICT D'ABIDJAN
 * Classification supervisee Random Forest sur Sentinel-2 + indices spectraux
 *
 * Points d'entrainement generes a partir d'ESA WorldCover (10m, 2021), utilise
 * comme reference de vraisemblance plutot que verite terrain (voir limites).
 * ============================================================================
 */

var abidjan = ee.Geometry.Rectangle([-4.20, 5.20, -3.80, 5.55]);
Map.centerObject(abidjan, 10);

// ============================================================================
// 1. COMPOSITE SENTINEL-2 SANS NUAGE (saison seche 2025-2026)
// ============================================================================
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
  return image.updateMask(mask).divide(10000).copyProperties(image, ['system:time_start']);
}

// Fenetre elargie sur 15 mois + seuil nuage permissif (40%) pour assurer une
// couverture spatiale complete (99.9%) - un seuil plus strict laissait un trou
// de donnees sur environ 35% de la zone (voir limites documentees dans README)
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(abidjan).filterDate('2025-01-01', '2026-03-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40)).map(maskS2clouds);

var composite = s2.median().clip(abidjan);

// ============================================================================
// 2. INDICES SPECTRAUX (predicteurs complementaires)
// ============================================================================
var ndvi = composite.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndwi = composite.normalizedDifference(['B3', 'B8']).rename('NDWI');
var ndbi = composite.normalizedDifference(['B11', 'B8']).rename('NDBI');

var bands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];
var predictors = composite.select(bands).addBands([ndvi, ndwi, ndbi]);

// ============================================================================
// 3. CLASSES ET RECLASSIFICATION DEPUIS ESA WORLDCOVER
// ============================================================================
// Classes WorldCover regroupees en 6 classes LULC simplifiees et pertinentes
// pour le contexte urbain/periurbain d'Abidjan :
// 1 = Eau, 2 = Vegetation dense (foret/mangrove), 3 = Vegetation herbeuse/arbustive,
// 4 = Cultures, 5 = Bati, 6 = Sol nu

var worldcover = ee.ImageCollection('ESA/WorldCover/v200').first().clip(abidjan);

var fromClasses = [10, 20, 30, 40, 50, 60, 80, 90, 95];
var toClasses =   [2,  3,  3,  4,  5,  6,  1,  1,  2];
var lulcReference = worldcover.remap(fromClasses, toClasses).rename('classe');

var classNames = ['Eau', 'Vegetation dense', 'Vegetation herbeuse/arbustive', 'Cultures', 'Bati', 'Sol nu'];
var classColors = ['0000FF', '006400', '90EE90', 'FFD700', 'FF0000', 'D2B48C'];

// ============================================================================
// 4. ECHANTILLONNAGE STRATIFIE DES POINTS D'ENTRAINEMENT
// ============================================================================
var trainingImage = predictors.addBands(lulcReference);

var trainingPoints = trainingImage.stratifiedSample({
  numPoints: 500,
  classBand: 'classe',
  region: abidjan,
  scale: 10,
  seed: 42,
  geometries: true
});
print('Nombre total de points d\'entrainement:', trainingPoints.size());

// Separation 70% entrainement / 30% validation
var withRandom = trainingPoints.randomColumn('random', 42);
var trainSet = withRandom.filter(ee.Filter.lt('random', 0.7));
var testSet = withRandom.filter(ee.Filter.gte('random', 0.7));
print('Points entrainement:', trainSet.size());
print('Points validation:', testSet.size());

// ============================================================================
// 5. ENTRAINEMENT RANDOM FOREST
// ============================================================================
var predictorBands = bands.concat(['NDVI', 'NDWI', 'NDBI']);

var classifier = ee.Classifier.smileRandomForest(100).train({
  features: trainSet,
  classProperty: 'classe',
  inputProperties: predictorBands
});

// ============================================================================
// 6. CLASSIFICATION DE L'IMAGE COMPLETE
// ============================================================================
var classified = predictors.classify(classifier).rename('LULC_2026');

// ============================================================================
// 7. VALIDATION - MATRICE DE CONFUSION ET PRECISION
// ============================================================================
var testClassified = testSet.classify(classifier);
var confusionMatrix = testClassified.errorMatrix('classe', 'classification');
print('Matrice de confusion:', confusionMatrix);
print('Precision globale:', confusionMatrix.accuracy());
print('Indice Kappa:', confusionMatrix.kappa());
print('Precision par classe (producer):', confusionMatrix.producersAccuracy());
print('Precision par classe (consumer):', confusionMatrix.consumersAccuracy());

// Importance des variables
print('Importance des variables (Random Forest):', classifier.explain());

// ============================================================================
// 8. VISUALISATION
// ============================================================================
Map.addLayer(composite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'Composite vraies couleurs', false);
Map.addLayer(classified, {min: 1, max: 6, palette: classColors}, 'Classification LULC (Random Forest)');

// ============================================================================
// 9. LEGENDE
// ============================================================================
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
legend.add(ui.Label('LULC Abidjan - Random Forest', {fontWeight: 'bold', fontSize: '14px'}));
legend.add(ui.Label('Sentinel-2, saison seche 2025-2026', {fontSize: '11px', color: '666666'}));
var makeRow = function(color, label) {
  var colorBox = ui.Label('', {backgroundColor: color, padding: '8px', margin: '0 4px 4px 0'});
  var description = ui.Label(label, {margin: '0 0 4px 6px'});
  return ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal'));
};
for (var i = 0; i < classNames.length; i++) {
  legend.add(makeRow('#' + classColors[i], classNames[i]));
}
Map.add(legend);

// ============================================================================
// 10. STATISTIQUES DE SURFACE PAR CLASSE
// ============================================================================
var areaImage = ee.Image.pixelArea().divide(1e6).addBands(classified);
var areaByClass = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'classe'}),
  geometry: abidjan, scale: 10, maxPixels: 1e9
});
print('Surface par classe (km2):', areaByClass);

// ============================================================================
// 11. EXPORTS
// ============================================================================
Export.image.toDrive({
  image: classified, description: 'Abidjan_LULC_RandomForest_2026',
  folder: 'GEE_Exports_LULC_Abidjan', region: abidjan, scale: 10, maxPixels: 1e9, fileFormat: 'GeoTIFF'
});

print('Miniature classification:', classified.getThumbURL({min: 1, max: 6, palette: classColors, dimensions: '1024x900', region: abidjan}));
print('Miniature composite:', composite.getThumbURL({bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3, dimensions: '1024x900', region: abidjan}));
