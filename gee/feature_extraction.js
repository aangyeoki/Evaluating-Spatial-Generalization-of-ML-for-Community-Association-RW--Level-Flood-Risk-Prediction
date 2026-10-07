var studyArea = ee.FeatureCollection('users/tiffanymichelle/StudyAreaHilir').geometry();
var banjir    = ee.FeatureCollection('users/tiffanymichelle/HistoriBanjir2010-2020');
var SCALE = 30;

// seleksi rw yg dipilih yg benar2 di dlm area hilir
var rw = banjir.filterBounds(studyArea).map(function(f) {
  var luasRW = f.geometry().area(50);
  var luasIrisan = f.geometry().intersection(studyArea, 50).area(50);
  return f.set({
    luas_rw: luasRW,
    frac_dalam: luasIrisan.divide(luasRW)   // proporsi RW di dalam DAS
  });
}).filter(ee.Filter.gt('frac_dalam', 0.5));  // minimal separuh RW di dalam

print('Jumlah RW (>50% di dalam DAS):', rw.size());
print('Sebaran kategori:', rw.aggregate_histogram('Kategori_B'));
Map.centerObject(studyArea, 11);
Map.addLayer(studyArea, {color: 'yellow'}, 'Batas hilir Ciliwung');
Map.addLayer(rw, {color: 'red'}, 'RW terpilih');

// sm kyk sblm revisi
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(studyArea).filterDate('2018-01-01', '2021-01-01')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .select(['VV', 'VH']);
var kering = s1.filter(ee.Filter.calendarRange(6, 9, 'month')).median()
  .rename(['VV_dry', 'VH_dry']);

var dem   = ee.Image('USGS/SRTMGL1_003').rename('elevation');
var slope = ee.Terrain.slope(dem).rename('slope');
var merit = ee.Image('MERIT/Hydro/v1_0_1');
var hand  = merit.select('hnd').rename('hand');
var upa   = merit.select('upa').rename('upstream_area');
var maskSungai = merit.select('wth').gt(0).unmask(0);
var jarakSungai = maskSungai
  .fastDistanceTransform({neighborhood: 200, units: 'pixels'})
  .sqrt().reproject({crs: merit.projection()})
  .multiply(ee.Number(merit.projection().nominalScale()))
  .rename('dist_river');
var twi = upa.multiply(1e6)
  .divide(slope.multiply(Math.PI / 180).tan().max(0.001))
  .log().rename('twi');
var lulc = ee.ImageCollection('ESA/WorldCover/v100').first();
var builtup = lulc.eq(50).rename('builtup');   // fraksi lahan terbangun
var vegetasi = lulc.eq(10).rename('vegetasi'); // fraksi tutupan pohon

// FITUR RELATIF — detrending spasial radius 1.5 km   <-- BARU
// Tujuan: buang sinyal "lokasi absolut" (isu spasial),
// sisakan variasi mikro-topografi lokal yang relevan ke banjir

var RADIUS_DETREND = 1500; // meter
var kernel = ee.Kernel.circle({radius: RADIUS_DETREND, units: 'meters'});

function buatRelatif(img, namaAsli, namaBaru) {
  var trendLokal = img.select(namaAsli).reduceNeighborhood({
    reducer: ee.Reducer.mean(),
    kernel: kernel,
    skipMasked: false
  }).rename(namaBaru + '_trend');
  return img.select(namaAsli).subtract(trendLokal).rename(namaBaru);
}

var elevation_rel  = buatRelatif(dem,         'elevation',      'elevation_rel');
var hand_rel       = buatRelatif(hand,        'hand',           'hand_rel');
var slope_rel      = buatRelatif(slope,       'slope',          'slope_rel');
var twi_rel        = buatRelatif(twi,         'twi',            'twi_rel');
var dist_river_rel = buatRelatif(jarakSungai, 'dist_river',     'dist_river_rel');
var upa_rel        = buatRelatif(upa,         'upstream_area',  'upstream_area_rel');

var stack = ee.Image.cat([
  kering, dem, slope, hand, upa, jarakSungai, twi, builtup, vegetasi,
  elevation_rel, hand_rel, slope_rel, twi_rel, dist_river_rel, upa_rel   // <-- BARU
]);

// statistik zonal per rw
var reducers = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.min(),    sharedInputs: true})
  .combine({reducer2: ee.Reducer.max(),    sharedInputs: true})
  .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true});
var rwStats = stack.reduceRegions({
  collection: rw,
  reducer: reducers,
  scale: SCALE,
  tileScale: 4        // naikkan ke 8 atau 16 kalau kena error memori
});

// geometri ga msk ke csv biar ringan
var hasil = rwStats.map(function(f) {
  return ee.Feature(null, f.toDictionary());
});

Export.table.toDrive({
  collection: hasil,
  description: 'rw_ciliwung_hilir_v5_relatif',   // <-- nama diganti, biar tidak menimpa v4
  folder: 'SkripsiBanjir',
  fileFormat: 'CSV'
});

// ada rasternya jg buat bikin map
Export.table.toDrive({
  collection: rwStats,
  description: 'rw_ciliwung_hilir_v5_relatif_geom',   // <-- nama diganti juga
  folder: 'SkripsiBanjir',
  fileFormat: 'GeoJSON'
});