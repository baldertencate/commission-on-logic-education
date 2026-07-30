import fs from "node:fs/promises";
import path from "node:path";
import { listEventFiles, readEvent, ROOT, stableJson } from "./lib.js";

const files = await listEventFiles();
const events = await Promise.all(files.map(readEvent));
events.sort((a, b) => {
  const left = a as { startDate: string; id: string };
  const right = b as { startDate: string; id: string };
  return right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id);
});

const collection = {
  schemaVersion: 1,
  events,
};

const requestedOutput = process.argv[2];
const outputFile = requestedOutput
  ? path.resolve(ROOT, requestedOutput)
  : path.join(ROOT, "events.json");
await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, stableJson(collection));
console.log(`Built ${path.relative(ROOT, outputFile)} with ${events.length} events.`);
