/**
 * Error taxonomy surfaced to the calling model.
 *
 * The rule carried over from the sibling projects: a failure must never be
 * reported as an empty result. A model that sees "no title found" cannot tell
 * that apart from a genuine absence, and will confidently tell the user the
 * series does not exist.
 *
 * That rule carries more weight here. Anime News Network answers every request
 * with HTTP 200, including its failures, which it signals with a <warning>
 * element inside the body.
 */

export type ErrorCode =
  "not_found" | "invalid_input" | "rate_limited" | "parse_failure" | "network_error" | "timeout";

export interface ErrorDetails {
  url?: string;
  status?: number;
  retryAfterMs?: number;
  hint?: string;
}

export class AnnError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "AnnError";
  }
}

const ISSUES_URL = "https://github.com/smeet666/mcp-animenewsnetwork/issues";

export function notFound(url: string, what: string): AnnError {
  return new AnnError("not_found", `Anime News Network has no entry for ${what}.`, {
    url,
    hint: "Use search_titles to find a title and its id, then call this tool with that id.",
  });
}

export function invalidInput(message: string, hint?: string): AnnError {
  return new AnnError("invalid_input", message, hint ? { hint } : {});
}

export function rateLimited(url: string, retryAfterMs: number): AnnError {
  return new AnnError(
    "rate_limited",
    "Anime News Network is rate limiting this client. This does NOT mean the title does not exist.",
    {
      url,
      retryAfterMs,
      hint:
        `Wait about ${Math.ceil(retryAfterMs / 1000)} seconds, then call the same tool again with the ` +
        "same arguments. If it keeps happening, raise ANN_MIN_INTERVAL_MS.",
    },
  );
}

/**
 * Raised when a response arrives but cannot be read as the XML we expect. The
 * common cause is a reports.xml id the site does not know, which it answers
 * with a full HTML page under HTTP 200.
 */
export function parseFailure(url: string, what: string): AnnError {
  return new AnnError(
    "parse_failure",
    `The response loaded but could not be read as Anime News Network XML (${what}).`,
    { url, hint: `Please report this, with the request you made, at ${ISSUES_URL}` },
  );
}

export function upstreamError(url: string, status: number): AnnError {
  return new AnnError("network_error", `Anime News Network returned HTTP ${status}.`, {
    url,
    status,
    ...(status >= 500
      ? { hint: "This is a problem on Anime News Network's side. Try again shortly." }
      : {}),
  });
}
