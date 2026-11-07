"""Delete old generic Pin and Stud records from DB, keeping only the 16 real parts."""
import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "host": "localhost", "port": 5432,
    "user": "postgres", "password": "postgres123", "dbname": "wgdeepinsight",
}

conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
cur  = conn.cursor()

# Show all parts before deletion
cur.execute("SELECT id::text, part_name FROM parts ORDER BY part_name")
rows = cur.fetchall()
print(f"Before: {len(rows)} parts")
for r in rows:
    print(f"  {r['part_name']}")

# Delete old generic parts that have NO part number in parentheses in their name
# These are the original legacy DB rows: "Pin" and "Stud"
to_delete = []
for r in rows:
    name = r['part_name']
    # Keep if name contains "(XXXXXXX)" — these are the new seeded parts
    import re
    if not re.search(r'\(\d+\)', name):
        # It's a legacy name like "Pin", "Stud", "Capnut", "Adapter"
        # Only delete Pin and Stud — keep Capnut and Adapter
        if name.strip().lower() in ('pin', 'stud'):
            to_delete.append((r['id'], r['part_name']))

print(f"\nWill delete: {to_delete}")
for pid, pname in to_delete:
    cur.execute("DELETE FROM specifications WHERE part_id = %s", (pid,))
    cur.execute("DELETE FROM parts WHERE id::text = %s", (pid,))
    print(f"  Deleted: {pname} ({pid})")

conn.commit()

cur.execute("SELECT COUNT(*) as c FROM parts")
total = cur.fetchone()['c']
print(f"\nAfter: {total} parts in DB")

cur.close()
conn.close()
print("Done.")
