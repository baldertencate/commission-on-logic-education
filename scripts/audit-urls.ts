import fs from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { listResourceFiles, readResource, ROOT } from "./lib.js";
import { checkUrl, formatUrlCheck, type UrlCheckResult } from "./url-check.js";

export const URL_AUDIT_ISSUE_PREFIX = "URL audit: ";

type Resource = {
  id: string;
  url: string;
  alternateUrls?: string[];
  review?: {
    needsReview: boolean;
    issues: string[];
  };
  [key: string]: unknown;
};

type AuditEntry = {
  file: string;
  resource: Resource;
  results: UrlCheckResult[];
};

export function updateReviewBlock(
  source: string,
  review: NonNullable<Resource["review"]>,
): string {
  const block = stringifyYaml({ review }, { lineWidth: 0 }).trimEnd();
  const reviewStart = source.search(/^review:\s*$/m);

  if (reviewStart < 0) {
    return `${source.trimEnd()}\n${block}\n`;
  }

  const afterReviewHeading = source.indexOf("\n", reviewStart) + 1;
  const remainingSource = source.slice(afterReviewHeading);
  const nextRootProperty = remainingSource.search(/^[^\s#][^:\n]*:/m);
  const reviewEnd =
    nextRootProperty < 0 ? source.length : afterReviewHeading + nextRootProperty;
  return `${source.slice(0, reviewStart)}${block}\n${source.slice(reviewEnd)}`;
}

async function writeReviewBlock(
  file: string,
  review: NonNullable<Resource["review"]>,
): Promise<void> {
  const source = await fs.readFile(file, "utf8");
  await fs.writeFile(file, updateReviewBlock(source, review));
}

export function synchronizeUrlReviewIssues(
  resource: Resource,
  results: UrlCheckResult[],
): boolean {
  const existingIssues = resource.review?.issues ?? [];
  const humanIssues = existingIssues.filter(
    (issue) => !issue.startsWith(URL_AUDIT_ISSUE_PREFIX),
  );
  const existingUrlIssues = existingIssues.filter(
    (issue) => issue.startsWith(URL_AUDIT_ISSUE_PREFIX),
  );
  const urlIssues = results.flatMap((result) => {
    if (result.outcome === "warning") {
      return existingUrlIssues.filter((issue) =>
        issue.startsWith(`${URL_AUDIT_ISSUE_PREFIX}${result.url} `),
      );
    }
    if (result.outcome === "stale" || result.outcome === "unsafe") {
      const description =
        result.outcome === "stale" ? "appears stale" : "cannot be checked safely";
      return [
        `${URL_AUDIT_ISSUE_PREFIX}${result.url} ${description} (${result.detail}).`,
      ];
    }
    return [];
  });
  const issues = [...humanIssues, ...new Set(urlIssues)];
  const nextReview = {
    needsReview: issues.length > 0,
    issues,
  };

  if (
    resource.review &&
    resource.review.needsReview === nextReview.needsReview &&
    JSON.stringify(resource.review.issues) === JSON.stringify(nextReview.issues)
  ) {
    return false;
  }
  if (!resource.review && !issues.length) return false;
  resource.review = nextReview;
  return true;
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
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), items.length) },
      () => runWorker(),
    ),
  );
  return results;
}

export async function auditCatalogueUrls(concurrency = 8): Promise<AuditEntry[]> {
  const files = await listResourceFiles();
  return mapWithConcurrency(files, concurrency, async (file) => {
    const resource = await readResource(file) as Resource;
    const urls = [resource.url, ...(resource.alternateUrls ?? [])];
    const results: UrlCheckResult[] = [];
    for (const url of urls) {
      const result = await checkUrl(url);
      results.push(result);
      console.log(`[${result.outcome}] ${resource.id}: ${formatUrlCheck(result)}`);
    }
    return { file, resource, results };
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const concurrencyArgument = process.argv.find((argument) =>
    argument.startsWith("--concurrency="),
  );
  const concurrency = concurrencyArgument
    ? Number(concurrencyArgument.split("=")[1])
    : 8;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error("--concurrency must be an integer between 1 and 32.");
  }

  const entries = await auditCatalogueUrls(concurrency);
  let changedResources = 0;
  let staleUrls = 0;
  let warnings = 0;

  for (const entry of entries) {
    staleUrls += entry.results.filter(
      ({ outcome }) => outcome === "stale" || outcome === "unsafe",
    ).length;
    warnings += entry.results.filter(({ outcome }) => outcome === "warning").length;
    if (!synchronizeUrlReviewIssues(entry.resource, entry.results)) continue;
    if (!dryRun) {
      if (!entry.resource.review) {
        throw new Error(`${entry.resource.id} requires a review block after its URL audit.`);
      }
      await writeReviewBlock(entry.file, entry.resource.review);
    }
    changedResources += 1;
  }

  const summary =
    `URL audit checked ${entries.length} resources: ` +
    `${staleUrls} stale or unsafe URL(s), ${warnings} inconclusive warning(s), ` +
    `${changedResources} resource file(s) ${dryRun ? "would be updated" : "updated"}.`;
  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Catalogue URL audit\n\n${summary}\n`,
    );
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  await main();
}
