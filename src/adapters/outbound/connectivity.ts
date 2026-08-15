/**
 * The shape every outbound adapter returns from `checkConnectivity()`.
 *
 * A check answers one question: are the credentials in the environment real,
 * accepted by the vendor, and scoped for what Tamoa needs? `detail` carries the
 * evidence on success and the reason on failure, so a failing run is actionable
 * without re-running anything by hand.
 */
export interface ConnectivityResult {
  service: string;
  ok: boolean;
  detail: string;
}

export function ok(service: string, detail: string): ConnectivityResult {
  return { service, ok: true, detail };
}

export function failed(service: string, error: unknown): ConnectivityResult {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return { service, ok: false, detail };
}
