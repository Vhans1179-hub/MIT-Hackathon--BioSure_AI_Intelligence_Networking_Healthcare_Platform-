"""
Patient Service Layer

Provides reusable data access methods for patient statistics and demographics.
"""

from typing import Dict, Any
from backend.database import get_database


class PatientService:
    """Service for accessing patient data and statistics"""
    
    @staticmethod
    async def get_patient_stats() -> Dict[str, Any]:
        """
        Get comprehensive patient statistics
        
        Returns:
            Dictionary with patient statistics including demographics and distributions
        """
        db = await get_database()
        patients_collection = db["patients"]
        
        # Aggregation pipeline for statistics
        pipeline = [
            {
                "$facet": {
                    # Total count and averages
                    "overview": [
                        {
                            "$group": {
                                "_id": None,
                                "total_patients": {"$sum": 1},
                                "avg_age": {"$avg": "$age"},
                                "avg_prior_lines": {"$avg": "$prior_lines"},
                                "male_count": {
                                    "$sum": {"$cond": [{"$eq": ["$sex", "M"]}, 1, 0]}
                                },
                                "toxicity_count": {
                                    "$sum": {"$cond": [{"$eq": ["$has_toxicity_30_day", True]}, 1, 0]}
                                },
                                "event_12m_count": {
                                    "$sum": {"$cond": [{"$eq": ["$has_event_12_month", True]}, 1, 0]}
                                },
                                "retreatment_18m_count": {
                                    "$sum": {"$cond": [{"$eq": ["$has_retreatment_18_month", True]}, 1, 0]}
                                },
                            }
                        }
                    ],
                    # Payer distribution
                    "payer_dist": [
                        {
                            "$group": {
                                "_id": "$payer_type",
                                "count": {"$sum": 1}
                            }
                        }
                    ],
                    # Region distribution
                    "region_dist": [
                        {
                            "$group": {
                                "_id": "$region",
                                "count": {"$sum": 1}
                            }
                        }
                    ],
                    # Age buckets
                    "age_buckets": [
                        {
                            "$bucket": {
                                "groupBy": "$age",
                                "boundaries": [50, 60, 70, 80, 150],
                                "default": "other",
                                "output": {
                                    "count": {"$sum": 1}
                                }
                            }
                        }
                    ]
                }
            }
        ]
        
        result = await patients_collection.aggregate(pipeline).to_list(length=1)
        
        if not result:
            return None
        
        data = result[0]
        
        # Extract overview stats
        overview = data["overview"][0] if data["overview"] else {}
        total_patients = overview.get("total_patients", 0)
        avg_age = round(overview.get("avg_age", 0))
        avg_prior_lines = round(overview.get("avg_prior_lines", 0), 1)
        male_count = overview.get("male_count", 0)
        male_percent = round((male_count / total_patients * 100) if total_patients > 0 else 0)
        toxicity_count = overview.get("toxicity_count", 0)
        toxicity_percent = round((toxicity_count / total_patients * 100) if total_patients > 0 else 0)
        event_12m_count = overview.get("event_12m_count", 0)
        event_12m_percent = round((event_12m_count / total_patients * 100) if total_patients > 0 else 0)
        retreatment_18m_count = overview.get("retreatment_18m_count", 0)
        retreatment_18m_percent = round((retreatment_18m_count / total_patients * 100) if total_patients > 0 else 0)
        
        # Convert payer distribution to dict
        payer_dist = {
            item["_id"]: item["count"]
            for item in data["payer_dist"]
        }
        
        # Convert region distribution to dict
        region_dist = {
            item["_id"]: item["count"]
            for item in data["region_dist"]
        }
        
        # Convert age buckets to dict with labels
        age_bucket_labels = {
            50: "50-59",
            60: "60-69",
            70: "70-79",
            80: "80+",
        }
        age_buckets = {
            age_bucket_labels.get(item["_id"], "other"): item["count"]
            for item in data["age_buckets"]
            if item["_id"] != "other"
        }
        
        return {
            "total_patients": total_patients,
            "avg_age": avg_age,
            "male_percent": male_percent,
            "female_percent": 100 - male_percent,
            "avg_prior_lines": avg_prior_lines,
            "payer_dist": payer_dist,
            "region_dist": region_dist,
            "age_buckets": age_buckets,
            "toxicity_count": toxicity_count,
            "toxicity_percent": toxicity_percent,
            "event_12m_count": event_12m_count,
            "event_12m_percent": event_12m_percent,
            "retreatment_18m_count": retreatment_18m_count,
            "retreatment_18m_percent": retreatment_18m_percent,
        }