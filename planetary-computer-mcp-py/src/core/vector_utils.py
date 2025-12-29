"""
Vector utilities for GeoParquet processing.
"""

from typing import Any

import duckdb
import geopandas as gpd


def query_geoparquet_spatially(
    parquet_urls: list[str],
    bbox: list[float],
    limit: int | None = None,
) -> gpd.GeoDataFrame:
    """
    Query GeoParquet files spatially using DuckDB.

    Args:
        parquet_urls: List of Parquet file URLs
        bbox: Bounding box [west, south, east, north]
        limit: Maximum number of features to return

    Returns:
        GeoDataFrame with intersecting geometries
    """
    west, south, east, north = bbox

    # Build SQL query
    union_queries = []
    for url in parquet_urls:
        query = f"""
        SELECT * FROM read_parquet('{url}')
        WHERE geometry.intersects(ST_GeomFromText('POLYGON(({west} {south}, {east} {south}, {east} {north}, {west} {north}, {west} {south}))'))
        """
        union_queries.append(query)

    full_query = " UNION ALL ".join(union_queries)

    if limit:
        full_query += f" LIMIT {limit}"

    # Execute with DuckDB
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")

    result = con.execute(full_query).fetchdf()

    # Convert to GeoDataFrame if geometry column exists
    if "geometry" in result.columns:
        return gpd.GeoDataFrame(result, geometry="geometry")
    return gpd.GeoDataFrame(result)


def save_geodataframe_as_parquet(
    gdf: gpd.GeoDataFrame,
    output_path: str,
) -> str:
    """
    Save GeoDataFrame as Parquet.

    Args:
        gdf: GeoDataFrame to save
        output_path: Output file path

    Returns:
        Path to saved file
    """
    gdf.to_parquet(output_path)
    return output_path


def get_vector_metadata(gdf: gpd.GeoDataFrame) -> dict[str, Any]:
    """
    Extract metadata from GeoDataFrame.

    Args:
        gdf: GeoDataFrame

    Returns:
        Dictionary with metadata
    """
    bounds = gdf.total_bounds.tolist() if len(gdf) > 0 else None

    return {
        "count": len(gdf),
        "columns": list(gdf.columns),
        "crs": str(gdf.crs) if gdf.crs else None,
        "bounds": bounds,
        "geometry_types": gdf.geometry.type.value_counts().to_dict()
        if len(gdf) > 0
        else {},
    }
