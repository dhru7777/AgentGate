import type { Connect, Plugin } from "vite";
import { loadEnv, type ResolvedConfig } from "vite";
import { loadMonadAccount, readAddress } from "./server/monadAccount";

function attach(middlewares: Connect.Server, config: ResolvedConfig) {
  middlewares.use("/api/monad-account", (req, res) => {
    const query = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const address = readAddress(new URLSearchParams(query).get("address"));
    const key = loadEnv(config.mode, config.envDir, "").ETHERSCAN_API_KEY;
    if (!address || !key) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: address ? "Missing ETHERSCAN_API_KEY" : "Invalid address" }));
      return;
    }
    loadMonadAccount(key, address)
      .then((body) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body));
      })
      .catch((error: unknown) => {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Etherscan request failed" }));
      });
  });
}

export function monadAccountApi(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "monad-account-api",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      attach(server.middlewares, config);
    },
    configurePreviewServer(server) {
      attach(server.middlewares, config);
    },
  };
}
