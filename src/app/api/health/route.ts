export const runtime = "nodejs";

export function GET() {
  // Liveness only. Database readiness is checked by npm run db:check.
  return Response.json(
    { status: "ok", service: "doclens" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
