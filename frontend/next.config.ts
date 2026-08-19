import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is served as static files by the FastAPI backend, which also
  // exposes /api. One process, one port, no cross-origin setup.
  //
  // Note that the legal templates in `templates/` at the repo root are read
  // while these pages are generated (see src/lib/templates.ts), so a build
  // needs that directory present one level above this app.
  output: "export",

  // Every route becomes a directory with an index.html, which is what the
  // backend's static mount serves for a path like /app.
  trailingSlash: true,

  // Don't generate AGENTS.md / CLAUDE.md into the app directory; this repo
  // keeps its own guidance for agents.
  agentRules: false,
};

export default nextConfig;
