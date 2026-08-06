import { useEffect, useState } from "react";

import { signedUrl } from "@/lib/storage";

export function StorageImage({
  refValue,
  alt,
  className,
  fallbackLabel,
}: {
  refValue: string | null | undefined;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void signedUrl(refValue).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [refValue]);

  if (!url) {
    return (
      <div
        className={
          "flex items-center justify-center rounded-lg border border-dashed border-border bg-muted type-caption text-muted-foreground " +
          (className ?? "")
        }
      >
        {fallbackLabel ?? "No image"}
      </div>
    );
  }

  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
