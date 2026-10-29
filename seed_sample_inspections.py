import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import random

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres123",
    "dbname": "wgdeepinsight"
}

def seed_inspections():
    conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
    cur = conn.cursor()

    cur.execute("SELECT id, part_name FROM parts;")
    parts = cur.fetchall()
    part_map = {p["part_name"]: p["id"] for p in parts}

    cur.execute("SELECT id, part_id, model_type FROM models;")
    models = cur.fetchall()

    statuses = ["PASS", "PASS", "PASS", "FAIL", "PASS"]
    shifts = ["Morning", "Afternoon", "Night"]

    print("Seeding sample historical inspections...")
    now = datetime.now()

    for i in range(1, 16):
        part_name = random.choice(list(part_map.keys()))
        pid = part_map[part_name]
        status = random.choice(statuses)
        shift = random.choice(shifts)
        duration = round(random.uniform(0.8, 3.2), 2)
        insp_num = f"INSP-202609-{1000 + i}"
        dt = now - timedelta(hours=i*3, minutes=random.randint(5, 45))

        cur.execute("""
            INSERT INTO inspections (inspection_number, inspector_id, part_id, inspection_date, inspection_time, shift, duration_seconds, status, remarks)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (insp_num, "inspector-1", pid, dt.date(), dt.time(), shift, duration, status, f"Routine inspection for {part_name}"))
        insp_id = cur.fetchone()["id"]

        # Insert sample measurements if Capnut
        if part_name == "Capnut":
            cur.execute("""
                INSERT INTO measurement_results (inspection_id, parameter, expected, actual, deviation, tolerance, unit, status)
                VALUES 
                (%s, 'OD Flats (hex width)', 35.74, 35.76, 0.02, 0.36, 'mm', 'PASS'),
                (%s, 'ID Bore Step Ø1', 17.15, 17.18, 0.03, 0.20, 'mm', 'PASS'),
                (%s, 'Overall Height', 17.50, 17.52, 0.02, 0.10, 'mm', 'PASS');
            """, (insp_id, insp_id, insp_id))
        elif part_name == "Pin":
            cur.execute("""
                INSERT INTO measurement_results (inspection_id, parameter, expected, actual, deviation, tolerance, unit, status)
                VALUES 
                (%s, 'OD (Outer Diameter ØA)', 11.979, 11.982, 0.003, 0.021, 'mm', 'PASS'),
                (%s, 'Length L (overall)', 87.60, 87.64, 0.04, 0.20, 'mm', 'PASS');
            """, (insp_id, insp_id))

        # Insert sample defect result
        cur.execute("""
            INSERT INTO defect_results (inspection_id, defect_name, confidence, status)
            VALUES (%s, %s, %s, %s);
        """, (insp_id, "OK Surface" if status == "PASS" else "Surface Scratch", 0.94 if status == "PASS" else 0.88, status))

    conn.commit()
    cur.close()
    conn.close()
    print("✅ 15 Historical inspection records seeded successfully into local PostgreSQL!")

if __name__ == "__main__":
    seed_inspections()
