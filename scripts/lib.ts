import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const ROOT = path.resolve(import.meta.dirname, "..");

export type TaxonomyItem = { id: string; label: string };

export async function listResourceFiles(): Promise<string[]> {
  return listYamlFiles("resources");
}

export async function listEventFiles(): Promise<string[]> {
  return listYamlFiles("events");
}

async function listYamlFiles(directoryName: string): Promise<string[]> {
  const directory = path.join(ROOT, directoryName);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

export async function readResource(file: string): Promise<unknown> {
  return parseYaml(await fs.readFile(file, "utf8"));
}

export async function readEvent(file: string): Promise<unknown> {
  return parseYaml(await fs.readFile(file, "utf8"));
}

export async function readTaxonomy(name: string): Promise<TaxonomyItem[]> {
  const file = path.join(ROOT, "taxonomy", `${name}.yml`);
  return parseYaml(await fs.readFile(file, "utf8")) as TaxonomyItem[];
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "pvs") url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
