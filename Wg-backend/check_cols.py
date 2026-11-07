import psycopg2
conn = psycopg2.connect(host='localhost',port=5432,user='postgres',password='postgres123',dbname='wgdeepinsight')
cur = conn.cursor()
cur.execute("SELECT part_name, reference_image FROM parts ORDER BY part_name")
for r in cur.fetchall():
    print(repr(r[0]), '|', r[1])
conn.close()
