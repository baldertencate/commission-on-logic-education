import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  buildEventSuggestion,
  eventSuggestionHeadings,
} from "./event-suggestion.js";
import { ROOT } from "./lib.js";

const issueBody = `
### ${eventSuggestionHeadings.title}

Example Logic Workshop

### ${eventSuggestionHeadings.description}

An event with **talks** and demonstrations.

### ${eventSuggestionHeadings.startDate}

2028-05-10

### ${eventSuggestionHeadings.endDate}

2028-05-11

### ${eventSuggestionHeadings.format}

Hybrid

### ${eventSuggestionHeadings.location}

Amsterdam, Netherlands

### ${eventSuggestionHeadings.eventType}

Workshop

### ${eventSuggestionHeadings.eventUrl}

https://example.test/workshop

### ${eventSuggestionHeadings.recordingUrl}

_No response_
`;

const generated = await buildEventSuggestion({
  body: issueBody,
  issueNumber: 4321,
});
assert.equal(generated.id, "example-logic-workshop-2028");
assert.deepEqual(parseYaml(generated.yaml), generated.event);
assert.equal(generated.event.format, "hybrid");
assert.equal(generated.event.eventType, "workshop");
assert.equal(generated.event.location, "Amsterdam, Netherlands");
assert.equal("recordingUrl" in generated.event, false);

await assert.rejects(
  buildEventSuggestion({
    body: issueBody.replace("2028-05-11", "2028-05-09"),
    issueNumber: 4321,
  }),
  /cannot be before/,
);
await assert.rejects(
  buildEventSuggestion({
    body: issueBody.replace("Hybrid", "Online"),
    issueNumber: 4321,
  }),
  /must be left blank/,
);

const form = parseYaml(
  await fs.readFile(path.join(ROOT, ".github", "ISSUE_TEMPLATE", "new-event.yml"), "utf8"),
) as {
  body: Array<{
    attributes?: { label?: string; options?: Array<string> };
    validations?: { required?: boolean };
  }>;
};
for (const label of [
  "Event title",
  "Description",
  "Start date",
  "End date",
  "Format",
  "Event type",
  "Final checks",
]) {
  const field = form.body.find((item) => item.attributes?.label === label);
  assert(field, `Event form must include “${label}”`);
  assert.equal(field.validations?.required ?? label === "Final checks", true);
}

console.log("Event suggestion generation tests passed.");
