import os
import json
import pandas as pd
import requests
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL = "http://localhost:8000/api"
EXCEL_PATH = r"c:\\Users\\abiji\\deepinsight-windows\\Measurement_Chart.xlsx"

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
def read_excel(path: str):
    if not Path(path).exists():
        raise FileNotFoundError(f"Excel file not found: {path}")
    df = pd.read_excel(path)
    # Normalise column names (case‑insensitive)
    df.columns = [c.strip().lower() for c in df.columns]
    # Expected columns (you can adjust if your sheet differs)
    required = {"partnumber", "parameter", "expectedvalue", "tolerance", "unit"}
    missing = required - set(df.columns)
    if missing:
        raise KeyError(f"Missing required columns in Excel: {missing}")
    # Optional notes column
    return df

def group_by_part(df: pd.DataFrame):
    parts = {}
    for _, row in df.iterrows():
        pn = str(row["partnumber"]).strip()
        if not pn:
            continue
        spec = {
            "parameter": str(row["parameter"]).strip(),
            "expected_value": row["expectedvalue"],
            "tolerance": row["tolerance"],
            "unit": str(row["unit"]).strip(),
            "notes": str(row.get("notes", "")).strip()
        }
        parts.setdefault(pn, []).append(spec)
    return parts

def insert_part(part_name: str):
    payload = {
        "part_name": part_name,
        "description": f"Imported from Measurement_Chart.xlsx – {part_name}",
        "reference_image": None,
        "geometry_image": None,
        "surface_reference": None
    }
    resp = requests.post(f"{BASE_URL}/parts", json=payload)
    resp.raise_for_status()
    return resp.json()["id"]  # the newly created UUID

def insert_specifications(part_id: str, specs: list):
    for spec in specs:
        payload = {
            "part_id": part_id,
            "parameter": spec["parameter"],
            "expected_value": spec["expected_value"],
            "tolerance": spec["tolerance"],
            "unit": spec["unit"],
            "notes": spec.get("notes", "")
        }
        resp = requests.post(f"{BASE_URL}/specifications", json=payload)
        resp.raise_for_status()

def main():
    print("🔧 Reading Excel file…")
    df = read_excel(EXCEL_PATH)
    parts = group_by_part(df)
    print(f"📦 Found {len(parts)} distinct part(s) in the sheet.")

    for part_name, specs in parts.items():
        print(f"➡️ Inserting part '{part_name}' with {len(specs)} specification(s)…")
        part_id = insert_part(part_name)
        insert_specifications(part_id, specs)
        print(f"   ✅ Part '{part_name}' inserted (id={part_id}).")

    print("\nAll done! Refresh the WGDeepInsight UI – the new parts should now appear in the dropdowns.")

if __name__ == "__main__":
    main()
