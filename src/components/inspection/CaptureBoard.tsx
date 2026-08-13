import { useRef, useState } from "react";
import { Camera, Images, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type CapturedFrame = { id: string; file: File; preview: string };

export function CaptureBoard({
  label,
  frames,
  onChange,
  disabled,
}: {
  label: string;
  frames: CapturedFrame[];
  onChange: (next: CapturedFrame[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));
    onChange([...frames, ...next]);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary-subtle" : "border-border bg-background"
        }`}
      >
        <Images className="size-6 text-muted-foreground" />
        <p className="type-body-m font-medium text-foreground">{label}</p>
        <p className="type-caption text-muted-foreground">
          Capture from the station camera or drop image frames here
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-4" />
            Capture
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || frames.length === 0}
            onClick={() => onChange([])}
          >
            <RotateCcw className="size-4" />
            Retake all
          </Button>
        </div>
      </div>

      {frames.length > 0 && (
        <div className="mt-4">
          <p className="type-caption mb-2 text-muted-foreground">
            {frames.length} frame{frames.length > 1 ? "s" : ""} ready
          </p>
          <div className="flex flex-row gap-3 overflow-x-auto pb-2">
            {frames.map((f) => (
              <div
                key={f.id}
                className="group relative aspect-square w-20 h-20 shrink-0 overflow-hidden rounded-lg border border-border"
              >
                <img src={f.preview} alt="Captured frame preview" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => onChange(frames.filter((x) => x.id !== f.id))}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove frame"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}