"""
Basic test for raster download functionality.
"""

import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
import xarray as xr


# Mark as integration test since it requires network access
@pytest.mark.integration
# Mark as integration test since it requires network access
@pytest.mark.integration
def test_download_sentinel2_data():
    """Test downloading Sentinel-2 data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 10m resolution - ~1000x1000 pixels
    # 0.1 deg ~ 11km ~ 1100 pixels at 10m
    result = download_data(
        query="sentinel-2 imagery",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created and not empty
    raw_path = Path(result["raw"])
    vis_path = Path(result["visualization"])
    assert raw_path.exists()
    assert vis_path.exists()
    assert raw_path.stat().st_size > 0  # Ensure not empty
    assert vis_path.stat().st_size > 0
    assert result["collection"] == "sentinel-2-l2a"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "sentinel-2-l2a"

    # Save visualization to samples for visual validation
    if not os.path.exists("samples"):
        os.makedirs("samples")
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_sentinel1_data():
    """Test downloading Sentinel-1 data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 10m resolution - ~1000x1000 pixels
    result = download_data(
        query="sentinel-1 radar",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        time_range="2024-06-01/2024-06-30",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "sentinel-1-rtc"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "sentinel-1-rtc"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_naip_data():
    """Test downloading NAIP data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Denver area has 30cm NAIP from 2023
    # Small AOI: 0.005 deg ~ 500m ~ 1600 pixels at 30cm
    result = download_data(
        query="naip aerial imagery",
        aoi=[-104.995, 39.745, -104.99, 39.75],  # 0.005 x 0.005 deg Denver
        time_range="2023-01-01/2024-01-01",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "naip"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "naip"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_esa_worldcover_data():
    """Test downloading ESA WorldCover data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 10m resolution
    result = download_data(
        query="land cover",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "esa-worldcover"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "esa-worldcover"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_dem_data():
    """Test downloading DEM data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 30m resolution
    result = download_data(
        query="elevation dem",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "cop-dem-glo-30"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "cop-dem-glo-30"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_landsat_data():
    """Test downloading Landsat data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 30m resolution - ~370x370 pixels
    result = download_data(
        query="landsat imagery",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "landsat-c2-l2"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "landsat-c2-l2"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_ms_buildings():
    """Test downloading MS Buildings vector data."""
    from planetary_computer_mcp.tools.download_geometries import download_geometries

    # Small AOI in a dense urban area (Seattle downtown)
    # Should have plenty of building footprints
    result = download_geometries(
        collection="ms-buildings",
        aoi=[-122.345, 47.605, -122.335, 47.615],  # 0.01 x 0.01 deg Seattle
        output_dir=tempfile.mkdtemp(),
        limit=1000,
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    vis_path = Path(result["visualization"])
    assert raw_path.exists()
    assert vis_path.exists()
    assert raw_path.stat().st_size > 0
    assert vis_path.stat().st_size > 0
    assert result["collection"] == "ms-buildings"

    # Check metadata
    assert "count" in result["metadata"]
    assert result["metadata"]["count"] > 0
    assert "bbox" in result["metadata"]

    # Save visualization to samples
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_gridmet_climate_data():
    """Test downloading GridMET climate data (Zarr-based)."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI in California for GridMET (4km resolution, CONUS coverage)
    # GridMET has data from 1979-2020
    result = download_data(
        query="gridmet temperature",
        aoi=[-118.3, 34.0, -118.1, 34.2],  # 0.2 x 0.2 deg LA area
        time_range="2020-06-01/2020-06-07",  # One week in 2020
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])

    # Check that at least one visualization exists
    vis_keys = [k for k in result if k.endswith(("visualization", "spatial", "animation"))]
    assert len(vis_keys) > 0, f"No visualization found in result keys: {list(result.keys())}"

    # Check the primary visualization
    vis_path = Path(result[vis_keys[0]])
    assert vis_path.exists()
    assert vis_path.stat().st_size > 0

    assert raw_path.exists()
    assert raw_path.stat().st_size > 0
    assert result["collection"] == "gridmet"

    # Check file extension (should be .nc for NetCDF)
    assert raw_path.suffix == ".nc"

    # Check metadata
    assert "variables" in result["metadata"]
    assert "time_range" in result["metadata"]
    assert result["metadata"]["collection"] == "gridmet"

    # Save first visualization to samples
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
@pytest.mark.slow
def test_download_gridmet_large_area_climate_visualization():
    """Test downloading GridMET climate data with large-area heatmap visualization."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Large AOI in Western US for meaningful spatial patterns (4km resolution)
    # This creates a heatmap visualization and animation
    result = download_data(
        query="gridmet temperature",
        aoi=[-125, 32, -110, 42],  # Western US extent
        time_range="2020-06-01/2020-06-07",  # One week for animation
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    assert raw_path.exists()
    assert raw_path.stat().st_size > 0
    assert result["collection"] == "gridmet"
    assert raw_path.suffix == ".nc"

    # Check visualizations
    assert "visualization" in result  # Static heatmap
    assert "animation" in result  # Animated GIF

    vis_path = Path(result["visualization"])
    anim_path = Path(result["animation"])

    assert vis_path.exists()
    assert anim_path.exists()
    assert vis_path.stat().st_size > 0
    assert anim_path.stat().st_size > 0

    assert vis_path.suffix == ".jpg"
    assert anim_path.suffix == ".gif"

    # Check metadata
    assert "variables" in result["metadata"]
    assert result["metadata"]["collection"] == "gridmet"
    assert "bbox" in result["metadata"]

    # Save visualizations to samples (skip in CI for speed)
    if not os.environ.get("CI"):
        sample_vis_path = (
            Path("samples") / f"{result['collection']}-heatmap-visualization{vis_path.suffix}"
        )
        sample_anim_path = (
            Path("samples") / f"{result['collection']}-heatmap-animation{anim_path.suffix}"
        )
        shutil.copy(vis_path, sample_vis_path)
        shutil.copy(anim_path, sample_anim_path)


@pytest.mark.integration
@pytest.mark.slow
def test_download_terraclimate_large_area_climate_visualization():
    """Test downloading TerraClimate data with large-area heatmap visualization."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Large AOI in North America for meaningful spatial patterns (4km resolution)
    # This creates a heatmap visualization and animation
    result = download_data(
        query="terraclimate",
        aoi=[-130, 20, -60, 50],  # North America extent
        time_range="2020-01-01/2020-12-31",  # Full year for animation
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    assert raw_path.exists()
    assert raw_path.stat().st_size > 0
    assert result["collection"] == "terraclimate"
    assert raw_path.suffix == ".nc"

    # Check visualizations
    assert "visualization" in result  # Static heatmap
    assert "animation" in result  # Animated GIF

    vis_path = Path(result["visualization"])
    anim_path = Path(result["animation"])

    assert vis_path.exists()
    assert anim_path.exists()
    assert vis_path.stat().st_size > 0
    assert anim_path.stat().st_size > 0

    assert vis_path.suffix == ".jpg"
    assert anim_path.suffix == ".gif"

    # Check metadata
    assert "variables" in result["metadata"]
    assert result["metadata"]["collection"] == "terraclimate"
    assert "bbox" in result["metadata"]


@pytest.mark.integration
@pytest.mark.fast
def test_download_gridmet_small_area_climate_visualization():
    """Test downloading GridMET climate data with small-area heatmap visualization."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI in California for fast processing (4km resolution)
    # ~30x30km area in central California (within 1000 km² limit)
    result = download_data(
        query="gridmet temperature",
        aoi=[-121.5, 37.5, -121.2, 37.8],  # ~30x30km in Central Valley
        time_range="2020-06-01/2020-06-03",  # 3 days for fast animation
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    assert raw_path.exists()
    assert raw_path.stat().st_size > 0
    assert result["collection"] == "gridmet"
    assert raw_path.suffix == ".nc"

    # Check visualizations - animation only created for > 3 time steps
    assert "visualization" in result  # Static heatmap

    vis_path = Path(result["visualization"])
    assert vis_path.exists()
    assert vis_path.stat().st_size > 0
    assert vis_path.suffix == ".jpg"

    # Check metadata
    assert "variables" in result["metadata"]
    assert result["metadata"]["collection"] == "gridmet"
    assert "bbox" in result["metadata"]

    # Save visualizations to samples (skip in CI for speed)
    if not os.environ.get("CI"):
        sample_vis_path = (
            Path("samples") / f"{result['collection']}-small-heatmap-visualization{vis_path.suffix}"
        )
        shutil.copy(vis_path, sample_vis_path)
        # Only save animation if it exists
        if "animation" in result:
            sample_anim_path = (
                Path("samples")
                / f"{result['collection']}-small-heatmap-animation{Path(result['animation']).suffix}"
            )
            shutil.copy(result["animation"], sample_anim_path)


@pytest.mark.integration
@pytest.mark.fast
def test_download_terraclimate_small_area_climate_visualization():
    """Test downloading TerraClimate data with small-area heatmap visualization."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI in North Carolina for fast processing (4km resolution)
    # ~30x30km area to stay under 1000 km² limit
    result = download_data(
        query="terraclimate",
        aoi=[-80.0, 35.0, -79.7, 35.3],  # Small NC region
        time_range="2020-01-01/2020-03-31",  # 3 months for fast animation
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    assert raw_path.exists()
    assert raw_path.stat().st_size > 0
    assert result["collection"] == "terraclimate"
    assert raw_path.suffix == ".nc"

    # Check visualizations - animation only created for > 3 time steps
    assert "visualization" in result  # Static heatmap

    vis_path = Path(result["visualization"])
    assert vis_path.exists()
    assert vis_path.stat().st_size > 0
    assert vis_path.suffix == ".jpg"

    # Check metadata
    assert "variables" in result["metadata"]
    assert result["metadata"]["collection"] == "terraclimate"
    assert "bbox" in result["metadata"]

    # Save visualizations to samples (skip in CI for speed)
    if not os.environ.get("CI"):
        sample_vis_path = (
            Path("samples") / f"{result['collection']}-small-heatmap-visualization{vis_path.suffix}"
        )
        shutil.copy(vis_path, sample_vis_path)
        # Only save animation if it exists
        if "animation" in result:
            sample_anim_path = (
                Path("samples")
                / f"{result['collection']}-small-heatmap-animation{Path(result['animation']).suffix}"
            )
            shutil.copy(result["animation"], sample_anim_path)


@pytest.fixture
def mock_zarr_dataset():
    """Create a mock xarray Dataset for testing visualizations.

    Returns
    -------
    xr.Dataset
        Mock dataset with temperature data
    """
    # Create synthetic data similar to climate data
    lat = np.linspace(34.0, 34.2, 20)
    lon = np.linspace(-118.3, -118.1, 20)
    time = pd.date_range("2020-01-01", "2020-01-07", freq="D")  # 7 days

    # Create temperature data (in Kelvin)
    temperature = 280 + 10 * np.random.rand(len(time), len(lat), len(lon))  # 280-290K

    ds = xr.Dataset(
        {"tmmx": (["time", "lat", "lon"], temperature)},
        coords={"time": time, "lat": lat, "lon": lon},
    )

    # Add attributes
    ds["tmmx"].attrs["units"] = "K"

    return ds


@pytest.fixture
def mock_spatial_data():
    """Create mock spatial data without time dimension.

    Returns
    -------
    xr.DataArray
        Mock spatial data array
    """
    lat = np.linspace(34.0, 34.2, 20)
    lon = np.linspace(-118.3, -118.1, 20)

    # Create elevation data
    elevation = 500 + 200 * np.random.rand(len(lat), len(lon))  # 500-700m

    da = xr.DataArray(elevation, coords={"lat": lat, "lon": lon}, dims=["lat", "lon"])
    da.attrs["units"] = "m"

    return da


@pytest.mark.fast
def test_create_zarr_visualizations_with_time(mock_zarr_dataset):
    """Test _create_zarr_visualizations with time series data.

    Parameters
    ----------
    mock_zarr_dataset : xr.Dataset
        Mock dataset fixture

    Returns
    -------
    None
        Test passes if function works correctly
    """
    from planetary_computer_mcp.tools.download_data import _create_zarr_visualizations

    output_dir = tempfile.mkdtemp()

    with (
        patch("planetary_computer_mcp.tools.download_data._create_zarr_animation"),
        patch("planetary_computer_mcp.tools.download_data._create_spatial_snapshot"),
    ):
        result = _create_zarr_visualizations(mock_zarr_dataset, "test-collection", output_dir)

        # Should have visualization and animation keys (no spatial key in new logic)
        assert "visualization" in result
        assert "animation" in result
        assert len(result) == 2

        # Check file paths exist
        for path in result.values():
            assert path.startswith(output_dir)
            assert "test-collection" in path


@pytest.mark.fast
def test_create_zarr_visualizations_no_time(mock_spatial_data):
    """Test _create_zarr_visualizations with spatial-only data.

    Parameters
    ----------
    mock_spatial_data : xr.DataArray
        Mock spatial data fixture

    Returns
    -------
    None
        Test passes if function works correctly
    """
    from planetary_computer_mcp.tools.download_data import _create_zarr_visualizations

    output_dir = tempfile.mkdtemp()

    # Convert to dataset
    ds = xr.Dataset({"elevation": mock_spatial_data})

    with patch("planetary_computer_mcp.tools.download_data._create_spatial_plot"):
        result = _create_zarr_visualizations(ds, "test-collection", output_dir)

        # Should only have spatial visualization
        assert "visualization" in result
        assert len(result) == 1


@pytest.mark.fast
def test_create_spatial_snapshot(mock_zarr_dataset):
    """Test _create_spatial_snapshot creates a spatial heatmap.

    Parameters
    ----------
    mock_zarr_dataset : xr.Dataset
        Mock dataset fixture

    Returns
    -------
    None
        Test passes if spatial snapshot file is created
    """
    from planetary_computer_mcp.tools.download_data import _create_spatial_snapshot

    output_path = Path(tempfile.mkdtemp()) / "test_spatial.jpg"
    var_data = mock_zarr_dataset["tmmx"].isel(time=0)  # First time slice

    _create_spatial_snapshot(var_data, str(output_path), "tmmx", "test-collection")

    assert output_path.exists()
    assert output_path.stat().st_size > 0


@pytest.mark.fast
def test_create_spatial_plot(mock_spatial_data):
    """Test _create_spatial_plot creates a spatial visualization.

    Parameters
    ----------
    mock_spatial_data : xr.DataArray
        Mock spatial data fixture

    Returns
    -------
    None
        Test passes if spatial plot file is created
    """
    from planetary_computer_mcp.tools.download_data import _create_spatial_plot

    output_path = Path(tempfile.mkdtemp()) / "test_plot.jpg"

    _create_spatial_plot(mock_spatial_data, str(output_path), "elevation", "test-collection")

    assert output_path.exists()
    assert output_path.stat().st_size > 0


@pytest.mark.fast
def test_create_zarr_animation(mock_zarr_dataset):
    """Test _create_zarr_animation creates an animated GIF.

    Parameters
    ----------
    mock_zarr_dataset : xr.Dataset
        Mock dataset fixture

    Returns
    -------
    None
        Test passes if animation GIF file is created
    """
    from planetary_computer_mcp.tools.download_data import _create_zarr_animation

    output_path = Path(tempfile.mkdtemp()) / "test_animation.gif"

    _create_zarr_animation(mock_zarr_dataset, str(output_path), "test-collection")

    assert output_path.exists()
    assert output_path.stat().st_size > 0
    assert output_path.suffix == ".gif"
