import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

const execFile = promisify(execFileCallback);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResourceContact = {
  id?: string;
  title?: string;
  maintainerEmail?: string;
};

export type ResourceChange = {
  path: string;
  before: ResourceContact | null;
  after: ResourceContact | null;
  diff: string;
};

export type Notification = {
  to: string;
  subject: string;
  text: string;
  html: string;
  resourceIds: string[];
};

type NotificationItem = {
  title: string;
  id: string;
  path: string;
  kind: "created" | "updated" | "deleted" | "maintainer changed";
  diff: string;
};

function usableEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.toLowerCase() !== "unknown" &&
    EMAIL_PATTERN.test(value)
  );
}

function safeTitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim()
    ? value.replace(/[\r\n]+/g, " ").trim()
    : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function changeKind(change: ResourceChange): NotificationItem["kind"] {
  if (!change.before) return "created";
  if (!change.after) return "deleted";
  if (change.before.maintainerEmail !== change.after.maintainerEmail) {
    return "maintainer changed";
  }
  return "updated";
}

export function buildNotifications(
  changes: ResourceChange[],
  repositoryUrl: string,
  commitSha: string,
): Notification[] {
  const grouped = new Map<string, NotificationItem[]>();

  for (const change of changes) {
    const kind = changeKind(change);
    const resource = change.after ?? change.before ?? {};
    const id = resource.id || change.path.replace(/^resources\/|\.ya?ml$/g, "");
    const item: NotificationItem = {
      title: safeTitle(resource.title, id),
      id,
      path: change.path,
      kind,
      diff: change.diff.trim().slice(0, 50_000),
    };
    const addresses = new Set<string>();

    if (change.before && usableEmail(change.before.maintainerEmail)) {
      addresses.add(change.before.maintainerEmail.toLowerCase());
    }
    if (
      (!change.before ||
        change.before.maintainerEmail !== change.after?.maintainerEmail) &&
      change.after &&
      usableEmail(change.after.maintainerEmail)
    ) {
      addresses.add(change.after.maintainerEmail.toLowerCase());
    }

    for (const address of addresses) {
      const items = grouped.get(address) ?? [];
      items.push(item);
      grouped.set(address, items);
    }
  }

  const commitUrl = `${repositoryUrl}/commit/${encodeURIComponent(commitSha)}`;
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([to, items]) => {
      const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
      const subject =
        ordered.length === 1
          ? `Catalogue record changed: ${ordered[0].title}`
          : `${ordered.length} logic education catalogue records changed`;
      const sections = ordered.map(
        (item) =>
          `${item.title} (${item.kind})\nResource ID: ${item.id}\nFile: ${item.path}\n\n${item.diff || "(No textual diff available)"}`,
      );
      const text = [
        "A catalogue record associated with this email address was changed.",
        "",
        `Commit: ${commitUrl}`,
        "",
        ...sections.flatMap((section, index) => [
          index ? "\n----------------------------------------\n" : "",
          section,
        ]),
        "",
        "If this change is incorrect, reply to this message or open an issue in the repository.",
        "If you no longer wish to receive maintenance notifications, reply and ask us to remove or update the maintainer email.",
      ].join("\n");
      const htmlSections = ordered
        .map(
          (item) =>
            `<h2>${escapeHtml(item.title)} <small>(${escapeHtml(item.kind)})</small></h2>` +
            `<p>Resource ID: <code>${escapeHtml(item.id)}</code><br>` +
            `File: <code>${escapeHtml(item.path)}</code></p>` +
            `<pre style="white-space:pre-wrap;padding:12px;background:#f6f8fa;border:1px solid #d0d7de">${escapeHtml(item.diff || "(No textual diff available)")}</pre>`,
        )
        .join("");
      const html =
        `<p>A catalogue record associated with this email address was changed.</p>` +
        `<p><a href="${escapeHtml(commitUrl)}">View the commit on GitHub</a></p>` +
        htmlSections +
        `<p>If this change is incorrect, reply to this message or open an issue in the repository.</p>` +
        `<p>If you no longer wish to receive maintenance notifications, reply and ask us to remove or update the maintainer email.</p>`;

      return {
        to,
        subject,
        text,
        html,
        resourceIds: ordered.map((item) => item.id),
      };
    });
}

async function gitText(args: string[]): Promise<string> {
  const { stdout } = await execFile("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function resourceAt(
  revision: string,
  file: string,
): Promise<ResourceContact | null> {
  try {
    return parseYaml(await gitText(["show", `${revision}:${file}`])) as ResourceContact;
  } catch {
    return null;
  }
}

export async function collectResourceChanges(
  beforeSha: string,
  afterSha: string,
): Promise<ResourceChange[]> {
  const names = await gitText([
    "diff",
    "--no-renames",
    "--name-only",
    "--diff-filter=ACDMRT",
    beforeSha,
    afterSha,
    "--",
    "resources",
  ]);
  const paths = names
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => /^resources\/[^/]+\.ya?ml$/i.test(value));

  return Promise.all(
    paths.map(async (file) => ({
      path: file,
      before: await resourceAt(beforeSha, file),
      after: await resourceAt(afterSha, file),
      diff: await gitText([
        "diff",
        "--no-renames",
        "--no-ext-diff",
        "--unified=3",
        beforeSha,
        afterSha,
        "--",
        file,
      ]),
    })),
  );
}
