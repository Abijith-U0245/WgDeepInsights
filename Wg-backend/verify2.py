import psycopg2
conn = psycopg2.connect(host='localhost',port=5432,user='postgres',password='postgres123',dbname='wgdeepinsight')
cur = conn.cursor()
cur.execute("SELECT p.part_name, COUNT(s.id) as spec_count FROM parts p LEFT JOIN specifications s ON s.part_id=p.id GROUP BY p.part_name ORDER BY p.part_name;")
spec_rows = cur.fetchall()
cur.execute("SELECT COUNT(*) FROM parts;"); total_parts = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM specifications;"); total_specs = cur.fetchone()[0]
conn.close()
with open("verify_out2.txt","w") as f:
    f.write(f"Total Parts: {total_parts}\nTotal Specs: {total_specs}\n\nSpecs per part:\n")
    for r in spec_rows:
        f.write(f"  {r[0]}: {r[1]} specs\n")
print("done")
