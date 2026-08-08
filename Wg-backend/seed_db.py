"""
seed_db.py — Seeds Supabase with 4 parts, specs, and AI model records.
Run once: python seed_db.py
"""

import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://ucsifglxuekuocycaqvl.supabase.co"
SUPABASE_KEY = "sb_publishable_tSpZ1AnGqkyG-vwy0nB3VA_CCC4A4Hs"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def get(path):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = urllib.request.Request(url, headers=HEADERS, method="GET")
    with urllib.request.urlopen(r) as res:
        return json.loads(res.read())


def post(path, body):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(r) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"  POST ERROR {e.code}: {e.read().decode()}")
        return None


# ── 1. Parts ─────────────────────────────────────────────────────────────────
print("\n[1] Checking existing parts…")
existing_parts = get("parts?select=id,part_name&order=part_name")
part_map = {p["part_name"]: p["id"] for p in existing_parts}
print(f"  Found: {list(part_map.keys())}")

PARTS = [
    {
        "part_name": "Capnut",
        "description": "Hexagonal cap nut with internal M16×1.5 female thread and external 1-1/8\"-12 UNF male thread boss. Used as a sealing closure in hydraulic assemblies.",
        "reference_image": None,
    },
    {
        "part_name": "Stud",
        "description": "Double-ended stud bolt with 5/16\"-18 UNC 2A thread on both ends. Provides a fixed threaded post for nut fastening in mounting applications.",
        "reference_image": None,
    },
    {
        "part_name": "Adapter",
        "description": "Hexagonal adapter/union fitting with M22×1.5 thread on both sides and an internal Ø19.7mm pilot bore. Bridges two hydraulic line sizes.",
        "reference_image": None,
    },
    {
        "part_name": "Pin",
        "description": "Precision cylindrical pin (Ø11.979mm OD) with two transverse Ø3.2mm through-holes spaced 81.2mm apart. Used as a pivot or alignment pin.",
        "reference_image": None,
    },
]

for p in PARTS:
    if p["part_name"] not in part_map:
        print(f"  Inserting part: {p['part_name']}…")
        result = post("parts", p)
        if result:
            part_map[p["part_name"]] = result[0]["id"] if isinstance(result, list) else result["id"]
            print(f"    → id: {part_map[p['part_name']]}")
    else:
        print(f"  Skipping (exists): {p['part_name']}")

print(f"\n  Part IDs: {part_map}")

if len(part_map) < 4:
    print("ERROR: Not all parts were created. Stopping.")
    exit(1)


# ── 2. Specifications ─────────────────────────────────────────────────────────
print("\n[2] Inserting specifications…")
existing_specs = get("specifications?select=part_id,parameter")
existing_spec_keys = {(s["part_id"], s["parameter"]) for s in existing_specs}

all_specs = []

cid = part_map["Capnut"]
all_specs += [
    {"part_id": cid, "parameter": "OD Flats (hex width)",   "expected_value": 35.74, "tolerance": 0.36,  "unit": "mm", "notes": "36mm nominal"},
    {"part_id": cid, "parameter": "ID Bore Step Ø1",         "expected_value": 17.15, "tolerance": 0.20,  "unit": "mm", "notes": ""},
    {"part_id": cid, "parameter": "ID Bore Step Ø2",         "expected_value": 14.575,"tolerance": 0.075, "unit": "mm", "notes": ""},
    {"part_id": cid, "parameter": "ID Bore Step Ø3",         "expected_value": 10.675,"tolerance": 0.075, "unit": "mm", "notes": ""},
    {"part_id": cid, "parameter": "Overall Height",           "expected_value": 17.50, "tolerance": 0.10,  "unit": "mm", "notes": ""},
    {"part_id": cid, "parameter": "Male Thread Boss Dia",     "expected_value": 25.40, "tolerance": 0.05,  "unit": "mm", "notes": "1-1/8\"-12 UNF"},
]

sid = part_map["Stud"]
all_specs += [
    {"part_id": sid, "parameter": "Overall Length",           "expected_value": 38.10, "tolerance": 0.80,  "unit": "mm", "notes": ""},
    {"part_id": sid, "parameter": "Shank OD",                 "expected_value": 7.90,  "tolerance": 0.20,  "unit": "mm", "notes": "5/16\"-18 UNC 2A"},
    {"part_id": sid, "parameter": "Metal-End Length",         "expected_value": 11.60, "tolerance": 0.80,  "unit": "mm", "notes": ""},
    {"part_id": sid, "parameter": "Nut-End Thread Length",    "expected_value": 19.30, "tolerance": 0.50,  "unit": "mm", "notes": ""},
]

