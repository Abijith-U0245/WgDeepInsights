import json
import urllib.request
import urllib.error
import time
import random
import string

SUPABASE_URL = "https://ucsifglxuekuocycaqvl.supabase.co"
SUPABASE_KEY = "sb_publishable_tSpZ1AnGqkyG-vwy0nB3VA_CCC4A4Hs"

def rand_string(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

email = f"manager_{rand_string()}@example.com"
password = f"WGD33p!{rand_string(12)}#"

# 1. Sign up a Manager user
print(f"Creating Manager user: {email}")
signup_url = f"{SUPABASE_URL}/auth/v1/signup"
signup_data = json.dumps({
    "email": email,
    "password": password,
    "data": {"role": "inspection_manager", "name": "Auto Seed Manager"}
}).encode()

headers = {
    "apikey": SUPABASE_KEY,
    "Content-Type": "application/json"
}

try:
    req = urllib.request.Request(signup_url, data=signup_data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as res:
        auth_res = json.loads(res.read())
        access_token = auth_res["session"]["access_token"]
        print("✅ User created and authenticated.")
except urllib.error.HTTPError as e:
    print(f"Auth Error {e.code}: {e.read().decode()}")
    exit(1)

# Now we have the manager JWT
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {access_token}",
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
        "description": "Hexagonal cap nut with internal M16×1.5 female thread and external 1-1/8\"-12 UNF male thread boss.",
    },
    {
        "part_name": "Stud",
        "description": "Double-ended stud bolt with 5/16\"-18 UNC 2A thread on both ends.",
    },
    {
        "part_name": "Adapter",
        "description": "Hexagonal adapter/union fitting with M22×1.5 thread on both sides and an internal Ø19.7mm pilot bore.",
    },
    {
        "part_name": "Pin",
        "description": "Precision cylindrical pin (Ø11.979mm OD) with two transverse Ø3.2mm through-holes spaced 81.2mm apart.",
    },
]

for p in PARTS:
    if p["part_name"] not in part_map:
        print(f"  Inserting part: {p['part_name']}…")
        result = post("parts", p)
        if result:
            part_map[p["part_name"]] = result[0]["id"] if isinstance(result, list) else result["id"]
            print(f"    → id: {part_map[p['part_name']]}")

# ── 2. Specifications ─────────────────────────────────────────────────────────
print("\n[2] Inserting specifications…")
existing_specs = get("specifications?select=part_id,parameter")
existing_spec_keys = {(s["part_id"], s["parameter"]) for s in existing_specs}

all_specs = []
if "Capnut" in part_map:
    cid = part_map["Capnut"]
    all_specs += [
        {"part_id": cid, "parameter": "OD Flats (hex width)",   "expected_value": 35.74, "tolerance": 0.36,  "unit": "mm"},
        {"part_id": cid, "parameter": "ID Bore Step Ø1",         "expected_value": 17.15, "tolerance": 0.20,  "unit": "mm"},
        {"part_id": cid, "parameter": "Overall Height",           "expected_value": 17.50, "tolerance": 0.10,  "unit": "mm"},
    ]

if "Stud" in part_map:
    sid = part_map["Stud"]
    all_specs += [
        {"part_id": sid, "parameter": "Overall Length",           "expected_value": 38.10, "tolerance": 0.80,  "unit": "mm"},
        {"part_id": sid, "parameter": "Shank OD",                 "expected_value": 7.90,  "tolerance": 0.20,  "unit": "mm"},
    ]

if "Adapter" in part_map:
    aid = part_map["Adapter"]
    all_specs += [
        {"part_id": aid, "parameter": "OD Hex Flats",             "expected_value": 27.00, "tolerance": 0.30,  "unit": "mm"},
        {"part_id": aid, "parameter": "Bore / Pilot ID",          "expected_value": 19.70, "tolerance": 0.10,  "unit": "mm"},
    ]

if "Pin" in part_map:
    pid = part_map["Pin"]
    all_specs += [
        {"part_id": pid, "parameter": "OD (Outer Diameter ØA)",      "expected_value": 11.979,"tolerance": 0.021, "unit": "mm"},
        {"part_id": pid, "parameter": "Length L (overall)",           "expected_value": 87.60, "tolerance": 0.20,  "unit": "mm"},
        {"part_id": pid, "parameter": "Length C (hole centres)",      "expected_value": 81.20, "tolerance": 0.20,  "unit": "mm"},
        {"part_id": pid, "parameter": "ID Through-hole ØD (×2)",     "expected_value": 3.20,  "tolerance": 0.10,  "unit": "mm"},
        {"part_id": pid, "parameter": "Width / Chamfer B",           "expected_value": 3.20,  "tolerance": 0.10,  "unit": "mm"},
    ]

new_specs = [s for s in all_specs if (s["part_id"], s["parameter"]) not in existing_spec_keys]
if new_specs:
    r = post("specifications", new_specs)
    print(f"  Inserted {len(r) if r else 0} specs")
else:
    print("  Specs already up to date.")

# ── 3. AI Models ───────────────────────────────────────────────────────────────
print("\n[3] Inserting AI models…")
existing_models = get("models?select=model_name")
existing_model_names = {m["model_name"] for m in existing_models}

all_models = []
if "Capnut" in part_map:
    all_models += [
        {"model_name": "Capnut Surface Defect", "part_id": part_map["Capnut"],  "model_type": "surface",  "model_path": "surface_models/Capnut_best.pt", "status": "active"},
        {"model_name": "Capnut Dim Measurement",   "part_id": part_map["Capnut"],  "model_type": "measurement",   "model_path": "dim_models/Capnut_Measurement.py", "status": "active"},
    ]
if "Stud" in part_map:
    all_models += [
        {"model_name": "Stud Surface Defect",   "part_id": part_map["Stud"],    "model_type": "surface",  "model_path": "surface_models/Stud_best.pt", "status": "active"},
        {"model_name": "Stud Dim Measurement",     "part_id": part_map["Stud"],    "model_type": "measurement",   "model_path": "dim_models/Stud_Measurement.py", "status": "active"},
    ]
if "Adapter" in part_map:
    all_models += [
        {"model_name": "Adapter Surface Defect","part_id": part_map["Adapter"], "model_type": "surface",  "model_path": "surface_models/Adaptor_best.pt", "status": "active"},
        {"model_name": "Adapter Dim Measurement",  "part_id": part_map["Adapter"], "model_type": "measurement",   "model_path": "dim_models/Adaptor_Measurement.py", "status": "active"},
    ]
if "Pin" in part_map:
    all_models += [
        {"model_name": "Pin Surface Defect",    "part_id": part_map["Pin"],     "model_type": "surface",  "model_path": "surface_models/Pin_best.pt", "status": "active"},
        {"model_name": "Pin Dim Measurement",      "part_id": part_map["Pin"],     "model_type": "measurement",   "model_path": "dim_models/Pin_Measurement.py", "status": "active"},
    ]

new_models = [m for m in all_models if m["model_name"] not in existing_model_names]
if new_models:
    r = post("models", new_models)
    print(f"  Inserted {len(r) if r else 0} models")
else:
    print("  Models already up to date.")

print("\n✅ Seed complete!")
