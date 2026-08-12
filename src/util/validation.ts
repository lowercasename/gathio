import i18next from "i18next";
import moment from "moment-timezone";
import {
  ICustomQuestion,
  maxCustomQuestions,
  maxCustomQuestionOptions,
  maxCustomQuestionPromptLength,
} from "../models/Event.js";
import { generateEventID } from "./generator.js";

type Error = {
  message?: string;
  field?: string;
};

type EventValidationResponse = {
  data?: ValidatedEventData;
  errors?: Error[];
};

type EventGroupValidationResponse = {
  data?: ValidatedEventGroupData;
  errors?: Error[];
};

interface EventData {
  eventName: string;
  eventLocation: string;
  eventStart: string;
  eventEnd: string;
  timezone: string;
  eventDescription: string;
  eventURL: string;
  imagePath: string;
  hostName: string;
  creatorEmail: string;
  publicCheckbox: string;
  eventGroupCheckbox: string;
  eventGroupID: string;
  eventGroupEditToken: string;
  interactionCheckbox: string;
  joinCheckbox: string;
  maxAttendeesCheckbox: string;
  maxAttendees: number;
  approveRegistrationsCheckbox?: string; // optional checkbox value
  customQuestions?: string; // JSON-encoded array of questions
}

// EventData without the 'checkbox' fields
export type ValidatedEventData = Omit<
  EventData,
  | "publicCheckbox"
  | "eventGroupCheckbox"
  | "interactionCheckbox"
  | "joinCheckbox"
  | "maxAttendeesCheckbox"
  | "approveRegistrationsCheckbox"
  | "customQuestions"
> & {
  publicBoolean: boolean;
  eventGroupBoolean: boolean;
  interactionBoolean: boolean;
  joinBoolean: boolean;
  maxAttendeesBoolean: boolean;
  approveRegistrationsBoolean: boolean;
  customQuestions: ICustomQuestion[];
};

interface EventGroupData {
  eventGroupName: string;
  eventGroupDescription: string;
  eventGroupURL: string;
  hostName: string;
  creatorEmail: string;
  publicCheckbox: string;
}

export type ValidatedEventGroupData = Omit<EventGroupData, "publicCheckbox"> & {
  publicBoolean: boolean;
};

const validateEmail = (email: string) => {
  if (!email || email.length === 0 || typeof email !== "string") {
    return false;
  }
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// From https://stackoverflow.com/a/43467144
const validateUrl = (url: string) => {
  if (!url) {
    return false;
  }
  let validUrl;
  try {
    validUrl = new URL(url);
  } catch {
    return false;
  }
  return validUrl.protocol === "http:" || validUrl.protocol === "https:";
};

export const validateEventTime = (
  start: string,
  end: string,
  timezone: string,
): Error | boolean => {
  // Parse the datetime-local values in the event's timezone
  const startMoment = moment.tz(start, timezone);
  const endMoment = moment.tz(end, timezone);
  const now = moment();

  if (startMoment.isAfter(endMoment)) {
    return {
      message: i18next.t("util.validation.eventtime.startisafter"),
      field: "eventStart",
    };
  }
  if (endMoment.isBefore(now)) {
    return {
      message: i18next.t("util.validation.eventtime.endisbefore"),
      field: "eventEnd",
    };
  }
  // Duration cannot be longer than 1 year
  if (endMoment.diff(startMoment, "years") > 1) {
    return {
      message: i18next.t("util.validation.eventtime.endyears"),
      field: "eventEnd",
    };
  }
  return true;
};

// Matches IDs produced by generateEventID (21 chars of the nanoid alphabet)
const customQuestionIDPattern = /^[A-Za-z0-9_]{21}$/;

// Parses and validates the JSON-encoded custom questions field submitted by
// the event form. Returns the cleaned-up questions (with stable IDs assigned
// to any new ones) and any validation errors.
export const validateCustomQuestions = (
  rawQuestions: string | undefined,
): { questions: ICustomQuestion[]; errors: Error[] } => {
  const errors: Error[] = [];
  if (!rawQuestions) {
    return { questions: [], errors };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawQuestions);
  } catch {
    errors.push({
      message: i18next.t("util.validation.customquestions.invalid"),
      field: "customQuestions",
    });
    return { questions: [], errors };
  }
  if (!Array.isArray(parsed)) {
    errors.push({
      message: i18next.t("util.validation.customquestions.invalid"),
      field: "customQuestions",
    });
    return { questions: [], errors };
  }
  if (parsed.length > maxCustomQuestions) {
    errors.push({
      message: i18next.t("util.validation.customquestions.maxquestions", {
        max: maxCustomQuestions,
      }),
      field: "customQuestions",
    });
    return { questions: [], errors };
  }
  const questions: ICustomQuestion[] = [];
  const seenQuestionIDs = new Set<string>();
  for (const rawQuestion of parsed) {
    if (typeof rawQuestion !== "object" || rawQuestion === null) {
      errors.push({
        message: i18next.t("util.validation.customquestions.invalid"),
        field: "customQuestions",
      });
      continue;
    }
    const question = rawQuestion as Record<string, unknown>;
    const prompt =
      typeof question.prompt === "string" ? question.prompt.trim() : "";
    if (!prompt) {
      errors.push({
        message: i18next.t("util.validation.customquestions.prompt"),
        field: "customQuestions",
      });
      continue;
    }
    if (prompt.length > maxCustomQuestionPromptLength) {
      errors.push({
        message: i18next.t("util.validation.customquestions.promptlength", {
          max: maxCustomQuestionPromptLength,
        }),
        field: "customQuestions",
      });
      continue;
    }
    const type = question.type === "multipleChoice" ? "multipleChoice" : "text";
    let options: string[] = [];
    if (type === "multipleChoice") {
      options = (Array.isArray(question.options) ? question.options : [])
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim())
        .filter((option) => option !== "");
      if (options.length < 2) {
        errors.push({
          message: i18next.t("util.validation.customquestions.minoptions"),
          field: "customQuestions",
        });
        continue;
      }
      if (options.length > maxCustomQuestionOptions) {
        errors.push({
          message: i18next.t("util.validation.customquestions.maxoptions", {
            max: maxCustomQuestionOptions,
          }),
          field: "customQuestions",
        });
        continue;
      }
      if (
        options.some((option) => option.length > maxCustomQuestionPromptLength)
      ) {
        errors.push({
          message: i18next.t("util.validation.customquestions.optionlength", {
            max: maxCustomQuestionPromptLength,
          }),
          field: "customQuestions",
        });
        continue;
      }
    }
    // Keep the existing ID on edit so attendee answers stay linked - but only
    // accept well-formed, unique IDs from the client (a duplicate ID would
    // make two questions alias each other's answers, and IDs are used in form
    // field names, so arbitrary strings could corrupt request parsing)
    let id = typeof question.id === "string" ? question.id.trim() : "";
    if (!customQuestionIDPattern.test(id) || seenQuestionIDs.has(id)) {
      id = generateEventID();
    }
    seenQuestionIDs.add(id);
    questions.push({
      id,
      prompt,
      type,
      options,
    });
  }
  return { questions, errors };
};

