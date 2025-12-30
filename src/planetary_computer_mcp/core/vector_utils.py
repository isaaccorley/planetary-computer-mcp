"""
Vector utilities for GeoParquet processing.
"""

import math
from pathlib import Path
from typing import Any

import adlfs
import geopandas as gpd
import pandas as pd
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


def query_geoparquet_spatially(
    base_path: str,
    bbox: list[float],
    limit: int | None = None,
    storage_options: dict[str, Any] | None = None,
) -> gpd.GeoDataFrame:
    """
    Query GeoParquet files spatially using GeoPandas.

    Reads parquet files directly from Azure blob storage using fsspec,
    then filters geometries that intersect the bounding box.

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
        # Region is already in the base path from STAC
        region_path = base_path_no_abfs
    else:
        # Add region partition
        region_path = f"{base_path_no_abfs}/RegionName={region}"

    # Create bbox geometry for spatial filtering
    bbox_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])

    # Prepare storage options for geopandas
    gpd_storage_options = {
        "account_name": storage_options["account_name"],
        "credential": storage_options["credential"],
    }

    all_gdfs = []
    total_count = 0

    for qk in quadkeys:
        if limit and total_count >= limit:
            break

        # Look for parquet files in the quadkey subdirectory
        qk_path = f"{region_path}/quadkey={qk}"

        try:
            # List parquet files in this quadkey partition
            parquet_files = fs.glob(f"{qk_path}/*.parquet")

            if not parquet_files:
                continue

            # Process parquet files for this quadkey
            for remote_file in parquet_files:
                if limit and total_count >= limit:
                    break

                # Read directly from Azure using fsspec (no local download)
                az_path = f"az://{remote_file}"
                gdf = gpd.read_parquet(az_path, storage_options=gpd_storage_options)

                # Spatial filter using bbox
                filtered = gdf[gdf.geometry.intersects(bbox_geom)]

                if len(filtered) > 0:
                    # Apply limit if needed
                    if limit:
                        remaining = limit - total_count
                        if len(filtered) > remaining:
                            filtered = filtered.head(remaining)

                    all_gdfs.append(filtered)
                    total_count += len(filtered)

        except Exception:
            # Continue with other quadkeys on failure
            continue

    if not all_gdfs:
        return gpd.GeoDataFrame()

    # Combine results
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
