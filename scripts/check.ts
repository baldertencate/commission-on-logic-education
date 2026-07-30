import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import type { ErrorObject } from "ajv";
import { eventDatesAreOrdered, eventDuplicateKey } from "./event-validation.js";
import {
  listEventFiles,
  listResourceFiles,
  normalizeUrl,
  readEvent,
  readResource,
  readTaxonomy,
  ROOT,
} from "./lib.js";

type Resource = {
  id: string;
  url: string;
  alternateUrls?: string[];
  types: string[];
  topics: string[];
  languages?: string[];
  audiences: string[];
};

type Event = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
};

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as typeof import("ajv/dist/2020.js").default;
const addFormats = require("ajv-formats").default as typeof import("ajv-formats").default;
const resourceSchema = JSON.parse(
  await fs.readFile(path.join(ROOT, "schema", "resource.schema.json"), "utf8"),
);
const catalogueSchema = JSON.parse(
  await fs.readFile(path.join(ROOT, "schema", "catalogue.schema.json"), "utf8"),
);
const eventSchema = JSON.parse(
  await fs.readFile(path.join(ROOT, "schema", "event.schema.json"), "utf8"),
);
const eventsSchema = JSON.parse(
  await fs.readFile(path.join(ROOT, "schema", "events.schema.json"), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(resourceSchema);
ajv.addSchema(eventSchema);
const validateResource = ajv.getSchema(resourceSchema.$id);
if (!validateResource) throw new Error("Could not compile resource.schema.json");
const validateCatalogue = ajv.compile(catalogueSchema);
const validateEvent = ajv.getSchema(eventSchema.$id);
if (!validateEvent) throw new Error("Could not compile event.schema.json");
const validateEvents = ajv.compile(eventsSchema);
const files = await listResourceFiles();
const eventFiles = await listEventFiles();
const errors: string[] = [];
const entries: Array<{ file: string; resource: Resource }> = [];
const eventEntries: Array<{ file: string; event: Event }> = [];

function formatErrors(file: string, details: ErrorObject[] | null | undefined) {
  for (const detail of details ?? []) {
    errors.push(`${path.relative(ROOT, file)}${detail.instancePath || "/"} ${detail.message}`);
  }
}

for (const file of files) {
  const value = await readResource(file);
  if (!validateResource(value)) formatErrors(file, validateResource.errors);
  else entries.push({ file, resource: value as Resource });
}

for (const file of eventFiles) {
  const value = await readEvent(file);
  if (!validateEvent(value)) formatErrors(file, validateEvent.errors);
  else eventEntries.push({ file, event: value as Event });
}

const taxonomyNames = ["resource-types", "topics", "audiences"] as const;
const taxonomyIds = new Map<string, Set<string>>();
for (const name of taxonomyNames) {
  const items = await readTaxonomy(name);
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || !item.label) errors.push(`taxonomy/${name}.yml has an item without id or label`);
    if (ids.has(item.id)) errors.push(`taxonomy/${name}.yml repeats id "${item.id}"`);
    ids.add(item.id);
  }
  taxonomyIds.set(name, ids);
}

const seenIds = new Map<string, string>();
const seenUrls = new Map<string, string>();
for (const { file, resource } of entries) {
  const expectedFile = `resources/${resource.id}.yml`;
  const actualFile = path.relative(ROOT, file);
  if (actualFile !== expectedFile) {
    errors.push(`${actualFile} must be named ${expectedFile}`);
  }
  const previousId = seenIds.get(resource.id);
  if (previousId) errors.push(`duplicate id "${resource.id}" in ${previousId} and ${actualFile}`);
  seenIds.set(resource.id, actualFile);

  for (const rawUrl of [resource.url, ...(resource.alternateUrls ?? [])]) {
    const url = normalizeUrl(rawUrl);
    const previousUrl = seenUrls.get(url);
    if (previousUrl && previousUrl !== resource.id) {
      errors.push(`duplicate URL "${url}" in ${previousUrl} and ${resource.id}`);
    }
    seenUrls.set(url, resource.id);
  }

  const references: Array<[keyof Resource, string]> = [
    ["types", "resource-types"],
    ["topics", "topics"],
    ["audiences", "audiences"],
  ];
  for (const [field, taxonomy] of references) {
    for (const id of resource[field] as string[]) {
      if (!taxonomyIds.get(taxonomy)?.has(id)) {
        errors.push(`${actualFile} references unknown ${taxonomy} id "${id}"`);
      }
    }
  }
}

const seenEventIds = new Map<string, string>();
const seenEvents = new Map<string, string>();
for (const { file, event } of eventEntries) {
  const expectedFile = `events/${event.id}.yml`;
  const actualFile = path.relative(ROOT, file);
  if (actualFile !== expectedFile) {
    errors.push(`${actualFile} must be named ${expectedFile}`);
  }

  const previousId = seenEventIds.get(event.id);
  if (previousId) {
    errors.push(`duplicate event id "${event.id}" in ${previousId} and ${actualFile}`);
  }
  seenEventIds.set(event.id, actualFile);

  if (!eventDatesAreOrdered(event)) {
    errors.push(`${actualFile} endDate must not be before startDate`);
  }

  const eventKey = eventDuplicateKey(event);
  const previousEvent = seenEvents.get(eventKey);
  if (previousEvent) {
    errors.push(`possible duplicate event in ${previousEvent} and ${actualFile}`);
  }
  seenEvents.set(eventKey, actualFile);
}

const catalogue = {
  schemaVersion: 1,
  resources: entries.map(({ resource }) => resource).sort((a, b) => a.id.localeCompare(b.id)),
};
if (!validateCatalogue(catalogue)) {
  for (const detail of validateCatalogue.errors ?? []) {
    errors.push(`generated catalogue${detail.instancePath || "/"} ${detail.message}`);
  }
}

const events = {
  schemaVersion: 1,
  events: eventEntries
    .map(({ event }) => event)
    .sort(
      (a, b) =>
        b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id),
    ),
};
if (!validateEvents(events)) {
  for (const detail of validateEvents.errors ?? []) {
    errors.push(`generated events${detail.instancePath || "/"} ${detail.message}`);
  }
}

try {
  execFileSync(process.execPath, [
    path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    "--noEmit",
  ], { cwd: ROOT, stdio: "pipe" });
} catch (error) {
  const output = error as { stdout?: Buffer; stderr?: Buffer };
  errors.push(`TypeScript check failed:\n${output.stdout?.toString() ?? ""}${output.stderr?.toString() ?? ""}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${entries.length} resources, ${eventEntries.length} events, taxonomies, URLs, and generated collections.`,
);
