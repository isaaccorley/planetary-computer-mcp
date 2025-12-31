"""
STAC client wrapper for Planetary Computer.
"""

import planetary_computer as pc
from pystac import Item
from pystac_client import Client


class PlanetaryComputerSTAC:
    """Wrapper for Planetary Computer STAC operations."""

    def __init__(self) -> None:
        self.catalog_url = "https://planetarycomputer.microsoft.com/api/stac/v1"
        self.client = Client.open(self.catalog_url)

    def search_items(
        self,
        collections: list[str],
        bbox: list[float] | None = None,
        datetime: str | None = None,
        max_cloud_cover: int | None = None,
        limit: int | None = None,
        sortby: str | None = "-datetime",
    ) -> list[Item]:
        """
        Search for STAC items.

        Parameters
        ----------
        collections : list[str]
            List of collection IDs
        bbox : list[float] or None, optional
            Bounding box [west, south, east, north]
        datetime : str or None, optional
            ISO8601 datetime range
        max_cloud_cover : int or None, optional
            Maximum cloud cover percentage
        limit : int or None, optional
            Maximum number of items to return
        sortby : str or None, optional
            Sort order. Default "-datetime" for most recent first.
            Use "+datetime" for oldest first, or None for no sorting.

        Returns
        -------
        list[Item]
            List of signed STAC items
        """
        query_params = {}
        if max_cloud_cover is not None:
            query_params["eo:cloud_cover"] = {"lt": max_cloud_cover}

        search = self.client.search(
            collections=collections,
            bbox=bbox,
            datetime=datetime,
            query=query_params if query_params else None,
            limit=limit,
            sortby=sortby,
        )

        items = list(search.items())
        return [pc.sign(item) for item in items]

    def get_collection_info(self, collection_id: str) -> dict:
        """
        Get basic info about a collection.

        Parameters
        ----------
        collection_id : str
            Collection ID

        Returns
        -------
        dict
            Dictionary with collection metadata
        """
        collection = self.client.get_collection(collection_id)
        return {
            "id": collection.id,
            "title": collection.title or "",
            "description": collection.description or "",
            "providers": [p.name for p in collection.providers] if collection.providers else [],
            "extent": {
                "temporal": collection.extent.temporal.intervals
                if collection.extent.temporal
                else None,
                "spatial": collection.extent.spatial.bboxes if collection.extent.spatial else None,
            },
        }


# Global instance
stac_client = PlanetaryComputerSTAC()
