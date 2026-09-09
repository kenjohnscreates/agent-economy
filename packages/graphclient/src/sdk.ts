/**
 * Typed SDK wrapper around codegen getSdk.
 * Inputs: GraphQLClient. Outputs: strongly typed query methods.
 */
import type { GraphQLClient } from "graphql-request";
import { getSdk } from "./generated/graphql.js";

export function createSdk(client: GraphQLClient) {
  return getSdk(client);
}

export type GraphSdk = ReturnType<typeof createSdk>;
