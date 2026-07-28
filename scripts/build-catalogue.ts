import fs from "node:fs/promises";
import path from "node:path";
import { listResourceFiles, readResource, ROOT, stableJson } from "./lib.js";

const files = await listResourceFiles();
const resources = await Promise.all(files.map(readResource));
resources.sort((a, b) => {
  const left = a as { id: string };
  const right = b as { id: string };
  return left.id.localeCompare(right.id);
});

const catalogue = {
  schemaVersion: 1,
  resources,
};

await fs.writeFile(path.join(ROOT, "catalogue.json"), stableJson(catalogue));
console.log(`Built catalogue.json with ${resources.length} resources.`);
