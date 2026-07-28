import assert from "node:assert/strict";
import {
  extractContactLinks,
  extractEmailCandidates,
  resultsToCsv,
} from "./discover-maintainer-emails.js";

const resource = {
  id: "example-logic",
  title: "Example Logic",
  url: "https://logic.example.org/tool",
  maintainerEmail: "unknown",
  authors: ["Ada Lovelace"],
};
const html = `
  <html>
    <body>
      <nav>
        <a href="/contact">Contact us</a>
        <a href="https://unrelated.example.net/about">Unrelated</a>
      </nav>
      <p>Questions about the tool? Email
        <a href="mailto:Ada.Lovelace@example.org?subject=Logic">Ada Lovelace</a>.
      </p>
      <p>Backup: support [at] logic.example.org</p>
      <p>Automated mail: no-reply@logic.example.org</p>
      <a href="mailto:%E0%A4%A">Malformed address</a>
    </body>
  </html>
`;

const candidates = extractEmailCandidates(
  html,
  "https://logic.example.org/about",
  resource,
);
assert.deepEqual(
  candidates.map(({ email }) => email),
  ["ada.lovelace@example.org", "support@logic.example.org"],
);
assert.equal(candidates[0]?.confidence, "high");
assert.equal(candidates[1]?.confidence, "high");
assert.deepEqual(
  extractContactLinks(html, "https://logic.example.org/tool"),
  ["https://logic.example.org/contact"],
);

const csv = resultsToCsv(
  [{ resource, candidates: candidates.slice(0, 1) }],
  "2026-07-28T12:00:00.000Z",
);
assert.match(csv, /"ada\.lovelace@example\.org"/);
assert.match(csv, /"example-logic"/);
assert.match(csv, /"candidate"/);

console.log("Maintainer email discovery tests passed.");
