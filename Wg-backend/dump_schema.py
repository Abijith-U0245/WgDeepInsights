import psycopg2
conn = psycopg2.connect(host='localhost',port=5432,user='postgres',password='postgres123',dbname='wgdeepinsight')
cur = conn.cursor()
cur.execute("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='specifications' ORDER BY ordinal_position;")
rows = cur.fetchall()
with open('schema_specs.txt','w') as f:
    for r in rows:
        f.write(str(r)+'\n')
conn.close()
print("Done")
