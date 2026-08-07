import capnutImg from "@/assets/parts/capnut.jpg";
import pinImg from "@/assets/parts/pin.jpg";
import studImg from "@/assets/parts/stud.jpg";
import adaptorImg from "@/assets/parts/adapter.jpg";

import capnutPhoto from "@/assets/parts/capnut_photo.jpg";
import studPhoto from "@/assets/parts/stud_photo.jpg";
import adapterPhoto from "@/assets/parts/adapter_photo.jpg";
import pinPhoto from "@/assets/parts/pin_photo.jpg";

const PART_IMAGE_BY_KEY: Record<string, string> = {
  stud: studImg,
  adapter: adaptorImg,
  adaptor: adaptorImg,
  capnut: capnutImg,
  pin: pinImg,
};

const PART_PHOTO_BY_KEY: Record<string, string> = {
  stud: studPhoto,
  adapter: adapterPhoto,
  adaptor: adapterPhoto,
  capnut: capnutPhoto,
  pin: pinPhoto,
};

export const PART_REFERENCE_IMAGES = {
  stud: studImg,
  adapter: adaptorImg,
  capnut: capnutImg,
  pin: pinImg,
} as const;

export const PART_PHOTOS = {
  stud: studPhoto,
  adapter: adapterPhoto,
  capnut: capnutPhoto,
  pin: pinPhoto,
} as const;

export function partImageUrl(partName: string | null | undefined): string | null {
  if (!partName) return null;
  const key = partName.toLowerCase().replace(/[\s_-]/g, "");
  return PART_IMAGE_BY_KEY[key] ?? null;
}

export function partPhotoUrl(partName: string | null | undefined): string | null {
  if (!partName) return null;
  const key = partName.toLowerCase().replace(/[\s_-]/g, "");
  return PART_PHOTO_BY_KEY[key] ?? null;
}
