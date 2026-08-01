import fs from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { listResourceFiles, readResource, ROOT } from "./lib.js";
import { validatePublicTarget } from "./url-check.js";

type Resource = {
  id: string;
  title: string;
  url: string;
  maintainerEmail: string;
  authors?: string[];
};

export type EmailCandidate = {
  email: string;
  score: number;
  confidence: "high" | "medium" | "low";
  sourceUrl: string;
  context: string;
  reasons: string[];
};

type DiscoveryResult = {
  resource: Resource;
  candidates: EmailCandidate[];
  error?: string;
};

type CrawlOptions = {
  maxPages: number;
  minimumScore: number;
  fetchImpl?: typeof fetch;
};

const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const CONTACT_HINT = /\b(contact|about|team|people|staff|author|maintain|support|help|imprint)\b/i;
const CONTEXT_HINT = /\b(contact|email|maintain|support|help|questions?|feedback|reach|write to)\b/i;
const EXCLUDED_LOCAL_PART = /^(?:no-?reply|do-?not-?reply|privacy|abuse|security|postmaster)$/i;
const EXCLUDED_DOMAIN_ENDING = /\.(?:png|jpe?g|gif|svg|webp|css|js)$/i;
const DEFAULT_OUTPUT = "private/maintainer-email-candidates.csv";
const USER_AGENT =
  "commission-on-logic-education-maintainer-discovery/1.0 (+https://github.com/baldertencate/commission-on-logic-education)";
const MAX_HTML_BYTES = 2_000_000;

function normalizedHost(value: string): string {
  return value.toLocaleLowerCase().replace(/^www\./, "");
}

function relatedHosts(left: string, right: string): boolean {
  const first = normalizedHost(left);
  const second = normalizedHost(right);
  return (
    first === second ||
    first.endsWith(`.${second}`) ||
    second.endsWith(`.${first}`)
  );
}

function cleanContext(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function deobfuscateText(value: string): string {
  return value
    .replace(/\s*(?:\[at\]|\(at\))\s*/gi, "@")
    .replace(/\s*(?:\[dot\]|\(dot\))\s*/gi, ".");
}

function authorTokens(resource: Resource): string[] {
  return (resource.authors ?? [])
    .flatMap((author) => author.toLocaleLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 4);
}

function scoreCandidate(
  email: string,
  sourceUrl: string,
  context: string,
  method: "mailto" | "text",
  resource: Resource,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const source = new URL(sourceUrl);
  const [localPart, emailDomain = ""] = email.split("@");
  let score = 20;

  if (method === "mailto") {
    score += 25;
    reasons.push("published as a mailto link");
  } else {
    reasons.push("published in page text");
  }
  if (relatedHosts(source.hostname, emailDomain)) {
    score += 25;
    reasons.push("email domain matches the resource site");
  }
  if (CONTACT_HINT.test(`${source.pathname} ${source.search}`)) {
    score += 10;
    reasons.push("found on a contact-related page");
  }
  if (CONTEXT_HINT.test(context)) {
    score += 15;
    reasons.push("near contact or support wording");
  }
  const authorMatch = authorTokens(resource).find((token) =>
    `${localPart} ${context}`.toLocaleLowerCase().includes(token),
  );
  if (authorMatch) {
    score += 15;
    reasons.push(`matches listed author “${authorMatch}”`);
  }
  if (/^(?:contact|info|support|help|admin|office|webmaster)$/i.test(localPart ?? "")) {
    score += 5;
    reasons.push("uses a role-based address");
  }

  return { score: Math.min(score, 100), reasons };
}

function confidenceForScore(score: number): EmailCandidate["confidence"] {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function validCandidateEmail(email: string): boolean {
  const normalized = email.toLocaleLowerCase();
  const [localPart = "", domain = ""] = normalized.split("@");
  return (
    Boolean(localPart && domain) &&
    !EXCLUDED_LOCAL_PART.test(localPart) &&
    !EXCLUDED_DOMAIN_ENDING.test(domain)
  );
}

export function extractEmailCandidates(
  html: string,
  sourceUrl: string,
  resource: Resource,
): EmailCandidate[] {
  const $ = load(html);
  const occurrences: Array<{
    email: string;
    context: string;
    method: "mailto" | "text";
  }> = [];

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href")?.trim() ?? "";
    if (!href.toLocaleLowerCase().startsWith("mailto:")) return;
    let recipients: string;
    try {
      recipients = decodeURIComponent(href.slice("mailto:".length).split("?")[0] ?? "");
    } catch {
      return;
    }
    const context = cleanContext(
      $(element).closest("p, li, address, dd, div").first().text() || $(element).text(),
    );
    for (const email of recipients.match(EMAIL_PATTERN) ?? []) {
      occurrences.push({ email, context, method: "mailto" });
    }
  });

  $("script, style, noscript, template, svg").remove();
  const text = cleanContext(deobfuscateText($.root().text()));
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const start = Math.max(0, (match.index ?? 0) - 100);
    const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 100);
    occurrences.push({
      email: match[0],
      context: cleanContext(text.slice(start, end)),
      method: "text",
    });
  }

  const candidates = new Map<string, EmailCandidate>();
  for (const occurrence of occurrences) {
    const email = occurrence.email.toLocaleLowerCase();
    if (!validCandidateEmail(email)) continue;
    const scored = scoreCandidate(
      email,
      sourceUrl,
      occurrence.context,
      occurrence.method,
      resource,
    );
    const candidate: EmailCandidate = {
      email,
      score: scored.score,
      confidence: confidenceForScore(scored.score),
      sourceUrl,
      context: occurrence.context,
      reasons: scored.reasons,
    };
    const previous = candidates.get(email);
    if (!previous || candidate.score > previous.score) candidates.set(email, candidate);
  }
  return [...candidates.values()].sort(
    (left, right) => right.score - left.score || left.email.localeCompare(right.email),
  );
}

