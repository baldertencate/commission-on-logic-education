import "./styles.css";
import { splitEventsByDate, type EventRecord } from "./event-utils.js";
import { renderMarkdown } from "./markdown.js";

type EventsCollection = {
  schemaVersion: number;
  events: EventRecord[];
};

const repositoryUrl = "https://github.com/baldertencate/commission-on-logic-education";
const upcomingList = getElement<HTMLDivElement>("upcoming-events");
const pastList = getElement<HTMLDivElement>("past-events");
const upcomingCount = getElement<HTMLParagraphElement>("upcoming-count");
const pastCount = getElement<HTMLParagraphElement>("past-count");
const upcomingEmpty = getElement<HTMLParagraphElement>("upcoming-empty");
const errorTemplate = getElement<HTMLTemplateElement>("event-error-template");
const addEvent = getElement<HTMLAnchorElement>("add-event");
const eventSuggestDialog = getElement<HTMLDialogElement>("event-suggest-dialog");
const eventSuggestClose = getElement<HTMLButtonElement>("event-suggest-close");
const eventSuggestCancel = getElement<HTMLButtonElement>("event-suggest-cancel");

function getElement<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element #${id}`);
  return value as T;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function label(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function todayLocal(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateRange(event: EventRecord): string {
  if (event.startDate === event.endDate) return formatDate(event.startDate);
  return `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
}

function eventCard(event: EventRecord): HTMLElement {
  const article = element("article", "event-card");
  article.dataset.eventId = event.id;

  const header = element("header", "event-card__header");
  const headingGroup = element("div");
  const date = element("p", "event-card__date");
  date.textContent = formatDateRange(event);
  const heading = element("h3");
  const title = event.eventUrl
    ? element("a", "event-card__title")
    : element("span", "event-card__title");
  title.textContent = event.title;
  if (title instanceof HTMLAnchorElement) {
    title.href = event.eventUrl!;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    const external = element("span", "external-indicator");
    external.setAttribute("aria-hidden", "true");
    external.textContent = "↗";
    title.append(" ", external);
  }
  heading.append(title);
  headingGroup.append(date, heading);

  const edit = element("a", "edit-link");
  edit.href = `${repositoryUrl}/edit/main/events/${encodeURIComponent(event.id)}.yml`;
  edit.target = "_blank";
  edit.rel = "noopener noreferrer";
  edit.textContent = "Edit this event";
  header.append(headingGroup, edit);

  const facts = element("div", "event-card__facts");
  for (const value of [label(event.eventType), label(event.format)]) {
    const chip = element("span", "chip");
    chip.textContent = value;
    facts.append(chip);
  }
  if (event.location) {
    const location = element("span", "event-card__location");
    location.textContent = event.location;
    facts.append(location);
  }

  const description = element("details", "event-description");
  const summary = element("summary");
  summary.textContent = "Description";
  const content = element("div", "event-description__content");
  content.append(renderMarkdown(event.description));
  description.append(summary, content);

  for (const image of event.images ?? []) {
    const figure = element("figure", "event-image");
    const img = element("img");
    img.src = image.url;
    img.alt = image.alt;
    img.loading = "lazy";
    figure.append(img);
    if (image.caption) {
      const caption = element("figcaption");
      caption.textContent = image.caption;
      figure.append(caption);
    }
    content.append(figure);
  }

  if (event.recordingUrl) {
    const recording = element("a", "event-recording");
    recording.href = event.recordingUrl;
    recording.target = "_blank";
    recording.rel = "noopener noreferrer";
    recording.textContent = "Watch the recording ↗";
    content.append(recording);
  }

  article.append(header, facts, description);
  return article;
}

function renderList(container: HTMLElement, events: EventRecord[]): void {
  const fragment = document.createDocumentFragment();
  for (const event of events) fragment.append(eventCard(event));
  container.replaceChildren(fragment);
  container.setAttribute("aria-busy", "false");
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

addEvent.addEventListener("click", (event) => {
  event.preventDefault();
  eventSuggestDialog.showModal();
});
eventSuggestClose.addEventListener("click", () => eventSuggestDialog.close());
eventSuggestCancel.addEventListener("click", () => eventSuggestDialog.close());
eventSuggestDialog.addEventListener("click", (event) => {
  if (event.target === eventSuggestDialog) eventSuggestDialog.close();
});

async function loadEvents(): Promise<void> {
  try {
    const response = await fetch("../events.json");
    if (!response.ok) throw new Error(`Events request failed: ${response.status}`);
    const collection = (await response.json()) as EventsCollection;
    const { upcoming, past } = splitEventsByDate(collection.events, todayLocal());
    renderList(upcomingList, upcoming);
    renderList(pastList, past);
    upcomingCount.textContent = countLabel(upcoming.length);
    pastCount.textContent = countLabel(past.length);
    upcomingEmpty.hidden = upcoming.length !== 0;
  } catch (error) {
    console.error(error);
    upcomingList.setAttribute("aria-busy", "false");
    pastList.setAttribute("aria-busy", "false");
    upcomingList.replaceChildren(errorTemplate.content.cloneNode(true));
    upcomingCount.textContent = "Unavailable";
    pastCount.textContent = "Unavailable";
  }
}

void loadEvents();
