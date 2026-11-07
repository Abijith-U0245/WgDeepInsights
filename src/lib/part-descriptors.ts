/**
 * Static master data for the 4 inspected part families.
 * Each entry includes the actual photograph, the engineering drawing,
 * and a rich descriptive analysis used on the Parts page and dashboards.
 */

import capnutPhoto from "@/assets/parts/capnut_photo.jpg";
import adapterPhoto from "@/assets/parts/adapter_photo.jpg";
import placeholderImg from "@/assets/parts/placeholder.png";

// AI-generated part images for the 13 new parts
import img100336950 from "@/assets/parts/Part_100336950.jpg";
import img100342310 from "@/assets/parts/Part_100342310.jpg";
import img100922920 from "@/assets/parts/Part_100922920.jpg";
import img8913505204 from "@/assets/parts/Part_8913505204.jpg";
import img4611000994 from "@/assets/parts/Part_4611000994.jpg";
import img8920100094 from "@/assets/parts/Part_8920100094.jpg";
import img100931690 from "@/assets/parts/Part_100931690.jpg";
import img8910100424 from "@/assets/parts/Part_8910100424.jpg";
import img8910100714 from "@/assets/parts/Part_8910100714.jpg";
import img8933200024 from "@/assets/parts/Part_8933200024.jpg";
import img8933200064 from "@/assets/parts/Part_8933200064.jpg";
import img100631510 from "@/assets/parts/Part_100631510.jpg";
import img8910100554 from "@/assets/parts/Part_8910100554.jpg";
import img100631490 from "@/assets/parts/Part_100631490.png";

import capnutDrawing from "@/assets/parts/capnut.jpg";
import adapterDrawing from "@/assets/parts/adapter.jpg";


export interface PartSpec {
  parameter: string;
  value: string;
  critical?: boolean;
}

export interface PartDescriptor {
  key: string;               // normalised key matching DB part_name
  partNumber: string;
  name: string;
  tagline: string;
  photo: string;
  drawing: string;
  material: string;
  surfaceProtection: string;
  weight: string;
  category: string;
  description: string;
  function: string;
  inspectionFocus: string[];
  specs: PartSpec[];
  defectTypes: string[];
  tone: "blue" | "green" | "amber" | "rose";
}

