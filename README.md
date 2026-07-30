# Logic Education Resources

A community-maintained, machine-readable catalogue of resources for teaching and learning logic.
The catalogue is owned by the IUHPST/DLMPST Commission on Logic Education and is intended to power
an interactive successor to the current
[Resources on Logic Education](https://resources.illc.uva.nl/Commission-on-Logic-Education/compilation-resources-on-logic-education/)
page.

## Repository structure

```text
resources/                   One reviewed YAML file per resource
events/                      One reviewed YAML file per event
taxonomy/                    Controlled vocabularies for types, topics, and audiences
schema/resource.schema.json  Shared resource schema
schema/catalogue.schema.json Schema for the generated catalogue
schema/event.schema.json     Shared event schema
schema/events.schema.json    Schema for the generated events collection
scripts/                     Import, validation, and build tools
src/                         Searchable catalogue website
```

The YAML files are the source of truth. `catalogue.json` and `events.json` are generated
deterministically for websites, search indexes, and other consumers; they are ignored by Git and
should not be committed.

## Work with the catalogue

Node.js 22 or newer is required.

```sh
npm install
npm test
```

To build both merged collections locally:

```sh
npm run build
```

`npm test` validates every resource against the JSON Schema, checks taxonomy references, detects
duplicate IDs and normalized URLs, verifies filenames, type-checks the scripts, and validates the
complete generated catalogue in memory. The same checks run automatically on pull requests.
GitHub Actions then builds `catalogue.json` and publishes it as a downloadable workflow artifact.
Future website deployments can run the same build directly from the reviewed YAML source.

The event collection is intentionally lightweight. Each event has an ID, title, description,
start and end dates, format, event type, and event URL. Physical and hybrid events also require a
location; a recording URL is optional. `npm test` validates the schema, filenames, date order, and
possible duplicates. Events are generated newest first in `events.json`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and curation guidance.

## Website

The static website has a landing page and two collection routes:

- `resources/` loads the generated resource catalogue and provides:
  - instant, multi-word search across titles, descriptions, authors, features, and taxonomy
  - highlighted search terms and live result counts
  - responsive resource cards with canonical links and access details
  - guided **Edit this resource** links that explain YAML and the review process before opening GitHub
  - a structured **Suggest a new resource** form that is converted into a validated pull request
- `events/` loads the generated event collection and provides:
  - automatic Upcoming and Past sections based on each event's end date
  - reverse-chronological ordering
  - expandable event descriptions, recording links, and direct editing links
  - a structured event suggestion form that generates a validated pull request
- `about/` introduces the Commission members and links to its YouTube channel and mailing list

Resource URLs receive safe checks on new submissions and during the monthly catalogue-wide
stale-link review.

Run the website locally:

```sh
npm run dev
```

Create the complete GitHub Pages output in `dist/`:

```sh
npm run build:site
```

The `Deploy website` workflow validates the repository, regenerates `catalogue.json`, builds the
site, and deploys the resulting artifact to GitHub Pages whenever `main` changes.

## Maintainer notifications

After a resource change reaches `main`, the `Notify resource maintainers` workflow emails the
address associated with each affected record and includes the YAML diff. Messages are consolidated
per recipient. Records whose `maintainerEmail` is `unknown` are skipped.

For an existing record, the workflow always notifies the address in the previous version. When the
address changes, it notifies both the previous and new addresses. A new record is sent to its new
maintainer, and deletion notices go to the previous maintainer. Notifications run only after merge,
never from untrusted pull-request code, and a safety limit prevents more than 100 messages per run.

The sender is `Logic Education Resources <logic.education.resources@gmail.com>`. A repository
administrator must configure it once:

1. Enable 2-Step Verification on the Google account.
2. Open the Google Account **App passwords** page and create an app password named
   `GitHub catalogue notifications`.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions**.
4. Add `CATALOGUE_EMAIL_USERNAME` with the value
   `logic.education.resources@gmail.com`.
5. Add `CATALOGUE_EMAIL_APP_PASSWORD` with the generated 16-character app password
   (without display spaces).
6. Keep recovery information for the Google account under Commission control. Changing the main
   Google password revokes app passwords, so generate and save a new GitHub secret afterward.

The app password is available only to the post-merge workflow and must never be placed in a YAML
resource, source file, issue, pull request, or workflow log.

## Initial import

The initial records were extracted from the Commission's public compilation on 28 July 2026. Each
record retains its source page, source section, original resource type, and original external-software
value under `provenance`.

The source contains incomplete descriptions and ambiguous values. These records are deliberately
retained and marked with `review.needsReview` rather than silently guessed. Intermediary links from
the original compilation were replaced with the resources' canonical destinations.

## Generated catalogue format

The top-level format is intentionally small and stable:

```json
{
  "schemaVersion": 1,
  "resources": []
}
```

Consumers should use `id` as the durable resource identifier and should tolerate new optional fields
being added in future schema versions.

The generated event collection follows the same pattern:

```json
{
  "schemaVersion": 1,
  "events": []
}
```
