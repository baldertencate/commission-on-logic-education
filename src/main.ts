import "./styles.css";
import { containsAnyTerm, matchesSearch, normalize, queryTerms } from "./search.js";

type Access = {
  cost: "free" | "freemium" | "paid" | "unknown";
  mode: Array<"online" | "download" | "physical">;
  requiresSoftware: boolean | null;
  platforms?: string[];
  registration?: boolean | null;
};

type Resource = {
  id: string;
  title: string;
  url: string;
  description: string;
  features?: string[];
  types: string[];
  topics: string[];
  languages?: string[];
  audiences: string[];
  authors?: string[];
  access: Access;
  status: "active" | "inactive" | "unknown";
  notes?: string;
};

type Catalogue = {
  schemaVersion: number;
  resources: Resource[];
};

const repositoryUrl = "https://github.com/baldertencate/commission-on-logic-education";
const searchInput = getElement<HTMLInputElement>("resource-search");
const clearButton = getElement<HTMLButtonElement>("clear-search");
const emptyClearButton = getElement<HTMLButtonElement>("empty-clear");
const resourceList = getElement<HTMLDivElement>("resource-list");
const resultCount = getElement<HTMLParagraphElement>("result-count");
const emptyState = getElement<HTMLDivElement>("empty-state");
const errorTemplate = getElement<HTMLTemplateElement>("error-template");
const editDialog = getElement<HTMLDialogElement>("edit-dialog");
const editDialogTitle = getElement<HTMLHeadingElement>("edit-dialog-title");
const editContinue = getElement<HTMLAnchorElement>("edit-continue");
const editRemove = getElement<HTMLAnchorElement>("edit-remove");
const editClose = getElement<HTMLButtonElement>("edit-close");
const editCancel = getElement<HTMLButtonElement>("edit-cancel");
const suggestLink = getElement<HTMLAnchorElement>("suggest-resource");
const suggestDialog = getElement<HTMLDialogElement>("suggest-dialog");
const suggestClose = getElement<HTMLButtonElement>("suggest-close");
const suggestCancel = getElement<HTMLButtonElement>("suggest-cancel");

let resources: Resource[] = [];

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function appendHighlightedText(parent: HTMLElement, text: string, terms: string[]): void {
  if (!terms.length) {
    parent.append(text);
    return;
  }

  const escaped = [...terms]
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "giu");

  for (const part of text.split(pattern)) {
    if (!part) continue;
    if (terms.some((term) => normalize(term) === normalize(part))) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      parent.append(mark);
    } else {
      parent.append(part);
    }
  }
}

