import assert from "node:assert/strict";
import { test } from "node:test";
import moment from "moment-timezone";
import { validateEventData, validateEventTime } from "./validation.js";

const format = "YYYY-MM-DDTHH:mm";
const timezone = "Etc/UTC";
const hoursFromNow = (hours: number) =>
  moment.tz(timezone).add(hours, "hours").format(format);

const eventData = (overrides: object = {}) => ({
  eventName: "Event",
  eventLocation: "Somewhere",
  eventStart: hoursFromNow(1),
  eventEnd: hoursFromNow(2),
  timezone,
  eventDescription: "Description",
  eventURL: "",
  imagePath: "",
  hostName: "",
  creatorEmail: "",
  publicCheckbox: "false",
  eventGroupCheckbox: "false",
  eventGroupID: "",
  eventGroupEditToken: "",
  interactionCheckbox: "true",
  joinCheckbox: "false",
  maxAttendeesCheckbox: "false",
  maxAttendees: 0,
  ...overrides,
});

test("an event cannot be given an end time in the past", () => {
  const result = validateEventTime(
    hoursFromNow(-2),
    hoursFromNow(-1),
    timezone,
  );
  assert.equal(typeof result, "object");
  assert.equal((result as { field?: string }).field, "eventEnd");
});

test("an end time in the past is accepted when explicitly allowed", () => {
  assert.equal(
    validateEventTime(hoursFromNow(-2), hoursFromNow(-1), timezone, {
      allowPastEnd: true,
    }),
    true,
  );
});

test("allowing a past end time does not relax the other time checks", () => {
  const result = validateEventTime(
    hoursFromNow(-1),
    hoursFromNow(-2),
    timezone,
    {
      allowPastEnd: true,
    },
  );
  assert.equal((result as { field?: string }).field, "eventStart");
});

test("an ended event fails validation on creation but passes on edit", () => {
  const ended = eventData({
    eventStart: hoursFromNow(-2),
    eventEnd: hoursFromNow(-1),
  });
  assert.equal(validateEventData(ended).errors?.length, 1);
  assert.deepEqual(
    validateEventData(ended, { allowPastEnd: true }).errors ?? [],
    [],
  );
});

test("the comments-after-end checkbox is parsed into a boolean", () => {
  assert.equal(
    validateEventData(eventData({ commentsAfterEndCheckbox: "true" })).data
      ?.commentsAfterEndBoolean,
    true,
  );
  assert.equal(
    validateEventData(eventData({ commentsAfterEndCheckbox: "false" })).data
      ?.commentsAfterEndBoolean,
    false,
  );
  // Older clients don't send the field at all
  assert.equal(
    validateEventData(eventData()).data?.commentsAfterEndBoolean,
    false,
  );
});
