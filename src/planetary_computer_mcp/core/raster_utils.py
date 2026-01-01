"""
Raster utilities using odc-stac for COG loading and processing.
"""

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

    Parameters
    ----------
    items : list[Item]
        Signed STAC items
    bbox : list[float] or None, optional
        Bounding box [west, south, east, north]
    bands : list[str] or None, optional
        Specific bands to load (None for all)
    resolution : float or None, optional
        Output resolution in CRS units
    crs : str, optional
        Output CRS (default EPSG:4326)

    Returns
    -------
    xr.Dataset
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


def download_multiband_to_geotiff(
    items: list[Item],
    asset_name: str,
    output_path: str,
    bbox: list[float] | None = None,
    band_names: list[str] | None = None,
    overview_level: int | None = None,
) -> dict[str, Any]:
    """
    Download a multi-band asset directly to GeoTIFF using rasterio windowed reads.

    Bypasses xarray entirely for maximum performance. Uses rasterio's windowed
    reading to only download pixels within the bbox, then writes directly to disk.

    Parameters
    ----------
    items : list[Item]
        Signed STAC items (uses first item only)
    asset_name : str
        Name of the asset to load (e.g., 'image')
    output_path : str
        Path for output GeoTIFF file
    bbox : list[float] or None, optional
        Bounding box [west, south, east, north] in EPSG:4326
    band_names : list[str] or None, optional
        Names for the bands (e.g., ['red', 'green', 'blue', 'nir'])
    overview_level : int or None, optional
        COG overview level to use (2, 4, 8, etc.). None = native resolution.
        Use overview_level=4 for ~4x faster downloads at reduced resolution.

    Returns
    -------
    dict[str, Any]
        Metadata dict with crs, bounds, shape, dtype, bands
    """
    import rasterio  # type: ignore[import-not-found]
    from affine import Affine  # type: ignore[import-not-found]
    from rasterio.crs import CRS  # type: ignore[import-not-found]
    from rasterio.warp import transform_bounds  # type: ignore[import-not-found]
    from rasterio.windows import from_bounds  # type: ignore[import-not-found]

    if not items:
        raise ValueError("No items provided")

    item = items[0]
    if asset_name not in item.assets:
        raise ValueError(f"Asset '{asset_name}' not found in item")

    href = item.assets[asset_name].href

    with rasterio.open(href) as src:
        native_crs = src.crs
        num_bands = src.count
        dtype = src.dtypes[0]

        if bbox:
            # Transform bbox from WGS84 to native CRS
            west, south, east, north = bbox
            if native_crs and str(native_crs) != "EPSG:4326":
                native_bounds = transform_bounds(
                    CRS.from_epsg(4326),
                    native_crs,
                    west,
                    south,
                    east,
                    north,
                )
            else:
                native_bounds = (west, south, east, north)

            # Create window from bounds
            window = from_bounds(
                native_bounds[0],
                native_bounds[1],
                native_bounds[2],
                native_bounds[3],
                transform=src.transform,
            )

            full_width = int(window.width)
            full_height = int(window.height)

            # If using overview level, read at reduced resolution
            if overview_level and overview_level > 1:
                out_width = max(1, full_width // overview_level)
                out_height = max(1, full_height // overview_level)
                out_shape = (num_bands, out_height, out_width)
                data = src.read(window=window, out_shape=out_shape)

                # Adjust transform for reduced resolution
                window_transform = src.window_transform(window)
                scaled_transform = Affine(
                    window_transform.a * overview_level,
                    window_transform.b,
                    window_transform.c,
                    window_transform.d,
                    window_transform.e * overview_level,
                    window_transform.f,
                )
                window_transform = scaled_transform
            else:
                data = src.read(window=window)
                window_transform = src.window_transform(window)

            bounds = native_bounds
        else:
            if overview_level and overview_level > 1:
                out_width = max(1, src.width // overview_level)
                out_height = max(1, src.height // overview_level)
                out_shape = (num_bands, out_height, out_width)
                data = src.read(out_shape=out_shape)

                window_transform = Affine(
                    src.transform.a * overview_level,
                    src.transform.b,
                    src.transform.c,
                    src.transform.d,
                    src.transform.e * overview_level,
                    src.transform.f,
                )
            else:
                data = src.read()
                window_transform = src.transform

            bounds = src.bounds

        height, width = data.shape[1], data.shape[2]

        # Write directly to GeoTIFF
        profile = {
            "driver": "GTiff",
            "dtype": dtype,
            "width": width,
            "height": height,
            "count": num_bands,
            "crs": native_crs,
            "transform": window_transform,
            "compress": "lzw",
            "tiled": True,
            "blockxsize": 256,
            "blockysize": 256,
        }

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(data)

            # Write band descriptions if provided
            if band_names:
                for i, name in enumerate(band_names[:num_bands], start=1):
                    dst.set_band_description(i, name)

    # Return metadata
    names = (
        band_names[:num_bands]
        if band_names and len(band_names) <= num_bands
        else [f"band_{i + 1}" for i in range(num_bands)]
    )

    return {
        "crs": str(native_crs),
        "bounds": bounds,
        "resolution": (abs(window_transform.a), abs(window_transform.e)),
        "shape": (height, width),
        "dtype": str(dtype),
        "bands": names,
        "overview_level": overview_level or 1,
    }


def save_raster_as_geotiff(
    data: xr.Dataset,
    output_path: str,
    nodata: float | None = None,
) -> str:
    """
    Save raster data as GeoTIFF.

    Parameters
    ----------
    data : xr.Dataset
        Xarray Dataset
    output_path : str
        Output file path
    nodata : float or None, optional
        NoData value

    Returns
    -------
    str
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

    Parameters
    ----------
    data : xr.Dataset
        Xarray Dataset

    Returns
    -------
    dict[str, Any]
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
