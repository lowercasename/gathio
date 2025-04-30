import { IEventGroup } from "../models/EventGroup.js";

export interface EventListEvent {
    id: string;
    name: string;
    location: string;
    displayDate: string;
    eventHasConcluded: boolean;
    startMoment: moment.Moment;
    endMoment: moment.Moment;
    eventGroup?: IEventGroup;
}

interface EventBucket {
    title: string;
    events: EventListEvent[];
}

export const bucketEventsByMonth = (
    acc: EventBucket[],
    event: EventListEvent,
) => {
    const month = event.startMoment.format("MMMM YYYY");
    const matchingBucket = acc.find((bucket) => bucket.title === month);
    if (!matchingBucket) {
        acc.push({
            title: month,
            events: [event],
        });
    } else {
        matchingBucket.events.push(event);
    }
    return acc;
};
