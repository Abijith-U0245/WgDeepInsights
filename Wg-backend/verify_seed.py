import psycopg2
conn = psycopg2.connect(host='localhost',port=5432,user='postgres',password='postgres123',dbname='wgdeepinsight')
cur = conn.cursor()
cur.execute("SELECT part_name, description FROM parts ORDER BY created_at DESC LIMIT 25;")
rows = cur.fetchall()
print(f"=== Parts ({len(rows)} recent) ===")
for r in rows:
    print(f"  {r[0]} | {r[1]}")
cur.execute("SELECT COUNT(*) FROM specifications;")
print(f"\nTotal spec rows: {cur.fetchone()[0]}")
cur.execute("SELECT p.part_name, COUNT(s.id) as spec_count FROM parts p LEFT JOIN specifications s ON s.part_id=p.id GROUP BY p.part_name ORDER BY p.part_name;")
print("\nSpecs per part:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} specs")
conn.close()
