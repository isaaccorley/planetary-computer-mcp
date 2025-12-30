# Planetary Computer Collections

This document provides metadata for all available collections in the Planetary Computer STAC catalog.

| Collection ID                                          | Title                           | Description                          | Spatial Extent   | Temporal Range | Resolution | Data Type  | Typical Use Cases                           | Recommended Tool    |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------ | ---------------- | -------------- | ---------- | ---------- | ------------------------------------------- | ------------------- |
| sentinel-2-l2a                                         | Sentinel-2 Level 2A             | Multispectral optical imagery        | Global           | 2015-Present   | 10-20m     | COG        | NDVI, crop monitoring, land cover           | download_data       |
| naip                                                   | NAIP Aerial Imagery             | High-resolution RGB/IR aerial photos | USA              | 2010-Present   | 0.6-1m     | COG        | Agriculture, urban planning                 | download_data       |
| ms-buildings                                           | Microsoft Buildings             | Building footprints                  | Global (partial) | 2023           | N/A        | GeoParquet | Urban analysis, population density          | download_geometries |
| cop-dem-glo-30                                         | Copernicus DEM GLO-30           | Global digital elevation model       | Global           | 2021           | 30m        | COG        | Terrain analysis, hydrology                 | download_data       |
| esa-worldcover                                         | ESA WorldCover                  | Global land cover classification     | Global           | 2020-2021      | 10m        | COG        | Land use mapping, change detection          | download_data       |
| io-lulc-annual-v02                                     | Impact Observatory LULC         | Annual land use/land cover           | Global           | 2017-2022      | 10m        | COG        | Land change analysis                        | download_data       |
| landsat-c2-l2                                          | Landsat Collection 2 Level 2    | Multispectral optical imagery        | Global           | 1984-Present   | 30m        | COG        | Long-term monitoring, historical analysis   | download_data       |
| sentinel-1-rtc                                         | Sentinel-1 RTC                  | SAR backscatter imagery              | Global           | 2014-Present   | 10m        | COG        | Flood mapping, soil moisture                | download_data       |
| also-dem                                               | ALSO DEM                        | Digital elevation model              | Global           | 2006-2011      | 30m        | COG        | Terrain analysis (alternative)              | download_data       |
| daymet-daily-na                                        | Daymet Daily                    | Daily climate/weather data           | North America    | 1980-Present   | 1km        | Zarr       | Climate analysis, agriculture               | download_data       |
| era5-pds                                               | ERA5 Reanalysis                 | Global climate reanalysis            | Global           | 1979-Present   | 0.25°      | Zarr       | Weather forecasting, research               | download_data       |
| modis-09A1-061                                         | MODIS Surface Reflectance       | 8-day surface reflectance            | Global           | 2000-Present   | 500m       | COG        | Vegetation monitoring, phenology            | download_data       |
| hls2-l30                                               | HLS Landsat                     | Harmonized Landsat/Sentinel          | Global           | 2013-Present   | 30m        | COG        | Time series analysis                        | download_data       |
| hls2-s30                                               | HLS Sentinel-2                  | Harmonized Landsat/Sentinel          | Global           | 2015-Present   | 30m        | COG        | Time series analysis                        | download_data       |
| noaa-cdr-sea-surface-temperature-optimum-interpolation | NOAA CDR SST                    | Sea surface temperature              | Global oceans    | 1981-Present   | 0.25°      | COG        | Ocean monitoring, climate                   | download_data       |
| noaa-cdr-sea-surface-temperature-whoi                  | NOAA CDR SST WHOI               | Sea surface temperature              | Global oceans    | 1981-Present   | 0.25°      | COG        | Ocean monitoring, climate                   | download_data       |
| nasadem                                                | NASADEM                         | Digital elevation model              | Global           | 2000           | 30m        | COG        | Terrain analysis                            | download_data       |
| aster-l1t                                              | ASTER L1T                       | Multispectral thermal imagery        | Global           | 2000-Present   | 15-90m     | COG        | Mineral mapping, thermal analysis           | download_data       |
| chesapeake                                             | Chesapeake Bay Land Cover       | High-res land cover                  | Chesapeake Bay   | 2013-2014      | 1m         | COG        | Wetland mapping, coastal analysis           | download_data       |
| also-palsar                                            | ALSO PALSAR                     | SAR backscatter                      | Global           | 2006-2011      | 12.5-100m  | COG        | Forest monitoring, soil moisture            | download_data       |
| 3dep-seamless                                          | 3DEP Seamless DEM               | High-res elevation                   | USA              | 2010-Present   | 1-10m      | COG        | Terrain analysis, flood modeling            | download_data       |
| gridmet                                                | GridMET                         | Daily surface meteorological data    | Western USA      | 1979-Present   | 4km        | COG        | Drought monitoring, fire weather            | download_data       |
| gpm-imerg-hhr                                          | GPM IMERG                       | High-res precipitation               | Global           | 2000-Present   | 0.1°       | COG        | Flood monitoring, rainfall analysis         | download_data       |
| goes-cmi                                               | GOES CMI                        | Geostationary imagery                | Americas         | 2017-Present   | 0.5-2km    | COG        | Weather monitoring, fire detection          | download_data       |
| goes-glm                                               | GOES GLM                        | Lightning detection                  | Americas         | 2017-Present   | N/A        | COG        | Storm tracking, fire ignition               | download_data       |
| gnatsgo                                                | gNATSGO Soil                    | Soil properties and classifications  | USA              | 2022           | 30m        | COG        | Agriculture, environmental modeling         | download_data       |
| fia                                                    | Forest Inventory Analysis       | Forest inventory plots               | USA              | 2001-Present   | N/A        | GeoParquet | Forest management, carbon assessment        | download_geometries |
| gbif                                                   | GBIF Species Occurrences        | Biodiversity observations            | Global           | Various        | N/A        | GeoParquet | Biodiversity analysis, species distribution | download_geometries |
| gap                                                    | GAP Land Cover                  | Protected area land cover            | USA              | 2011           | 30m        | COG        | Conservation planning                       | download_data       |
| fws-nwi                                                | FWS National Wetlands Inventory | Wetland boundaries                   | USA              | 2016           | N/A        | GeoParquet | Wetland conservation, water quality         | download_geometries |
| esa-cci                                                | ESA CCI Land Cover              | Long-term land cover                 | Global           | 1992-2018      | 300m       | COG        | Land change analysis                        | download_data       |
| era5                                                   | ERA5 Climate                    | Hourly climate data                  | Global           | 1979-Present   | 0.25°      | Zarr       | Climate research, weather analysis          | download_data       |
| eclipse                                                | Eclipse Path                    | Solar eclipse paths                  | Global           | 2024           | N/A        | GeoParquet | Education, event planning                   | download_geometries |
| drcog-lulc                                             | DRCOG Land Use                  | Regional land use                    | Denver region    | 2018           | 1m         | COG        | Urban planning, transportation              | download_data       |
| deltares-floods                                        | Deltares Floods                 | Flood hazard maps                    | Global           | 2020           | 90m        | COG        | Flood risk assessment                       | download_data       |
| deltares-water-availability                            | Deltares Water Availability     | Water stress indicators              | Global           | 2020           | 30 arc-min | COG        | Water resource management                   | download_data       |
| daymet                                                 | Daymet Climate                  | Daily climate data                   | North America    | 1980-Present   | 1km        | Zarr       | Agriculture, ecology                        | download_data       |
| copernicus-dem                                         | Copernicus DEM                  | Digital elevation model              | Global           | 2021           | 30m        | COG        | Terrain analysis                            | download_data       |
| conus404                                               | CONUS404                        | High-res hydrological model          | CONUS            | 1979-Present   | 1km        | COG        | Hydrology, water resources                  | download_data       |
| cil-gdpcir                                             | CIL GDPCIR                      | Climate indicators                   | Global           | 1990-2020      | 0.5°       | COG        | Climate impact analysis                     | download_data       |
| aster-l1t                                              | ASTER L1T                       | Thermal infrared imagery             | Global           | 2000-Present   | 90m        | COG        | Mineral mapping, volcano monitoring         | download_data       |
| 3dep-lidar                                             | 3DEP LiDAR                      | Point cloud data                     | USA              | 2010-Present   | Variable   | COG        | Terrain modeling, forestry                  | download_data       |
| 3dep                                                   | 3DEP Elevation                  | High-res elevation                   | USA              | 2010-Present   | 1-10m      | COG        | Flood modeling, infrastructure              | download_data       |
| usda-cdl                                               | USDA Cropland Data Layer        | Annual crop types                    | USA              | 2008-Present   | 30m        | COG        | Agriculture, crop monitoring                | download_data       |
| usgs-lcmap                                             | USGS LCMAP                      | Land cover change                    | USA              | 1985-Present   | 30m        | COG        | Land change analysis                        | download_data       |
| nrcan-landcover                                        | NRCan Land Cover                | Annual land cover                    | Canada           | 1984-Present   | 30m        | COG        | Forest monitoring, agriculture              | download_data       |
| planet-nicfi                                           | Planet NICFI                    | High-res satellite imagery           | Tropical regions | 2015-Present   | 4.77m      | COG        | Tropical forest monitoring                  | download_data       |
| sentinel-1-grd                                         | Sentinel-1 GRD                  | SAR ground range detected            | Global           | 2014-Present   | 10-40m     | COG        | Interferometry, change detection            | download_data       |
| sentinel-3-olci                                        | Sentinel-3 OLCI                 | Ocean color imagery                  | Global oceans    | 2016-Present   | 300m       | COG        | Ocean productivity, water quality           | download_data       |
| sentinel-3-slstr                                       | Sentinel-3 SLSTR                | Thermal infrared imagery             | Global           | 2016-Present   | 500m-1km   | COG        | Sea surface temperature, fire monitoring    | download_data       |
| sentinel-3-sral                                        | Sentinel-3 SRAL                 | Radar altimetry                      | Global oceans    | 2016-Present   | N/A        | COG        | Sea level, wind speed                       | download_data       |
| sentinel-3-synergy                                     | Sentinel-3 Synergy              | Surface parameters                   | Global           | 2016-Present   | 1km        | COG        | Vegetation, soil moisture                   | download_data       |
| sentinel-5p-l2-netcdf                                  | Sentinel-5P L2                  | Atmospheric composition              | Global           | 2018-Present   | 3.5-7km    | NetCDF     | Air quality, ozone monitoring               | download_data       |
| terraclimate                                           | TerraClimate                    | Monthly climate data                 | Global           | 1958-Present   | 4km        | COG        | Climate analysis, drought monitoring        | download_data       |
| us-census                                              | US Census Blocks                | Census geography                     | USA              | 2020           | N/A        | GeoParquet | Demographic analysis, urban planning        | download_geometries |
| mtbs                                                   | MTBS Fire Boundaries            | Fire perimeters                      | USA              | 1984-Present   | N/A        | GeoParquet | Fire ecology, risk assessment               | download_geometries |
| mobi                                                   | MOBI                            | Mobility data                        | USA              | 2020           | N/A        | GeoParquet | Transportation planning                     | download_geometries |
| kaza-hydroforecast                                     | KAZA Hydroforecast              | Hydrological forecasts               | Southern Africa  | 2020-Present   | 1km        | COG        | Flood forecasting                           | download_data       |
| jrc-gsw                                                | JRC Global Surface Water        | Water occurrence                     | Global           | 1984-2020      | 30m        | COG        | Water resource monitoring                   | download_data       |
| io-biodiversity                                        | Impact Observatory Biodiversity | Biodiversity indicators              | Global           | 2017-2022      | 10m        | COG        | Conservation planning                       | download_data       |
| hrea                                                   | HREA                            | Human settlements                    | Global           | 2000-2020      | 100m       | COG        | Population distribution                     | download_data       |
| gap                                                    | GAP Land Cover                  | Protected lands                      | USA              | 2011           | 30m        | COG        | Conservation planning                       | download_data       |
| fws-nwi                                                | FWS NWI                         | Wetlands                             | USA              | 2016           | N/A        | GeoParquet | Wetland conservation                        | download_geometries |
| esa-worldcover                                         | ESA WorldCover                  | Land cover                           | Global           | 2020-2021      | 10m        | COG        | Land use mapping                            | download_data       |
| esa-cci                                                | ESA CCI                         | Long-term land cover                 | Global           | 1992-2018      | 300m       | COG        | Climate change analysis                     | download_data       |
| era5                                                   | ERA5                            | Climate reanalysis                   | Global           | 1979-Present   | 0.25°      | Zarr       | Weather research                            | download_data       |
| eclipse                                                | Eclipse                         | Solar eclipse paths                  | Global           | 2024           | N/A        | GeoParquet | Education                                   | download_geometries |
| drcog-lulc                                             | DRCOG LULC                      | Land use                             | Denver           | 2018           | 1m         | COG        | Urban planning                              | download_data       |
| deltares-floods                                        | Deltares Floods                 | Flood risk                           | Global           | 2020           | 90m        | COG        | Disaster planning                           | download_data       |
| deltares-water-availability                            | Deltares Water                  | Water stress                         | Global           | 2020           | 30 arc-min | COG        | Water management                            | download_data       |
| daymet                                                 | Daymet                          | Climate data                         | North America    | 1980-Present   | 1km        | Zarr       | Agriculture                                 | download_data       |
| copernicus-dem                                         | Copernicus DEM                  | Elevation                            | Global           | 2021           | 30m        | COG        | Terrain analysis                            | download_data       |
| conus404                                               | CONUS404                        | Hydrological model                   | CONUS            | 1979-Present   | 1km        | COG        | Water resources                             | download_data       |
| cil-gdpcir                                             | CIL GDPCIR                      | Climate indicators                   | Global           | 1990-2020      | 0.5°       | COG        | Climate adaptation                          | download_data       |
| chesapeake                                             | Chesapeake                      | Land cover                           | Chesapeake Bay   | 2013-2014      | 1m         | COG        | Coastal management                          | download_data       |
| also-palsar                                            | ALSO PALSAR                     | SAR                                  | Global           | 2006-2011      | 12.5-100m  | COG        | Forest monitoring                           | download_data       |
| aster-l1t                                              | ASTER L1T                       | Thermal                              | Global           | 2000-Present   | 15-90m     | COG        | Geology                                     | download_data       |
| 3dep-seamless                                          | 3DEP Seamless                   | Elevation                            | USA              | 2010-Present   | 1-10m      | COG        | Infrastructure                              | download_data       |
| 3dep-lidar                                             | 3DEP LiDAR                      | Point clouds                         | USA              | 2010-Present   | Variable   | COG        | 3D modeling                                 | download_data       |

