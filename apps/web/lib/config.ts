// Client-side config. Only NEXT_PUBLIC_* values reach the browser.
import { API_DEFAULT_PORT } from "@agent-town/shared";

export const API_URL: string =
  process.env["NEXT_PUBLIC_API_URL"] ?? `http://localhost:${API_DEFAULT_PORT}`;

/** Town label (ENS parent). Kenny's fixtures use the "<town>" placeholder until real mode. */
export const TOWN_NAME: string = process.env["NEXT_PUBLIC_TOWN_NAME"] ?? "botanica";
