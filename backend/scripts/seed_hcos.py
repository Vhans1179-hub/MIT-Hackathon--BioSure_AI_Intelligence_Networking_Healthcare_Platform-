"""
Database seeding script for HCO data.
Generates HCO records based on existing patient data with ghost patient metrics.
"""
import asyncio
import random
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
from backend.models.hco import HCOCreate


# State to region mapping
STATE_REGION_MAP = {
    "CA": "West",
    "TX": "South",
    "FL": "South",
    "NY": "Northeast",
    "PA": "Northeast",
    "IL": "Midwest",
    "OH": "Midwest",
    "GA": "South",
    "NC": "South",
    "MI": "Midwest",
}


async def seed_hcos():
    """Seed the database with HCO records based on patient data."""
    print("🌱 Starting HCO data seeding...")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.database_name]
    patients_collection = db["patients"]
    hcos_collection = db["hcos"]
    
    try:
        # Check if HCO data already exists
        existing_count = await hcos_collection.count_documents({})
        if existing_count > 0:
            print(f"⚠️  Database already contains {existing_count} HCOs.")
            response = input("Do you want to clear and reseed? (yes/no): ")
            if response.lower() != "yes":
                print("❌ Seeding cancelled.")
                return
            
            # Clear existing data
            print("🗑️  Clearing existing HCO data...")
            await hcos_collection.delete_many({})
        
        # Check if patient data exists
        patient_count = await patients_collection.count_documents({})
        if patient_count == 0:
            print("❌ No patient data found. Please run seed_patients.py first.")
            return
        
        print(f"📊 Found {patient_count} patients in database")
        
        # Query unique HCOs from patient data
        print("🔍 Analyzing patient data to extract HCO information...")
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "hco_id": "$treating_hco_id",
                        "name": "$treating_hco_name",
                        "state": "$state",
                        "region": "$region"
                    },
                    "treated_patients": {"$sum": 1}
                }
            },
            {
                "$sort": {"_id.hco_id": 1}
            }
        ]
        
        hco_aggregates = await patients_collection.aggregate(pipeline).to_list(length=None)
        
        if not hco_aggregates:
            print("❌ No HCO data found in patient records.")
            return
        
        print(f"📝 Found {len(hco_aggregates)} unique HCOs in patient data")
        
        # Generate HCO records with ghost patients
        print("💾 Generating HCO records with ghost patient metrics...")
        hcos = []
        
        for agg in hco_aggregates:
            hco_data = agg["_id"]
            treated_count = agg["treated_patients"]
            
            # Generate ghost patients (2-5x treated count, randomized)
            multiplier = random.uniform(2.0, 5.0)
            ghost_count = int(treated_count * multiplier)
            
            hco_dict = {
                "hco_id": hco_data["hco_id"],
                "name": hco_data["name"],
                "state": hco_data["state"],
                "region": hco_data["region"],
                "treated_patients": treated_count,
                "ghost_patients": ghost_count,
            }
            
            # Validate with Pydantic model
            hco = HCOCreate(**hco_dict)
            
            # Convert to dict for MongoDB insertion
            hco_insert = hco.model_dump()
            hco_insert["created_at"] = datetime.utcnow()
            hco_insert["updated_at"] = datetime.utcnow()
            
            hcos.append(hco_insert)
        
        # Insert all HCOs
        print(f"💾 Inserting {len(hcos)} HCOs into database...")
        result = await hcos_collection.insert_many(hcos)
        print(f"✅ Successfully inserted {len(result.inserted_ids)} HCOs!")
        
        # Create indexes
        print("🔍 Creating indexes...")
        await hcos_collection.create_index("hco_id", unique=True)
        await hcos_collection.create_index("region")
        await hcos_collection.create_index("state")
        await hcos_collection.create_index("ghost_patients")
        print("✅ Indexes created successfully!")
        
        # Display statistics
        print("\n📊 Seeding Statistics:")
        print(f"  Total HCOs: {len(hcos)}")
        
        # Count by region
        region_counts = {}
        for h in hcos:
            region_counts[h["region"]] = region_counts.get(h["region"], 0) + 1
        print(f"  By region: {region_counts}")
        
        # Count by state
        state_counts = {}
        for h in hcos:
            state_counts[h["state"]] = state_counts.get(h["state"], 0) + 1
        print(f"  By state: {state_counts}")
        
        # Total patients
        total_treated = sum(h["treated_patients"] for h in hcos)
        total_ghost = sum(h["ghost_patients"] for h in hcos)
        print(f"  Total treated patients: {total_treated}")
        print(f"  Total ghost patients: {total_ghost}")
        
        # Leakage rate
        leakage_rate = (total_ghost / (total_ghost + total_treated)) * 100
        print(f"  Overall leakage rate: {leakage_rate:.1f}%")
        
        # Average ghost per HCO
        avg_ghost = total_ghost / len(hcos)
        print(f"  Average ghost per HCO: {avg_ghost:.1f}")
        
        # Top 5 HCOs by ghost patients
        sorted_hcos = sorted(hcos, key=lambda x: x["ghost_patients"], reverse=True)
        print("\n🏆 Top 5 HCOs by Ghost Patients:")
        for i, hco in enumerate(sorted_hcos[:5], 1):
            print(f"  {i}. {hco['name']} ({hco['state']}): {hco['ghost_patients']} ghost, {hco['treated_patients']} treated")
        
        print("\n🎉 HCO data seeding completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(seed_hcos())