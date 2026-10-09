export type ScanNote = {
  index: number;
  tag1: string;
  tag2: string;
  value: string;
  reasoning: string;
};

type ApiItem = {
  feedback_index?: number;
  tag1?: string | null;
  tag2?: string | null;
  value?: string | null;
  feedback_uri?: string | null;
};

type ApiPage = {
  items?: ApiItem[];
  total?: number;
};

function reasoningFrom(uri: string | null | undefined): string {
  const prefix = "data:application/json,";
  if (!uri?.startsWith(prefix)) return "";
  try {
    const doc = JSON.parse(uri.slice(prefix.length)) as { reasoning?: unknown };
    return typeof doc.reasoning === "string" ? doc.reasoning.trim() : "";
  } catch {
    return "";
  }
}

export async function loadScanFeedback(agentId: number): Promise<ScanNote[]> {
  const notes: ScanNote[] = [];
  const limit = 50;
  let offset = 0;
  for (;;) {
    const url = new URL("https://api.8004scan.io/api/v1/feedbacks");
    url.searchParams.set("chain_id", "10143");
    url.searchParams.set("agent_token_id", String(agentId));
    url.searchParams.set("is_testnet", "true");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`8004scan returned ${response.status}`);
    const body = (await response.json()) as ApiPage;
    const items = body.items ?? [];
    for (const item of items) {
      notes.push({
        index: item.feedback_index ?? 0,
        tag1: item.tag1?.trim() || "—",
        tag2: item.tag2?.trim() || "",
        value: item.value ?? "",
        reasoning: reasoningFrom(item.feedback_uri),
      });
    }
    offset += items.length;
    const total = body.total ?? offset;
    if (items.length === 0 || offset >= total || offset >= 200) break;
  }
  notes.sort((a, b) => b.index - a.index);
  return notes;
}
