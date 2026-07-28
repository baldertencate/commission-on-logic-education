import fs from "node:fs/promises";
import path from "node:path";
import { buildResourceSuggestion, ROOT } from "./suggestion.js";
import {
  assertNoStaleSubmissionUrls,
  checkSubmittedUrls,
} from "./submission-url-check.js";

type IssueEvent = {
  issue?: {
    number?: number;
    body?: string | null;
    html_url?: string;
    created_at?: string;
  };
};

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set.");

try {
  const event = JSON.parse(await fs.readFile(eventPath, "utf8")) as IssueEvent;
  const issue = event.issue;
  if (!issue?.number || !issue.html_url || !issue.created_at) {
    throw new Error("The GitHub event does not contain a complete issue.");
  }

  const generated = await buildResourceSuggestion({
    body: issue.body ?? "",
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    createdAt: issue.created_at,
  });
  const resource = generated.resource as {
    url: string;
    alternateUrls?: string[];
  };
  const urlResults = await checkSubmittedUrls([
    resource.url,
    ...(resource.alternateUrls ?? []),
  ]);
  assertNoStaleSubmissionUrls(urlResults);

  const destination = path.join(ROOT, generated.relativeFile);
  await fs.writeFile(destination, generated.yaml);

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `resource_id=${generated.id}\nresource_file=${generated.relativeFile}\n`,
    );
  }

  console.log(`Generated ${generated.relativeFile}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await fs.writeFile(path.join(ROOT, "suggestion-error.txt"), `${message}\n`);
  throw error;
}
