"""
Vector utilities for GeoParquet processing.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import adlfs
import geopandas as gpd
import mercantile
import pandas as pd
import pyarrow.parquet as pq
from pystac import Item
from shapely import Polygon
from shapely.geometry import box

# Max parallel downloads for Azure blob storage
MAX_PARALLEL_DOWNLOADS = 8


def get_quadkeys_for_bbox(bbox: list[float], level: int = 9) -> list[str]:
    """
    Get all quadkeys at given level that intersect bbox.

    Uses mercantile for efficient tile enumeration instead of grid sampling.

    Parameters
    ----------
    bbox : list[float]
        Bounding box [west, south, east, north]
    level : int, optional
        Quadkey level (default 9 for MS Buildings)

    Returns
    -------
    list[str]
        List of quadkey strings (preserves leading zeros)
    """
    west, south, east, north = bbox
    return [
        mercantile.quadkey(tile) for tile in mercantile.tiles(west, south, east, north, zooms=level)
    ]


def _read_and_filter_parquet(
    file_path: str,
    storage_options: dict[str, Any],
    bbox_geom: Polygon,
    fs: adlfs.AzureBlobFileSystem | None = None,
) -> gpd.GeoDataFrame | None:
    """
    Read parquet file and filter spatially using PyArrow for speed.

    Uses PyArrow for faster raw reads, then converts to GeoDataFrame
    and applies spatial filter.

    Parameters
    ----------
    file_path : str
        Full path to parquet file (az:// URL or raw path)
    storage_options : dict[str, Any]
        Azure storage credentials (account_name, sas_token/credential)
    bbox_geom : Polygon
        Shapely geometry for spatial filtering
    fs : adlfs.AzureBlobFileSystem, optional
        Pre-initialized filesystem for reuse

    Returns
    -------
    gpd.GeoDataFrame or None
        Filtered GeoDataFrame or None if no matches
    """
    try:
        # Use PyArrow for faster reads
        clean_path = file_path.replace("az://", "").replace("abfs://", "")

        if fs is not None:
            # Use provided filesystem (faster - reuses connection)
            table = pq.read_table(fs.open(clean_path))
        else:
            # Fallback to geopandas (slower but handles auth automatically)
            gdf = gpd.read_parquet(file_path, storage_options=storage_options)
            if len(gdf) == 0:
                return None
            # Apply spatial filter
            mask = gdf.geometry.intersects(bbox_geom)
            filtered = gdf[mask]
            return gpd.GeoDataFrame(filtered, crs="EPSG:4326") if len(filtered) > 0 else None

        # Convert PyArrow table to GeoDataFrame
        df = table.to_pandas()
        if len(df) == 0:
            return None

        # Parse WKB geometry
        import shapely

        df["geometry"] = shapely.from_wkb(df["geometry"])
        gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")

        # Spatial filter using spatial index for large datasets
        if len(gdf) > 1000:
            sindex = gdf.sindex
            candidates_idx = list(sindex.intersection(bbox_geom.bounds))
            if not candidates_idx:
                return None
            candidates = gdf.iloc[candidates_idx]
            mask = candidates.geometry.intersects(bbox_geom)
            filtered = candidates[mask]
        else:
            mask = gdf.geometry.intersects(bbox_geom)
            filtered = gdf[mask]

        return gpd.GeoDataFrame(filtered, crs="EPSG:4326") if len(filtered) > 0 else None

    except Exception:
        return None


def query_geoparquet_by_quadkey(
    base_href: str,
    bbox: list[float],
    storage_options: dict[str, Any],
    quadkey_level: int = 9,
) -> gpd.GeoDataFrame:
    """
    Query GeoParquet by directly accessing quadkey partitions.

    This is the efficient method for quadkey-partitioned datasets like MS Buildings.
    Instead of listing all partitions (2000+ for US), it computes only the quadkeys
    that intersect the bbox and reads those partitions directly.

    Parameters
    ----------
    base_href : str
        Base path to region partition (e.g., abfs://footprints/.../RegionName=United States)
    bbox : list[float]
        Bounding box [west, south, east, north]
    storage_options : dict[str, Any]
        Azure storage credentials (account_name, credential/sas_token)
    quadkey_level : int, optional
        Quadkey zoom level (default 9 for MS Buildings)

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with intersecting geometries
    """
    # Compute quadkeys for bbox
    quadkeys = get_quadkeys_for_bbox(bbox, level=quadkey_level)
    if not quadkeys:
        return gpd.GeoDataFrame()

    # Setup filesystem
    account_name: str = storage_options.get("account_name") or ""
    sas_token: str = storage_options.get("credential") or storage_options.get("sas_token") or ""
    fs = adlfs.AzureBlobFileSystem(
        account_name=account_name,
        sas_token=sas_token,
    )

    # Clean base path (remove protocol prefix)
    base_path = base_href.replace("abfs://", "").replace("az://", "")

    # Collect parquet files from each quadkey partition
    all_parquet_files: list[str] = []
    for qk in quadkeys:
        quadkey_path = f"{base_path}/quadkey={qk}"
        try:
            parts = fs.ls(quadkey_path)
            all_parquet_files.extend(f"az://{part}" for part in parts if part.endswith(".parquet"))
        except Exception:
            # Quadkey partition may not exist (sparse data)
            continue

    if not all_parquet_files:
        return gpd.GeoDataFrame()

    # Create bbox geometry for spatial filtering
    bbox_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])

    # Prepare storage options for fallback
    gp_storage_options = {
        "account_name": account_name,
        "sas_token": sas_token,
    }

    # Process files in parallel with shared filesystem connection
    all_gdfs: list[gpd.GeoDataFrame] = []

    def read_file(file_path: str) -> gpd.GeoDataFrame | None:
        return _read_and_filter_parquet(file_path, gp_storage_options, bbox_geom, fs=fs)

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_DOWNLOADS) as executor:
        future_to_file = {
            executor.submit(read_file, file_path): file_path for file_path in all_parquet_files
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


def query_geoparquet_from_items(
    items: list[Item],
    bbox: list[float],
    storage_options: dict[str, Any] | None = None,
) -> gpd.GeoDataFrame:
    """
    Query GeoParquet files from STAC items with parallel downloads.

    This method handles non-quadkey partitioned datasets where each STAC item
    corresponds to a single parquet file or partition.

    Parameters
    ----------
    items : list[Item]
        STAC items from search (already filtered by bbox via STAC API)
    bbox : list[float]
        Bounding box [west, south, east, north] for final spatial filter
    storage_options : dict[str, Any] or None, optional
        Azure storage credentials

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with intersecting geometries
    """
    if not items or not storage_options:
        return gpd.GeoDataFrame()

    # Setup filesystem for listing parquet parts
    account_name: str = storage_options.get("account_name") or ""
    sas_token: str = storage_options.get("credential") or storage_options.get("sas_token") or ""
    fs = adlfs.AzureBlobFileSystem(
        account_name=account_name,
        sas_token=sas_token,
    )

    # Collect all parquet file paths from items
    # Each item's "data" asset may contain multiple parquet files
    all_parquet_files: list[str] = []
    for item in items:
        if "data" not in item.assets:
            continue
        data_href = item.assets["data"].href
        try:
            # List parquet files under this item's data asset
            parts = fs.ls(data_href)
            all_parquet_files.extend(f"az://{part}" for part in parts)
        except Exception:
            continue

    if not all_parquet_files:
        return gpd.GeoDataFrame()

    # Create bbox geometry for spatial filtering
    bbox_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])

    # Prepare storage options for geopandas
    gp_storage_options = {
        "account_name": storage_options.get("account_name"),
        "sas_token": storage_options.get("credential") or storage_options.get("sas_token"),
    }

    # Process files in parallel
    all_gdfs: list[gpd.GeoDataFrame] = []

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_DOWNLOADS) as executor:
        future_to_file = {
            executor.submit(
                _read_and_filter_parquet, file_path, gp_storage_options, bbox_geom
            ): file_path
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
