"""
Core utilities for Planetary Computer MCP server.
"""

from planetary_computer_mcp.core.collections import (
    COLLECTION_INFO,
    COLLECTION_KEYWORDS,
    COLLECTION_TYPES,
    AmbiguousCollectionError,
    NoCollectionMatchError,
    detect_collection_from_query,
    get_collection_type,
)
from planetary_computer_mcp.core.geocoding import (
    calculate_bbox_area_km2,
    clear_geocoding_cache,
    get_cache_stats,
    get_default_time_range,
    place_to_bbox,
    validate_bbox,
)
from planetary_computer_mcp.core.stac_client import PlanetaryComputerSTAC, stac_client
from planetary_computer_mcp.core.zarr_utils import (
    COORD_MAPPINGS,
    DEFAULT_VARIABLES,
    get_available_variables,
    get_zarr_metadata,
    get_zarr_store_url,
    load_and_compute_zarr,
    load_zarr_data,
    save_zarr_subset_as_netcdf,
)

__all__ = [
    "COLLECTION_INFO",
    "COLLECTION_KEYWORDS",
    "COLLECTION_TYPES",
    "COORD_MAPPINGS",
    "DEFAULT_VARIABLES",
    "AmbiguousCollectionError",
    "NoCollectionMatchError",
    "PlanetaryComputerSTAC",
    "calculate_bbox_area_km2",
    "clear_geocoding_cache",
    "detect_collection_from_query",
    "get_available_variables",
    "get_cache_stats",
    "get_collection_type",
    "get_default_time_range",
    "get_zarr_metadata",
    "get_zarr_store_url",
    "load_and_compute_zarr",
    "load_zarr_data",
    "place_to_bbox",
    "save_zarr_subset_as_netcdf",
    "stac_client",
    "validate_bbox",
]
