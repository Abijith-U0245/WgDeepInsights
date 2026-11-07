import json, os, psycopg2, traceback
from psycopg2.extras import RealDictCursor

DB_CONFIG = {'host':'localhost','port':5432,'user':'postgres','password':'postgres123','dbname':'wgdeepinsight'}

def sanitize(text):
    if text is None: return ""
    t = str(text)
    t = t.replace("\u00b1","+/-").replace("\u00d7","x").replace("\u2014","-").replace("\u2013","-")
    return t.encode("ascii",errors="replace").decode("ascii")

def to_numeric(val):
    if val is None: return None
    try: return float(val)
    except: return None

def parse_param(p):
    parameter = sanitize(p.get("parameter",""))
    unit      = sanitize(p.get("unit") or "")
    raw_notes = sanitize(p.get("notes") or "")
    exp_raw   = p.get("expected")
    exp_num   = to_numeric(exp_raw)
    extra = []
    if exp_raw is not None and exp_num is None:
        extra.append(f"expected: {sanitize(str(exp_raw))}")
    tol_raw  = p.get("tolerance")
    tol_num  = to_numeric(tol_raw)
    tol_type = p.get("toleranceType","")
    if tol_num is not None:
        if tol_type == "plusMinus": extra.append(f"tolerance: +/-{tol_num}")
        elif tol_type == "maxOnly": extra.append(f"tolerance: max {tol_num}")
        elif tol_type == "classText": extra.append(f"tolerance class: {sanitize(str(tol_raw))}")
    elif tol_raw is not None:
        extra.append(f"tolerance: {sanitize(str(tol_raw))}")
    notes = "; ".join(filter(None,[raw_notes]+extra))
    return parameter, exp_num, tol_num, unit, notes

spec_path = os.path.abspath(os.path.join(os.path.dirname(__file__),"..",'parts_specs.json'))
with open(spec_path,'r',encoding='utf-8') as f:
    data = json.load(f)

conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
cur  = conn.cursor()

# Get existing part id or insert dummy
cur.execute("SELECT id::text FROM parts LIMIT 1;")
pid = cur.fetchone()["id"]

for part in data['parts']:
    print(f"\n=== {part['partNo']} {part['partName']} ===")
    for p in part.get('parameters',[]):
        parameter, exp_num, tol_num, unit, notes = parse_param(p)
        print(f"  param={repr(parameter)} exp={exp_num} tol={tol_num} unit={repr(unit)}")
        try:
            cur.execute(
                "INSERT INTO specifications (part_id,parameter,expected_value,tolerance,unit,notes) VALUES (%s::uuid,%s,%s,%s,%s,%s);",
                (pid, parameter, exp_num, tol_num, unit, notes)
            )
        except Exception as e:
            print(f"    FAIL: {e}")
            conn.rollback()
            conn.autocommit = False
            # reconnect
            conn.close()
            conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
            cur  = conn.cursor()
        else:
            conn.rollback()

cur.close()
conn.close()
print("\nDone (all rows rolled back - test only)")
