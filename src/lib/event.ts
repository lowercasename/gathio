import i18next from "i18next";
import { ICustomQuestion, IEvent } from "../models/Event.js";
import { IEventGroup } from "../models/EventGroup.js";

// A custom question as the templates want it: the event page's RSVP modal,
// the standalone answers form, and the event form's Alpine component all
// consume this shape. `isMultipleChoice` exists because Handlebars can't
// compare values in an `{{#if}}`.
export interface CustomQuestionView {
  id: string;
  prompt: string;
  type: ICustomQuestion["type"];
  isMultipleChoice: boolean;
  options: string[];
}

export const getCustomQuestionsForDisplay = (
  event: Pick<IEvent, "customQuestions">,
): CustomQuestionView[] =>
  (event.customQuestions || []).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    isMultipleChoice: question.type === "multipleChoice",
    options: question.options,
  }));

export interface EventListEvent {
  id: string;
  name: string;
  location: string;
  displayDate: string;
  eventHasConcluded: boolean;
  startMoment: moment.Moment;
  endMoment: moment.Moment;
  eventGroup?: IEventGroup;
  eventGroupId?: string;
}

interface EventBucket {
  title: string;
  events: EventListEvent[];
}

export const bucketEventsByMonth = (
  acc: EventBucket[],
  event: EventListEvent,
) => {
  event.startMoment.locale(i18next.language);
  const month = event.startMoment.format(i18next.t("common.year-month-format"));
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
