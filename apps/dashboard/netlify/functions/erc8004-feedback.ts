import { loadScanFeedback } from "../../server/scanFeedback";

export default async (req: Request) => {
  const agentId = Number(new URL(req.url).searchParams.get("agentId"));
  if (!Number.isInteger(agentId) || agentId < 0) {
    return Response.json({ error: "Invalid agent id" }, { status: 400 });
  }
  try {
    return Response.json({ notes: await loadScanFeedback(agentId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "8004scan request failed";
    return Response.json({ error: message }, { status: 502 });
  }
};
