import psycopg2
from psycopg2.extras import RealDictCursor
import json
import uuid
from datetime import datetime, date, time

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres123",
    "dbname": "wgdeepinsight"
}

def get_conn():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)

def json_serial(obj):
    if isinstance(obj, (datetime, date, time)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def query_all(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            rows = cur.fetchall()
            return [dict(r) for r in rows]

def query_one(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return dict(row) if row else None

def execute_sql(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            conn.commit()

# ── API HELPERS ──────────────────────────────────────────────────────────────

def get_parts():
    return query_all("SELECT id::text, part_name, description, reference_image, geometry_image, surface_reference, created_at::text FROM parts ORDER BY part_name;")

def get_specifications(part_id=None):
    if part_id:
        return query_all("SELECT id::text, part_id::text, parameter, expected_value, tolerance, unit, notes, created_at::text FROM specifications WHERE part_id = %s::uuid ORDER BY parameter;", (part_id,))
    return query_all("SELECT id::text, part_id::text, parameter, expected_value, tolerance, unit, notes, created_at::text FROM specifications ORDER BY parameter;")

def get_models(part_id=None):
    if part_id:
        return query_all("SELECT id::text, part_id::text, model_name, model_type, model_path, version, status, uploaded_at::text FROM models WHERE part_id = %s::uuid ORDER BY model_name;", (part_id,))
    return query_all("SELECT id::text, part_id::text, model_name, model_type, model_path, version, status, uploaded_at::text FROM models ORDER BY model_name;")

def get_inspections(limit=500):
    return query_all("SELECT id::text, inspection_number, inspector_id, part_id::text, model_id::text, inspection_date::text, inspection_time::text, shift, duration_seconds, area, status, remarks, report_url, created_at::text FROM inspections ORDER BY created_at DESC LIMIT %s;", (limit,))

def get_profiles():
    return query_all("SELECT id::text, name, email, created_at::text FROM profiles ORDER BY created_at;")

def get_user_roles():
    return query_all("SELECT id::text, user_id::text, role::text, created_at::text FROM user_roles;")

def get_inspection_detail(inspection_id):
    inspection = query_one("SELECT id::text, inspection_number, inspector_id, part_id::text, model_id::text, inspection_date::text, inspection_time::text, shift, duration_seconds, area, status, remarks, report_url, created_at::text FROM inspections WHERE id = %s::uuid;", (inspection_id,))
    measurements = query_all("SELECT id::text, inspection_id::text, parameter, expected, actual, deviation, tolerance, unit, status, created_at::text FROM measurement_results WHERE inspection_id = %s::uuid;", (inspection_id,))
    defects = query_all("SELECT id::text, inspection_id::text, defect_name, confidence, annotated_image, status, created_at::text FROM defect_results WHERE inspection_id = %s::uuid;", (inspection_id,))
    images = query_all("SELECT id::text, inspection_id::text, image_type, image_url, created_at::text FROM captured_images WHERE inspection_id = %s::uuid;", (inspection_id,))
    return {
        "inspection": inspection,
        "measurements": measurements,
        "defects": defects,
        "images": images
    }

def save_inspection(part_name, status, duration, measurements=None, defects=None, images=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get part_id
            cur.execute("SELECT id FROM parts WHERE LOWER(part_name) = LOWER(%s);", (part_name,))
            part_row = cur.fetchone()
            part_id = part_row["id"] if part_row else None
            
            # Generate inspection number
            insp_num = f"INSP-{int(datetime.now().timestamp())}"
            inspector_id = "inspector-1"
            
            cur.execute("""
                INSERT INTO inspections (inspection_number, inspector_id, part_id, duration_seconds, status, remarks)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id::text;
            """, (insp_num, inspector_id, part_id, duration, status, f"Batch inspection for {part_name}"))
            
            insp_id = cur.fetchone()["id"]
            
            # Insert measurements
            if measurements:
                for m in measurements:
                    cur.execute("""
                        INSERT INTO measurement_results (inspection_id, parameter, expected, actual, deviation, tolerance, unit, status)
                        VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s);
                    """, (insp_id, m.get("parameter",""), m.get("expected",0), m.get("actual",0), m.get("deviation",0), m.get("tolerance",0), m.get("unit","mm"), m.get("status","PASS")))
            
            # Insert defects
            if defects:
                for d in defects:
                    cur.execute("""
                        INSERT INTO defect_results (inspection_id, defect_name, confidence, annotated_image, status)
                        VALUES (%s::uuid, %s, %s, %s, %s);
                    """, (insp_id, d.get("defect_name",""), d.get("confidence",0.9), d.get("annotated_image"), d.get("status","PASS")))

            # Insert images
            if images:
                for img in images:
                    cur.execute("""
                        INSERT INTO captured_images (inspection_id, image_type, image_url)
                        VALUES (%s::uuid, %s, %s);
                    """, (insp_id, img.get("image_type","top"), img.get("image_url","")))

def insert_row(table_name, row_data):
    if isinstance(row_data, list):
        results = [insert_row(table_name, item) for item in row_data]
        return results

    # Get user profile for inspector_id if needed
    if table_name == "inspections" and row_data.get("inspector_id"):
        # Check if inspector_id exists in profiles or set to NULL
        prof = query_one("SELECT id FROM profiles LIMIT 1;")
        if prof:
            row_data["inspector_id"] = str(prof["id"])
        else:
            row_data["inspector_id"] = None

    if table_name == "inspections" and not row_data.get("inspection_number"):
        row_data["inspection_number"] = f"INSP-{int(datetime.now().timestamp())}"

    cols = list(row_data.keys())
    vals = list(row_data.values())
    
    col_str = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))
    
    sql = f"INSERT INTO {table_name} ({col_str}) VALUES ({placeholders}) RETURNING id::text;"
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, vals)
            conn.commit()
            inserted_id = cur.fetchone()["id"]
            return query_one(f"SELECT *, id::text FROM {table_name} WHERE id = %s::uuid;", (inserted_id,))

