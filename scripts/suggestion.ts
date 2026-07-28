import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import {
  listResourceFiles,
  normalizeUrl,
  readResource,
  readTaxonomy,
  ROOT,
  type TaxonomyItem,
} from "./lib.js";

type IssueFields = Record<string, string>;

type ResourceSuggestionInput = {
  body: string;
  issueNumber: number;
  issueUrl: string;
  createdAt: string;
};

type GeneratedSuggestion = {
  id: string;
  relativeFile: string;
  resource: Record<string, unknown>;
  yaml: string;
};

const headings = {
  title: "Resource title",
  maintainerEmail: "Maintainer email address",
  url: "Canonical URL",
  description: "Description",
  types: "Resource types",
  topics: "Logic topics",
  languages: "Language codes",
  audiences: "Intended audiences",
  authors: "Authors or maintaining organizations",
  features: "Notable features",
  cost: "Cost",
  accessModes: "Access modes",
  software: "Does it require downloaded software?",
  platforms: "Platforms or required software",
  registration: "Is registration required?",
  notes: "Additional notes",
  checks: "Final checks",
} as const;

const maintainerAgreement =
  "I agree to periodic maintenance contact";

export function parseIssueForm(body: string): IssueFields {
  const fields: IssueFields = {};
  const matches = [...body.matchAll(/^###\s+(.+?)\s*$/gm)];

  for (const [index, match] of matches.entries()) {
    const heading = match[1];
    if (!heading) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    const value = body.slice(start, end).trim();
    fields[heading] = value === "_No response_" ? "" : value;
  }

  return fields;
}

function requiredField(fields: IssueFields, heading: string): string {
  const value = fields[heading]?.trim();
  if (!value) throw new Error(`The “${heading}” field is missing or empty.`);
  return value;
}

function listValues(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

function choiceValues(value: string): string[] {
  return listValues(value).flatMap((line) => line.split(/\s*,\s*/).filter(Boolean));
}

function normalizeChoice(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function taxonomyLookup(items: TaxonomyItem[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const item of items) {
    lookup.set(normalizeChoice(item.id), item.id);
    lookup.set(normalizeChoice(item.label), item.id);
  }
  return lookup;
}

function mapTaxonomyChoices(
  value: string,
  fieldName: string,
  items: TaxonomyItem[],
): string[] {
  const lookup = taxonomyLookup(items);
  return choiceValues(value).map((choice) => {
    const id = lookup.get(normalizeChoice(choice));
    if (!id) throw new Error(`“${choice}” is not an allowed value for ${fieldName}.`);
    return id;
  });
}

function parseTriState(value: string, fieldName: string): boolean | null {
  const normalized = normalizeChoice(value);
  if (normalized === "yes") return true;
  if (normalized === "no") return false;
  if (normalized === "unknown") return null;
  throw new Error(`“${value}” is not an allowed value for ${fieldName}.`);
}

function parseCost(value: string): "free" | "freemium" | "paid" | "unknown" {
  const normalized = normalizeChoice(value);
  if (["free", "freemium", "paid", "unknown"].includes(normalized)) {
    return normalized as "free" | "freemium" | "paid" | "unknown";
  }
  throw new Error(`“${value}” is not an allowed cost.`);
}

function parseAccessModes(value: string): Array<"online" | "download" | "physical"> {
  return choiceValues(value).map((choice) => {
    const normalized = normalizeChoice(choice);
    if (["online", "download", "physical"].includes(normalized)) {
      return normalized as "online" | "download" | "physical";
    }
    throw new Error(`“${choice}” is not an allowed access mode.`);
  });
}

function parseLanguageTags(value: string): string[] {
  const tags = choiceValues(value).map((tag) => {
    try {
      return new Intl.Locale(tag).toString();
    } catch {
      throw new Error(
        `“${tag}” is not a valid language tag. Use a code such as en, es, or pt-BR.`,
      );
    }
  });
  return [...new Set(tags)];
}

function parseMaintainerEmail(value: string): string {
  const email = value.trim();
  if (normalizeChoice(email) === "unknown") {
    throw new Error("New suggestions require a maintainer email address; “unknown” is for legacy records only.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("The maintainer email address is not valid.");
  }
  return email;
}

function requireMaintainerAgreement(value: string): void {
  const agreed = value
    .split(/\r?\n/)
    .some((line) => /^\s*-\s+\[[xX]\]\s+/.test(line) && line.includes(maintainerAgreement));
  if (!agreed) {
    throw new Error("The maintainer contact and public-storage agreement must be accepted.");
  }
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : fallback;
}

function chooseAvailableId(title: string, issueNumber: number, existingIds: Set<string>): string {
  const base = slugify(title, `resource-${issueNumber}`);
  if (!existingIds.has(base)) return base;

  const numberedBase = base.slice(0, Math.max(2, 99 - String(issueNumber).length))
    .replace(/-+$/g, "");
  let candidate = `${numberedBase}-${issueNumber}`;
  let counter = 2;
  while (existingIds.has(candidate)) {
    const suffix = `-${issueNumber}-${counter}`;
    candidate = `${base.slice(0, 100 - suffix.length).replace(/-+$/g, "")}${suffix}`;
    counter += 1;
  }
  return candidate;
}

export async function buildResourceSuggestion(
  input: ResourceSuggestionInput,
): Promise<GeneratedSuggestion> {
  const fields = parseIssueForm(input.body);
  const title = requiredField(fields, headings.title);
  const maintainerEmail = parseMaintainerEmail(
    requiredField(fields, headings.maintainerEmail),
  );
  const rawUrl = requiredField(fields, headings.url);
  const description = requiredField(fields, headings.description);
  requireMaintainerAgreement(requiredField(fields, headings.checks));

  let url: string;
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
  } catch {
    throw new Error("The canonical URL must be a complete http:// or https:// address.");
  }

  const [typesTaxonomy, topicsTaxonomy, audiencesTaxonomy, resourceFiles] =
    await Promise.all([
      readTaxonomy("resource-types"),
      readTaxonomy("topics"),
      readTaxonomy("audiences"),
      listResourceFiles(),
    ]);
  const existingIds = new Set(resourceFiles.map((file) => path.basename(file).replace(/\.ya?ml$/i, "")));
  const normalizedSuggestionUrl = normalizeUrl(url);

  for (const file of resourceFiles) {
    const resource = await readResource(file) as { id?: string; url?: string; alternateUrls?: string[] };
    for (const existingUrl of [resource.url, ...(resource.alternateUrls ?? [])]) {
      if (existingUrl && normalizeUrl(existingUrl) === normalizedSuggestionUrl) {
        throw new Error(
          `This URL is already present in the catalogue as “${resource.id ?? path.basename(file)}”.`,
        );
      }
    }
  }

  const types = mapTaxonomyChoices(
    requiredField(fields, headings.types),
    "resource types",
    typesTaxonomy,
  );
  const topics = mapTaxonomyChoices(
    requiredField(fields, headings.topics),
    "logic topics",
    topicsTaxonomy,
  );
  const languages = parseLanguageTags(fields[headings.languages] ?? "");
  const audiences = mapTaxonomyChoices(
    requiredField(fields, headings.audiences),
    "audiences",
    audiencesTaxonomy,
  );
  const accessModes = parseAccessModes(requiredField(fields, headings.accessModes));
  const features = listValues(fields[headings.features] ?? "");
  const authors = listValues(fields[headings.authors] ?? "");
  const platforms = listValues(fields[headings.platforms] ?? "");
  const notes = fields[headings.notes]?.trim() ?? "";
  const id = chooseAvailableId(title, input.issueNumber, existingIds);

  const access: Record<string, unknown> = {
    cost: parseCost(requiredField(fields, headings.cost)),
    mode: accessModes,
    requiresSoftware: parseTriState(
      requiredField(fields, headings.software),
      "downloaded software",
    ),
  };
  if (platforms.length) access.platforms = platforms;
  access.registration = parseTriState(
    requiredField(fields, headings.registration),
    "registration",
  );

  const resource: Record<string, unknown> = {
    id,
    title,
    url,
    description,
    maintainerEmail,
  };
  if (features.length) resource.features = features;
  resource.types = types;
  resource.topics = topics;
  if (languages.length) resource.languages = languages;
  resource.audiences = audiences;
  if (authors.length) resource.authors = authors;
  resource.access = access;
  resource.status = "active";
  if (notes) resource.notes = notes;
  resource.provenance = [
    {
      sourceUrl: input.issueUrl,
      sourceSection: "Community suggestion",
      importedAt: input.createdAt.slice(0, 10),
    },
  ];

  return {
    id,
    relativeFile: `resources/${id}.yml`,
    resource,
    yaml: stringifyYaml(resource, { lineWidth: 0 }),
  };
}

export const suggestionHeadings = headings;
export { ROOT };
