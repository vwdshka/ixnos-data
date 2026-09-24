import type { Instrumentation } from "next";
import { report } from "@/lib/sentry";

// Server errors (rendering, route handlers, server actions) go to Sentry when a DSN is set.
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  await report(error, request.path, request.method);
};
