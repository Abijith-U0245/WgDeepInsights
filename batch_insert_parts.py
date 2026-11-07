import os, json
import pandas as pd
from pathlib import Path

# Adjust this path if needed
excel_path = r"c:\\Users\\abiji\\deepinsight-windows\\Measurement_Chart.xlsx"

if not Path(excel_path).exists():
    raise FileNotFoundError(f"Excel file not found: {excel_path}")

# Read the first sheet
df = pd.read_excel(excel_path)

# Expected columns (case-insensitive): PartNumber, Parameter, ExpectedValue, Tolerance, Unit, Notes
# Normalize column names
col_map = {c.lower(): c for c in df.columns}
required = ['partnumber', 'parameter', 'expectedvalue', 'tolerance', 'unit']
for r in required:
    if r not in col_map:
        raise KeyError(f"Required column '{r}' not found in Excel")

# Rename for easier access
df = df.rename(columns={col_map['partnumber']: 'part_number',
                         col_map['parameter']: 'parameter',
                         col_map['expectedvalue']: 'expected_value',
                         col_map['tolerance']: 'tolerance',
                         col_map['unit']: 'unit',
                         col_map.get('notes', None): 'notes' if 'notes' in col_map else None})

# Group by part_number
parts_data = {}
for _, row in df.iterrows():
    pn = str(row['part_number']).strip()
    if not pn:
        continue
    spec = {
        'parameter': str(row['parameter']).strip(),
        'expected_value': row['expected_value'],
        'tolerance': row['tolerance'],
        'unit': str(row['unit']).strip(),
        'notes': str(row.get('notes', '')).strip()
    }
    parts_data.setdefault(pn, []).append(spec)

# Prepare payloads for insertion
payloads = []
for part_number, specs in parts_data.items():
    part_payload = {
        'part_name': part_number,
        'description': f"Part {part_number} imported from measurement chart",
        'reference_image': None,
        'geometry_image': None,
        'surface_reference': None
    }
    payloads.append({'part': part_payload, 'specs': specs})

print(json.dumps(payloads, indent=2))