export const PART_DESCRIPTORS: PartDescriptor[] = [
  {
    key: "capnut",
    partNumber: "M 346500",
    name: "Cap Nut",
    tagline: "Hex domed closure nut — 1⅛″ 12 UNF",
    photo: capnutPhoto,
    drawing: capnutDrawing,
    material: "11C10S25 IS:4431-1978",
    surfaceProtection: "JED 256-5 (class 3)",
    weight: "152 g",
    category: "Fastener / Closure",
    description:
      "A hexagonal domed cap nut (acorn nut) used to seal and terminate the exposed end of a bolt or stud. The domed cap protects the thread from corrosion and mechanical damage while presenting a clean aesthetic finish. The A/F 36 mm hex flats allow standard wrench tightening.",
    function:
      "Seals protruding stud threads in WABCO braking system assemblies, prevents thread corrosion, and provides a tamper-evident closure. The internal 1-1/8\"-12 UNF thread engages the mating stud with a torque-specified clamp load.",
    inspectionFocus: [
      "Thread depth and pitch verification (1-1/8″ 12 UNF internal)",
      "Hex-flat dimensional check (A/F 36 ± 0.1 mm)",
      "Dome surface finish — no burrs, cracks, or pitting",
      "Perpendicularity of thread axis to seating face",
      "Surface protection coating integrity (JED 256-5)",
    ],
    specs: [
      { parameter: "Thread", value: "1-1/8\"-12 UNF (internal)", critical: true },
      { parameter: "A/F Hex", value: "36 mm", critical: true },
      { parameter: "Overall Height", value: "21.9 mm" },
      { parameter: "Cap Diameter", value: "Ø 39 mm" },
      { parameter: "Seating Face Dia", value: "Ø 34.7 mm" },
      { parameter: "Weight", value: "152 g" },
      { parameter: "Surface Area", value: "6126 mm²" },
      { parameter: "Thread Chamfer", value: "0.15 × 45° (×2)" },
    ],
    defectTypes: [
      "Thread stripped or cross-threaded",
      "Dome crack or surface pit",
      "Hex flat undersize / out-of-tolerance",
      "Missing or incomplete coating",
      "Burr on seating face",
    ],
    tone: "blue",
  },
  {
    key: "adapter",
    partNumber: "932 500 208 4",
    name: "Adapter",
    tagline: "Inside/Outside M22×1.5 thread adapter",
    photo: adapterPhoto,
    drawing: adapterDrawing,
    material: "JED-020-0 (A)",
    surfaceProtection: "JED-256-5",
    weight: "117 g",
    category: "Fluid Connector / Adapter Fitting",
    description:
      "A precision threaded adapter with M22×1.5 external threads on both sides and a Hex 27 mm wrenching flat in the centre. An internal Ø 10 mm bore passes through the part. The sealing surfaces and internal bore carry strict roughness requirements (Ra 3.2 – Ra 6.3 μm). 10° chamfer transitions into the hex on both sides.",
    function:
      "Converts or extends M22×1.5 pneumatic or hydraulic port connections in WABCO braking and air-suspension systems. The central hex enables installation with a standard 27 mm open-end wrench. The sealing face must be free of tool marks to ensure leak-free joints.",
    inspectionFocus: [
      "External thread profile M22×1.5 on both ends",
      "Hex across-flats 27 mm (ISO 2768-mK)",
      "Overall length 44 mm; threaded sections 12 mm and 24 mm",
      "Through-bore diameter Ø 10 mm",
      "Sealing surface roughness Ra ≤ 3.2 μm",
      "Chamfer 0.75 × 45° both sides; 2× R 0.5 groove root radii",
      "Freedom from burrs, sharp edges, and tool marks on sealing surface",
    ],
    specs: [
      { parameter: "Thread (both ends)", value: "M22×1.5 external", critical: true },
      { parameter: "Hex A/F", value: "27 mm", critical: true },
      { parameter: "Overall Length", value: "44 mm", critical: true },
      { parameter: "Through-bore", value: "Ø 10 mm" },
      { parameter: "Sealing Ra", value: "≤ 3.2 μm" },
      { parameter: "Thread engagement (hex side)", value: "12 mm (ref 8 mm unthreaded)" },
      { parameter: "Thread engagement (far side)", value: "24 mm" },
      { parameter: "Weight", value: "117 g" },
    ],
    defectTypes: [
      "Thread galling or wrong pitch (M22×1.5)",
      "Sealing surface scratches or tool marks",
      "Hex undersize / out of round",
      "Through-bore blocked or undersized",
      "Burr on chamfer edge",
    ],
    tone: "amber",
  },
  // New Screws
  {
    key: "100336950",
    partNumber: "100336950",
    name: "Pressure Setting Screw",
    tagline: "M6×1 slot-head pressure setting screw — 18.5 mm",
    photo: img100336950,
    drawing: img100336950,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Screws",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "Slot Width", value: "1.1 mm" },
      { parameter: "Total Length", value: "18.5 mm" },
      { parameter: "External Thread", value: "M6×1" }
    ],
    defectTypes: [],
    tone: "amber"
  },
  {
    key: "100342310",
    partNumber: "100342310",
    name: "Pressure Setting Screw",
    tagline: "M6×1 slot-head pressure setting screw — 30 mm",
    photo: img100342310,
    drawing: img100342310,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Screws",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "Slot Width", value: "1.1 mm" },
      { parameter: "Total Length", value: "30 mm" },
      { parameter: "External Thread", value: "M6×1" }
    ],
    defectTypes: [],
    tone: "amber"
  },
  {
    key: "100922920",
    partNumber: "100922920",
    name: "Countersunk Screw",
    tagline: "M4×0.7 countersunk flat-head screw — 16 mm",
    photo: img100922920,
    drawing: img100922920,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Screws",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread", value: "M4×0.7" },
      { parameter: "Total Length", value: "16 mm" },
      { parameter: "Head Slot Width", value: "0.9 mm" },
      { parameter: "Head Outer Diameter", value: "7.32 mm" }
    ],
    defectTypes: [],
    tone: "amber"
  },
  {
    key: "8913505204",
    partNumber: "8913505204",
    name: "Bleeder Screw",
    tagline: "M7×1 hex-head bleeder screw with cross-hole",
    photo: img8913505204,
    drawing: img8913505204,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Screws",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread", value: "M7×1" },
      { parameter: "Step Diameter", value: "5.19 mm" },
      { parameter: "Outer Diameter", value: "7 mm" },
      { parameter: "Diameter", value: "5 mm" },
      { parameter: "Cross Hole Diameter", value: "1.5 mm" },
      { parameter: "Inner Diameter (Ø3 bore)", value: "3.125 mm" },
      { parameter: "Inner Diameter (Ø2 bore)", value: "2.125 mm" },
      { parameter: "Across Flat (Hex 8)", value: "7.935 mm" },
      { parameter: "Depth", value: "26.95 mm" }
    ],
    defectTypes: [],
    tone: "amber"
  },
  // New Pins
  {
    key: "100631490",
    partNumber: "100631490",
    name: "Pin",
    tagline: "Cylindrical retention pin — Ø11.979 × 87.3 mm",
    photo: img100631490,
    drawing: img100631490,
    material: "Alloy steel — zinc plated",
    surfaceProtection: "Zinc phosphate / electro-zinc",
    weight: "~82 g (est.)",
    category: "Pins",
    description: "Precision cylindrical pin with cross-drilled holes at each end for locking in WABCO brake actuator linkages. Similar in form to 100631510 but with shorter overall length.",
    function: "Pivot and locking pin in WABCO brake valve assemblies. Cross-holes accept cotter pins to prevent axial withdrawal under dynamic loads.",
    inspectionFocus: [
      "Outer diameter Ø11.979 mm — no taper or ovality",
      "Cross-hole diameter and symmetry at each end",
      "Total length within tolerance",
      "Surface finish — no longitudinal scratches",
      "Zinc coating completeness",
    ],
    specs: [
      { parameter: "Outer Diameter", value: "11.979 mm", critical: true },
      { parameter: "Cross Hole Diameter", value: "3.2 mm", critical: true },
      { parameter: "Total Length", value: "~87.3 mm" },
      { parameter: "Coating", value: "Zinc phosphate / electro-zinc" },
    ],
    defectTypes: ["Bent shank", "Cross-hole off-position", "Diameter OOT", "Surface scratch", "Coating missing"],
    tone: "rose"
  },
  {
    key: "100631510",
    partNumber: "100631510",
    name: "Pin",
    tagline: "Cross-drilled cylindrical pin — Ø11.979 × 87.6 mm",
    photo: img100631510,
    drawing: img100631510,
    material: "Alloy steel — zinc plated",
    surfaceProtection: "Zinc phosphate / electro-zinc",
    weight: "~85 g (est.)",
    category: "Pins",
    description: "A precision cylindrical pin with cross-drilled holes used for retention and locking in brake actuator linkages.",
    function: "Pivot and locking pin in WABCO brake valve assemblies. Cross-holes accept cotter pins to prevent axial withdrawal.",
    inspectionFocus: [
      "Outer diameter Ø11.979 mm — no taper or ovality",
      "Cross-hole diameter Ø3.2 mm and symmetry",
      "Hole-to-end lengths within tolerance",
      "Total length 87.6 ±0.2 mm",
    ],
    specs: [
      { parameter: "Outer Diameter", value: "11.979 mm", critical: true },
      { parameter: "Cross Hole Diameter", value: "3.2 mm", critical: true },
      { parameter: "Length-2 (Hole to End, B/S)", value: "3.2 mm" },
      { parameter: "Total Length", value: "87.6 mm" },
      { parameter: "Length-1 (Hole to Hole)", value: "81.2 mm" },
    ],
    defectTypes: ["Bent shank", "Cross-hole off-position", "Diameter OOT", "Surface scratch", "Coating missing"],
    tone: "rose"
  },
  {
    key: "4611000994",
    partNumber: "4611000994",
    name: "Pin (Grooved)",
    tagline: "Grooved dowel pin — Ø12 × 60.65 mm",
    photo: img4611000994,
    drawing: img4611000994,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Pins",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "Groove Diameter", value: "9.955 mm" },
      { parameter: "Length-1 (B/S)", value: "16.3 mm" },
      { parameter: "Length-2", value: "28 mm" },
      { parameter: "Groove Width", value: "1.28 mm" },
      { parameter: "Outer Diameter", value: "11.979 mm" },
      { parameter: "Total Length", value: "60.65 mm" }
    ],
    defectTypes: [],
    tone: "rose"
  },
  {
    key: "8920100094",
    partNumber: "8920100094",
    name: "Knurl Pin",
    tagline: "Knurled retention pin — Ø6.17 × 24 mm",
    photo: img8920100094,
    drawing: img8920100094,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Pins",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "Step Diameter", value: "5.85 mm" },
      { parameter: "Total Length", value: "24 mm" },
      { parameter: "Outer Diameter (Knurl)", value: "6.17 mm" },
      { parameter: "Knurl Length", value: "12 mm" }
    ],
    defectTypes: [],
    tone: "rose"
  },
  // New Studs
  {
    key: "100931690",
    partNumber: "100931690",
    name: "Stud",
    tagline: "M12×1.5 double-ended stud bolt",
    photo: img100931690,
    drawing: img100931690,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Studs",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread 1 (Metal End)", value: "M12×1.5" },
      { parameter: "Pitch Dia 1 (Metal End)", value: "11.0615 mm" },
      { parameter: "Major Dia 1 (Metal End)", value: "11.925 mm" },
      { parameter: "Minor Dia 1 (Metal End)", value: "10.141 mm" },
      { parameter: "External Thread 2 (Nut End)", value: "M12×1.5" },
      { parameter: "Pitch Dia 2 (Nut End)", value: "10.956 mm" },
      { parameter: "Major Dia 2 (Nut End)", value: "11.882 mm" },
      { parameter: "Minor Dia 2 (Nut End)", value: "10.169 mm" },
      { parameter: "Thread Length 1 (Metal End)", value: "18.5 mm" },
      { parameter: "Thread Length 2 (Nut End)", value: "26.5 mm" },
      { parameter: "Shank Length", value: "1.75 mm" },
      { parameter: "Shank Diameter", value: "11.925 mm" }
    ],
    defectTypes: [],
    tone: "blue"
  },
  {
    key: "8910100424",
    partNumber: "8910100424",
    name: "Stud",
    tagline: "M8×1.25 double-ended stud bolt",
    photo: img8910100424,
    drawing: img8910100424,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Studs",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread 1 (Metal End)", value: "M8×1.25" },
      { parameter: "Pitch Dia 1 (Metal End)", value: "7.2235 mm" },
      { parameter: "Major Dia 1 (Metal End)", value: "7.934 mm" },
      { parameter: "Minor Dia 1 (Metal End)", value: "6.447 mm" },
      { parameter: "External Thread 2 (Nut End)", value: "M8×1.25" },
      { parameter: "Pitch Dia 2 (Nut End)", value: "7.129 mm" },
      { parameter: "Major Dia 2 (Nut End)", value: "7.894 mm" },
      { parameter: "Minor Dia 2 (Nut End)", value: "6.4735 mm" },
      { parameter: "Thread Length 1 (Metal End)", value: "16 mm" },
      { parameter: "Thread Length 2 (Nut End)", value: "21.5 mm" },
      { parameter: "Shank Length", value: "1.75 mm" },
      { parameter: "Shank Diameter", value: "7.925 mm" }
    ],
    defectTypes: [],
    tone: "blue"
  },
  {
    key: "8910100714",
    partNumber: "8910100714",
    name: "Stud",
    tagline: "M8×1.25 stud bolt — 44 mm",
    photo: img8910100714,
    drawing: img8910100714,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Studs",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread 1 (Metal End)", value: "M8×1.25" },
      { parameter: "Pitch Dia 1 (Metal End)", value: "7.2235 mm" },
      { parameter: "Major Dia 1 (Metal End)", value: "7.934 mm" },
      { parameter: "Minor Dia 1 (Metal End)", value: "6.447 mm" },
      { parameter: "External Thread 2 (Nut End)", value: "M8×1.25" },
      { parameter: "Pitch Dia 2 (Nut End)", value: "7.129 mm" },
      { parameter: "Major Dia 2 (Nut End)", value: "7.894 mm" },
      { parameter: "Minor Dia 2 (Nut End)", value: "6.4735 mm" },
      { parameter: "Thread Length 1 (Metal End)", value: "16 mm" },
      { parameter: "Thread Length 2 (Nut End)", value: "28 mm" },
      { parameter: "Shank Length", value: "1.75 mm" },
      { parameter: "Shank Diameter", value: "7.925 mm" },
      { parameter: "Total Length", value: "44 mm" }
    ],
    defectTypes: [],
    tone: "blue"
  },
  {
    key: "8933200024",
    partNumber: "8933200024",
    name: "Stud",
    tagline: "M8×1.25 double-ended stud bolt",
    photo: img8933200024,
    drawing: img8933200024,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Studs",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread 1 (Metal End)", value: "M8×1.25" },
      { parameter: "Pitch Dia 1 (Metal End)", value: "7.2235 mm" },
      { parameter: "Major Dia 1 (Metal End)", value: "7.934 mm" },
      { parameter: "Minor Dia 1 (Metal End)", value: "6.447 mm" },
      { parameter: "External Thread 2 (Nut End)", value: "M8×1.25" },
      { parameter: "Pitch Dia 2 (Nut End)", value: "7.129 mm" },
      { parameter: "Major Dia 2 (Nut End)", value: "7.894 mm" },
      { parameter: "Minor Dia 2 (Nut End)", value: "6.4735 mm" },
      { parameter: "Thread Length 1 (Metal End)", value: "16 mm" },
      { parameter: "Thread Length 2 (Nut End)", value: "21.5 mm" },
      { parameter: "Shank Length", value: "1.75 mm" },
      { parameter: "Shank Diameter", value: "7.925 mm" }
    ],
    defectTypes: [],
    tone: "blue"
  },
  {
    key: "8933200064",
    partNumber: "8933200064",
    name: "Stud",
    tagline: "M12×1.5 / M12×1.75 dual-thread stud bolt",
    photo: img8933200064,
    drawing: img8933200064,
    material: "",
    surfaceProtection: "",
    weight: "",
    category: "Studs",
    description: "",
    function: "",
    inspectionFocus: [],
    specs: [
      { parameter: "External Thread 1 (Metal End)", value: "M12×1.5" },
      { parameter: "Pitch Dia 1 (Metal End)", value: "10.981 mm" },
      { parameter: "Major Dia 1 (Metal End)", value: "11.925 mm" },
      { parameter: "Minor Dia 1 (Metal End)", value: "10.247 mm" },
      { parameter: "External Thread 2 (Nut End)", value: "M12×1.75" },
      { parameter: "Pitch Dia 2 (Nut End)", value: "10.788 mm" },
      { parameter: "Major Dia 2 (Nut End)", value: "11.8675 mm" },
      { parameter: "Minor Dia 2 (Nut End)", value: "9.87 mm" },
      { parameter: "Thread Length 1 (Metal End)", value: "18 mm" },
      { parameter: "Thread Length 2 (Total, Nut Side)", value: "35 mm" },
      { parameter: "Thread Length 3 (Nut End)", value: "30 mm" },
      { parameter: "Shank Diameter", value: "12 mm" }
    ],
    defectTypes: [],
    tone: "blue"
  },
  {
    key: "100937080",
    partNumber: "100937080",
    name: "Stud",
    tagline: "5/16\u2033-18 UNC / M8 dual-thread stud bolt — 38.1 mm",
    photo: img8910100554,
    drawing: img8910100554,
    material: "JED-051M4",
    surfaceProtection: "JED-256-5 (A)",
    weight: "~19 g",
    category: "Studs",
    description: "Double-ended stud with 5/16\"-18 UNC on one end and M8 thread on the other. Used in mixed-thread assemblies.",
    function: "Bridges metric and UNC threaded bores in WABCO valve body assemblies.",
    inspectionFocus: [
      "Thread 1 (Nut End): 5/16\"-18 UNC",
      "Thread 2 (Metal End): 5/16\"-18 UNC internally, M8 externally",
      "Overall length 38.1 ±0.8 mm",
      "Shank diameter Ø7.9 mm",
    ],
    specs: [
      { parameter: "External Thread 1 (Nut End)", value: "5/16\"-18 UNC", critical: true },
      { parameter: "Pitch Dia 1 (Nut End)", value: "6.93928 mm" },
      { parameter: "Major Dia 1 (Nut End)", value: "7.79653 mm" },
      { parameter: "Minor Dia 1 (Nut End)", value: "6.17474 mm" },
      { parameter: "External Thread 2 (Metal End)", value: "5/16\"-18 UNC", critical: true },
      { parameter: "Pitch Dia 2 (Metal End)", value: "6.93928 mm" },
      { parameter: "Major Dia 2 (Metal End)", value: "7.79653 mm" },
      { parameter: "Minor Dia 2 (Metal End)", value: "6.17474 mm" },
      { parameter: "Thread Length 1 (Nut End)", value: "19.3 mm" },
      { parameter: "Thread Length 2 (Metal End)", value: "11.6 mm" },
      { parameter: "Total Length", value: "38.1 mm" },
      { parameter: "Shank Diameter", value: "7.9 mm" }
    ],
    defectTypes: ["Thread damage", "Under/over length", "Bent shank", "Coating absent"],
    tone: "blue"
  }
];

const DESCRIPTOR_MAP: Record<string, PartDescriptor> = Object.fromEntries(
  PART_DESCRIPTORS.flatMap((d) => [
    [d.key, d],
    [d.partNumber, d],   // also index by part number string
  ])
);

export function getPartDescriptor(partName: string | null | undefined): PartDescriptor | null {
  if (!partName) return null;

  // Handle "Name (PartNo)" format — extract the part number
  const pnoMatch = partName.match(/\((\d+)\)\s*$/);
  if (pnoMatch?.[1]) {
    const byPno = DESCRIPTOR_MAP[pnoMatch[1]];
    if (byPno) return byPno;
  }

  // Legacy slug-based lookup
  const key = partName.toLowerCase().replace(/[\s_()-]/g, "").replace(/[^a-z0-9]/g, "");
  return DESCRIPTOR_MAP[key] ?? null;
}
