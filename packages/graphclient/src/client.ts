/**
 * Subgraph HTTP client for agent-town (Studio endpoint).
 * Reads SUBGRAPH_URL and optional GRAPH_API_KEY from env or caller config.
 * Returns a graphql-request GraphQLClient with browser User-Agent (Cloudflare 1010).
 */
import { GraphQLClient } from "graphql-request";

export type GraphClientConfig = {
  /** Studio query URL — default from process.env.SUBGRAPH_URL */
  url?: string;
  /** Studio query key — default from process.env.GRAPH_API_KEY */
  apiKey?: string;
};

const BROWSER_UA =
  "Mozilla/5.0 (compatible; AgentTown/1.0; +https://github.com/agent-town)";

/** Resolve subgraph URL; throws if missing. */
export function subgraphUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.SUBGRAPH_URL?.trim();
  if (!url) {
    throw new Error("SUBGRAPH_URL is required (set in .env, never commit)");
  }
  return url;
}

/** Build headers for Studio / gateway requests. */
export function subgraphHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": BROWSER_UA,
  };
  const key = apiKey?.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

/** Create a GraphQLClient for the agent-town subgraph. */
export function createGraphClient(config: GraphClientConfig = {}): GraphQLClient {
  const url = config.url ?? subgraphUrlFromEnv();
  const apiKey = config.apiKey ?? process.env.GRAPH_API_KEY;
  return new GraphQLClient(url, { headers: subgraphHeaders(apiKey) });
}
