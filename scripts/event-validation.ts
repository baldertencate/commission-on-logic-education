export type EventIdentity = {
  title: string;
  startDate: string;
  endDate: string;
};

export function eventDatesAreOrdered(event: EventIdentity): boolean {
  return event.endDate >= event.startDate;
}

export function eventDuplicateKey(event: EventIdentity): string {
  return [
    event.title.trim().toLocaleLowerCase(),
    event.startDate,
    event.endDate,
  ].join("|");
}
