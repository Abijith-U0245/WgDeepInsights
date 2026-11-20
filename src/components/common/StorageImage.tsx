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
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    setHasError(false);

    if (!refValue) {
      setUrl(null);
      return;
    }

    // Direct base64 data URI, HTTP URL, or blob
    if (
      refValue.startsWith("data:") ||
      refValue.startsWith("http:") ||
      refValue.startsWith("https:") ||
      refValue.startsWith("blob:")
    ) {
      setUrl(refValue);
      return;
    }

    // Raw base64 string without data: prefix
    if (refValue.length > 200 && !refValue.includes("::")) {
      setUrl(`data:image/jpeg;base64,${refValue}`);
      return;
    }

    void signedUrl(refValue).then((u) => {
      if (active) setUrl(u);
    });

    return () => {
      active = false;
    };
  }, [refValue]);

  if (!url || hasError) {
    return (
      <div
        className={
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 p-3 type-caption text-muted-foreground text-center " +
          (className ?? "")
        }
      >
        <span className="font-mono text-xs">{fallbackLabel ?? alt ?? "No image stored"}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
