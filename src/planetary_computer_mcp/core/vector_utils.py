"""
Vector utilities for GeoParquet processing.
"""

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import adlfs
import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
from shapely import Polygon
from shapely.geometry import box

# Max parallel downloads for Azure blob storage
MAX_PARALLEL_DOWNLOADS = 8


def latlon_to_quadkey(lat: float, lon: float, level: int) -> str:
    """
    Convert lat/lon to Bing Maps quadkey at given level.

    Parameters
    ----------
    lat : float
        Latitude in degrees
    lon : float
        Longitude in degrees
    level : int
        Quadkey zoom level

    Returns
    -------
    str
        Bing Maps quadkey string
    """
    x = int((lon + 180.0) / 360.0 * (1 << level))
    lat_rad = lat * math.pi / 180.0
    y = int(
        (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * (1 << level)
    )

    quadkey = ""
    for i in range(level, 0, -1):
        digit = 0
        mask = 1 << (i - 1)
        if (x & mask) != 0:
            digit += 1
        if (y & mask) != 0:
            digit += 2
        quadkey += str(digit)
    return quadkey


def _get_region_from_bbox(bbox: list[float]) -> str | None:
    """
    Determine MS Buildings region from bbox.

    Parameters
    ----------
    bbox : list[float]
        Bounding box [west, south, east, north]

    Returns
    -------
    str or None
        Region name or None if not found
    """
    west, south, _, _ = bbox

    # United States (continental + Alaska/Hawaii)
    if -160 <= west <= -66 and 18 <= south <= 71:
        return "United States"

    # Canada
    if -141 <= west <= -52 and 41 <= south <= 84:
        return "Canada"

    # Mexico
    if -117 <= west <= -86 and 14 <= south <= 32:
        return "Mexico"

    # North America (fallback for smaller regions)
    if -117 <= west <= -61 and 7 <= south <= 32:
        return "North America"

    return None


def get_quadkeys_for_bbox(bbox: list[float], level: int = 9) -> set[str]:
    """
    Get all quadkeys at given level that intersect bbox.

    Parameters
    ----------
    bbox : list[float]
        Bounding box [west, south, east, north]
    level : int, optional
        Quadkey level (default 9 for MS Buildings)

    Returns
    -------
    set[str]
        Set of quadkey strings
    """
    west, south, east, north = bbox

    # Get quadkeys for corners and edges
    quadkeys = set()

    # Sample points across the bbox
    lat_steps = max(2, int((north - south) * 100) + 1)
    lon_steps = max(2, int((east - west) * 100) + 1)

    for i in range(lat_steps):
        lat = south + (north - south) * i / (lat_steps - 1)
        for j in range(lon_steps):
            lon = west + (east - west) * j / (lon_steps - 1)
            qk = latlon_to_quadkey(lat, lon, level)
            quadkeys.add(qk)

    return quadkeys


def _read_and_filter_parquet(
    file_path: str,
    fs: adlfs.AzureBlobFileSystem,
    bbox_geom: Polygon,
) -> gpd.GeoDataFrame | None:
    """
    Read parquet file and filter spatially.

    Parameters
    ----------
    file_path : str
        Path to parquet file (without az:// prefix)
    fs : adlfs.AzureBlobFileSystem
        Filesystem instance for Azure blob storage
    bbox_geom : Polygon
        Shapely geometry for spatial filtering

    Returns
    -------
    gpd.GeoDataFrame or None
        Filtered GeoDataFrame or None if no matches
    """
    try:
        with fs.open(file_path, "rb") as f:
            pf = pq.ParquetFile(f)
            table = pf.read()

            df = table.to_pandas()
            gdf = gpd.GeoDataFrame(
                df,
                geometry=gpd.GeoSeries.from_wkb(df["geometry"]),
                crs="EPSG:4326",
            )

            # Spatial filter
            mask = gdf.geometry.intersects(bbox_geom)
            filtered = gdf[mask]

            if len(filtered) > 0:
                return filtered

            return None

    except Exception:
        return None


def query_geoparquet_spatially(
    base_path: str,
    bbox: list[float],
    storage_options: dict[str, Any] | None = None,
) -> gpd.GeoDataFrame:
    """
    Query GeoParquet files spatially with parallel downloads.

    Optimized implementation that:
    1. Lists all parquet files across quadkeys
    2. Downloads and filters files concurrently using ThreadPoolExecutor

    Parameters
    ----------
    base_path : str
        Base path to partitioned parquet (abfs:// URL)
    bbox : list[float]
        Bounding box [west, south, east, north]
    storage_options : dict[str, Any] or None, optional
        Azure storage credentials

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with intersecting geometries
    """
    if not storage_options:
        return gpd.GeoDataFrame()

    # Setup fsspec filesystem for Azure
    fs = adlfs.AzureBlobFileSystem(
        account_name=storage_options["account_name"],
        credential=storage_options["credential"],
    )

    # For MS Buildings, determine region from bbox
    region = _get_region_from_bbox(bbox)
    if not region:
        return gpd.GeoDataFrame()

    # Get quadkeys that intersect bbox
    quadkeys = get_quadkeys_for_bbox(bbox, level=9)

    # Convert abfs path to fsspec path for region partition
    base_path_no_abfs = base_path.replace("abfs://", "")
    if "RegionName=" in base_path_no_abfs:
        region_path = base_path_no_abfs
    else:
        region_path = f"{base_path_no_abfs}/RegionName={region}"

    # Create bbox geometry for spatial filtering
    bbox_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])

    # Collect all parquet files across quadkeys
    all_parquet_files: list[str] = []
    for qk in quadkeys:
        qk_path = f"{region_path}/quadkey={qk}"
        try:
            parquet_files = fs.glob(f"{qk_path}/*.parquet")
            all_parquet_files.extend(parquet_files)
        except Exception:
            continue

    if not all_parquet_files:
        return gpd.GeoDataFrame()

    # Process files in parallel
    all_gdfs: list[gpd.GeoDataFrame] = []

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_DOWNLOADS) as executor:
        future_to_file = {
            executor.submit(_read_and_filter_parquet, file_path, fs, bbox_geom): file_path
            for file_path in all_parquet_files
        }

        for future in as_completed(future_to_file):
            try:
                gdf = future.result()
                if gdf is not None and len(gdf) > 0:
                    all_gdfs.append(gdf)
            except Exception:
                continue

    if not all_gdfs:
        return gpd.GeoDataFrame()

    return gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True), crs="EPSG:4326")


def save_geodataframe_as_parquet(
    gdf: gpd.GeoDataFrame,
    output_path: str,
) -> str:
    """
    Save GeoDataFrame as GeoParquet.

    Parameters
    ----------
    gdf : gpd.GeoDataFrame
        GeoDataFrame to save
    output_path : str
        Output file path

    Returns
    -------
    str
        Path to saved file
    """
    gdf.to_parquet(Path(output_path))
    return output_path


def get_vector_metadata(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    """
    Extract metadata from GeoDataFrame.

    Parameters
    ----------
    gdf : gpd.GeoDataFrame
        GeoDataFrame

    Returns
    -------
    dict[str, Any]
        Dictionary with metadata
    """
    bounds = gdf.total_bounds.tolist() if len(gdf) > 0 else None

    return {
        "count": len(gdf),
        "columns": list(gdf.columns),
        "crs": str(gdf.crs) if gdf.crs else None,
        "bounds": bounds,
        "geometry_types": gdf.geometry.type.value_counts().to_dict() if len(gdf) > 0 else {},
    }
