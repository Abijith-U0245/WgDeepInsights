import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/measure
 * Placeholder for the dimensional measurement service (measurement.py).
 * Replace the simulation block with a call to the Python inference service.
 */
type Spec = { parameter: string; expected: number; tolerance: number; unit: string };

export const Route = createFileRoute("/api/measure")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { specifications?: Spec[] };
        const specs = body.specifications ?? [];
        const started = Date.now();

        const results = specs.map((spec) => {
          const spread = spec.tolerance * 1.4;
          const deviation = Number(((Math.random() - 0.5) * 2 * spread).toFixed(4));
          const actual = Number((spec.expected + deviation).toFixed(4));
          return {
            parameter: spec.parameter,
            expected: spec.expected,
            actual,
            deviation,
            tolerance: spec.tolerance,
            unit: spec.unit,
            status: Math.abs(deviation) <= spec.tolerance ? "pass" : "fail",
          };
        });

        return Response.json({
          results,
          status: results.every((r) => r.status === "pass") ? "pass" : "fail",
          durationMs: Date.now() - started + 900,
        });
      },
    },
  },
});
