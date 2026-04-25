"""
Database seeding script for patient data.
Generates 847 patient records with realistic distributions.
"""
import asyncio
import random
from datetime import date, datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
from backend.models.patient import PatientCreate


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

# HCO names by state
HCO_NAMES = {
    "CA": ["California Medical Center", "Bay Area Health", "Los Angeles General", "San Diego Clinic", "Sacramento Hospital"],
    "TX": ["Texas Health System", "Houston Medical", "Dallas Regional", "Austin Care Center", "San Antonio Hospital"],
    "FL": ["Florida Health Network", "Miami Medical", "Tampa General", "Orlando Regional", "Jacksonville Clinic"],
    "NY": ["New York Presbyterian", "Manhattan Medical", "Brooklyn Health", "Queens Hospital", "Buffalo General"],
    "PA": ["Pennsylvania Health", "Philadelphia Medical", "Pittsburgh Regional", "Harrisburg Hospital", "Allentown Clinic"],
    "IL": ["Illinois Medical Center", "Chicago Health", "Northwestern Hospital", "Springfield Regional", "Peoria Clinic"],
    "OH": ["Ohio Health System", "Cleveland Clinic", "Columbus Medical", "Cincinnati Hospital", "Toledo Regional"],
    "GA": ["Georgia Medical Center", "Atlanta Health", "Savannah Regional", "Augusta Hospital", "Macon Clinic"],
    "NC": ["North Carolina Health", "Charlotte Medical", "Raleigh Regional", "Durham Hospital", "Greensboro Clinic"],
    "MI": ["Michigan Health System", "Detroit Medical", "Grand Rapids Regional", "Ann Arbor Hospital", "Lansing Clinic"],
}


def generate_patient_id(index: int) -> str:
    """Generate patient ID in format PT-XXXXXX."""
    return f"PT-{index:06d}"


def generate_patient_data(index: int) -> dict:
    """Generate realistic patient data."""
    # Age: 55-80 years (weighted towards 60-70)
    age = random.choices(
        range(55, 81),
        weights=[1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
        k=1
    )[0]
    
    # Sex: ~60% Male, ~40% Female
    sex = random.choices(["M", "F"], weights=[60, 40], k=1)[0]
    
    # State distribution (weighted by population)
    state = random.choices(
        list(STATE_REGION_MAP.keys()),
        weights=[30, 25, 20, 15, 10, 10, 10, 10, 8, 7],  # CA, TX, FL, NY, PA, IL, OH, GA, NC, MI
        k=1
    )[0]
    
    region = STATE_REGION_MAP[state]
    
    # Payer type distribution
    payer_type = random.choices(
        ["Commercial", "Medicare Advantage", "Medicaid", "Other"],
        weights=[25, 50, 15, 10],
        k=1
    )[0]
    
    # Prior lines: 2-5 (weighted towards 3)
    prior_lines = random.choices([2, 3, 4, 5], weights=[20, 40, 30, 10], k=1)[0]
    
    # Outcomes
    has_event_12_month = random.random() < 0.25  # ~25%
    has_retreatment_18_month = random.random() < 0.15  # ~15%
    has_toxicity_30_day = random.random() < 0.12  # ~12%
    
    # HCO assignment (50 HCOs distributed across states)
    hco_id = f"HCO-{random.randint(1, 50):03d}"
    hco_name = random.choice(HCO_NAMES[state])
    
    # Index date: Last 2 years
    days_ago = random.randint(0, 730)
    index_date = date.today() - timedelta(days=days_ago)
    
    return {
        "patient_id": generate_patient_id(index),
        "age": age,
        "sex": sex,
        "state": state,
        "region": region,
        "payer_type": payer_type,
        "index_date": index_date,
        "treating_hco_id": hco_id,
        "treating_hco_name": hco_name,
        "prior_lines": prior_lines,
        "has_event_12_month": has_event_12_month,
        "has_retreatment_18_month": has_retreatment_18_month,
        "has_toxicity_30_day": has_toxicity_30_day,
    }


async def seed_patients():
    """Seed the database with 847 patient records."""
    print("🌱 Starting patient data seeding...")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.database_name]
    patients_collection = db["patients"]
    
    try:
        # Check if data already exists
        existing_count = await patients_collection.count_documents({})
        if existing_count > 0:
            print(f"⚠️  Database already contains {existing_count} patients.")
            response = input("Do you want to clear and reseed? (yes/no): ")
            if response.lower() != "yes":
                print("❌ Seeding cancelled.")
                return
            
            # Clear existing data
            print("🗑️  Clearing existing patient data...")
            await patients_collection.delete_many({})
        
        # Generate 847 patient records
        print("📝 Generating 847 patient records...")
        patients = []
        for i in range(1, 848):
            patient_data = generate_patient_data(i)
            
            # Validate with Pydantic model
            patient = PatientCreate(**patient_data)
            
            # Convert to dict for MongoDB insertion
            patient_dict = patient.model_dump()
            
            # Convert date to datetime for MongoDB
            if isinstance(patient_dict.get("index_date"), date):
                patient_dict["index_date"] = datetime.combine(patient_dict["index_date"], datetime.min.time())
            
            patient_dict["created_at"] = datetime.utcnow()
            patient_dict["updated_at"] = datetime.utcnow()
            
            patients.append(patient_dict)
            
            if i % 100 == 0:
                print(f"  Generated {i}/847 patients...")
        
        # Insert all patients
        print("💾 Inserting patients into database...")
        result = await patients_collection.insert_many(patients)
        print(f"✅ Successfully inserted {len(result.inserted_ids)} patients!")
        
        # Create indexes
        print("🔍 Creating indexes...")
        await patients_collection.create_index("patient_id", unique=True)
        await patients_collection.create_index("region")
        await patients_collection.create_index("state")
        await patients_collection.create_index("payer_type")
        await patients_collection.create_index("age")
        print("✅ Indexes created successfully!")
        
        # Display statistics
        print("\n📊 Seeding Statistics:")
        print(f"  Total patients: {len(patients)}")
        
        # Count by region
        region_counts = {}
        for p in patients:
            region_counts[p["region"]] = region_counts.get(p["region"], 0) + 1
        print(f"  By region: {region_counts}")
        
        # Count by payer type
        payer_counts = {}
        for p in patients:
            payer_counts[p["payer_type"]] = payer_counts.get(p["payer_type"], 0) + 1
        print(f"  By payer: {payer_counts}")
        
        # Count by sex
        sex_counts = {}
        for p in patients:
            sex_counts[p["sex"]] = sex_counts.get(p["sex"], 0) + 1
        print(f"  By sex: {sex_counts}")
        
        # Average age
        avg_age = sum(p["age"] for p in patients) / len(patients)
        print(f"  Average age: {avg_age:.1f}")
        
        print("\n🎉 Patient data seeding completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(seed_patients())