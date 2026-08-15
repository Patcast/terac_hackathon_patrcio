import { pathToFileURL } from "node:url";

/**
 * True when this module is the file node was told to run, rather than one that
 * was imported. Lets `server.ts` and `kickoff.ts` each carry a `main()` without
 * either firing when a test imports them.
 */
export function isEntrypoint(moduleUrl: string): boolean {
  const invoked = process.argv[1];
  return invoked !== undefined && moduleUrl === pathToFileURL(invoked).href;
}
