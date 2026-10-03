import { loadMonadAccount, readAddress } from "../../server/monadAccount";

export default async (req: Request) => {
  const address = readAddress(new URL(req.url).searchParams.get("address"));
  const key = process.env.ETHERSCAN_API_KEY ?? "";
  if (!address || !key) {
    return Response.json(
      { error: address ? "Missing ETHERSCAN_API_KEY" : "Invalid address" },
      { status: 400 },
    );
  }
  try {
    return Response.json(await loadMonadAccount(key, address));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Etherscan request failed";
    return Response.json({ error: message }, { status: 502 });
  }
};
