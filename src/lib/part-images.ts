import capnutImg from "@/assets/parts/capnut.jpg";
import pinImg from "@/assets/parts/pin.jpg";
import studImg from "@/assets/parts/stud.jpg";
import adaptorImg from "@/assets/parts/adapter.jpg";

import capnutPhoto from "@/assets/parts/capnut_photo.jpg";
import studPhoto from "@/assets/parts/stud_photo.jpg";
import adapterPhoto from "@/assets/parts/adapter_photo.jpg";
import pinPhoto from "@/assets/parts/pin_photo.jpg";

// New part photos (Part_XXXXX.jpg)
import img100336950 from "@/assets/parts/Part_100336950.jpg";
import img100342310 from "@/assets/parts/Part_100342310.jpg";
import img100922920 from "@/assets/parts/Part_100922920.jpg";
import img8913505204 from "@/assets/parts/Part_8913505204.jpg";
import img4611000994 from "@/assets/parts/Part_4611000994.jpg";
import img8920100094 from "@/assets/parts/Part_8920100094.jpg";
import img100631510 from "@/assets/parts/Part_100631510.jpg";
import img100931690 from "@/assets/parts/Part_100931690.jpg";
import img8910100424 from "@/assets/parts/Part_8910100424.jpg";
import img8910100714 from "@/assets/parts/Part_8910100714.jpg";
import img8933200024 from "@/assets/parts/Part_8933200024.jpg";
import img8933200064 from "@/assets/parts/Part_8933200064.jpg";
import img8910100554 from "@/assets/parts/Part_8910100554.jpg";
import img100631490 from "@/assets/parts/Part_100631490.png";

// ── lookup by normalised part_name key (spaces/dashes/underscores removed, lowercase) ──
const PART_IMAGE_BY_KEY: Record<string, string> = {
  // Legacy
  stud:    studImg,
  adapter: adaptorImg,
  adaptor: adaptorImg,
  capnut:  capnutImg,
  pin:     pinImg,

  // New parts — keyed by part number (extracted from "Name (PartNo)" format)
  "100336950":  img100336950,
  "100342310":  img100342310,
  "100922920":  img100922920,
  "8913505204": img8913505204,
  "4611000994": img4611000994,
  "8920100094": img8920100094,
  "100631510":  img100631510,
  "100931690":  img100931690,
  "8910100424": img8910100424,
  "8910100714": img8910100714,
  "8933200024": img8933200024,
  "8933200064": img8933200064,
  "8910100554": img8910100554,
  "100937080":  img8910100554,
  "100631490":  img100631490,
};

// Photos use the same new images (no separate photo variants for new parts)
const PART_PHOTO_BY_KEY: Record<string, string> = {
  stud:    studPhoto,
  adapter: adapterPhoto,
  adaptor: adapterPhoto,
  capnut:  capnutPhoto,
  pin:     pinPhoto,

  "100336950":  img100336950,
  "100342310":  img100342310,
  "100922920":  img100922920,
  "8913505204": img8913505204,
  "4611000994": img4611000994,
  "8920100094": img8920100094,
  "100631510":  img100631510,
  "100931690":  img100931690,
  "8910100424": img8910100424,
  "8910100714": img8910100714,
  "8933200024": img8933200024,
  "8933200064": img8933200064,
  "8910100554": img8910100554,
  "100937080":  img8910100554,
  "100631490":  img100631490,
};

export const PART_REFERENCE_IMAGES = {
  stud:    studImg,
  adapter: adaptorImg,
  capnut:  capnutImg,
  pin:     pinImg,
} as const;

export const PART_PHOTOS = {
  stud:    studPhoto,
  adapter: adapterPhoto,
  capnut:  capnutPhoto,
  pin:     pinPhoto,
} as const;

/**
 * Resolve to a local image URL for a given part name.
 *
 * Handles two formats:
 *  1. Legacy generic names — "Stud", "Capnut", "Pin", "Adapter"
 *  2. New "Name (PartNo)" format — extracts the part number in parentheses
 */
function normaliseKey(partName: string | null | undefined): string | null {
  if (!partName) return null;

  // Try extracting part number from "Name (PartNo)" format first
  const match = partName.match(/\((\d+)\)\s*$/);
  if (match) return match[1] ?? null; // e.g. "100336950"

  // Fall back to slugified name for legacy parts
  return partName.toLowerCase().replace(/[\s_()-]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Extract part number from a reference_image filename like "Part_8913505204.jpg" */
function keyFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const m = filename.match(/Part_(\d+)\.\w+$/i);
  return m ? (m[1] ?? null) : null;
}

export function partImageUrl(partName: string | null | undefined, refFilename?: string | null): string | null {
  const key = normaliseKey(partName);
  if (key && PART_IMAGE_BY_KEY[key]) return PART_IMAGE_BY_KEY[key]!;
  // fallback: try resolving from reference image filename
  const fkey = keyFromFilename(refFilename);
  if (fkey && PART_IMAGE_BY_KEY[fkey]) return PART_IMAGE_BY_KEY[fkey]!;
  return null;
}

export function partPhotoUrl(partName: string | null | undefined, refFilename?: string | null): string | null {
  const key = normaliseKey(partName);
  if (key && PART_PHOTO_BY_KEY[key]) return PART_PHOTO_BY_KEY[key]!;
  // fallback: try resolving from reference image filename
  const fkey = keyFromFilename(refFilename);
  if (fkey && PART_PHOTO_BY_KEY[fkey]) return PART_PHOTO_BY_KEY[fkey]!;
  return null;
}
