import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import uuid
from datetime import datetime, date, time

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres123"
}
TARGET_DB = "wgdeepinsight"

def create_database():
    print(f"[1] Connecting to PostgreSQL server to create database '{TARGET_DB}'...")
    conn = psycopg2.connect(**DB_CONFIG, dbname="postgres")
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (TARGET_DB,))
    exists = cursor.fetchone()
    if not exists:
        cursor.execute(f"CREATE DATABASE {TARGET_DB}")
        print(f"  [+] Database '{TARGET_DB}' created successfully.")
    else:
        print(f"  [*] Database '{TARGET_DB}' already exists.")
    cursor.close()
    conn.close()

def setup_schema_and_seed():
    print(f"\n[2] Setting up schema and seeding tables in '{TARGET_DB}'...")
    conn = psycopg2.connect(**DB_CONFIG, dbname=TARGET_DB)
    cursor = conn.cursor()

    # Enable pgcrypto for gen_random_uuid()
    cursor.execute("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";")

    # Create ENUM
    cursor.execute("""
        DO $$ BEGIN
            CREATE TYPE app_role AS ENUM ('inspection_manager', 'inspector');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Create TABLES
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            part_name VARCHAR(100) UNIQUE NOT NULL,
            description TEXT,
            reference_image TEXT,
            geometry_image TEXT,
            surface_reference TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS specifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            part_id UUID REFERENCES parts(id) ON DELETE CASCADE,
            parameter VARCHAR(255) NOT NULL,
            expected_value NUMERIC NOT NULL,
            tolerance NUMERIC DEFAULT 0,
            unit VARCHAR(20) DEFAULT 'mm',
            notes TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS models (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            part_id UUID REFERENCES parts(id) ON DELETE CASCADE,
            model_name VARCHAR(255) NOT NULL,
            model_type VARCHAR(100) NOT NULL,
            model_path VARCHAR(255) NOT NULL,
            version VARCHAR(50) DEFAULT '1.0',
            status VARCHAR(50) DEFAULT 'active',
            uploaded_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS inspections (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inspection_number VARCHAR(100) UNIQUE NOT NULL,
            inspector_id VARCHAR(255) NOT NULL,
            part_id UUID REFERENCES parts(id) ON DELETE SET NULL,
            model_id UUID REFERENCES models(id) ON DELETE SET NULL,
            inspection_date DATE DEFAULT CURRENT_DATE,
            inspection_time TIME DEFAULT CURRENT_TIME,
            shift VARCHAR(50) DEFAULT 'Morning',
            duration_seconds NUMERIC DEFAULT 0,
            area VARCHAR(100) DEFAULT 'Line-1',
            status VARCHAR(50) DEFAULT 'PASS',
            remarks TEXT DEFAULT '',
            report_url TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS captured_images (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
            image_type VARCHAR(50) DEFAULT 'top',
            image_url TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS measurement_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
            parameter VARCHAR(255) NOT NULL,
            expected NUMERIC NOT NULL,
            actual NUMERIC NOT NULL,
            deviation NUMERIC DEFAULT 0,
            tolerance NUMERIC DEFAULT 0,
            unit VARCHAR(20) DEFAULT 'mm',
            status VARCHAR(50) DEFAULT 'PASS',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS defect_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
            defect_name VARCHAR(255) NOT NULL,
            confidence NUMERIC DEFAULT 0,
            annotated_image TEXT,
            status VARCHAR(50) DEFAULT 'PASS',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            role app_role DEFAULT 'inspector',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    conn.commit()
    print("  [+] Database schema tables verified.")

    # ── SEED PARTS ─────────────────────────────────────────────────────────────
    parts_data = [
        ("Capnut", "Hexagonal cap nut with internal M16×1.5 female thread and external 1-1/8\"-12 UNF male thread boss. Used as a sealing closure in hydraulic assemblies."),
        ("Stud", "Double-ended stud bolt with 5/16\"-18 UNC 2A thread on both ends. Provides a fixed threaded post for nut fastening in mounting applications."),
        ("Adapter", "Hexagonal adapter/union fitting with M22×1.5 thread on both sides and an internal Ø19.7mm pilot bore. Bridges two hydraulic line sizes."),
        ("Pin", "Precision cylindrical pin (Ø11.979mm OD) with two transverse Ø3.2mm through-holes spaced 81.2mm apart. Used as a pivot or alignment pin.")
    ]

    part_id_map = {}
    for name, desc in parts_data:
        cursor.execute("SELECT id FROM parts WHERE part_name = %s", (name,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO parts (part_name, description) VALUES (%s, %s) RETURNING id", (name, desc))
            pid = str(cursor.fetchone()[0])
            print(f"  [+] Inserted part: {name} ({pid})")
        else:
            pid = str(row[0])
            print(f"  [*] Existing part: {name} ({pid})")
        part_id_map[name] = pid
    conn.commit()

    # ── SEED SPECIFICATIONS ────────────────────────────────────────────────────
    specs_data = [
        # CAPNUT
        (part_id_map["Capnut"], "OD Flats (hex width)", 35.74, 0.36, "mm", "36mm nominal"),
        (part_id_map["Capnut"], "ID Bore Step Ø1", 17.15, 0.20, "mm", ""),
        (part_id_map["Capnut"], "ID Bore Step Ø2", 14.575, 0.075, "mm", ""),
        (part_id_map["Capnut"], "ID Bore Step Ø3", 10.675, 0.075, "mm", ""),
        (part_id_map["Capnut"], "Overall Height", 17.50, 0.10, "mm", ""),
        (part_id_map["Capnut"], "Male Thread Boss Dia", 25.40, 0.05, "mm", "1-1/8\"-12 UNF"),
        # STUD
        (part_id_map["Stud"], "Overall Length", 38.10, 0.80, "mm", ""),
        (part_id_map["Stud"], "Shank OD", 7.90, 0.20, "mm", "5/16\"-18 UNC 2A"),
        (part_id_map["Stud"], "Metal-End Length", 11.60, 0.80, "mm", ""),
        (part_id_map["Stud"], "Nut-End Thread Length", 19.30, 0.50, "mm", ""),
        # ADAPTER
        (part_id_map["Adapter"], "OD Hex Flats", 27.00, 0.30, "mm", ""),
        (part_id_map["Adapter"], "Bore / Pilot ID", 19.70, 0.10, "mm", ""),
        (part_id_map["Adapter"], "Groove Width", 2.10, 0.10, "mm", ""),
        # PIN
        (part_id_map["Pin"], "OD (Outer Diameter ØA)", 11.979, 0.021, "mm", "h6-style"),
        (part_id_map["Pin"], "Length L (overall)", 87.60, 0.20, "mm", ""),
        (part_id_map["Pin"], "Length C (hole centres)", 81.20, 0.20, "mm", ""),
        (part_id_map["Pin"], "ID Through-hole ØD (×2)", 3.20, 0.10, "mm", "Ø3.2mm"),
        (part_id_map["Pin"], "Width / Chamfer B", 3.20, 0.10, "mm", "")
    ]

    for pid, param, exp, tol, unit, notes in specs_data:
        cursor.execute("SELECT id FROM specifications WHERE part_id = %s AND parameter = %s", (pid, param))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO specifications (part_id, parameter, expected_value, tolerance, unit, notes) VALUES (%s, %s, %s, %s, %s, %s)",
                (pid, param, exp, tol, unit, notes)
            )
    conn.commit()
    print("  [+] Specifications seeded.")

    # ── SEED MODELS ─────────────────────────────────────────────────────────────
    models_data = [
        (part_id_map["Capnut"], "Capnut Surface Defect — YOLOv11n", "Surface Defect Detection", "surface_models/Capnut_best.pt", "1.0", "active"),
        (part_id_map["Capnut"], "Capnut Dimensional Measurement", "Dimensional Measurement", "dim_models/Capnut_Measurement.py", "1.0", "active"),
        (part_id_map["Stud"], "Stud Surface Defect — YOLOv11n", "Surface Defect Detection", "surface_models/Stud_best.pt", "1.0", "active"),
        (part_id_map["Stud"], "Stud Dimensional Measurement", "Dimensional Measurement", "dim_models/Stud_Measurement.py", "1.0", "active"),
        (part_id_map["Adapter"], "Adapter Surface Defect — YOLOv11n", "Surface Defect Detection", "surface_models/Adaptor_best.pt", "1.0", "active"),
        (part_id_map["Adapter"], "Adapter Dimensional Measurement", "Dimensional Measurement", "dim_models/Adaptor_Measurement.py", "1.0", "active"),
        (part_id_map["Pin"], "Pin Surface Defect — YOLOv11n", "Surface Defect Detection", "surface_models/Pin_best.pt", "1.0", "active"),
        (part_id_map["Pin"], "Pin Dimensional Measurement", "Dimensional Measurement", "dim_models/Pin_Measurement.py", "1.0", "active")
    ]

    for pid, mname, mtype, mpath, ver, stat in models_data:
        cursor.execute("SELECT id FROM models WHERE model_name = %s", (mname,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO models (part_id, model_name, model_type, model_path, version, status) VALUES (%s, %s, %s, %s, %s, %s)",
                (pid, mname, mtype, mpath, ver, stat)
            )
    conn.commit()
    print("  [+] AI Models seeded.")

    # ── SEED PROFILES & USER ROLES ─────────────────────────────────────────────
    users_data = [
        ("Aarav Singh", "manager@wgtech.com", "inspection_manager"),
        ("Riya Patel", "inspector@wgtech.com", "inspector")
    ]

    for name, email, role in users_data:
        cursor.execute("SELECT id FROM profiles WHERE email = %s", (email,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO profiles (name, email) VALUES (%s, %s) RETURNING id", (name, email))
            uid = str(cursor.fetchone()[0])
            cursor.execute("INSERT INTO user_roles (user_id, role) VALUES (%s, %s)", (uid, role))
            print(f"  [+] Created user: {name} ({role})")
        else:
            uid = str(row[0])
            print(f"  [*] Existing user: {name}")
    conn.commit()

    cursor.close()
    conn.close()
    print("\n✅ Local PostgreSQL Database Setup & Data Transfer Complete!")

if __name__ == "__main__":
    create_database()
    setup_schema_and_seed()
