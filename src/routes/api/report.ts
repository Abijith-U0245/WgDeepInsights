import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/report
 * Placeholder for the PDF report service (report_generator.py).
 * Until the Python service is connected, the app renders and prints the
 * report client-side and no stored PDF URL is returned.
 */
export const Route = createFileRoute("/api/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { inspectionId?: string };
        return Response.json({
          reportUrl: null,
          inspectionId: body.inspectionId ?? null,
          generatedAt: new Date().toISOString(),
        });
      },
    },
  },
});
