import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, beforeEach, mock, test } from "node:test";
import { Request, RequestHandler, Response } from "express";
import { create } from "express-handlebars";
import i18next from "i18next";
import { getI18nHelpers } from "./helpers.js";
import { getConfig } from "./lib/config.js";
import { EmailService } from "./lib/email.js";
import EventGroup from "./models/EventGroup.js";
import Log from "./models/Log.js";

// Import the real router without writing startup logs to a database or leaving
// its nightly maintenance job running in the test process.
mock.method(Log.prototype, "save", async () => undefined);
const require = createRequire(import.meta.url);
mock.method(require("node-schedule"), "scheduleJob", () => null);
const { default: router } = await import("./routes.js");
after(() => mock.restoreAll());

const route = router.stack.find(
  (layer: { route?: { path: string } }) =>
    layer.route?.path === "/subscribe/:eventGroupID",
);
const subscribe: RequestHandler = route.route.stack[0].handle;

await i18next.init({
  lng: "en",
  resources: {
    en: {
      translation: JSON.parse(readFileSync("locales/en.json", "utf8")),
    },
  },
});

function makeEmailService() {
  const config = getConfig();
  return new EmailService(
    { ...config, general: { ...config.general, mail_service: "none" } },
    create({
      layoutsDir: "views/layouts/",
      partialsDir: ["views/partials/"],
      helpers: { ...getI18nHelpers() },
    }),
  );
}

let group: {
  id: string;
  name: string;
  subscribers: { email: string }[];
  save: () => Promise<void>;
};

beforeEach(() => {
  group = {
    id: "test-group",
    name: "Test group",
    subscribers: [],
    save: async () => undefined,
  };
  mock.method(EventGroup, "findOne", async () => group);
  mock.method(console, "error", () => undefined);
});

async function submit(emailService: EmailService) {
  const responses: { status: number; location?: string }[] = [];
  let status = 200;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    end() {
      assert.equal(responses.length, 0, "Response must only be sent once");
      responses.push({ status });
      return this;
    },
    sendStatus(code: number) {
      return this.status(code).end();
    },
    redirect(location: string) {
      assert.equal(responses.length, 0, "Response must only be sent once");
      responses.push({ status: 302, location });
      return this;
    },
  };
  await subscribe(
    {
      body: { emailAddress: "subscriber@example.invalid" },
      params: { eventGroupID: group.id },
      emailService,
    } as unknown as Request,
    response as unknown as Response,
    () => assert.fail("Unexpected next()"),
  );
  return responses;
}

test("subscription renders its confirmation email and redirects", async () => {
  const emailService = makeEmailService();
  let saved = false;
  group.save = async () => {
    await Promise.resolve();
    saved = true;
  };
  const send = mock.method(
    emailService,
    "sendEmail",
    async (message: Parameters<EmailService["sendEmail"]>[0]) => {
      assert.ok(saved, "Subscription must be saved before sending email");
      assert.match(message.text, /Test group/);
      assert.match(message.html ?? "", /Test group/);
      assert.ok(
        message.text.includes(
          "/unsubscribe/test-group?email=subscriber%40example.invalid",
        ),
      );
      return true;
    },
  );

  assert.deepEqual(await submit(emailService), [
    { status: 302, location: "/group/test-group" },
  ]);
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(group.subscribers, [
    { email: "subscriber@example.invalid" },
  ]);
});

test("an email rendering failure sends only one error response", async () => {
  const emailService = makeEmailService();
  mock.method(emailService.hbs, "renderView", async () => {
    throw new Error("Template rendering failed");
  });
  const send = mock.method(emailService, "sendEmail", async () => true);

  assert.deepEqual(await submit(emailService), [{ status: 500 }]);
  assert.equal(send.mock.callCount(), 0);
});

test("a database failure returns an error without sending confirmation", async () => {
  const emailService = makeEmailService();
  group.save = async () => {
    throw new Error("Database unavailable");
  };
  const send = mock.method(
    emailService,
    "sendEmailFromTemplate",
    async () => true,
  );

  assert.deepEqual(await submit(emailService), [{ status: 500 }]);
  assert.equal(send.mock.callCount(), 0);
});
