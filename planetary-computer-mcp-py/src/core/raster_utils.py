"""
Raster utilities using odc-stac for COG loading and processing.
"""

from typing import Any

import xarray as xr
from odc.stac import load
from pystac import Item


def load_raster_from_stac(
    items: list[Item],
    bbox: list[float],
    bands: list[str] | None = None,
    resolution: float | None = None,
    crs: str = "EPSG:4326",
) -> xr.Dataset:
    """
    Load raster data from STAC items using odc-stac.

    Args:
        items: Signed STAC items
        bbox: Bounding box [west, south, east, north]
        bands: Specific bands to load (None for all)
        resolution: Output resolution in CRS units
        crs: Output CRS

    Returns:
        Xarray Dataset with raster data
    """
    load_kwargs = {
        "bbox": bbox,
        "crs": crs,
    }

    if bands:
        load_kwargs["bands"] = bands

    if resolution:
        load_kwargs["resolution"] = resolution

    # Load with odc-stac
    data = load(items, **load_kwargs)

    return data


def save_raster_as_geotiff(
    data: xr.Dataset,
    output_path: str,
    nodata: float | None = None,
) -> str:
    """
    Save raster data as GeoTIFF.

    Args:
        data: Xarray Dataset
        output_path: Output file path
        nodata: NoData value

    Returns:
        Path to saved file
    """
    # Handle temporal data - take the most recent if multiple time slices
    if "time" in data.dims and data.dims["time"] > 1:
        # Take the last (most recent) time slice
        data = data.isel(time=-1)
    elif "time" in data.dims and data.dims["time"] == 1:
        # Remove singleton time dimension
        data = data.isel(time=0)

    # For multi-band data, save as multi-band GeoTIFF
    # For single band, extract the DataArray
    if isinstance(data, xr.Dataset) and len(data.data_vars) == 1:
        data_array = data[list(data.data_vars.keys())[0]]
    elif isinstance(data, xr.Dataset):
        # Multi-band - keep as dataset
        data_array = data
    else:
        data_array = data

    # Ensure the data has proper CRS and transform
    if not hasattr(data_array, "rio") or data_array.rio.crs is None:
        # Assume WGS84 if no CRS
        data_array = data_array.rio.write_crs("EPSG:4326")

    # Set nodata if provided
    if nodata is not None:
        data_array = data_array.rio.write_nodata(nodata)

    # Save as GeoTIFF
    data_array.rio.to_raster(output_path)

    return output_path


def get_raster_metadata(data: xr.Dataset) -> dict[str, Any]:
    """
    Extract metadata from raster Dataset.

    Args:
        data: Xarray Dataset

    Returns:
        Dictionary with metadata
    """
    # Use the first variable for metadata
    if isinstance(data, xr.Dataset) and len(data.data_vars) > 0:
        sample_var = list(data.data_vars.keys())[0]
        data_array = data[sample_var]
    else:
        data_array = data

    metadata = {
        "crs": str(data_array.rio.crs)
        if hasattr(data_array, "rio") and data_array.rio.crs
        else None,
        "bounds": data_array.rio.bounds() if hasattr(data_array, "rio") else None,
        "resolution": data_array.rio.resolution()
        if hasattr(data_array, "rio")
        else None,
        "shape": data_array.shape,
        "dtype": str(data_array.dtype),
        "bands": list(data.data_vars)
        if isinstance(data, xr.Dataset)
        else [data_array.name]
        if data_array.name
        else ["data"],
    }

    return metadata


def crop_raster_to_bbox(
    data: xr.Dataset,
    bbox: list[float],
) -> xr.Dataset:
    """
    Crop raster to bounding box.

    Args:
        data: Xarray Dataset
        bbox: [west, south, east, north]

    Returns:
        Cropped Dataset
    """
    west, south, east, north = bbox

    # Apply to all variables
    cropped = {}
    for var_name in data.data_vars:
        cropped[var_name] = data[var_name].rio.clip_box(west, south, east, north)

    return xr.Dataset(cropped, attrs=data.attrs)
