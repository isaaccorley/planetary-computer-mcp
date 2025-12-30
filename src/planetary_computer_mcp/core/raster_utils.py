"""
Raster utilities using odc-stac for COG loading and processing.
"""

import contextlib
from typing import Any

import rioxarray  # noqa: F401
import xarray as xr
from odc.stac import load
from pystac import Item


def load_raster_from_stac(
    items: list[Item],
    bbox: list[float] | None = None,
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
    load_kwargs: dict[str, Any] = {
        "crs": crs,
    }

    if bands:
        load_kwargs["bands"] = bands

    # Resolution must be provided - caller should pass native resolution
    if resolution:
        load_kwargs["resolution"] = resolution
    else:
        raise ValueError("Resolution is required for odc-stac loading")

    # Bbox must be passed to odc-stac load() for proper clipping
    if bbox:
        load_kwargs["bbox"] = bbox

    # Load with odc-stac
    return load(items, **load_kwargs)


def load_multiband_asset(
    items: list[Item],
    asset_name: str,
    bbox: list[float] | None = None,
    resolution: float | None = None,
    band_names: list[str] | None = None,
) -> xr.Dataset:
    """
    Load a multi-band asset (like NAIP 'image') using rioxarray.

    odc-stac doesn't handle multi-band single-asset collections well,
    so we use rioxarray directly for these cases.

    Args:
        items: Signed STAC items (uses first item only)
        asset_name: Name of the asset to load (e.g., 'image')
        bbox: Bounding box [west, south, east, north] in EPSG:4326
        resolution: Output resolution in degrees (ignored - uses native resolution)
        band_names: Names for the bands (e.g., ['red', 'green', 'blue', 'nir'])

    Returns:
        Xarray Dataset with named bands
    """
    import rioxarray as rxr  # Local import for type checking
    from rasterio.crs import CRS  # type: ignore[import-not-found]
    from rasterio.warp import transform_bounds  # type: ignore[import-not-found]

    if not items:
        raise ValueError("No items provided")

    item = items[0]  # Use first item
    if asset_name not in item.assets:
        raise ValueError(f"Asset '{asset_name}' not found in item")

    href = item.assets[asset_name].href

    # Load with rioxarray (supports COGs with windowed reads)
    data = rxr.open_rasterio(href)
    if not isinstance(data, xr.DataArray):
        raise TypeError("Expected DataArray from rioxarray")

    # Clip and reproject if bbox provided
    if bbox:
        native_crs = data.rio.crs

        # Transform bbox from WGS84 to native CRS for clipping
        if native_crs and str(native_crs) != "EPSG:4326":
            west, south, east, north = bbox
            native_bounds = transform_bounds(
                CRS.from_epsg(4326),
                native_crs,
                west,
                south,
                east,
                north,
            )
            # Clip in native CRS (preserves native resolution)
            with contextlib.suppress(Exception):
                data = data.rio.clip_box(*native_bounds)

            # Reproject to WGS84 after clipping
            data = data.rio.reproject("EPSG:4326")
        else:
            # Already in WGS84, just clip
            with contextlib.suppress(Exception):
                data = data.rio.clip_box(*bbox)

    # Convert to Dataset with named bands
    num_bands = data.shape[0] if len(data.shape) > 2 else 1
    if band_names and len(band_names) <= num_bands:
        # Create dataset with named bands
        datasets = {}
        for i, name in enumerate(band_names):
            if i < num_bands:
                band_data = data.isel(band=i) if len(data.shape) > 2 else data
                datasets[name] = band_data.drop_vars("band", errors="ignore")
        return xr.Dataset(datasets)
    else:
        # Return as single variable
        return xr.Dataset({"data": data})


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
    if "time" in data.sizes and data.sizes["time"] > 1:
        # Take the last (most recent) time slice
        data = data.isel(time=-1)
    elif "time" in data.sizes and data.sizes["time"] == 1:
        # Remove singleton time dimension
        data = data.isel(time=0)

    # For multi-band data, save as multi-band GeoTIFF
    # For single band, extract the DataArray
    if isinstance(data, xr.Dataset) and len(data.data_vars) == 1:
        data_array = data[next(iter(data.data_vars.keys()))]
    elif isinstance(data, xr.Dataset):
        # Multi-band - convert to DataArray with band dimension
        data_array = data.to_array(dim="band")
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
        sample_var = next(iter(data.data_vars.keys()))
        data_array = data[sample_var]
    else:
        data_array = data

    return {
        "crs": str(data_array.rio.crs)
        if hasattr(data_array, "rio") and data_array.rio.crs
        else None,
        "bounds": data_array.rio.bounds() if hasattr(data_array, "rio") else None,
        "resolution": data_array.rio.resolution() if hasattr(data_array, "rio") else None,
        "shape": data_array.shape,
        "dtype": str(data_array.dtype),
        "bands": list(data.data_vars)
        if isinstance(data, xr.Dataset)
        else [data_array.name]
        if data_array.name
        else ["data"],
    }


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
        try:
            cropped[var_name] = data[var_name].rio.clip_box(
                west, south, east, north, allow_one_dimensional_raster=True
            )
        except Exception as e:
            # If clipping fails, return original
            print(f"Warning: Clipping failed for {var_name}: {e}")
            cropped[var_name] = data[var_name]

    return xr.Dataset(cropped, attrs=data.attrs)
