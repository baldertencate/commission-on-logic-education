import assert from "node:assert/strict";
import {
  synchronizeUrlReviewIssues,
  updateReviewBlock,
  URL_AUDIT_ISSUE_PREFIX,
} from "./audit-urls.js";
import {
  checkUrl,
  isPublicIpAddress,
  type UrlCheckOptions,
} from "./url-check.js";
import {
  assertNoStaleSubmissionUrls,
} from "./submission-url-check.js";

const publicResolution = async () => ["93.184.216.34"];

function options(
  responses: Array<Response | Error>,
): UrlCheckOptions {
  let index = 0;
  return {
    resolveHostname: publicResolution,
    fetchImpl: async () => {
      const response = responses[index];
      index += 1;
      if (response instanceof Error) throw response;
      if (!response) throw new Error("The test did not provide enough responses.");
      return response;
    },
  };
}

assert.equal(isPublicIpAddress("8.8.8.8"), true);
assert.equal(isPublicIpAddress("127.0.0.1"), false);
assert.equal(isPublicIpAddress("192.168.1.1"), false);
assert.equal(isPublicIpAddress("::1"), false);

const reachable = await checkUrl(
  "https://example.test/",
  options([new Response(null, { status: 200 })]),
);
assert.equal(reachable.outcome, "reachable");

const headFallback = await checkUrl(
  "https://example.test/no-head",
  options([
    new Response(null, { status: 405 }),
    new Response(null, { status: 200 }),
  ]),
);
assert.equal(headFallback.outcome, "reachable");

const stale = await checkUrl(
  "https://example.test/missing",
  options([
    new Response(null, { status: 404, statusText: "Not Found" }),
    new Response(null, { status: 404, statusText: "Not Found" }),
  ]),
);
assert.equal(stale.outcome, "stale");
assert.throws(() => assertNoStaleSubmissionUrls([stale]), /failed the automatic check/);

const restricted = await checkUrl(
  "https://example.test/restricted",
  options([
    new Response(null, { status: 403 }),
    new Response(null, { status: 403 }),
  ]),
);
assert.equal(restricted.outcome, "warning");
assert.doesNotThrow(() => assertNoStaleSubmissionUrls([restricted]));

const redirect = await checkUrl(
  "https://example.test/old",
  options([
    new Response(null, {
      status: 301,
      headers: { location: "https://example.test/new" },
    }),
    new Response(null, { status: 200 }),
  ]),
);
assert.equal(redirect.outcome, "reachable");
assert.equal(redirect.finalUrl, "https://example.test/new");

const unsafe = await checkUrl("http://127.0.0.1/private");
assert.equal(unsafe.outcome, "unsafe");

const resource = {
  id: "example",
  url: "https://example.test/missing",
  review: {
    needsReview: true,
    issues: ["Confirm the intended audience."],
  },
};
assert.equal(synchronizeUrlReviewIssues(resource, [stale]), true);
assert.equal(resource.review.needsReview, true);
assert.deepEqual(resource.review.issues, [
  "Confirm the intended audience.",
  `${URL_AUDIT_ISSUE_PREFIX}https://example.test/missing appears stale (HTTP 404 Not Found).`,
]);
assert.equal(synchronizeUrlReviewIssues(resource, [reachable]), true);
assert.deepEqual(resource.review.issues, ["Confirm the intended audience."]);
assert.equal(resource.review.needsReview, true);
assert.equal(synchronizeUrlReviewIssues(resource, [reachable]), false);

const inconclusiveResource = {
  id: "inconclusive",
  url: "https://example.test/restricted",
  review: {
    needsReview: true,
    issues: [
      `${URL_AUDIT_ISSUE_PREFIX}https://example.test/restricted appears stale (HTTP 404 Not Found).`,
    ],
  },
};
assert.equal(synchronizeUrlReviewIssues(inconclusiveResource, [restricted]), false);
assert.equal(inconclusiveResource.review.needsReview, true);

const recoveredResource = {
  id: "recovered",
  url: "https://example.test/",
  review: {
    needsReview: true,
    issues: [
      `${URL_AUDIT_ISSUE_PREFIX}https://example.test/ appears stale (HTTP 404 Not Found).`,
    ],
  },
};
assert.equal(synchronizeUrlReviewIssues(recoveredResource, [reachable]), true);
assert.deepEqual(recoveredResource.review, { needsReview: false, issues: [] });

const sourceWithWrappedText = `id: example
description: This line intentionally
  remains wrapped.
review:
  needsReview: false
  issues: []
notes: Still here.
`;
const updatedSource = updateReviewBlock(sourceWithWrappedText, {
  needsReview: true,
  issues: ["Check the URL."],
});
assert.equal(
  updatedSource,
  `id: example
description: This line intentionally
  remains wrapped.
review:
  needsReview: true
  issues:
    - Check the URL.
notes: Still here.
`,
);

console.log("URL checker tests passed.");
