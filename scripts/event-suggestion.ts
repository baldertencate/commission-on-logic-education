import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { eventDuplicateKey } from "./event-validation.js";
import { listEventFiles, readEvent } from "./lib.js";
import { parseIssueForm } from "./suggestion.js";

type EventSuggestionInput = {
  body: string;
  issueNumber: number;
};

type GeneratedEventSuggestion = {
  id: string;
  relativeFile: string;
  event: Record<string, unknown>;
  yaml: string;
};

const headings = {
  title: "Event title",
  description: "Description",
  startDate: "Start date",
  endDate: "End date",
  format: "Format",
  location: "Location",
  eventType: "Event type",
  eventUrl: "Event URL",
  recordingUrl: "Recording URL",
} as const;

function requiredField(fields: Record<string, string>, heading: string): string {
  const value = fields[heading]?.trim();
  if (!value) throw new Error(`The “${heading}” field is missing or empty.`);
  return value;
}

function parseDate(value: string, fieldName: string): string {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${fieldName} is not a valid calendar date.`);
  }
  return date;
}

function parseChoice<T extends string>(
  value: string,
  allowed: Record<string, T>,
  fieldName: string,
): T {
  const result = allowed[value.trim().toLocaleLowerCase()];
  if (!result) throw new Error(`“${value}” is not an allowed ${fieldName}.`);
  return result;
}

function optionalUrl(value: string, fieldName: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${fieldName} must be a complete http:// or https:// address.`);
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88)
    .replace(/-+$/g, "");
}

function chooseAvailableId(
  title: string,
  startDate: string,
  issueNumber: number,
  existingIds: Set<string>,
): string {
  const titleSlug = slugify(title) || "event";
  const base = `${titleSlug}-${startDate.slice(0, 4)}`.slice(0, 100).replace(/-+$/g, "");
  if (!existingIds.has(base)) return base;
  const suffix = `-${issueNumber}`;
  return `${base.slice(0, 100 - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

export async function buildEventSuggestion(
  input: EventSuggestionInput,
): Promise<GeneratedEventSuggestion> {
  const fields = parseIssueForm(input.body);
  const title = requiredField(fields, headings.title);
  const description = requiredField(fields, headings.description);
  const startDate = parseDate(requiredField(fields, headings.startDate), "Start date");
  const endDate = parseDate(requiredField(fields, headings.endDate), "End date");
  if (endDate < startDate) throw new Error("End date cannot be before start date.");

  const format = parseChoice(
    requiredField(fields, headings.format),
    { online: "online", physical: "physical", hybrid: "hybrid" },
    "format",
  );
  const eventType = parseChoice(
    requiredField(fields, headings.eventType),
    {
      conference: "conference",
      course: "course",
      "panel discussion": "panel-discussion",
      seminar: "seminar",
      webinar: "webinar",
      workshop: "workshop",
      other: "other",
    },
    "event type",
  );
  const location = fields[headings.location]?.trim() ?? "";
  if (format !== "online" && !location) {
    throw new Error("Location is required for physical and hybrid events.");
  }
  if (format === "online" && location) {
    throw new Error("Location must be left blank for online events.");
  }

  const eventFiles = await listEventFiles();
  const existingIds = new Set(
    eventFiles.map((file) => path.basename(file).replace(/\.ya?ml$/i, "")),
  );
  const duplicateKey = eventDuplicateKey({ title, startDate, endDate });
  for (const file of eventFiles) {
    const existing = await readEvent(file) as {
      id?: string;
      title: string;
      startDate: string;
      endDate: string;
    };
    if (eventDuplicateKey(existing) === duplicateKey) {
      throw new Error(`This event is already present as “${existing.id ?? path.basename(file)}”.`);
    }
  }

  const id = chooseAvailableId(title, startDate, input.issueNumber, existingIds);
  const event: Record<string, unknown> = {
    id,
    title,
    description,
    startDate,
    endDate,
    format,
  };
  if (location) event.location = location;
  event.eventType = eventType;
  const eventUrl = optionalUrl(fields[headings.eventUrl] ?? "", "Event URL");
  const recordingUrl = optionalUrl(fields[headings.recordingUrl] ?? "", "Recording URL");
  if (eventUrl) event.eventUrl = eventUrl;
  if (recordingUrl) event.recordingUrl = recordingUrl;

  return {
    id,
    relativeFile: `events/${id}.yml`,
    event,
    yaml: stringifyYaml(event, { lineWidth: 0 }),
  };
}

export const eventSuggestionHeadings = headings;
