// TownRegistrar.sol ABI (packages/contracts). `register` returns a live tokenId for
// immediate use only — callers must re-read via labelhash after any grant (R3).
import { parseAbi } from "viem";

export const townRegistrarAbi = parseAbi([
  "function register(string label, address owner, uint8 role) returns (uint256 tokenId)",
  "function renew(string label, uint64 duration)",
  "function dnsName(string label) view returns (bytes)",
  "function durationOf(uint8 role) view returns (uint64)",
  "function roleBitmapOf(uint8 role) view returns (uint256)",
  "function registry() view returns (address)",
  "function resolver() view returns (address)",
  "function treasurer() view returns (address)",
  "function townLabel() view returns (string)",
  "function owner() view returns (address)",
  "event NameRegistered(uint256 indexed tokenId, string label, address indexed owner, uint8 role, uint64 expiry)",
  "error ZeroAddress()",
  "error InvalidLabel()",
  "error NameNotRegistered(string label)",
]);
