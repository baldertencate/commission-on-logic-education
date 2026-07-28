import assert from "node:assert/strict";
import {
  containsAnyTerm,
  matchesSearch,
  normalize,
  queryTerms,
  type SearchableResource,
} from "../src/search.js";

const resource: SearchableResource = {
  title: "Lógica in Action",
  description: "An open course covering modal and propositional logic.",
  features: ["Interactive exercises"],
  types: ["course", "website"],
  topics: ["modal-logic"],
  languages: ["en", "es"],
  audiences: ["undergraduate"],
  authors: ["Example Author"],
};

assert.deepEqual(queryTerms("  modal   action modal "), ["modal", "action"]);
assert.equal(normalize("Lógica"), "logica");
assert.equal(matchesSearch(resource, queryTerms("modal action")), true);
assert.equal(matchesSearch(resource, queryTerms("LOGICA author")), true);
assert.equal(matchesSearch(resource, queryTerms("modal video")), false);
assert.equal(containsAnyTerm(resource.features ?? [], queryTerms("interactive")), true);
assert.equal(containsAnyTerm(resource.features ?? [], queryTerms("exercise author")), true);
assert.equal(containsAnyTerm(resource.features ?? [], queryTerms("modal")), false);

console.log("Search filtering tests passed.");
