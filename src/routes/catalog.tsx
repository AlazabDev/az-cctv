import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy catalogue URL: the store is the single public product catalogue. */
export const Route = createFileRoute("/catalog")({
  beforeLoad: () => {
    throw redirect({ to: "/store", replace: true });
  },
});
