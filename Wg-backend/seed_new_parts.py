"""
seed_new_parts.py
-----------------
Reads ../parts_specs.json and inserts the 13 new parts + their
specifications into the local wgdeepinsight PostgreSQL database.

Run from the Wg-backend directory:
    python seed_new_parts.py

Schema for specifications:
  id, part_id, parameter (text), expected_value (numeric),
  tolerance (numeric), unit (text), notes (text), created_at
"""

import json
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres123",
    "dbname": "wgdeepinsight",
}

PART_IMAGE_MAP = {
    "100336950":  "Part_100336950.jpg",
    "100342310":  "Part_100342310.jpg",
    "100922920":  "Part_100922920.jpg",
    "8913505204": "Part_8913505204.jpg",
    "4611000994": "Part_4611000994.jpg",
    "8920100094": "Part_8920100094.jpg",
    "100631510":  "Part_100631510.jpg",
    "100931690":  "Part_100931690.jpg",
    "8910100424": "Part_8910100424.jpg",
    "8910100714": "Part_8910100714.jpg",
    "8933200024": "Part_8933200024.jpg",
    "8933200064": "Part_8933200064.jpg",
    "8910100554": "Part_8910100554.jpg",
}


def sanitize(text):
    """Strip / replace non-ASCII characters so psycopg2 stays happy."""
    if text is None:
        return ""
    t = str(text)
    t = t.replace("\u00b1", "+/-").replace("\u00d7", "x").replace("\u2014", "-").replace("\u2013", "-")
    return t.encode("ascii", errors="replace").decode("ascii")


def to_numeric(val):
    """Convert a value to float, or return None if not numeric."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_param(p):
    """
    Returns (parameter, expected_numeric, tolerance_numeric, unit, notes)
    All numeric cols return float|None; non-numeric values go into notes.
    """
    parameter = sanitize(p.get("parameter", ""))
    unit      = sanitize(p.get("unit") or "")
    raw_notes = sanitize(p.get("notes") or "")

    # ---- expected_value (numeric) ----
    exp_raw = p.get("expected")
    exp_num = to_numeric(exp_raw)
    # If expected was text (e.g. "M6x1"), put it in notes
    extra_notes = []
    if exp_raw is not None and exp_num is None:
        extra_notes.append(f"expected: {sanitize(str(exp_raw))}")

    # ---- tolerance (numeric) ----
    tol_raw  = p.get("tolerance")
    tol_num  = to_numeric(tol_raw)
    tol_type = p.get("toleranceType", "")
    # Annotate tolerance type in notes so nothing is lost
    if tol_num is not None:
        if tol_type == "plusMinus":
            extra_notes.append(f"tolerance: +/-{tol_num}")
        elif tol_type == "maxOnly":
            extra_notes.append(f"tolerance: max {tol_num}")
        elif tol_type == "classText":
            extra_notes.append(f"tolerance class: {sanitize(str(tol_raw))}")
    elif tol_raw is not None:
        # tolerance itself is text (rare) — store in notes, set column to None
        extra_notes.append(f"tolerance: {sanitize(str(tol_raw))}")

    notes = "; ".join(filter(None, [raw_notes] + extra_notes))

    return parameter, exp_num, tol_num, unit, notes


def main():
    spec_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "parts_specs.json")
    )

    if not os.path.exists(spec_path):
        print(f"ERROR: parts_specs.json not found at {spec_path}")
        sys.exit(1)

    with open(spec_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    parts = data.get("parts", [])
    print(f"Found {len(parts)} parts in parts_specs.json\n")

    conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
    cur  = conn.cursor()

    inserted_parts = 0
    inserted_specs = 0
    skipped_parts  = 0

    for part in parts:
        part_no   = part["partNo"]
        part_name = sanitize(part["partName"])
        family    = sanitize(part.get("family", ""))
        params    = part.get("parameters", [])
        description = f"Part No. {part_no} - {family}"
        # Use "Name (PartNo)" so each part number is a distinct row
        unique_name = f"{part_name} ({part_no})"
        img         = PART_IMAGE_MAP.get(part_no, "placeholder.png")

        # Check if already seeded (match by description which contains part_no)
        cur.execute(
            "SELECT id::text FROM parts WHERE description = %s;",
            (description,),
        )
        existing = cur.fetchone()

        if existing:
            part_id = existing["id"]
            print(f"  SKIP  {part_no} ({unique_name}) — already in DB (id={part_id})")
            skipped_parts += 1
        else:
            cur.execute(
                """
                INSERT INTO parts (part_name, description, reference_image, geometry_image)
                VALUES (%s, %s, %s, %s)
                RETURNING id::text;
                """,
                (unique_name, description, img, img),
            )
            part_id = cur.fetchone()["id"]
            print(f"  INSERT {part_no} ({unique_name}) -> id={part_id}")
            inserted_parts += 1

        # Seed specs only if none exist yet
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM specifications WHERE part_id = %s::uuid;",
            (part_id,),
        )
        spec_count = cur.fetchone()["cnt"]

        if spec_count == 0:
            for p in params:
                parameter, exp_num, tol_num, unit, notes = parse_param(p)
                cur.execute(
                    """
                    INSERT INTO specifications
                        (part_id, parameter, expected_value, tolerance, unit, notes)
                    VALUES (%s::uuid, %s, %s, %s, %s, %s);
                    """,
                    (part_id, parameter, exp_num, tol_num, unit, notes),
                )
                inserted_specs += 1
            print(f"    -> inserted {len(params)} spec rows")
        else:
            print(f"    -> specs already present ({spec_count} rows), skipping")

    conn.commit()
    cur.close()
    conn.close()

    print()
    print("=" * 55)
    print(f"Parts inserted : {inserted_parts}  |  skipped: {skipped_parts}")
    print(f"Spec rows added: {inserted_specs}")
    print("=" * 55)
    print()
    print("Restart the FastAPI backend, then refresh the dashboard.")
    print("All new parts will appear in Inspection -> New Inspection.")


if __name__ == "__main__":
    main()
