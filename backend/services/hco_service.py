"""
HCO Service Layer for BioSure Analytics.

Encapsulates HCO data access logic for API routers.
"""
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase


class HCOService:
    """Service for HCO data operations."""

    @staticmethod
    async def get_top_hcos_by_ghost_patients(
        db: AsyncIOMotorDatabase,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Get top HCOs sorted by ghost patients count.

        Args:
            db: MongoDB database instance
            limit: Number of top HCOs to return (default: 5)

        Returns:
            List of HCO documents with calculated leakage_rate
        """
        hcos_collection = db["hcos"]

        cursor = hcos_collection.find({}).sort("ghost_patients", -1).limit(limit)
        hcos_data = await cursor.to_list(length=limit)

        for hco in hcos_data:
            hco["_id"] = str(hco["_id"])
            total_patients = hco["ghost_patients"] + hco["treated_patients"]
            hco["leakage_rate"] = (
                (hco["ghost_patients"] / total_patients * 100)
                if total_patients > 0
                else 0.0
            )

        return hcos_data

    @staticmethod
    async def get_hcos(
        db: AsyncIOMotorDatabase,
        region: Optional[str] = None,
        state: Optional[str] = None,
        min_ghost_patients: Optional[int] = None,
        sort_by: str = "ghost_patients",
        limit: int = 100,
        skip: int = 0,
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get paginated list of HCOs with optional filtering and sorting.

        Args:
            db: MongoDB database instance
            region: Filter by geographic region
            state: Filter by 2-character state code
            min_ghost_patients: Minimum number of ghost patients
            sort_by: Sort field (ghost_patients, leakage_rate, name)
            limit: Number of records to return
            skip: Number of records to skip for pagination

        Returns:
            Tuple of (list of HCO documents, total count)
        """
        hcos_collection = db["hcos"]

        filter_query = {}

        if region:
            filter_query["region"] = region

        if state:
            filter_query["state"] = state.upper()

        if min_ghost_patients is not None:
            filter_query["ghost_patients"] = {"$gte": min_ghost_patients}

        total = await hcos_collection.count_documents(filter_query)

        if sort_by == "leakage_rate":
            pipeline = [
                {"$match": filter_query},
                {
                    "$addFields": {
                        "leakage_rate": {
                            "$multiply": [
                                {
                                    "$divide": [
                                        "$ghost_patients",
                                        {"$add": ["$ghost_patients", "$treated_patients"]}
                                    ]
                                },
                                100
                            ]
                        }
                    }
                },
                {"$sort": {"leakage_rate": -1}},
                {"$skip": skip},
                {"$limit": limit}
            ]

            hcos_data = await hcos_collection.aggregate(pipeline).to_list(length=limit)
        elif sort_by == "name":
            cursor = hcos_collection.find(filter_query).sort("name", 1).skip(skip).limit(limit)
            hcos_data = await cursor.to_list(length=limit)
        else:
            cursor = hcos_collection.find(filter_query).sort("ghost_patients", -1).skip(skip).limit(limit)
            hcos_data = await cursor.to_list(length=limit)

        for hco in hcos_data:
            hco["_id"] = str(hco["_id"])

            if "leakage_rate" not in hco:
                total_patients = hco["ghost_patients"] + hco["treated_patients"]
                hco["leakage_rate"] = (
                    (hco["ghost_patients"] / total_patients * 100)
                    if total_patients > 0
                    else 0.0
                )

        return hcos_data, total

    @staticmethod
    async def get_hco_by_name(
        db: AsyncIOMotorDatabase,
        name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Find an HCO by name (case-insensitive, fuzzy match).

        Args:
            db: MongoDB database instance
            name: HCO name to search for

        Returns:
            HCO document if found, None otherwise
        """
        hcos_collection = db["hcos"]

        # Try exact match first (case-insensitive)
        hco = await hcos_collection.find_one(
            {"name": {"$regex": f"^{name}$", "$options": "i"}}
        )

        if hco:
            hco["_id"] = str(hco["_id"])
            return hco

        # Try partial match if exact match fails
        hco = await hcos_collection.find_one(
            {"name": {"$regex": name, "$options": "i"}}
        )

        if hco:
            hco["_id"] = str(hco["_id"])
            return hco

        return None
