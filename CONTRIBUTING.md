# Contributing

Thank you for helping improve the logic education resources catalogue.

## Add or edit a resource

Each resource lives in `resources/<id>.yml`. Copy an existing file with similar content, choose a
stable lowercase ID, and use terms defined in the files under `taxonomy/`.

The filename must equal the resource ID. For example, a resource with `id: logic-in-action` belongs
in `resources/logic-in-action.yml`.

Descriptions should be factual, concise, and useful to educators or learners. Use the resource's
canonical website as `url` where possible. Put mirrors, archived locations, or former addresses in
`alternateUrls`.

## Edit a resource in your browser

Every resource card on the website has an **Edit this resource** link. It opens the corresponding
YAML file in GitHub's browser editor. A free GitHub account is required.

1. Sign in to GitHub and make the smallest factual correction needed.
2. Keep the field names, indentation, `id`, and filename unchanged.
3. Select **Propose changes**. GitHub will create a branch or fork and guide you through opening a
   pull request.
4. Follow the pull request for automatic-check results and maintainer feedback. GitHub displays
   notifications on the website and may send email according to your notification settings.

YAML uses spaces for indentation; do not use tabs. Items in a list begin with `-`. Quote a string
when punctuation such as `:` or `#` could be interpreted as YAML syntax. For example:

```yaml
features:
  - Interactive exercises
  - "Instructor materials: slides and worksheets"
```

The [resource schema](schema/resource.schema.json) is the authoritative definition. In particular:

- `id`, `title`, `url`, `description`, `types`, `topics`, `languages`, `audiences`, `access`,
  `status`, and `provenance` are required.
- `id` uses lowercase letters, numbers, and single hyphens, and must match the filename.
- `url` and `alternateUrls` must be complete HTTP or HTTPS URLs.
- `types`, `topics`, `languages`, and `audiences` may contain only IDs defined under
  [`taxonomy/`](taxonomy/).
- `access.cost` is `free`, `freemium`, `paid`, or `unknown`; `access.mode` contains one or more of
  `online`, `download`, and `physical`.
- Fields not defined by the schema are rejected.

## Suggest a new resource

Use the website's **Suggest a new resource** action. The resulting GitHub form uses the catalogue's
controlled vocabulary and collects everything required by the schema; contributors do not need to
write YAML.

When the form is submitted, the `Turn resource suggestion into a pull request` workflow:

1. converts the answers into one `resources/<id>.yml` file;
2. rejects duplicate URLs and unknown values;
3. runs the complete catalogue validation; and
4. opens a pull request for maintainer review.

If conversion fails, the workflow comments on the suggestion with an explanation. Editing the issue
runs the conversion again. When the pull request is merged, it closes the original suggestion.

Repository administrators must enable **Settings → Actions → General → Workflow permissions →
Allow GitHub Actions to create and approve pull requests** so the built-in workflow token can open
these pull requests. The workflow does not approve its own changes.

After making a change:

```sh
npm install
npm test
```

Commit only the resource or taxonomy source files you changed. Pull requests are checked for:

- JSON Schema conformance
- unknown taxonomy values
- duplicate IDs and normalized URLs
- mismatches between IDs and filenames
- validity of the complete generated catalogue
- TypeScript errors in the maintenance scripts

GitHub Actions generates `catalogue.json` after validation and publishes it as a workflow artifact.
Contributors should not add the generated file to their pull requests.

## Review status

Imported records may contain:

```yaml
review:
  needsReview: true
  issues:
    - Confirm the canonical resource URL.
```

Resolve an issue when you can verify the correction from an authoritative source. Remove the
resolved issue and set `needsReview` to `false` when no issues remain.

Broken or discontinued resources do not need to be deleted. Set `status` to `inactive` and explain
the situation in `notes`; this preserves the historical record and prevents the same resource from
being repeatedly rediscovered.

## Change the schema or taxonomy

Schema and taxonomy changes affect the entire catalogue. Explain the motivation in the pull request
and update existing resources in the same change. Taxonomy IDs should remain stable once published.
