var studyArea = ee.FeatureCollection('users/tiffanymichelle/StudyAreaHilir').geometry();
var banjir    = ee.FeatureCollection('users/tiffanymichelle/HistoriBanjir2010-2020');
var SCALE = 30;

// --- Select RWs that lie mostly inside the study area (>= 50%) ---
var rw = banjir.filterBounds(studyArea).map(function(f) {
  var rwArea     = f.geometry().area(50);
  var interArea  = f.geometry().intersection(studyArea, 50).area(50);
  return f.set({ luas_rw: rwArea, frac_dalam: interArea.divide(rwArea) });
}).filter(ee.Filter.gt('frac_dalam', 0.5));

print('Number of selected RWs (>50% inside study area):', rw.size());
Map.centerObject(studyArea, 11);
Map.addLayer(studyArea, {color: 'yellow'}, 'Study area boundary');
Map.addLayer(rw, {color: 'red'}, 'Selected RWs');

// --- Sentinel-1 dry-season composite (June-September) ---
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(studyArea).filterDate('2018-01-01', '2021-01-01')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .select(['VV', 'VH']);
var dryComposite = s1.filter(ee.Filter.calendarRange(6, 9, 'month')).median()
  .rename(['VV_dry', 'VH_dry']);

// --- Static topographic / hydrological / land-cover layers ---
var dem   = ee.Image('USGS/SRTMGL1_003').rename('elevation');
var slope = ee.Terrain.slope(dem).rename('slope');
var merit = ee.Image('MERIT/Hydro/v1_0_1');
var hand  = merit.select('hnd').rename('hand');
var upa   = merit.select('upa').rename('upstream_area');
var riverMask = merit.select('wth').gt(0).unmask(0);
var distRiver = riverMask
  .fastDistanceTransform({neighborhood: 200, units: 'pixels'})
  .sqrt().reproject({crs: merit.projection()})
  .multiply(ee.Number(merit.projection().nominalScale()))
  .rename('dist_river');
var twi = upa.multiply(1e6)
  .divide(slope.multiply(Math.PI / 180).tan().max(0.001))
  .log().rename('twi');
var lulc     = ee.ImageCollection('ESA/WorldCover/v100').first();
var builtup  = lulc.eq(50).rename('builtup');    // built-up fraction
var vegetasi = lulc.eq(10).rename('vegetasi');   // tree-cover fraction

// Absolute band stack (identical for every radius)
var absBands = ee.Image.cat([
  dryComposite, dem, slope, hand, upa, distRiver, twi, builtup, vegetasi
]);

// Zonal reducers: mean + min + max + stdDev
var reducers = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.min(),    sharedInputs: true})
  .combine({reducer2: ee.Reducer.max(),    sharedInputs: true})
  .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true});

// Detrending: subtract the local mean within a circular kernel
function makeRelative(img, srcName, outName, kernel) {
  var localTrend = img.select(srcName).reduceNeighborhood({
    reducer: ee.Reducer.mean(), kernel: kernel, skipMasked: false
  }).rename(outName + '_trend');
  return img.select(srcName).subtract(localTrend).rename(outName);
}

// Build + export one table per radius
function exportForRadius(radius, description) {
  var kernel = ee.Kernel.circle({radius: radius, units: 'meters'});
  var relBands = ee.Image.cat([
    makeRelative(dem,       'elevation',     'elevation_rel',     kernel),
    makeRelative(hand,      'hand',          'hand_rel',          kernel),
    makeRelative(slope,     'slope',         'slope_rel',         kernel),
    makeRelative(twi,       'twi',           'twi_rel',           kernel),
    makeRelative(distRiver, 'dist_river',    'dist_river_rel',    kernel),
    makeRelative(upa,       'upstream_area', 'upstream_area_rel', kernel)
  ]);

  // keep the SAME band order as the original script
  var stack = ee.Image.cat([
    dryComposite, dem, slope, hand, upa, distRiver, twi, builtup, vegetasi,
    relBands.select('elevation_rel'),
    relBands.select('hand_rel'),
    relBands.select('slope_rel'),
    relBands.select('twi_rel'),
    relBands.select('dist_river_rel'),
    relBands.select('upstream_area_rel')
  ]);

  var rwStats = stack.reduceRegions({
    collection: rw, reducer: reducers, scale: SCALE, tileScale: 4
  });
  var tableNoGeom = rwStats.map(function(f) { return ee.Feature(null, f.toDictionary()); });

  Export.table.toDrive({
    collection: tableNoGeom,
    description: description,
    folder: 'SkripsiBanjir',
    fileFormat: 'CSV'
  });
}

// Radii to test. r1500 reuses the original file name = the paper dataset.
exportForRadius(500,  'rw_ciliwung_sens_r500');
exportForRadius(1000, 'rw_ciliwung_sens_r1000');
exportForRadius(1500, 'rw_ciliwung_sens_r1500');   // yg kita pilih
exportForRadius(2000, 'rw_ciliwung_sens_r2000');
exportForRadius(3000, 'rw_ciliwung_sens_r3000');

print('Created 5 export tasks. Open the Tasks tab and run each one.');