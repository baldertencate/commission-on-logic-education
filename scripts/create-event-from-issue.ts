import fs from "node:fs/promises";
import path from "node:path";
import { buildEventSuggestion } from "./event-suggestion.js";
import { ROOT } from "./lib.js";
import {
  assertNoStaleSubmissionUrls,
  checkSubmittedUrls,
} from "./submission-url-check.js";

type IssueEvent = {
  issue?: {
    number?: number;
    body?: string | null;
  };
};

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set.");

try {
  const payload = JSON.parse(await fs.readFile(eventPath, "utf8")) as IssueEvent;
  if (!payload.issue?.number) throw new Error("The GitHub event does not contain a complete issue.");

  const generated = await buildEventSuggestion({
    body: payload.issue.body ?? "",
    issueNumber: payload.issue.number,
  });
  const event = generated.event as { eventUrl?: string; recordingUrl?: string };
  const urls = [event.eventUrl, event.recordingUrl].filter(
    (value): value is string => Boolean(value),
  );
  if (urls.length) assertNoStaleSubmissionUrls(await checkSubmittedUrls(urls));

  await fs.writeFile(path.join(ROOT, generated.relativeFile), generated.yaml);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `event_id=${generated.id}\nevent_file=${generated.relativeFile}\n`,
    );
  }
  console.log(`Generated ${generated.relativeFile}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await fs.writeFile(path.join(ROOT, "suggestion-error.txt"), `${message}\n`);
  throw error;
}
