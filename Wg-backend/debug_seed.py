import json, os, psycopg2, traceback
from psycopg2.extras import RealDictCursor

DB_CONFIG = {'host':'localhost','port':5432,'user':'postgres','password':'postgres123','dbname':'wgdeepinsight'}

spec_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'parts_specs.json'))
with open(spec_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

part = data['parts'][0]
params = part['parameters']

conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
cur = conn.cursor()

print("Part:", part['partNo'], part['partName'])
print("Params count:", len(params))
for i, p in enumerate(params[:3]):
    print(f"  Param {i}: {p}")

# Try inserting a single spec row with a real part id
cur.execute("SELECT id::text FROM parts LIMIT 1;")
row = cur.fetchone()
if row:
    pid = row['id']
    p = params[0]
    
    # Print all values we'd insert
    exp = p.get('expected')
    try:
        exp_num = float(exp) if exp is not None else None
    except:
        exp_num = None
    
    tol = p.get('tolerance')
    tol_str = f"+/-{tol}" if p.get('toleranceType') == 'plusMinus' else str(tol or '')
    unit = str(p.get('unit') or '').encode('ascii','replace').decode('ascii')
    notes = str(p.get('notes') or '').encode('ascii','replace').decode('ascii')
    param = str(p.get('parameter','')).encode('ascii','replace').decode('ascii')
    
    print("\nInserting spec with values:")
    print(" part_id:", pid)
    print(" parameter:", repr(param))
    print(" expected_value:", exp_num)
    print(" tolerance:", repr(tol_str))
    print(" unit:", repr(unit))
    print(" notes:", repr(notes))
    
    try:
        cur.execute(
            "INSERT INTO specifications (part_id, parameter, expected_value, tolerance, unit, notes) VALUES (%s::uuid, %s, %s, %s, %s, %s);",
            (pid, param, exp_num, tol_str, unit, notes)
        )
        print("SUCCESS")
        conn.rollback()
    except Exception as e:
        print("FAIL:", repr(e))
        traceback.print_exc()
        conn.rollback()

    # Now check schema of specifications
    cur.execute("SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name='specifications' ORDER BY ordinal_position;")
    print("\nSpecifications schema:")
    for r in cur.fetchall():
        print(" ", dict(r))
else:
    print("No parts in DB yet!")

cur.close()
conn.close()
