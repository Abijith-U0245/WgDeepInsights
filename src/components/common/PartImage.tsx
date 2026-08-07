import { partImageUrl } from "@/lib/part-images";
import { StorageImage } from "@/components/common/StorageImage";
import { cn } from "@/lib/utils";

export function PartImage({
  partName,
  refValue,
  alt,
  className,
  fallbackLabel,
}: {
  partName: string;
  refValue?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const localSrc = partImageUrl(partName);

  if (localSrc) {
    return (
      <img
        src={localSrc}
        alt={alt}
        loading="lazy"
        className={cn("bg-muted object-contain", className)}
      />
    );
  }

  return (
    <StorageImage
      refValue={refValue}
      alt={alt}
      className={className}
      fallbackLabel={fallbackLabel ?? "Reference image"}
    />
  );
}
