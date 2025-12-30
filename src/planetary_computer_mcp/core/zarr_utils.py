"""
Zarr utilities for multidimensional climate/weather data.

Supports loading Zarr data from Planetary Computer's climate collections
like GridMET, TerraClimate, Daymet, and ERA5.
"""

from typing import Any

import planetary_computer as pc
import pystac_client
import xarray as xr

# Catalog URL for Planetary Computer
PC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Zarr asset name preference order
ZARR_ASSET_NAMES = ["zarr-abfs", "zarr-https"]

# Collection-specific coordinate mappings
# Maps collection ID to (time_coord, lat_coord, lon_coord)
COORD_MAPPINGS: dict[str, tuple[str, str, str]] = {
    "gridmet": ("time", "lat", "lon"),
    "terraclimate": ("time", "lat", "lon"),
    "daymet-daily-na": ("time", "lat", "lon"),  # Note: lat/lon are 2D in Daymet
    "daymet-daily-hi": ("time", "lat", "lon"),
    "daymet-daily-pr": ("time", "lat", "lon"),
    "era5-pds": ("time", "lat", "lon"),
}

# Default variables for each collection (for quick previews)
DEFAULT_VARIABLES: dict[str, list[str]] = {
    "gridmet": ["air_temperature", "precipitation_amount"],
    "terraclimate": ["tmax", "tmin", "ppt"],
    "daymet-daily-na": ["tmax", "tmin", "prcp"],
    "daymet-daily-hi": ["tmax", "tmin", "prcp"],
    "daymet-daily-pr": ["tmax", "tmin", "prcp"],
    "era5-pds": ["air_temperature_at_2_metres", "precipitation_amount_1hour_Accumulation"],
}


def get_zarr_store_url(collection_id: str) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """
    Get the Zarr store URL and access credentials for a collection.

    Uses Planetary Computer's STAC catalog to find the Zarr asset
    and signs it to get storage credentials.

    Args:
        collection_id: Planetary Computer collection ID

    Returns:
        Tuple of (zarr_url, storage_options, open_kwargs)

    Raises:
        ValueError: If collection doesn't have a Zarr asset
    """
    catalog = pystac_client.Client.open(PC_STAC_URL)
    collection = catalog.get_collection(collection_id)

    if not collection.assets:
        raise ValueError(f"Collection {collection_id} has no assets")

    # Find Zarr asset
    zarr_asset = None
    for asset_name in ZARR_ASSET_NAMES:
        if asset_name in collection.assets:
            zarr_asset = collection.assets[asset_name]
            break

    if zarr_asset is None:
        raise ValueError(
            f"Collection {collection_id} has no Zarr asset. "
            f"Available: {list(collection.assets.keys())}"
        )

    # Sign asset to get credentials
    signed_asset = pc.sign(zarr_asset)

    storage_options = signed_asset.extra_fields.get("xarray:storage_options", {})
    open_kwargs = signed_asset.extra_fields.get("xarray:open_kwargs", {}).copy()

    # Some collections put storage_options inside open_kwargs
    # Extract it to avoid duplicate keyword argument error
    if "storage_options" in open_kwargs:
        storage_options = open_kwargs.pop("storage_options")

    # Remove 'engine' if present - open_zarr doesn't accept it
    open_kwargs.pop("engine", None)

    return signed_asset.href, storage_options, open_kwargs


def load_zarr_data(
    collection_id: str,
    variables: list[str] | None = None,
    bbox: list[float] | None = None,
    time_range: str | None = None,
) -> xr.Dataset:
    """
    Load Zarr data from a Planetary Computer collection.

    Supports spatial and temporal subsetting for efficient data access.
    Only loads requested variables and spatial/temporal extent.

    Args:
        collection_id: Collection ID (e.g., "gridmet", "terraclimate")
        variables: Variables to load (None for collection defaults)
        bbox: Bounding box [west, south, east, north] in EPSG:4326
        time_range: ISO8601 time range (e.g., "2020-01-01/2020-12-31")

    Returns:
        xarray Dataset with requested data

    Raises:
        ValueError: If collection not found or no data in extent
    """
    # Get Zarr store URL and credentials
    zarr_url, storage_options, open_kwargs = get_zarr_store_url(collection_id)

    # Open Zarr store (lazy loading)
    ds = xr.open_zarr(zarr_url, storage_options=storage_options, **open_kwargs)

    # Get coordinate names for this collection
    time_coord, lat_coord, lon_coord = COORD_MAPPINGS.get(collection_id, ("time", "lat", "lon"))

    # Select variables
    if variables:
        available = {str(v) for v in ds.data_vars}
        requested = set(variables)
        missing = requested - available
        if missing:
            raise ValueError(f"Variables not found: {missing}. Available: {sorted(available)}")
        ds = ds[variables]
    elif collection_id in DEFAULT_VARIABLES:
        # Use defaults if no variables specified
        defaults = DEFAULT_VARIABLES[collection_id]
        available = [v for v in defaults if v in ds.data_vars]
        if available:
            ds = ds[available]

    # Apply spatial subset if bbox provided
    if bbox and lat_coord in ds.coords and lon_coord in ds.coords:
        west, south, east, north = bbox

        # Check if lat/lon are 1D (regular grid) or 2D (projected)
        if ds[lat_coord].ndim == 1:
            # Regular lat/lon grid - use sel with slice
            # Handle both ascending and descending lat
            lat_vals = ds[lat_coord].values
            if lat_vals[0] > lat_vals[-1]:
                # Descending lat
                ds = ds.sel({lon_coord: slice(west, east), lat_coord: slice(north, south)})
            else:
                # Ascending lat
                ds = ds.sel({lon_coord: slice(west, east), lat_coord: slice(south, north)})
        else:
            # 2D lat/lon (projected data like Daymet) - skip spatial subset for now
            # TODO: Implement proper spatial indexing for projected grids
            pass

    # Apply time subset if provided
    if time_range and time_coord in ds.coords:
        if "/" in time_range:
            start, end = time_range.split("/")
        else:
            start = end = time_range
        ds = ds.sel({time_coord: slice(start, end)})

    return ds


