# Evaluating Spatial Generalization of Flood-Risk Models

This project evaluates machine-learning classification of flood risk for Community Associations (RWs) in the downstream Ciliwung watershed, Jakarta. The study asks whether models trained on labeled RWs can transfer to regions not represented during training, and whether feature representations or class-imbalance strategies improve that transfer.

## Background

Historical flood labels are available for 182 of the 365 RWs in the study area. A model evaluated with a conventional random split can benefit from similar RWs appearing in both training and test sets, so this project also tests on entire held-out Jakarta regions. The labels are consolidated into three ordered classes: Low, Medium, and High.

## Objectives

- Build an RW-level flood-risk classification workflow from multiple geospatial data sources.
- Compare random and region-held-out validation to measure spatial generalization.
- Test absolute, locally detrended relative, and combined features, alongside class weighting and random oversampling.
- Use the best-performing configuration to produce exploratory predictions for the 183 unlabeled RWs.

## Methodology

Google Earth Engine (GEE) extracts 30 m features from SRTM elevation, MERIT Hydro, ESA WorldCover, and dry-season Sentinel-1. RWs with less than 50% of their area inside the study boundary are excluded. Zonal statistics summarize the raster features for each RW. Relative features subtract a local mean from elevation, HAND, slope, TWI, distance to river, and upstream area; the main analysis uses a 1,500 m neighborhood.

The notebook compares Random Forest and XGBoost with five-fold `GroupKFold` by Jakarta region. It evaluates absolute, relative, and combined features, then compares baseline training, class weighting, and random oversampling. Oversampling is applied only to training folds. A repeated stratified random protocol is also compared with the spatial protocol. Macro-F1 is the primary metric; pooled out-of-fold metrics and other class-level and agreement metrics provide additional context.

For radius sensitivity, GEE exports relative and combined feature tables using 500, 1,000, 1,500, 2,000, and 3,000 m neighborhoods. The notebook evaluates each table using the same spatial folds and models.

## Results

Absolute features were more stable across regions than relative or combined features. For the class-imbalance experiment, Random Forest with training-fold oversampling achieved the highest spatial Macro-F1: **0.432 ± 0.103**. The final model's pooled out-of-fold Macro-F1 was **0.619**, with a Quadratic Weighted Kappa of **0.613**. Region-level Macro-F1 varied from **0.333 in North Jakarta** to **0.618 in West Jakarta**; North Jakarta's score is based on only two labeled RWs and should be interpreted cautiously. The random-versus-spatial comparison also shows that pooled metrics can conceal substantial region-to-region variation.

The selected configuration, absolute features with Random Forest and oversampling, was applied to the 183 unlabeled RWs: 127 were predicted Low, 41 Medium, and 15 High. These are exploratory screening predictions, not independently verified labels.

## Conclusion

The results favor retaining absolute geographic context for this study: local detrending did not improve spatial transfer, while oversampling improved minority-class performance. Spatial validation reveals meaningful variation between Jakarta regions that aggregate scores alone can hide. More labeled RWs, hyperparameter optimization, and features that capture coastal exposure, subsidence, or temporal SAR conditions are useful next steps. The findings apply to this downstream Ciliwung study area and are limited by the small labeled sample and only five spatial groups.

## Code Flow

### Main feature extraction and evaluation

1. [`gee/feature_extraction.js`](https://code.earthengine.google.com/62783baf54ef20b18334b5c3af93b29c) selects RWs with more than half their area inside the study boundary, builds the geospatial layers, calculates absolute and 1,500 m relative features, and exports RW-level CSV and GeoJSON tables from GEE.
2. Download the GEE exports into `assets/`. The notebook loads the CSV, maps the original labels to Low/Medium/High, and evaluates feature representations and model configurations using spatial cross-validation. It then compares random and spatial validation, reports performance, and predicts labels for unlabeled RWs.

### Detrending-radius sensitivity analysis

1. [`gee/sensitivity_analysis.js`](https://code.earthengine.google.com/d82ee5d47601d2982ab1db51d936bf04) repeats relative-feature generation at 500, 1,000, 1,500, 2,000, and 3,000 m and creates one GEE export task per radius.
2. Download those CSV exports into `assets/` using the filenames configured in the notebook (`rw_ciliwung_sens_r500.csv` through `rw_ciliwung_sens_r3000.csv`).
3. The notebook evaluates relative and combined features for each radius with Random Forest and XGBoost under five-fold spatial `GroupKFold`, then writes the sensitivity results and figure under `results/`.

