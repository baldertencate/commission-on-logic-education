export type SearchableResource = {
  title: string;
  description: string;
  features?: string[];
  types: string[];
  topics: string[];
  languages?: string[];
  audiences: string[];
  authors?: string[];
  notes?: string;
};

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

export function queryTerms(value: string): string[] {
  return [...new Set(value.trim().split(/\s+/).filter(Boolean))];
}

export function containsAnyTerm(values: string[], terms: string[]): boolean {
  const normalizedTerms = terms.map(normalize);
  return values.some((value) => {
    const normalizedValue = normalize(value);
    return normalizedTerms.some((term) => normalizedValue.includes(term));
  });
}

export function matchesSearch(resource: SearchableResource, terms: string[]): boolean {
  const text = normalize([
    resource.title,
    resource.description,
    ...(resource.features ?? []),
    ...resource.types,
    ...resource.topics,
    ...(resource.languages ?? []),
    ...resource.audiences,
    ...(resource.authors ?? []),
    resource.notes ?? "",
  ].join(" "));
  return terms.every((term) => text.includes(normalize(term)));
}