export function extractContactLinks(html: string, sourceUrl: string): string[] {
  const $ = load(html);
  const source = new URL(sourceUrl);
  const links = new Set<string>();

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href) return;
    let target: URL;
    try {
      target = new URL(href, source);
    } catch {
      return;
    }
    if (!["http:", "https:"].includes(target.protocol)) return;
    if (!relatedHosts(source.hostname, target.hostname)) return;
    const hint = `${$(element).text()} ${target.pathname}`;
    if (!CONTACT_HINT.test(hint)) return;
    target.hash = "";
    links.add(target.toString());
  });

  return [...links];
}

async function readLimitedHtml(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) {
    throw new Error(`unsupported content type ${contentType}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new Error("page is larger than the 2 MB discovery limit");
  }
  if (!response.body) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("page is larger than the 2 MB discovery limit");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function fetchHtml(
  initialUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const targetProblem = await validatePublicTarget(currentUrl);
    if (targetProblem) throw new Error(targetProblem.detail);

    const response = await fetchImpl(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error(`HTTP ${response.status} has no redirect destination`);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
    }
    return { html: await readLimitedHtml(response), finalUrl: currentUrl };
  }
  throw new Error("redirect limit exceeded");
}

async function discoverForResource(
  resource: Resource,
  options: CrawlOptions,
): Promise<DiscoveryResult> {
  const queue = [resource.url];
  const visited = new Set<string>();
  const candidates = new Map<string, EmailCandidate>();
  let firstError: string | undefined;

  while (queue.length && visited.size < options.maxPages) {
    const requestedUrl = queue.shift();
    if (!requestedUrl || visited.has(requestedUrl)) continue;
    visited.add(requestedUrl);

    try {
      const page = await fetchHtml(requestedUrl, options.fetchImpl);
      for (const candidate of extractEmailCandidates(page.html, page.finalUrl, resource)) {
        const previous = candidates.get(candidate.email);
        if (!previous || candidate.score > previous.score) {
          candidates.set(candidate.email, candidate);
        }
      }
      if (visited.size === 1) {
        const rootUrl = new URL("/", page.finalUrl).toString();
        if (rootUrl !== page.finalUrl) queue.push(rootUrl);
      }
      queue.push(...extractContactLinks(page.html, page.finalUrl));
    } catch (error) {
      firstError ??= error instanceof Error ? error.message : String(error);
    }
  }

  const ranked = [...candidates.values()]
    .filter(({ score }) => score >= options.minimumScore)
    .sort((left, right) => right.score - left.score || left.email.localeCompare(right.email))
    .slice(0, 3);
  return {
    resource,
    candidates: ranked,
    ...(ranked.length === 0 && firstError ? { error: firstError } : {}),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
  return results;
}

function csvCell(value: string | number): string {
  let text = String(value).replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function resultsToCsv(results: DiscoveryResult[], generatedAt: string): string {
  const headings = [
    "status",
    "resourceId",
    "resourceTitle",
    "resourceUrl",
    "email",
    "confidence",
    "score",
    "sourceUrl",
    "context",
    "reasons",
    "discoveredAt",
    "error",
  ];
  const rows: Array<Array<string | number>> = [headings];

  for (const result of results) {
    if (!result.candidates.length) {
      rows.push([
        result.error ? "error" : "none",
        result.resource.id,
        result.resource.title,
        result.resource.url,
        "",
        "",
        "",
        "",
        "",
        "",
        generatedAt,
        result.error ?? "",
      ]);
      continue;
    }
    for (const candidate of result.candidates) {
      rows.push([
        "candidate",
        result.resource.id,
        result.resource.title,
        result.resource.url,
        candidate.email,
        candidate.confidence,
        candidate.score,
        candidate.sourceUrl,
        candidate.context,
        candidate.reasons.join("; "),
        generatedAt,
        "",
      ]);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function numberOption(name: string, fallback: number): number {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? Number(argument.slice(name.length + 3)) : fallback;
}

function stringOption(name: string, fallback: string): string {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(`Discover likely maintainer emails published on resource websites.

Usage:
  npm run discover:maintainers
  npm run discover:maintainers -- --resource=logic4fun

Options:
  --output=${DEFAULT_OUTPUT}
  --resource=ID          Limit discovery to one resource ID (repeatable)
  --limit=NUMBER         Limit the number of resources
  --max-pages=NUMBER     Maximum pages per resource (default: 5)
  --minimum-score=NUMBER Minimum candidate score (default: 45)
  --concurrency=NUMBER   Concurrent resource crawls (default: 3)`);
    return;
  }

  const output = path.resolve(ROOT, stringOption("output", DEFAULT_OUTPUT));
  const limit = numberOption("limit", Number.POSITIVE_INFINITY);
  const maxPages = numberOption("max-pages", 5);
  const minimumScore = numberOption("minimum-score", 45);
  const concurrency = numberOption("concurrency", 3);
  const selectedIds = new Set(
    process.argv
      .filter((value) => value.startsWith("--resource="))
      .map((value) => value.slice("--resource=".length)),
  );
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new Error("--max-pages must be an integer between 1 and 10.");
  }
  if (!(limit === Number.POSITIVE_INFINITY || (Number.isInteger(limit) && limit >= 1))) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
    throw new Error("--minimum-score must be between 0 and 100.");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be an integer between 1 and 8.");
  }
  const privateDirectory = path.join(ROOT, "private");
  const outputIsInsideRepository =
    output === ROOT || output.startsWith(`${ROOT}${path.sep}`);
  const outputIsPrivate =
    output.startsWith(`${privateDirectory}${path.sep}`);
  if (outputIsInsideRepository && !outputIsPrivate) {
    throw new Error(
      "Discovery output inside the repository must be placed under the git-ignored private/ directory.",
    );
  }

  const files = await listResourceFiles();
  const resources = (await Promise.all(
    files.map(async (file) => await readResource(file) as Resource),
  ))
    .filter(({ maintainerEmail }) => maintainerEmail === "unknown")
    .filter(({ id }) => selectedIds.size === 0 || selectedIds.has(id))
    .slice(0, limit);
  if (selectedIds.size && resources.length !== selectedIds.size) {
    const found = new Set(resources.map(({ id }) => id));
    const missing = [...selectedIds].filter((id) => !found.has(id));
    if (missing.length) {
      throw new Error(
        `No unknown-maintainer resource found for: ${missing.join(", ")}`,
      );
    }
  }

  console.log(`Inspecting ${resources.length} resource site(s); emails will only be written to the private output file.`);
  const results = await mapWithConcurrency(resources, concurrency, async (resource) => {
    const result = await discoverForResource(resource, { maxPages, minimumScore });
    console.log(
      `${resource.id}: ${result.candidates.length} candidate(s)` +
      (result.error ? `; ${result.error}` : ""),
    );
    return result;
  });

  await fs.mkdir(path.dirname(output), { recursive: true });
  if (outputIsPrivate) {
    const privateDirectoryStat = await fs.lstat(privateDirectory);
    if (privateDirectoryStat.isSymbolicLink()) {
      throw new Error("The private output directory must not be a symbolic link.");
    }
  }
  const generatedAt = new Date().toISOString();
  await fs.writeFile(output, resultsToCsv(results, generatedAt), { mode: 0o600 });
  await fs.chmod(output, 0o600);
  const candidateCount = results.reduce(
    (count, result) => count + result.candidates.length,
    0,
  );
  console.log(
    `Saved ${candidateCount} candidate(s) for ${results.length} resource(s) to ${path.relative(ROOT, output)}.`,
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  await main();
}
