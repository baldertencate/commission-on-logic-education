export type EventRecord = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  format: "online" | "physical" | "hybrid";
  location?: string;
  eventType:
    | "conference"
    | "course"
    | "panel-discussion"
    | "seminar"
    | "webinar"
    | "workshop"
    | "other";
  eventUrl?: string;
  recordingUrl?: string;
  images?: Array<{
    url: string;
    alt: string;
    caption?: string;
  }>;
};

export function sortEventsReverseChronologically(events: EventRecord[]): EventRecord[] {
  return [...events].sort(
    (left, right) =>
      right.startDate.localeCompare(left.startDate) ||
      right.endDate.localeCompare(left.endDate) ||
      left.id.localeCompare(right.id),
  );
}

export function splitEventsByDate(
  events: EventRecord[],
  today: string,
): { upcoming: EventRecord[]; past: EventRecord[] } {
  const sorted = sortEventsReverseChronologically(events);
  return {
    upcoming: sorted.filter((event) => event.endDate >= today),
    past: sorted.filter((event) => event.endDate < today),
  };
}
