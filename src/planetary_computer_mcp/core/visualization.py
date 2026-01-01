"""
Visualization utilities for generating RGB/JPEG previews from raster data.
"""

import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np
import xarray as xr
from PIL import Image

# ESA WorldCover colormap
ESA_WORLDCOVER_CMAP = {
    10: (0, 100, 0, 255),  # Tree cover - dark green
    20: (255, 187, 34, 255),  # Shrubland - orange
    30: (255, 255, 76, 255),  # Grassland - yellow
    40: (240, 150, 255, 255),  # Cropland - pink
    50: (250, 0, 0, 255),  # Built-up - red
    60: (180, 180, 180, 255),  # Bare/sparse - gray
    70: (240, 240, 240, 255),  # Snow/ice - white
    80: (0, 100, 200, 255),  # Water - blue
    90: (0, 150, 160, 255),  # Wetland - teal
    95: (0, 207, 117, 255),  # Mangroves - green
    100: (250, 230, 160, 255),  # Moss/lichen - beige
}

# Terrain/elevation colormap (blue to green to brown)
TERRAIN_CMAP = [
    (0, 0, 255, 255),  # Deep blue (low elevation)
    (0, 100, 255, 255),  # Blue
    (0, 200, 255, 255),  # Light blue
    (0, 255, 200, 255),  # Cyan
    (0, 255, 0, 255),  # Green
    (100, 255, 0, 255),  # Light green
    (200, 255, 0, 255),  # Yellow-green
    (255, 255, 0, 255),  # Yellow
    (255, 200, 0, 255),  # Orange
    (255, 150, 0, 255),  # Dark orange
    (255, 100, 0, 255),  # Red-orange
    (200, 100, 0, 255),  # Brown
    (150, 75, 0, 255),  # Dark brown
    (100, 50, 0, 255),  # Darker brown
    (255, 255, 255, 255),  # White (high elevation)
]


def create_rgb_visualization(
    data: xr.Dataset,
    output_path: str,
    collection: str,
    stretch: bool = True,
) -> str:
    """
    Create RGB visualization from raster data.

    Parameters
    ----------
    data : xr.Dataset
        Xarray Dataset
    output_path : str
        Output JPEG/PNG path
    collection : str
        Collection ID for band selection
    stretch : bool, optional
        Whether to stretch values for better visualization

    Returns
    -------
    str
        Path to saved visualization
    """
    # Select appropriate bands based on collection
    rgb_bands = get_rgb_bands_for_collection(collection)

    # Extract RGB bands
    rgb_data = []
    for band in rgb_bands:
        if band in data.data_vars:
            band_data = data[band].values
            # Take first time slice if temporal
            if "time" in data.dims:
                band_data = band_data[0]
            rgb_data.append(band_data)
        else:
            # Fallback: use first available band
            first_band = next(iter(data.data_vars.keys()))
            band_data = data[first_band].values
            if "time" in data.dims:
                band_data = band_data[0]
            rgb_data.append(band_data)

    if len(rgb_data) < 3:
        # Pad with copies if not enough bands
        while len(rgb_data) < 3:
            rgb_data.append(rgb_data[0])

    # Stack into RGB array
    rgb_array = np.stack(rgb_data[:3], axis=-1)

    # Normalize to 0-255
    rgb_normalized = normalize_rgb(rgb_array, stretch=stretch)

    # Save as image using Pillow to preserve original resolution
    img = Image.fromarray(rgb_normalized)
    img.save(output_path)

    return output_path


def create_colormap_visualization(
    data: xr.Dataset,
    output_path: str,
    collection: str,
) -> str:
    """
    Create colormap visualization for classified or continuous data.

    Parameters
    ----------
    data : xr.Dataset
        Xarray Dataset
    output_path : str
        Output path
    collection : str
        Collection ID

    Returns
    -------
    str
        Path to saved visualization
    """
    # Get the first band as DataArray
    if isinstance(data, xr.Dataset) and len(data.data_vars) > 0:
        band_name = next(iter(data.data_vars.keys()))
        band_data = data[band_name]
    elif isinstance(data, xr.DataArray):
        band_data = data
    else:
        raise ValueError("Invalid data type")

    # Extract values as numpy array
    values = np.array(band_data.values)

    # Handle temporal dimension
    if values.ndim > 2:
        values = values[0]  # Take first time slice

    # Squeeze extra dimensions
    values = np.squeeze(values)

    # Create colormap
    cmap_info = get_colormap_for_collection(collection)
    if isinstance(cmap_info, dict):
        # Discrete colormap for classified data
        bounds = sorted(cmap_info.keys())
        colors = []
        for val in bounds:
            r, g, b, a = cmap_info[val]
            colors.append((r / 255, g / 255, b / 255, a / 255))

        cmap = mcolors.ListedColormap(colors)
        norm = mcolors.BoundaryNorm(bounds + [max(bounds) + 1], cmap.N)

        # Apply colormap to values
        rgba = cmap(norm(values))
        rgb_array = (rgba[:, :, :3] * 255).astype(np.uint8)  # Drop alpha, keep RGB
    elif isinstance(cmap_info, str):
        # Matplotlib colormap for continuous data
        try:
            cmap = plt.get_cmap(cmap_info)
        except (AttributeError, ValueError):
            # Fallback to grayscale if colormap not found
            cmap = plt.get_cmap("gray")

        # Normalize values to 0-1 range for colormap
        values_min = np.min(values)
        values_max = np.max(values)
        if values_max > values_min:
            norm = mcolors.Normalize(vmin=values_min, vmax=values_max)
            rgba = cmap(norm(values))
            rgb_array = (rgba[:, :, :3] * 255).astype(np.uint8)
        else:
            # Constant value
            rgb_array = np.full(values.shape + (3,), 128, dtype=np.uint8)
    else:
        # Default grayscale
        # Normalize values to 0-255
        values_min = np.min(values)
        values_max = np.max(values)
        if values_max > values_min:
            gray = ((values - values_min) / (values_max - values_min) * 255).astype(np.uint8)
        else:
            gray = np.zeros_like(values, dtype=np.uint8)
        rgb_array = np.stack([gray, gray, gray], axis=-1)

    # Save as image using Pillow
    img = Image.fromarray(rgb_array)
    img.save(output_path)

    return output_path