aid = part_map["Adapter"]
all_specs += [
    {"part_id": aid, "parameter": "OD Hex Flats",             "expected_value": 27.00, "tolerance": 0.30,  "unit": "mm", "notes": ""},
    {"part_id": aid, "parameter": "Bore / Pilot ID",          "expected_value": 19.70, "tolerance": 0.10,  "unit": "mm", "notes": ""},
    {"part_id": aid, "parameter": "Groove Width",              "expected_value": 2.10,  "tolerance": 0.10,  "unit": "mm", "notes": ""},
]

pid = part_map["Pin"]
all_specs += [
    {"part_id": pid, "parameter": "OD (Outer Diameter ØA)",      "expected_value": 11.979,"tolerance": 0.021, "unit": "mm", "notes": "h6-style"},
    {"part_id": pid, "parameter": "Length L (overall)",           "expected_value": 87.60, "tolerance": 0.20,  "unit": "mm", "notes": ""},
    {"part_id": pid, "parameter": "Length C (hole centres)",      "expected_value": 81.20, "tolerance": 0.20,  "unit": "mm", "notes": ""},
    {"part_id": pid, "parameter": "ID Through-hole ØD (×2)",     "expected_value": 3.20,  "tolerance": 0.10,  "unit": "mm", "notes": "Ø3.2mm"},
    {"part_id": pid, "parameter": "Width / Chamfer B",           "expected_value": 3.20,  "tolerance": 0.10,  "unit": "mm", "notes": ""},
]

new_specs = [s for s in all_specs if (s["part_id"], s["parameter"]) not in existing_spec_keys]
if new_specs:
    r = post("specifications", new_specs)
    print(f"  Inserted {len(r) if r else 0} specs (skipped {len(all_specs)-len(new_specs)} existing)")
else:
    print("  All specs already exist — skipping.")


# ── 3. AI Models ───────────────────────────────────────────────────────────────
print("\n[3] Inserting AI models…")
existing_models = get("models?select=model_name")
existing_model_names = {m["model_name"] for m in existing_models}

all_models = [
    {"model_name": "Capnut Surface Defect — YOLOv11n", "part_id": part_map["Capnut"],  "model_type": "Surface Defect Detection",  "model_path": "surface_models/Capnut_best.pt",       "version": "1.0", "status": "active"},
    {"model_name": "Capnut Dimensional Measurement",   "part_id": part_map["Capnut"],  "model_type": "Dimensional Measurement",   "model_path": "dim_models/Capnut_Measurement.py",    "version": "1.0", "status": "active"},
    {"model_name": "Stud Surface Defect — YOLOv11n",   "part_id": part_map["Stud"],    "model_type": "Surface Defect Detection",  "model_path": "surface_models/Stud_best.pt",         "version": "1.0", "status": "active"},
    {"model_name": "Stud Dimensional Measurement",     "part_id": part_map["Stud"],    "model_type": "Dimensional Measurement",   "model_path": "dim_models/Stud_Measurement.py",      "version": "1.0", "status": "active"},
    {"model_name": "Adapter Surface Defect — YOLOv11n","part_id": part_map["Adapter"], "model_type": "Surface Defect Detection",  "model_path": "surface_models/Adaptor_best.pt",      "version": "1.0", "status": "active"},
    {"model_name": "Adapter Dimensional Measurement",  "part_id": part_map["Adapter"], "model_type": "Dimensional Measurement",   "model_path": "dim_models/Adaptor_Measurement.py",   "version": "1.0", "status": "active"},
    {"model_name": "Pin Surface Defect — YOLOv11n",    "part_id": part_map["Pin"],     "model_type": "Surface Defect Detection",  "model_path": "surface_models/Pin_best.pt",          "version": "1.0", "status": "active"},
    {"model_name": "Pin Dimensional Measurement",      "part_id": part_map["Pin"],     "model_type": "Dimensional Measurement",   "model_path": "dim_models/Pin_Measurement.py",       "version": "1.0", "status": "active"},
]

new_models = [m for m in all_models if m["model_name"] not in existing_model_names]
if new_models:
    r = post("models", new_models)
    print(f"  Inserted {len(r) if r else 0} models (skipped {len(all_models)-len(new_models)} existing)")
else:
    print("  All models already exist — skipping.")


print("\n✅ Seed complete!")
print(f"   Parts : {list(part_map.keys())}")
print(f"   Specs : {len(all_specs)} total ({len(new_specs)} new)")
print(f"   Models: {len(all_models)} total ({len(new_models)} new)")
