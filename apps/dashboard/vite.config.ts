import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { monadAccountApi } from "./vite.monadApi";

export default defineConfig({
  plugins: [react(), monadAccountApi()],
  server: { port: 5173 },
});