## Notes

- **COG**: Cloud-Optimized GeoTIFF, supports efficient spatial subsetting
- **GeoParquet**: Vector data in Parquet format, supports spatial queries
- **Zarr**: Multidimensional array format, optimized for time series data
- **NetCDF**: Network Common Data Form, common for climate data

## Data Types and Recommended Tools

| Data Type                 | Format      | Tool                  |
| ------------------------- | ----------- | --------------------- |
| Optical/Satellite Imagery | COG         | `download_data`       |
| Elevation/DEM             | COG         | `download_data`       |
| Land Cover/Classification | COG         | `download_data`       |
| SAR Imagery               | COG         | `download_data`       |
| Climate/Weather           | Zarr/NetCDF | `download_data`       |
| Vector/Geometries         | GeoParquet  | `download_geometries` |

## Visualization

- **Optical imagery**: RGB composites (Sentinel-2: B04/B03/B02, NAIP: R/G/B)
- **DEMs**: Terrain colormaps (elevation → color ramps)
- **Land cover**: Categorical colormaps (class values → colors)
- **Vectors**: Geometry overlays on basemaps
- **Climate**: Variable-specific visualizations (temperature, precipitation, etc.)

## Query Keywords

Collections can be referenced by:

- Collection ID (exact match)
- Keywords in natural language queries
- Common names (e.g., "sentinel", "landsat", "buildings")

See `src/core/collections.py` for the complete keyword mapping.
