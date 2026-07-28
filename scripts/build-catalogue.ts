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

const requestedOutput = process.argv[2];
const outputFile = requestedOutput
  ? path.resolve(ROOT, requestedOutput)
  : path.join(ROOT, "catalogue.json");
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, stableJson(catalogue));
console.log(`Built ${path.relative(ROOT, outputFile)} with ${resources.length} resources.`);
