// src/lib/event.ts

import moment from "moment-timezone";
import i18next from "i18next";
import type { EventGroup } from "@prisma/client";

export interface EventListEvent {
    id: string;
    name: string;
    location: string;
    displayDate: string;
    eventHasConcluded: boolean;
    startMoment: moment.Moment;
    endMoment: moment.Moment;
    eventGroup?: EventGroup;
}

interface MonthBucket {
    title: string;
    events: EventListEvent[];
}

/**
 * Groups a flat list of EventListEvent into month-based buckets.
 * Each bucket has a `title` (e.g. "2025-05") and an array of events.
 */
export const bucketEventsByMonth = (
    acc: MonthBucket[],
    event: EventListEvent,
): MonthBucket[] => {
    // ensure the moment is localized
    event.startMoment.locale(i18next.language);

    // format like "2025-05"
    const month = event.startMoment.format(
        i18next.t("common.year-month-format"),
    );

    let bucket = acc.find((b) => b.title === month);
    if (!bucket) {
        bucket = { title: month, events: [] };
        acc.push(bucket);
    }

    bucket.events.push(event);
    return acc;
};
