/**
 * Static master data for the 4 inspected part families.
 * Each entry includes the actual photograph, the engineering drawing,
 * and a rich descriptive analysis used on the Parts page and dashboards.
 */

import capnutPhoto from "@/assets/parts/capnut_photo.jpg";
import studPhoto from "@/assets/parts/stud_photo.jpg";
import adapterPhoto from "@/assets/parts/adapter_photo.jpg";
import pinPhoto from "@/assets/parts/pin_photo.jpg";

import capnutDrawing from "@/assets/parts/capnut.jpg";
import studDrawing from "@/assets/parts/stud.jpg";
import adapterDrawing from "@/assets/parts/adapter.jpg";
import pinDrawing from "@/assets/parts/pin.jpg";

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
    key: "stud",
    partNumber: "891 010 055 4",
    name: "Stud Bolt",
    tagline: "Double-ended stud — 5⁄16″-18 UNC 2A",
    photo: studPhoto,
    drawing: studDrawing,
    material: "JED-051M4",
    surfaceProtection: "JED-256-5 (A)",
    weight: "19 g",
    category: "Fastener / Threaded Stud",
    description:
      "A double-ended stud bolt with identical UNC threads on both ends and a smooth unthreaded shank in the centre. One end (metal end) presses or screws into the component body; the other (nut end) receives a securing nut. A white paint dot and drill-point mark at the metal end provide clear installation-direction identification on the shopfloor.",
    function:
      "Connects two mating components without a through-bolt. The fixed metal end locks into a tapped bore; the projecting nut end retains the mating assembly with a standard hex nut. Used in WABCO air-brake and valve assemblies.",
    inspectionFocus: [
      "Thread pitch and gauge — 5/16\"-18 UNC 2A both ends",
      "Effective thread length: metal end 11.6 ± 0.8 mm, nut end 19.3 mm",
      "Overall length 38.1 ± 0.8 mm",
      "Shank diameter Ø 7.9 mm (no thread)",
      "Paint dot and drill-point identification features present",
      "45° lead chamfer (1 × 45°) on both ends",
    ],
    specs: [
      { parameter: "Thread (both ends)", value: "5/16\"-18 UNC 2A", critical: true },
      { parameter: "Overall Length", value: "38.1 ± 0.8 mm", critical: true },
      { parameter: "Shank Diameter", value: "Ø 7.9 mm" },
      { parameter: "Metal-end Length", value: "11.6 ± 0.8 mm" },
      { parameter: "Nut-end Length", value: "19.3 mm" },
      { parameter: "Chamfer", value: "1 × 45° (both ends)" },
      { parameter: "Weight", value: "19 g" },
      { parameter: "Thread Standard", value: "ASME B1.1-1989" },
    ],
    defectTypes: [
      "Thread damage or wrong pitch",
      "Under/over length",
      "Missing paint dot or drill point",
      "Bent shank",
      "Coating absent or peeling",
    ],
    tone: "green",
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
  {
    key: "pin",
    partNumber: "100631510",
    name: "Pin",
    tagline: "Cross-drilled cylindrical dowel pin",
    photo: pinPhoto,
    drawing: pinDrawing,
    material: "Alloy steel — zinc plated",
    surfaceProtection: "Zinc phosphate / electro-zinc",
    weight: "~85 g (est.)",
    category: "Retention / Locking Pin",
    description:
      "A precision cylindrical steel pin with cross-drilled holes at each end used for retention and locking in mechanical assemblies. The smooth cylindrical body provides an accurate sliding or press fit, while the cross-drilled holes accept a split pin, cotter pin, or roll pin to prevent axial withdrawal.",
    function:
      "Used as a pivot pin, clevis pin, or locking pin in WABCO brake actuator linkages and valve assemblies. The cross-drilled holes at each end allow a cotter pin or clip to retain the assembly under dynamic loading. Precise diameter ensures correct bore fit and prevents backlash.",
    inspectionFocus: [
      "Cylindrical body diameter — no taper or ovality",
      "Overall length within tolerance",
      "Cross-hole position from each end — symmetry check",
      "Cross-hole diameter and perpendicularity to pin axis",
      "Surface finish — no longitudinal scratches or pitting",
      "Zinc coating completeness — no bare steel exposed",
    ],
    specs: [
      { parameter: "Form", value: "Cylindrical — smooth shank", critical: true },
      { parameter: "End feature", value: "Cross-drilled hole (×2 ends)", critical: true },
      { parameter: "Body surface finish", value: "Ra ≤ 1.6 μm (est.)" },
      { parameter: "Hole Ø", value: "TBD from master drawing" },
      { parameter: "Coating", value: "Zinc phosphate / electro-zinc" },
    ],
    defectTypes: [
      "Bent or bowed shank",
      "Cross-hole off-position or misaligned",
      "Diameter out of tolerance",
      "Surface scratch or gouge",
      "Missing or incomplete zinc coating",
    ],
    tone: "rose",
  },
];

const DESCRIPTOR_MAP: Record<string, PartDescriptor> = Object.fromEntries(
  PART_DESCRIPTORS.map((d) => [d.key, d]),
);

export function getPartDescriptor(partName: string | null | undefined): PartDescriptor | null {
  if (!partName) return null;
  const key = partName.toLowerCase().replace(/[\s_-]/g, "");
  return DESCRIPTOR_MAP[key] ?? null;
}
