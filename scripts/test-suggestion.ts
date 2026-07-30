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

### ${suggestionHeadings.maintainerEmail}

maintainer@example.test

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

en
es

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
- [x] I agree to periodic maintenance contact, including about stale URLs, and understand that the maintainer email will be stored with the record in the public GitHub repository and generated catalogue data.
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
  maintainerEmail: string;
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
assert.equal(resource.maintainerEmail, "maintainer@example.test");
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
      options?: Array<string | { label: string; required?: boolean }>;
      multiple?: boolean;
    };
    validations?: {
      required?: boolean;
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
  return (field?.attributes?.options ?? []).filter(
    (option): option is string => typeof option === "string",
  );
}

for (const [label, taxonomy] of [
  [suggestionHeadings.types, "resource-types"],
  [suggestionHeadings.topics, "topics"],
  [suggestionHeadings.audiences, "audiences"],
] as const) {
  assert.deepEqual(
    formOptions(label),
    (await readTaxonomy(taxonomy)).map((item) => item.label),
    `${label} options must match taxonomy/${taxonomy}.yml`,
  );
}

const languageField = issueForm.body.find(
  (item) => item.attributes?.label === suggestionHeadings.languages,
);
assert.equal(languageField?.type, "textarea", "Language codes must be entered as free-form tags");

const maintainerField = issueForm.body.find(
  (item) => item.attributes?.label === suggestionHeadings.maintainerEmail,
);
assert.equal(maintainerField?.type, "input", "Maintainer email must be an input");
assert.equal(maintainerField?.validations?.required, true, "Maintainer email must be required");

const finalChecks = issueForm.body.find((item) => item.attributes?.label === suggestionHeadings.checks);
const maintainerCheck = finalChecks?.attributes?.options?.find(
  (option) => typeof option !== "string" && option.label.startsWith("I agree to periodic"),
);
assert.equal(
  typeof maintainerCheck === "string" ? false : maintainerCheck?.required,
  true,
  "Maintainer agreement must be required",
);

const removalForm = parseYaml(
  await fs.readFile(path.join(ROOT, ".github", "ISSUE_TEMPLATE", "remove-resource.yml"), "utf8"),
) as IssueForm;
for (const label of [
  "Resource ID",
  "Resource URL",
  "Why should this resource be reviewed for removal?",
  "Explanation",
  "Final check",
]) {
  const field = removalForm.body.find((item) => item.attributes?.label === label);
  assert(field, `Removal form must include “${label}”`);
  assert.equal(field.validations?.required ?? label === "Final check", true);
}
const removalFinalCheck = removalForm.body.find(
  (item) => item.attributes?.label === "Final check",
);
const removalAgreement = removalFinalCheck?.attributes?.options?.find(
  (option) => typeof option !== "string" && option.label.startsWith("I understand"),
);
assert.equal(
  typeof removalAgreement === "string" ? false : removalAgreement?.required,
  true,
  "Removal review acknowledgement must be required",
);

assert.deepEqual(
  (generated.resource as { languages?: string[] }).languages,
  ["en", "es"],
);

const withoutLanguages = await buildResourceSuggestion({
  body: issueBody.replace("\nen\nes\n", "\n_No response_\n"),
  issueNumber: 1234,
  issueUrl: "https://github.com/example/catalogue/issues/1234",
  createdAt: "2026-07-28T12:00:00Z",
});
assert.equal("languages" in withoutLanguages.resource, false);

await assert.rejects(
  buildResourceSuggestion({
    body: issueBody.replace("\nen\nes\n", "\nnot_a_language\n"),
    issueNumber: 1234,
    issueUrl: "https://github.com/example/catalogue/issues/1234",
    createdAt: "2026-07-28T12:00:00Z",
  }),
  /not a valid language tag/,
);

await assert.rejects(
  buildResourceSuggestion({
    body: issueBody.replace("maintainer@example.test", "unknown"),
    issueNumber: 1234,
    issueUrl: "https://github.com/example/catalogue/issues/1234",
    createdAt: "2026-07-28T12:00:00Z",
  }),
  /require a maintainer email address/,
);

await assert.rejects(
  buildResourceSuggestion({
    body: issueBody.replace(
      "- [x] I agree to periodic maintenance contact",
      "- [ ] I agree to periodic maintenance contact",
    ),
    issueNumber: 1234,
    issueUrl: "https://github.com/example/catalogue/issues/1234",
    createdAt: "2026-07-28T12:00:00Z",
  }),
  /agreement must be accepted/,
);

console.log("Resource suggestion generation tests passed.");
