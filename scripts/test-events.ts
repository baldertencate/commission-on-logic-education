import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { eventDatesAreOrdered, eventDuplicateKey } from "./event-validation.js";
import { ROOT } from "./lib.js";
import {
  sortEventsReverseChronologically,
  splitEventsByDate,
  type EventRecord,
} from "../src/event-utils.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as typeof import("ajv/dist/2020.js").default;
const addFormats = require("ajv-formats").default as typeof import("ajv-formats").default;
const schema = JSON.parse(
  await fs.readFile(path.join(ROOT, "schema", "event.schema.json"), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const validOnline = {
  id: "example-event",
  title: "Example event",
  description: "An event about teaching logic.",
  startDate: "2026-09-01",
  endDate: "2026-09-02",
  format: "online",
  eventType: "other",
  eventUrl: "https://example.org/event",
};
assert.equal(validate(validOnline), true);
const { eventUrl: _eventUrl, ...validWithoutEventUrl } = validOnline;
assert.equal(validate(validWithoutEventUrl), true);
assert.equal(validate({ ...validOnline, format: "physical" }), false);
assert.equal(validate({ ...validOnline, location: "Amsterdam" }), false);
assert.equal(
  validate({ ...validOnline, format: "hybrid", location: "Amsterdam" }),
  true,
);
assert.equal(validate({ ...validOnline, startDate: "2026-02-30" }), false);

assert.equal(eventDatesAreOrdered(validOnline), true);
assert.equal(
  eventDatesAreOrdered({
    ...validOnline,
    startDate: "2026-09-03",
    endDate: "2026-09-02",
  }),
  false,
);
assert.equal(
  eventDuplicateKey(validOnline),
  eventDuplicateKey({ ...validOnline, title: "  EXAMPLE EVENT  " }),
);

const datedEvents = [
  { ...validOnline, id: "past", startDate: "2025-01-01", endDate: "2025-01-01" },
  { ...validOnline, id: "future", startDate: "2027-01-01", endDate: "2027-01-02" },
  { ...validOnline, id: "ongoing", startDate: "2026-07-29", endDate: "2026-07-31" },
] as EventRecord[];
assert.deepEqual(
  sortEventsReverseChronologically(datedEvents).map((event) => event.id),
  ["future", "ongoing", "past"],
);
const split = splitEventsByDate(datedEvents, "2026-07-30");
assert.deepEqual(split.upcoming.map((event) => event.id), ["future", "ongoing"]);
assert.deepEqual(split.past.map((event) => event.id), ["past"]);

console.log("Event validation tests passed.");
