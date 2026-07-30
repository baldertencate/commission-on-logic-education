function safeLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:|\.{0,2}\/)/i.test(trimmed)) return trimmed;
  return null;
}

function appendInlineMarkdown(parent: HTMLElement, source: string): void {
  const token = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;

  for (const match of source.matchAll(token)) {
    const index = match.index ?? 0;
    parent.append(document.createTextNode(source.slice(cursor, index)));
    const value = match[0];

    if (value.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = value.slice(2, -2);
      parent.append(strong);
    } else if (value.startsWith("*")) {
      const emphasis = document.createElement("em");
      emphasis.textContent = value.slice(1, -1);
      parent.append(emphasis);
    } else {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      const href = parts ? safeLinkUrl(parts[2]) : null;
      if (parts && href) {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = parts[1];
        if (/^https?:\/\//i.test(href)) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        parent.append(link);
      } else {
        parent.append(document.createTextNode(value));
      }
    }
    cursor = index + value.length;
  }

  parent.append(document.createTextNode(source.slice(cursor)));
}

export function renderMarkdown(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: HTMLUListElement | HTMLOListElement | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const node = document.createElement("p");
    appendInlineMarkdown(node, paragraph.join(" ").trim());
    fragment.append(node);
    paragraph = [];
  };

  const flushList = (): void => {
    if (!list) return;
    fragment.append(list);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{2,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(6, heading[1].length + 2);
      const node = document.createElement(`h${level}`) as HTMLHeadingElement;
      appendInlineMarkdown(node, heading[2]);
      fragment.append(node);
      continue;
    }

    const listItem = /^([-*]|\d+\.)\s+(.+)$/.exec(trimmed);
    if (listItem) {
      flushParagraph();
      const ordered = /\d+\./.test(listItem[1]);
      if (!list || (ordered && list.tagName !== "OL") || (!ordered && list.tagName !== "UL")) {
        flushList();
        list = document.createElement(ordered ? "ol" : "ul");
      }
      const item = document.createElement("li");
      appendInlineMarkdown(item, listItem[2]);
      list.append(item);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return fragment;
}