function label(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function languageLabel(value: string): string {
  const specialLabels: Record<string, string> = {
    mul: "Multilingual",
    und: "Undetermined language",
    zxx: "Language-independent",
  };
  if (specialLabels[value]) return specialLabels[value];

  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(value) ?? value;
  } catch {
    return value;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function buildChipList(resource: Resource, terms: string[]): HTMLDivElement {
  const container = element("div", "chips");
  for (const value of [...resource.types, ...resource.topics]) {
    const chip = element("span", "chip");
    appendHighlightedText(chip, label(value), terms);
    container.append(chip);
  }
  return container;
}

function buildMetadata(resource: Resource, terms: string[]): HTMLDListElement {
  const rows: Array<[string, string]> = [];
  if (resource.authors?.length) rows.push(["By", resource.authors.join("; ")]);
  if (resource.languages?.length) {
    rows.push(["Language", resource.languages.map(languageLabel).join(", ")]);
  }

  const access = [
    ...resource.access.mode.map(label),
    resource.access.cost !== "unknown" ? label(resource.access.cost) : "",
    resource.access.requiresSoftware === true ? "Software required" : "",
  ].filter(Boolean);
  if (access.length) rows.push(["Access", access.join(" · ")]);

  const list = element("dl", "metadata");
  for (const [name, value] of rows) {
    const term = element("dt");
    term.textContent = name;
    const description = element("dd");
    appendHighlightedText(description, value, terms);
    list.append(term, description);
  }
  return list;
}

function buildResourceCard(resource: Resource, terms: string[]): HTMLElement {
  const article = element("article", "resource-card");
  article.dataset.resourceId = resource.id;

  const header = element("header", "resource-card__header");
  const heading = element("h2");
  const titleLink = element("a", "resource-card__title");
  titleLink.href = resource.url;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  appendHighlightedText(titleLink, resource.title, terms);
  const external = element("span", "external-indicator");
  external.setAttribute("aria-hidden", "true");
  external.textContent = "↗";
  titleLink.append(" ", external);
  heading.append(titleLink);

  const editLink = element("a", "edit-link");
  editLink.href = `${repositoryUrl}/edit/main/resources/${encodeURIComponent(resource.id)}.yml`;
  editLink.target = "_blank";
  editLink.rel = "noopener noreferrer";
  editLink.textContent = "Edit this resource";
  editLink.setAttribute("aria-haspopup", "dialog");
  editLink.addEventListener("click", (event) => {
    event.preventDefault();
    editDialogTitle.textContent = `Edit “${resource.title}”`;
    editContinue.href = editLink.href;
    const removalTitle = `[Removal suggestion]: ${resource.title} (${resource.id})`;
    editRemove.href =
      `${repositoryUrl}/issues/new?template=remove-resource.yml&title=${encodeURIComponent(removalTitle)}`;
    editDialog.showModal();
  });
  header.append(heading, editLink);

  const description = element("p", "resource-card__description");
  appendHighlightedText(description, resource.description, terms);

  article.append(header, buildChipList(resource, terms), description);

  if (resource.features?.length) {
    const details = element("details", "features");
    const summary = element("summary");
    summary.textContent = `Features (${resource.features.length})`;
    const list = element("ul");
    for (const feature of resource.features) {
      const item = element("li");
      appendHighlightedText(item, feature, terms);
      list.append(item);
    }
    details.append(summary, list);
    details.open = terms.length > 0 && containsAnyTerm(resource.features, terms);
    article.append(details);
  }

  article.append(buildMetadata(resource, terms));
  return article;
}

function render(): void {
  const terms = queryTerms(searchInput.value);
  const filtered = resources.filter((resource) => matchesSearch(resource, terms));
  const fragment = document.createDocumentFragment();
  for (const resource of filtered) fragment.append(buildResourceCard(resource, terms));

  resourceList.replaceChildren(fragment);
  resourceList.hidden = filtered.length === 0;
  emptyState.hidden = filtered.length !== 0;
  clearButton.hidden = terms.length === 0;

  const noun = filtered.length === 1 ? "resource" : "resources";
  resultCount.textContent = terms.length
    ? `${filtered.length} ${noun} matching “${searchInput.value.trim()}”`
    : `${filtered.length} ${noun}`;
}

function clearSearch(): void {
  searchInput.value = "";
  render();
  searchInput.focus();
}

searchInput.addEventListener("input", render);
clearButton.addEventListener("click", clearSearch);
emptyClearButton.addEventListener("click", clearSearch);
editClose.addEventListener("click", () => editDialog.close());
editCancel.addEventListener("click", () => editDialog.close());
suggestClose.addEventListener("click", () => suggestDialog.close());
suggestCancel.addEventListener("click", () => suggestDialog.close());
suggestLink.addEventListener("click", (event) => {
  event.preventDefault();
  suggestDialog.showModal();
});

for (const dialog of [editDialog, suggestDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

async function loadCatalogue(): Promise<void> {
  try {
    const response = await fetch("../catalogue.json");
    if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`);
    const catalogue = await response.json() as Catalogue;
    resources = catalogue.resources.sort((left, right) => left.title.localeCompare(right.title));
    resourceList.setAttribute("aria-busy", "false");
    render();
  } catch (error) {
    console.error(error);
    resourceList.setAttribute("aria-busy", "false");
    resourceList.replaceChildren(errorTemplate.content.cloneNode(true));
    resultCount.textContent = "Catalogue unavailable";
  }
}

void loadCatalogue();
