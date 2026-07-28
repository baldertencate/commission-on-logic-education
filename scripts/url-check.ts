import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UrlCheckOutcome = "reachable" | "stale" | "warning" | "unsafe";

export type UrlCheckResult = {
  url: string;
  finalUrl: string;
  outcome: UrlCheckOutcome;
  detail: string;
  status?: number;
};

export type UrlCheckOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  resolveHostname?: (hostname: string) => Promise<string[]>;
};

type RequestResult =
  | UrlCheckResult
  | {
      url: string;
      finalUrl: string;
      status: number;
      statusText: string;
    };

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return true;
  const [first, second, third] = octets as [number, number, number, number];

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLocaleLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) !== 4 || isPrivateIpv4(mapped);
  }
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version === 6) return !isPrivateIpv6(address);
  return false;
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const direct = error as Error & { code?: string; cause?: unknown };
  if (direct.code) return direct.code;
  if (direct.cause && typeof direct.cause === "object" && "code" in direct.cause) {
    return String((direct.cause as { code?: unknown }).code);
  }
  return undefined;
}

function networkFailure(url: string, error: unknown): UrlCheckResult {
  const code = errorCode(error);
  const timedOut =
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError");
  if (code === "ENOTFOUND") {
    return {
      url,
      finalUrl: url,
      outcome: "stale",
      detail: "the hostname does not exist",
    };
  }
  return {
    url,
    finalUrl: url,
    outcome: "warning",
    detail: timedOut
      ? "the request timed out"
      : `the URL could not be checked${code ? ` (${code})` : ""}`,
  };
}

export async function validatePublicTarget(
  rawUrl: string,
  resolveHostname: (hostname: string) => Promise<string[]> = defaultResolveHostname,
): Promise<UrlCheckResult | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl,
      finalUrl: rawUrl,
      outcome: "unsafe",
      detail: "the address is not a valid URL",
    };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      url: rawUrl,
      finalUrl: rawUrl,
      outcome: "unsafe",
      detail: "only HTTP and HTTPS URLs can be checked",
    };
  }
  if (parsed.username || parsed.password) {
    return {
      url: rawUrl,
      finalUrl: rawUrl,
      outcome: "unsafe",
      detail: "URLs containing credentials are not allowed",
    };
  }
  if (
    parsed.hostname.toLocaleLowerCase() === "localhost" ||
    parsed.hostname.toLocaleLowerCase().endsWith(".localhost")
  ) {
    return {
      url: rawUrl,
      finalUrl: rawUrl,
      outcome: "unsafe",
      detail: "the URL points to a local address",
    };
  }

  try {
    const addresses = await resolveHostname(parsed.hostname);
    if (!addresses.length) {
      return {
        url: rawUrl,
        finalUrl: rawUrl,
        outcome: "stale",
        detail: "the hostname has no address",
      };
    }
    const nonPublicAddress = addresses.find((address) => !isPublicIpAddress(address));
    if (nonPublicAddress) {
      return {
        url: rawUrl,
        finalUrl: rawUrl,
        outcome: "unsafe",
        detail: `the hostname resolves to a non-public address (${nonPublicAddress})`,
      };
    }
  } catch (error) {
    return networkFailure(rawUrl, error);
  }
  return undefined;
}

async function requestWithRedirects(
  originalUrl: string,
  method: "HEAD" | "GET",
  options: Required<Pick<UrlCheckOptions, "timeoutMs" | "maxRedirects" | "fetchImpl" | "resolveHostname">>,
): Promise<RequestResult> {
  let currentUrl = originalUrl;

  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    const unsafe = await validatePublicTarget(currentUrl, options.resolveHostname);
    if (unsafe) return { ...unsafe, url: originalUrl, finalUrl: currentUrl };

    let response: Response;
    try {
      response = await options.fetchImpl(currentUrl, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: {
          "User-Agent": "logic-education-resources-url-checker/1.0",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
          ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
        },
      });
    } catch (error) {
      return { ...networkFailure(originalUrl, error), finalUrl: currentUrl };
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        return {
          url: originalUrl,
          finalUrl: currentUrl,
          outcome: "warning",
          status: response.status,
          detail: `HTTP ${response.status} did not provide a redirect destination`,
        };
      }
      if (redirectCount === options.maxRedirects) {
        return {
          url: originalUrl,
          finalUrl: currentUrl,
          outcome: "warning",
          status: response.status,
          detail: `more than ${options.maxRedirects} redirects`,
        };
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    await response.body?.cancel().catch(() => undefined);
    return {
      url: originalUrl,
      finalUrl: currentUrl,
      status: response.status,
      statusText: response.statusText,
    };
  }

  return {
    url: originalUrl,
    finalUrl: currentUrl,
    outcome: "warning",
    detail: "the redirect limit was exceeded",
  };
}

function classifyResponse(result: Exclude<RequestResult, UrlCheckResult>): UrlCheckResult {
  if (result.status >= 200 && result.status < 400) {
    return {
      ...result,
      outcome: "reachable",
      detail: `HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ""}`,
    };
  }
  if (result.status === 404 || result.status === 410) {
    return {
      ...result,
      outcome: "stale",
      detail: `HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ""}`,
    };
  }
  if (result.status === 401 || result.status === 403 || result.status === 451) {
    return {
      ...result,
      outcome: "warning",
      detail: `HTTP ${result.status} restricts automated access`,
    };
  }
  return {
    ...result,
    outcome: "warning",
    detail: `HTTP ${result.status}${result.statusText ? ` ${result.statusText}` : ""}`,
  };
}

function isFinalResult(result: RequestResult): result is UrlCheckResult {
  return "outcome" in result;
}

export async function checkUrl(
  url: string,
  suppliedOptions: UrlCheckOptions = {},
): Promise<UrlCheckResult> {
  const options = {
    timeoutMs: suppliedOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRedirects: suppliedOptions.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    fetchImpl: suppliedOptions.fetchImpl ?? fetch,
    resolveHostname: suppliedOptions.resolveHostname ?? defaultResolveHostname,
  };

  const head = await requestWithRedirects(url, "HEAD", options);
  if (!isFinalResult(head) && head.status >= 200 && head.status < 400) {
    return classifyResponse(head);
  }
  if (isFinalResult(head) && head.outcome === "unsafe") return head;

  const get = await requestWithRedirects(url, "GET", options);
  return isFinalResult(get) ? get : classifyResponse(get);
}

export function formatUrlCheck(result: UrlCheckResult): string {
  const redirect =
    result.finalUrl !== result.url ? `; redirected to ${result.finalUrl}` : "";
  return `${result.url}: ${result.detail}${redirect}`;
}
