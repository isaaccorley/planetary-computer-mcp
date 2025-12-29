"""
Basic test for raster download functionality.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import tempfile
from pathlib import Path

import pytest


# Mark as integration test since it requires network access
@pytest.mark.integration
def test_download_sentinel_data():
    """Test downloading Sentinel-2 data."""
    from src.tools.download_data import download_data

    # Test with a small area
    result = download_data(
        query="sentinel-2 imagery",
        aoi=[-122.5, 37.5, -122.0, 38.0],  # Small area in SF
        time_range="2024-01-01/2024-01-31",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "sentinel-2-l2a"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "sentinel-2-l2a"
