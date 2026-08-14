import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/inspection/")({
  component: () => <Navigate to="/inspection/new" replace />,
});