def load_and_compute_zarr(
    collection_id: str,
    variables: list[str] | None = None,
    bbox: list[float] | None = None,
    time_range: str | None = None,
) -> xr.Dataset:
    """
    Load Zarr data and compute (download) to memory.

    Same as load_zarr_data but triggers actual data download.
    Use for smaller subsets that fit in memory.

    Args:
        collection_id: Collection ID
        variables: Variables to load
        bbox: Bounding box [west, south, east, north]
        time_range: ISO8601 time range

    Returns:
        Computed xarray Dataset with data in memory
    """
    ds = load_zarr_data(collection_id, variables, bbox, time_range)
    return ds.compute()


def save_zarr_subset_as_netcdf(
    data: xr.Dataset,
    output_path: str,
) -> str:
    """
    Save Zarr data subset as NetCDF file.

    Args:
        data: xarray Dataset (should be computed/in-memory)
        output_path: Output file path (.nc)

    Returns:
        Path to saved NetCDF file
    """
    # Ensure data is computed
    if data.chunks:
        data = data.compute()

    # Clean attributes that may have encoding issues
    data = _sanitize_attrs_for_netcdf(data)

    data.to_netcdf(output_path, engine="h5netcdf")
    return output_path


def _sanitize_attrs_for_netcdf(data: xr.Dataset) -> xr.Dataset:
    """
    Remove or fix attributes that cause NetCDF encoding issues.

    Some Zarr datasets have attributes with characters that can't be
    encoded to UTF-8 for NetCDF files.
    """

    data = data.copy()

    def clean_attrs(attrs: dict) -> dict:
        """Clean a dictionary of attributes."""
        cleaned = {}
        for key, value in attrs.items():
            if isinstance(value, str):
                # Replace surrogates and other problematic characters
                try:
                    value.encode("utf-8")
                    cleaned[key] = value
                except UnicodeEncodeError:
                    # Skip attributes that can't be encoded
                    continue
            elif isinstance(value, dict):
                # Skip complex nested attributes
                continue
            else:
                cleaned[key] = value
        return cleaned

    # Clean dataset attributes
    data.attrs = clean_attrs(dict(data.attrs))

    # Clean variable attributes
    for var in data.data_vars:
        data[var].attrs = clean_attrs(dict(data[var].attrs))

    # Clean coordinate attributes
    for coord in data.coords:
        data[coord].attrs = clean_attrs(dict(data[coord].attrs))

    return data


def get_zarr_metadata(data: xr.Dataset) -> dict[str, Any]:
    """
    Extract metadata from Zarr Dataset.

    Args:
        data: xarray Dataset

    Returns:
        Dictionary with metadata including variables, dimensions,
        coordinates, time range, and spatial extent
    """
    metadata: dict[str, Any] = {
        "variables": [str(v) for v in data.data_vars],
        "dimensions": dict(data.sizes),
        "coordinates": [str(c) for c in data.coords],
        "attributes": dict(data.attrs),
    }

    # Add time range if available
    for time_coord in ["time", "day"]:
        if time_coord in data.coords:
            time_vals = data[time_coord].values
            if len(time_vals) > 0:
                metadata["time_range"] = {
                    "start": str(time_vals[0])[:10],
                    "end": str(time_vals[-1])[:10],
                    "count": len(time_vals),
                }
            break

    # Add spatial extent if available
    for lat_coord in ["lat", "latitude", "y"]:
        if lat_coord in data.coords and data[lat_coord].ndim == 1:
            lat_vals = data[lat_coord].values
            metadata["lat_range"] = {
                "min": float(lat_vals.min()),
                "max": float(lat_vals.max()),
            }
            break

    for lon_coord in ["lon", "longitude", "x"]:
        if lon_coord in data.coords and data[lon_coord].ndim == 1:
            lon_vals = data[lon_coord].values
            metadata["lon_range"] = {
                "min": float(lon_vals.min()),
                "max": float(lon_vals.max()),
            }
            break

    return metadata


def get_available_variables(collection_id: str) -> list[str]:
    """
    Get list of available variables for a Zarr collection.

    Args:
        collection_id: Collection ID

    Returns:
        List of variable names
    """
    zarr_url, storage_options, open_kwargs = get_zarr_store_url(collection_id)
    ds = xr.open_zarr(zarr_url, storage_options=storage_options, **open_kwargs)
    return [str(v) for v in ds.data_vars]
