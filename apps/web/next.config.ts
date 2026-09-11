import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 regenerates AGENTS.md and CLAUDE.md in this folder on every `next dev`
  // start, which dirties the working tree. Off: those files are not ours to own.
  agentRules: false,
};

export default nextConfig;