export const validateEventData = (
  eventData: EventData,
): EventValidationResponse => {
  const customQuestionValidation = validateCustomQuestions(
    eventData.customQuestions,
  );
  const validatedData: ValidatedEventData = {
    ...eventData,
    publicBoolean: eventData.publicCheckbox === "true",
    eventGroupBoolean: eventData.eventGroupCheckbox === "true",
    interactionBoolean: eventData.interactionCheckbox === "true",
    joinBoolean: eventData.joinCheckbox === "true",
    maxAttendeesBoolean: eventData.maxAttendeesCheckbox === "true",
    approveRegistrationsBoolean:
      eventData.approveRegistrationsCheckbox === "true",
    customQuestions: customQuestionValidation.questions,
  };
  const errors: Error[] = [...customQuestionValidation.errors];
  if (!validatedData.eventName) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventname"),
      field: "eventName",
    });
  }
  if (!validatedData.eventLocation) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventlocation"),
      field: "eventLocation",
    });
  }
  if (!validatedData.eventStart) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventstart"),
      field: "eventStart",
    });
  }
  if (!validatedData.eventEnd) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventend"),
      field: "eventEnd",
    });
  }
  const timeValidation = validateEventTime(
    validatedData.eventStart,
    validatedData.eventEnd,
    validatedData.timezone,
  );
  if (timeValidation !== true && timeValidation !== false) {
    errors.push({
      message: timeValidation.message,
    });
  }
  if (!validatedData.timezone) {
    errors.push({
      message: i18next.t("util.validation.eventdata.timezone"),
      field: "timezone",
    });
  }
  if (!validatedData.eventDescription) {
    errors.push({
      message: i18next.t("util.validation.eventdata.eventdescription"),
      field: "eventDescription",
    });
  }
  if (validatedData.eventGroupBoolean) {
    if (!validatedData.eventGroupID) {
      errors.push({
        message: i18next.t("util.validation.eventdata.eventgroupboolean"),
        field: "eventGroupID",
      });
    }
    if (!validatedData.eventGroupEditToken) {
      errors.push({
        message: i18next.t("util.validation.eventdata.eventgroupedittoken"),
        field: "eventGroupEditToken",
      });
    }
  }
  if (validatedData.maxAttendeesBoolean) {
    if (!validatedData.maxAttendees) {
      errors.push({
        message: i18next.t("util.validation.eventdata.maxattendeesboolean"),
        field: "maxAttendees",
      });
    }
    if (isNaN(validatedData.maxAttendees)) {
      errors.push({
        message: i18next.t("util.validation.eventdata.maxattendees"),
        field: "maxAttendees",
      });
    }
  }
  if (validatedData.creatorEmail) {
    if (!validateEmail(validatedData.creatorEmail)) {
      errors.push({
        message: i18next.t("util.validation.eventdata.creatoremail"),
        field: "creatorEmail",
      });
    }
  }
  if (validatedData.eventURL) {
    if (!validateUrl(validatedData.eventURL)) {
      errors.push({
        message: i18next.t("util.validation.eventdata.eventurl"),
        field: "eventURL",
      });
    }
  }

  return {
    data: validatedData,
    errors: errors,
  };
};

export const validateGroupData = (
  groupData: EventGroupData,
): EventGroupValidationResponse => {
  const errors: Error[] = [];
  if (!groupData.eventGroupName) {
    errors.push({
      message: i18next.t("util.validation.groupdata.eventgroupname"),
      field: "eventGroupName",
    });
  }
  if (!groupData.eventGroupDescription) {
    errors.push({
      message: i18next.t("util.validation.groupdata.eventgroupdescription"),
      field: "eventGroupDescription",
    });
  }
  if (groupData.creatorEmail) {
    if (!validateEmail(groupData.creatorEmail)) {
      errors.push({
        message: i18next.t("util.validation.groupdata.creatoremail"),
        field: "creatorEmail",
      });
    }
  }
  if (groupData.eventGroupURL) {
    if (!validateUrl(groupData.eventGroupURL)) {
      errors.push({
        message: i18next.t("util.validation.groupdata.eventgroupurl"),
        field: "eventGroupURL",
      });
    }
  }

  const validatedData: ValidatedEventGroupData = {
    ...groupData,
    publicBoolean: groupData.publicCheckbox === "true",
  };

  return {
    data: validatedData,
    errors: errors,
  };
};
