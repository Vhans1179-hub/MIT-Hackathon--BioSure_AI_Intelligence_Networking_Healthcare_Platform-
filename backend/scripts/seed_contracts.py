"""
Seed Contract Templates Script

Seeds the MongoDB database with 3 contract templates for the Contract Simulator.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import backend modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
from datetime import datetime


async def seed_contract_templates():
    """Seed contract templates into MongoDB"""

    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.database_name]
    collection = db["contract_templates"]

    print("Connected to MongoDB")

    existing_count = await collection.count_documents({})
    if existing_count > 0:
        print(f"WARNING: Found {existing_count} existing contract templates")
        response = input("Do you want to delete existing templates and reseed? (y/n): ")
        if response.lower() == 'y':
            await collection.delete_many({})
            print("Deleted existing templates")
        else:
            print("Keeping existing templates. Exiting.")
            client.close()
            return

    templates = [
        {
            "template_id": "survival-12m",
            "name": "12-Month Survival Warranty",
            "description": "Rebate if patient dies or escalates to new MM treatment before 12 months",
            "outcome_type": "12-month-survival",
            "default_time_window": 12,
            "default_rebate_percent": 50,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "template_id": "retreatment-18m",
            "name": "Retreatment Warranty",
            "description": "Rebate if patient receives new high-cost MM treatment within 18 months",
            "outcome_type": "retreatment",
            "default_time_window": 18,
            "default_rebate_percent": 40,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "template_id": "toxicity-30d",
            "name": "Toxicity Warranty",
            "description": "Rebate if patient has ICU/inpatient readmission with CRS/ICANS within 30 days",
            "outcome_type": "toxicity",
            "default_time_window": 1,
            "default_rebate_percent": 30,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
    ]

    result = await collection.insert_many(templates)
    print(f"Inserted {len(result.inserted_ids)} contract templates")

    await collection.create_index("template_id", unique=True)
    print("Created unique index on template_id")

    count = await collection.count_documents({})
    print(f"Total contract templates in database: {count}")

    print("\nInserted Templates:")
    async for template in collection.find({}):
        print(f"  - {template['name']} ({template['template_id']})")
        print(f"    Outcome: {template['outcome_type']}")
        print(f"    Default: {template['default_rebate_percent']}% rebate, {template['default_time_window']} months")
        print()

    client.close()
    print("Contract template seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed_contract_templates())
