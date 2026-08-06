import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/inspect
 * Placeholder for the surface defect service (surface_defect_model.pt).
 * Replace the simulation block with a call to the Python inference service.
 */
const DEFECT_CLASSES = [
  "Missing Thread",
  "Cross Thread",
  "Loose Thread",
  "Incorrect Depth",
  "Surface Scratch",
  "Porosity",
];

export const Route = createFileRoute("/api/inspect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { images?: string[] };
        const started = Date.now();
        const frames = body.images?.length ?? 1;

        const detectedCount = Math.random() < 0.55 ? 0 : 1 + Math.floor(Math.random() * 2);
        const picked = [...DEFECT_CLASSES].sort(() => Math.random() - 0.5).slice(0, detectedCount);

        const defects = picked.map((defectName, index) => ({
          defectName,
          confidence: Number((0.72 + Math.random() * 0.27).toFixed(3)),
          annotatedImage: body.images?.[index] ?? body.images?.[0] ?? null,
          status: "reject" as const,
        }));

        return Response.json({
          defects,
          status: defects.length === 0 ? "pass" : "reject",
          durationMs: Date.now() - started + 420 * frames,
        });
      },
    },
  },
});
