"""
Vector utilities for GeoParquet processing.
"""

import math
from pathlib import Path
from typing import Any

import fsspec
import geopandas as gpd
from shapely.geometry import box


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


def query_geoparquet_spatially(
    base_path: str,
    bbox: list[float],
    limit: int | None = None,
    storage_options: dict[str, Any] | None = None,
) -> gpd.GeoDataFrame:
    """
    Query GeoParquet files spatially.

    Parameters
    ----------
    base_path : str
        Base path to partitioned parquet (abfs:// URL)
    bbox : list[float]
        Bounding box [west, south, east, north]
    limit : int or None, optional
        Maximum number of features to return
    storage_options : dict[str, Any] or None, optional
        Azure storage credentials

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with intersecting geometries
    """
    if not storage_options:
        return gpd.GeoDataFrame()

    # Get quadkeys that intersect bbox
    quadkeys = get_quadkeys_for_bbox(bbox, level=9)

    # Setup filesystem
    fs = fsspec.filesystem("abfs", **storage_options)

    # Find parquet files for relevant quadkeys
    base_path_clean = base_path.replace("abfs://", "")
    all_gdfs = []
    total_count = 0

    for qk in quadkeys:
        if limit and total_count >= limit:
            break

        qk_path = f"{base_path_clean}/quadkey={qk}"
        try:
            files = fs.ls(qk_path)
        except FileNotFoundError:
            continue

        for f in files:
            if not f.endswith(".parquet"):
                continue

            file_url = f"abfs://{f}"
            try:
                gdf = gpd.read_parquet(file_url, storage_options=storage_options)

                # Clip to bbox
                bbox_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])
                clipped = gdf[gdf.geometry.intersects(bbox_geom)]

                if len(clipped) > 0:
                    all_gdfs.append(clipped)
                    total_count += len(clipped)

                    if limit and total_count >= limit:
                        break
            except Exception as e:
                print(f"Warning: Failed to read {file_url}: {e}")
                continue

    if not all_gdfs:
        return gpd.GeoDataFrame()

    # Combine results
    import pandas as pd

    combined = gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True), crs="EPSG:4326")

    # Apply limit
    if limit and len(combined) > limit:
        combined = combined.head(limit)

    return combined


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
