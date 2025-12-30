"""
Core utilities for Planetary Computer MCP server.
"""

from planetary_computer_mcp.core.collections import (
    COLLECTION_KEYWORDS,
    COLLECTION_TYPES,
    detect_collection_from_query,
    get_collection_type,
)
from planetary_computer_mcp.core.geocoding import place_to_bbox, validate_bbox
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
    "COLLECTION_KEYWORDS",
    "COLLECTION_TYPES",
    "COORD_MAPPINGS",
    "DEFAULT_VARIABLES",
    "PlanetaryComputerSTAC",
    "detect_collection_from_query",
    "get_available_variables",
    "get_collection_type",
    "get_zarr_metadata",
    "get_zarr_store_url",
    "load_and_compute_zarr",
    "load_zarr_data",
    "place_to_bbox",
    "save_zarr_subset_as_netcdf",
    "stac_client",
    "validate_bbox",
]
