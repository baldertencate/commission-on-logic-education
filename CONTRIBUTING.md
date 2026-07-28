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
