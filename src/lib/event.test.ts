import assert from "node:assert/strict";
import { test } from "node:test";
import { commentsAllowedAfterEnd, eventAcceptsComments } from "./event.js";

const now = new Date("2030-06-01T12:00:00Z");
const past = new Date("2030-06-01T11:00:00Z");
const future = new Date("2030-06-01T13:00:00Z");

test("comments are never accepted when the event has comments switched off", () => {
  assert.equal(
    eventAcceptsComments(
      { usersCanComment: false, usersCanCommentAfterEnd: true, end: future },
      now,
    ),
    false,
  );
});

test("comments are accepted until the event ends", () => {
  assert.equal(
    eventAcceptsComments(
      { usersCanComment: true, usersCanCommentAfterEnd: false, end: future },
      now,
    ),
    true,
  );
});

test("comments close when the event ends unless the host keeps them open", () => {
  const event = { usersCanComment: true, end: past };
  assert.equal(
    eventAcceptsComments({ ...event, usersCanCommentAfterEnd: false }, now),
    false,
  );
  assert.equal(
    eventAcceptsComments({ ...event, usersCanCommentAfterEnd: true }, now),
    true,
  );
});

test("events from before the per-event setting keep comments open after they end", () => {
  assert.equal(commentsAllowedAfterEnd({}), true);
  assert.equal(
    eventAcceptsComments({ usersCanComment: true, end: past }, now),
    true,
  );
});
