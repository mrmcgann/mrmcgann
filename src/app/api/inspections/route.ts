// In-person inspections have ended (older app versions still call this). Mobile inspections are
// ordered from the listing instead, through /api/leads.
export async function POST() {
  return Response.json({ error: "In-person inspections aren't available any more. Update the app, then order an independent mobile inspection from the listing." }, { status: 410 });
}
