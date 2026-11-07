"""Seed Pin 100631490 into the database."""
import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "host": "localhost", "port": 5432,
    "user": "postgres", "password": "postgres123", "dbname": "wgdeepinsight",
}

conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
cur  = conn.cursor()

part_no   = "100631490"
part_name = f"Pin ({part_no})"
desc      = f"Part No. {part_no} - Pins"
img       = "Part_100631490.png"

# Check if already seeded
cur.execute("SELECT id::text FROM parts WHERE description = %s", (desc,))
existing = cur.fetchone()

if existing:
    part_id = existing["id"]
    print(f"Already exists: {part_name} -> {part_id}")
else:
    cur.execute(
        "INSERT INTO parts (part_name, description, reference_image, geometry_image) VALUES (%s,%s,%s,%s) RETURNING id::text",
        (part_name, desc, img, img)
    )
    part_id = cur.fetchone()["id"]
    print(f"Inserted: {part_name} -> {part_id}")

    # Columns: part_id, parameter, expected_value, tolerance, unit, notes
    specs = [
        ("Outer Diameter",       None, None, "mm", "11.979 mm nominal"),
        ("Cross Hole Diameter",  None, None, "mm", "3.2 mm"),
        ("Total Length",         None, None, "mm", "~87.3 mm"),
        ("Coating",              None, None, "",   "Zinc phosphate / electro-zinc"),
    ]
    for param, ev, tol, unit, notes in specs:
        cur.execute(
            "INSERT INTO specifications (part_id, parameter, expected_value, tolerance, unit, notes) VALUES (%s,%s,%s,%s,%s,%s)",
            (part_id, param, ev, tol, unit, notes)
        )
    print(f"  {len(specs)} specs inserted.")

conn.commit()
cur.close()
conn.close()
print("Done.")
