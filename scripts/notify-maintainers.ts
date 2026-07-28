import nodemailer from "nodemailer";
import {
  buildNotifications,
  collectResourceChanges,
} from "./maintainer-notifications.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const beforeSha = required("BEFORE_SHA");
const afterSha = required("AFTER_SHA");
const repository = required("GITHUB_REPOSITORY");
const repositoryUrl = `https://github.com/${repository}`;
const dryRun = process.env.EMAIL_DRY_RUN === "true";
const changes = await collectResourceChanges(beforeSha, afterSha);
const notifications = buildNotifications(changes, repositoryUrl, afterSha);

if (notifications.length === 0) {
  console.log("No maintainers need to be notified.");
  process.exit(0);
}

if (notifications.length > 100) {
  throw new Error(
    `Refusing to send ${notifications.length} messages in one run (limit: 100).`,
  );
}

if (dryRun) {
  console.log(
    `Dry run: ${notifications.length} message(s) would notify maintainers about ${changes.length} changed resource file(s).`,
  );
  process.exit(0);
}

const username = required("CATALOGUE_EMAIL_USERNAME");
const appPassword = required("CATALOGUE_EMAIL_APP_PASSWORD");
if (username.toLowerCase() !== "logic.education.resources@gmail.com") {
  throw new Error("CATALOGUE_EMAIL_USERNAME is not the approved catalogue sender.");
}

const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: username, pass: appPassword },
});
await transport.verify();

for (const notification of notifications) {
  await transport.sendMail({
    from: `"Logic Education Resources" <${username}>`,
    replyTo: username,
    to: notification.to,
    subject: notification.subject,
    text: notification.text,
    html: notification.html,
  });
}

console.log(
  `Sent ${notifications.length} maintainer notification(s) for ${changes.length} changed resource file(s).`,
);
