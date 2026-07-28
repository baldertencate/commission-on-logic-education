import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { readTaxonomy, ROOT } from "./lib.js";
import {
  buildResourceSuggestion,
  parseIssueForm,
  suggestionHeadings,
} from "./suggestion.js";

const issueBody = `
### ${suggestionHeadings.title}

Example Logic Laboratory

### ${suggestionHeadings.url}

https://example.test/logic-laboratory

### ${suggestionHeadings.description}

An interactive collection of exercises for introductory logic.

### ${suggestionHeadings.types}

- Course
- Website

### ${suggestionHeadings.topics}

- Propositional logic
- Modal logic

### ${suggestionHeadings.languages}

English

### ${suggestionHeadings.audiences}

- Undergraduate students
- Educators

### ${suggestionHeadings.authors}

Example University
Ada Example

### ${suggestionHeadings.features}

Immediate feedback
Downloadable exercises

### ${suggestionHeadings.cost}

Free

### ${suggestionHeadings.accessModes}

- Online
- Download

### ${suggestionHeadings.software}

No

### ${suggestionHeadings.platforms}

Web browser

### ${suggestionHeadings.registration}

Unknown

### ${suggestionHeadings.notes}

_No response_

### Final checks

- [x] I checked that this resource is not already in the catalogue.
`;

const fields = parseIssueForm(issueBody);
assert.equal(fields[suggestionHeadings.title], "Example Logic Laboratory");
assert.equal(fields[suggestionHeadings.notes], "");

const generated = await buildResourceSuggestion({
  body: issueBody,
  issueNumber: 1234,
  issueUrl: "https://github.com/example/catalogue/issues/1234",
  createdAt: "2026-07-28T12:00:00Z",
});
const resource = generated.resource as {
  id: string;
  types: string[];
  topics: string[];
  authors: string[];
  access: {
    cost: string;
    mode: string[];
    requiresSoftware: boolean | null;
    registration: boolean | null;
  };
  provenance: Array<{ importedAt: string }>;
};

assert.equal(resource.id, "example-logic-laboratory");
assert.deepEqual(resource.types, ["course", "website"]);
assert.deepEqual(resource.topics, ["propositional-logic", "modal-logic"]);
assert.deepEqual(resource.authors, ["Example University", "Ada Example"]);
assert.equal(resource.access.cost, "free");
assert.deepEqual(resource.access.mode, ["online", "download"]);
assert.equal(resource.access.requiresSoftware, false);
assert.equal(resource.access.registration, null);
assert.equal(resource.provenance[0]?.importedAt, "2026-07-28");
assert.deepEqual(parseYaml(generated.yaml), generated.resource);

type IssueForm = {
  body: Array<{
    type: string;
    attributes?: {
      label?: string;
      options?: string[];
      multiple?: boolean;
    };
  }>;
};

const issueForm = parseYaml(
  await fs.readFile(path.join(ROOT, ".github", "ISSUE_TEMPLATE", "new-resource.yml"), "utf8"),
) as IssueForm;

function formOptions(label: string): string[] {
  const field = issueForm.body.find((item) => item.attributes?.label === label);
  assert.equal(field?.type, "dropdown", `${label} must be a dropdown`);
  assert.equal(field?.attributes?.multiple, true, `${label} must allow multiple selections`);
  return field?.attributes?.options ?? [];
}

for (const [label, taxonomy] of [
  [suggestionHeadings.types, "resource-types"],
  [suggestionHeadings.topics, "topics"],
  [suggestionHeadings.languages, "languages"],
  [suggestionHeadings.audiences, "audiences"],
] as const) {
  assert.deepEqual(
    formOptions(label),
    (await readTaxonomy(taxonomy)).map((item) => item.label),
    `${label} options must match taxonomy/${taxonomy}.yml`,
  );
}

console.log("Resource suggestion generation tests passed.");