def normalize_rgb(rgb_array: np.ndarray, stretch: bool = True) -> np.ndarray:
    """
    Normalize RGB array to 0-255 range.

    Uses in-place operations where possible to minimize memory copies.

    Parameters
    ----------
    rgb_array : np.ndarray
        RGB array
    stretch : bool, optional
        Whether to apply percentile stretch

    Returns
    -------
    np.ndarray
        Normalized RGB array (0-255)
    """
    # Work on float32 copy for normalization (single copy instead of multiple)
    rgb = rgb_array.astype(np.float32, copy=True)

    # Handle NaN/inf in-place
    np.nan_to_num(rgb, copy=False, nan=0, posinf=0, neginf=0)

    if stretch:
        # Percentile stretch
        p2, p98 = np.percentile(rgb, (2, 98), axis=(0, 1))
        denom = p98 - p2
        if np.any(denom == 0) or np.any(np.isnan(denom)):
            # If no variation, use min-max
            rgb_min = np.min(rgb, axis=(0, 1))
            rgb_max = np.max(rgb, axis=(0, 1))
            rgb -= rgb_min
            rgb /= rgb_max - rgb_min + 1e-8
        else:
            rgb -= p2
            rgb /= denom
            np.clip(rgb, 0, 1, out=rgb)
    else:
        # Min-max normalization in-place
        rgb_min = np.min(rgb, axis=(0, 1))
        rgb_max = np.max(rgb, axis=(0, 1))
        rgb -= rgb_min
        rgb /= rgb_max - rgb_min + 1e-8

    # Scale to 0-255 and convert to uint8
    rgb *= 255
    return rgb.astype(np.uint8)


def get_rgb_bands_for_collection(collection: str) -> list[str]:
    """
    Get RGB band names for a collection.

    Parameters
    ----------
    collection : str
        Collection ID

    Returns
    -------
    list[str]
        List of band names [red, green, blue]
    """
    band_mappings = {
        "sentinel-2-l2a": ["B04", "B03", "B02"],  # R, G, B
        "landsat-c2-l2": ["red", "green", "blue"],
        "naip": ["red", "green", "blue"],
        "sentinel-1-rtc": ["vv", "vh", "vv"],  # SAR false color
    }

    return band_mappings.get(
        collection,
        ["B04", "B03", "B02"],
    )  # Default to Sentinel bands


def get_colormap_for_collection(
    collection: str,
) -> dict[int, tuple[int, int, int, int]] | str | None:
    """
    Get colormap for classified collections.

    Parameters
    ----------
    collection : str
        Collection ID

    Returns
    -------
    dict[int, tuple[int, int, int, int]] or str or None
        Dictionary mapping class values to RGBA colors, or matplotlib colormap name, or None
    """
    if collection in ["esa-worldcover", "io-lulc-annual-v02"]:
        return ESA_WORLDCOVER_CMAP
    elif collection in ["cop-dem-glo-30", "alos-dem"]:
        return "terrain"  # Matplotlib terrain colormap

    return None


def create_rgb_visualization_from_geotiff(
    input_path: str,
    output_path: str,
    collection: str,
    stretch: bool = True,
) -> str:
    """
    Create RGB visualization directly from a GeoTIFF file.

    Reads RGB bands from a GeoTIFF and creates a JPEG visualization,
    bypassing xarray for maximum performance.

    Parameters
    ----------
    input_path : str
        Path to input GeoTIFF file
    output_path : str
        Output JPEG/PNG path
    collection : str
        Collection ID for band selection
    stretch : bool, optional
        Whether to stretch values for better visualization

    Returns
    -------
    str
        Path to saved visualization
    """
    import rasterio  # type: ignore[import-not-found]

    with rasterio.open(input_path) as src:
        # NAIP: bands are R, G, B, NIR (1, 2, 3, 4)
        # Read first 3 bands for RGB
        if src.count >= 3:
            rgb_data = src.read([1, 2, 3])  # Read R, G, B
        else:
            # Single band - replicate to RGB
            band = src.read(1)
            rgb_data = np.stack([band, band, band])

    # Transpose from (bands, height, width) to (height, width, bands)
    rgb_array = np.transpose(rgb_data, (1, 2, 0))

    # Normalize to 0-255
    rgb_normalized = normalize_rgb(rgb_array, stretch=stretch)

    # Save as image using Pillow
    img = Image.fromarray(rgb_normalized)
    img.save(output_path)

    return output_path
