import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The legal templates live in `templates/` at the repo root, one level above
  // this app. They are read at build time (see src/lib/templates.ts), so Next
  // needs to trace outside the app directory when bundling.
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),

  // Don't generate AGENTS.md / CLAUDE.md into the app directory; this repo
  // keeps its own guidance for agents.
  agentRules: false,
};

export default nextConfig;
