import path from "node:path";
import { execFileSync } from "node:child_process";
import { readResource, ROOT } from "./lib.js";
import { checkUrl, formatUrlCheck, type UrlCheckResult } from "./url-check.js";

type SubmittedResource = {
  id?: string;
  url?: string;
  alternateUrls?: string[];
};

function actionWarning(message: string): void {
  const escaped = message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.warn(process.env.GITHUB_ACTIONS ? `::warning title=URL check::${escaped}` : `Warning: ${message}`);
}

export async function checkSubmittedUrls(
  urls: string[],
): Promise<UrlCheckResult[]> {
  const results: UrlCheckResult[] = [];
  for (const url of urls) {
    const result = await checkUrl(url);
    results.push(result);
    if (result.outcome === "warning") actionWarning(formatUrlCheck(result));
  }
  return results;
}

export function assertNoStaleSubmissionUrls(results: UrlCheckResult[]): void {
  const failures = results.filter(
    ({ outcome }) => outcome === "stale" || outcome === "unsafe",
  );
  if (failures.length) {
    throw new Error(
      `The submitted resource contains a URL that failed the automatic check:\n${failures
        .map((result) => `- ${formatUrlCheck(result)}`)
        .join("\n")}\nPlease correct the URL or explain the exceptional case to a maintainer.`,
    );
  }
}

async function addedResourceFiles(base: string): Promise<string[]> {
  const output = execFileSync(
    "git",
    ["diff", "--diff-filter=A", "--name-only", base, "HEAD", "--", "resources"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => /\.ya?ml$/i.test(file));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let files: string[];
  if (args[0] === "--base") {
    const base = args[1];
    if (!base) throw new Error("--base requires a Git commit or ref.");
    files = await addedResourceFiles(base);
  } else {
    files = args;
  }

  if (!files.length) {
    console.log("No newly submitted resource files require URL checks.");
    return;
  }

  for (const relativeFile of files) {
    const file = path.resolve(ROOT, relativeFile);
    if (!file.startsWith(`${path.join(ROOT, "resources")}${path.sep}`)) {
      throw new Error(`${relativeFile} is not a resource file.`);
    }
    const resource = await readResource(file) as SubmittedResource;
    const urls = [resource.url, ...(resource.alternateUrls ?? [])].filter(
      (url): url is string => typeof url === "string",
    );
    if (!urls.length) throw new Error(`${relativeFile} does not contain a URL.`);
    const results = await checkSubmittedUrls(urls);
    assertNoStaleSubmissionUrls(results);
    console.log(`Checked ${urls.length} URL(s) for ${resource.id ?? relativeFile}.`);
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  await main();
}
