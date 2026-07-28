import assert from "node:assert/strict";
import {
  buildNotifications,
  type ResourceChange,
} from "./maintainer-notifications.js";

const changes: ResourceChange[] = [
  {
    path: "resources/alpha.yml",
    before: {
      id: "alpha",
      title: "Alpha",
      maintainerEmail: "old@example.test",
    },
    after: {
      id: "alpha",
      title: "Alpha revised",
      maintainerEmail: "new@example.test",
    },
    diff: "-title: Alpha\n+title: Alpha revised",
  },
  {
    path: "resources/beta.yml",
    before: null,
    after: {
      id: "beta",
      title: "Beta",
      maintainerEmail: "new@example.test",
    },
    diff: "+title: Beta\n+description: <unsafe>",
  },
  {
    path: "resources/legacy.yml",
    before: { id: "legacy", title: "Legacy", maintainerEmail: "unknown" },
    after: { id: "legacy", title: "Legacy revised", maintainerEmail: "unknown" },
    diff: "-title: Legacy\n+title: Legacy revised",
  },
];

const notifications = buildNotifications(
  changes,
  "https://github.com/example/catalogue",
  "abc123",
);
assert.equal(notifications.length, 2);

const oldMaintainer = notifications.find(
  (notification) => notification.to === "old@example.test",
);
assert(oldMaintainer);
assert.deepEqual(oldMaintainer.resourceIds, ["alpha"]);
assert.match(oldMaintainer.text, /maintainer changed/);
assert.match(oldMaintainer.text, /-title: Alpha/);
assert.match(oldMaintainer.text, /github\.com\/example\/catalogue\/commit\/abc123/);

const newMaintainer = notifications.find(
  (notification) => notification.to === "new@example.test",
);
assert(newMaintainer);
assert.deepEqual(newMaintainer.resourceIds, ["alpha", "beta"]);
assert.match(newMaintainer.subject, /2 logic education catalogue records/);
assert.doesNotMatch(newMaintainer.text, /Legacy/);
assert.match(newMaintainer.html, /Alpha revised/);
assert.match(newMaintainer.html, /&lt;/);

const deleted = buildNotifications(
  [
    {
      path: "resources/deleted.yml",
      before: {
        id: "deleted",
        title: "Deleted",
        maintainerEmail: "owner@example.test",
      },
      after: null,
      diff: "-title: Deleted",
    },
  ],
  "https://github.com/example/catalogue",
  "def456",
);
assert.equal(deleted[0]?.to, "owner@example.test");
assert.match(deleted[0]?.text ?? "", /deleted/);

console.log("Maintainer notification tests passed.");
