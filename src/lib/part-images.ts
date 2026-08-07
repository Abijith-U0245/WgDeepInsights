import capnutImg from "@/assets/parts/capnut.jpg";
import pinImg from "@/assets/parts/pin.jpg";
import studImg from "@/assets/parts/stud.jpg";
import adaptorImg from "@/assets/parts/adapter.jpg";

const PART_IMAGE_BY_KEY: Record<string, string> = {
  stud: studImg,
  adapter: adaptorImg,
  adaptor: adaptorImg,
  capnut: capnutImg,
  pin: pinImg,
};

export const PART_REFERENCE_IMAGES = {
  stud: studImg,
  adapter: adaptorImg,
  capnut: capnutImg,
  pin: pinImg,
} as const;

export function partImageUrl(partName: string | null | undefined): string | null {
  if (!partName) return null;
  const key = partName.toLowerCase().replace(/[\s_-]/g, "");
  return PART_IMAGE_BY_KEY[key] ?? null;
}
