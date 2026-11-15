import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { runInContext } from "node:vm";
import express, { type ErrorRequestHandler } from "express";
import i18next from "i18next";
import { LanguageDetector, handle } from "i18next-http-middleware";
import Handlebars from "handlebars";
import { JSDOM } from "jsdom";

describe("event image uploads", () => {
  let server: Server;
  let origin: string;
  let configDirectory: string;
  const originalDirectory = process.cwd();
  const formatMessage =
    "Unsupported image format. Please choose a JPEG, PNG or GIF image.";

  before(async () => {
    // Load the router with an isolated configuration. These requests stop
    // before database, email or federation operations.
    configDirectory = await mkdtemp(path.join(tmpdir(), "gathio-upload-"));
    await mkdir(path.join(configDirectory, "config"));
    await writeFile(
      path.join(configDirectory, "config/config.toml"),
      '[general]\nmail_service = "none"\nis_federated = false\n',
    );
    process.chdir(configDirectory);
    const { default: eventRouter } = await import("./event.js").finally(() => {
      process.chdir(originalDirectory);
    });
    const translations = await Promise.all(
      ["en", "de"].map(async (language) => [
        language,
        {
          translation: JSON.parse(
            await readFile(
              new URL(`../../locales/${language}.json`, import.meta.url),
              "utf8",
            ),
          ),
        },
      ]),
    );
    await i18next.use(LanguageDetector).init({
      resources: Object.fromEntries(translations),
      fallbackLng: "en",
      supportedLngs: ["en", "de"],
      detection: { order: ["header"] },
    });
    const app = express();
    app.use(handle(i18next));
    app.use(eventRouter);
    const unexpectedError: ErrorRequestHandler = (error, _req, res, _next) => {
      res.status(500).json({ unexpectedError: error.message });
    };
    app.use(unexpectedError);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (configDirectory) {
      await rm(configDirectory, { recursive: true, force: true });
    }
  });

  for (const [method, url] of [
    ["POST", "/event"],
    ["PUT", "/event/test-event"],
  ]) {
    for (const mimeType of ["image/webp", "image/svg+xml", "text/plain"]) {
      it(`${method} reports unsupported ${mimeType} uploads`, async () => {
        const form = new FormData();
        form.append(
          "imageUpload",
          new Blob(["image"], { type: mimeType }),
          "cover",
        );
        const response = await fetch(origin + url, { method, body: form });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          errors: [{ field: "event-image-upload", message: formatMessage }],
        });
      });
    }

    for (const mimeType of ["image/jpeg", "image/png", "image/gif"]) {
      it(`${method} still passes ${mimeType} uploads to event validation`, async () => {
        const form = new FormData();
        form.append(
          "imageUpload",
          new Blob(["image"], { type: mimeType }),
          "cover",
        );
        const response = await fetch(origin + url, { method, body: form });
        assert.equal(response.status, 400);
        const { errors } = (await response.json()) as {
          errors: { field: string; message: string }[];
        };
        assert.ok(errors.some((error) => error.field === "eventName"));
        assert.ok(
          errors.every((error) => error.field !== "event-image-upload"),
        );
      });
    }

    it(`${method} localizes the image format error`, async () => {
      const form = new FormData();
      form.append(
        "imageUpload",
        new Blob(["image"], { type: "image/webp" }),
        "cover.webp",
      );
      const response = await fetch(origin + url, {
        method,
        body: form,
        headers: { "accept-language": "de" },
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        errors: [
          {
            field: "event-image-upload",
            message:
              "Nicht unterstütztes Bildformat. Bitte wähle ein JPEG-, PNG- oder GIF-Bild.",
          },
        ],
      });
    });

    it(`${method} does not disguise other multipart failures as format errors`, async () => {
      const response = await fetch(origin + url, {
        method,
        headers: { "content-type": "multipart/form-data" },
        body: "missing boundary",
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        unexpectedError: "Multipart: Boundary not found",
      });
    });
  }

  for (const [script, component] of [
    ["new.js", "newEventForm"],
    ["event-edit.js", "editEventForm"],
  ]) {
    it(`${component} reports the format error and highlights the upload field`, async () => {
      const template = Handlebars.compile(
        await readFile(
          new URL("../../views/partials/eventForm.handlebars", import.meta.url),
          "utf8",
        ),
      );
      const html = template(
        {},
        {
          helpers: { t: (key: string) => i18next.t(key, { lng: "en" }) },
        },
      );
      const dom = new JSDOM(html, { url: origin, runScripts: "outside-only" });
      try {
        dom.window.FormData = FormData;
        dom.window.fetch = (url, options) =>
          fetch(new URL(String(url), origin), options);
        dom.window.eventData = { id: "test-event", editToken: "test-token" };
        // Readiness callbacks initialize unrelated preview/timezone widgets.
        // Run the real submission methods with jQuery's actual DOM operations.
        dom.window.eval(
          await readFile(
            new URL("../../public/js/jquery-3.4.1.min.js", import.meta.url),
            "utf8",
          ),
        );
        dom.window.$.fn.ready = () => {};
        for (const filename of ["util.js", `modules/${script}`]) {
          runInContext(
            await readFile(
              new URL(`../../public/js/${filename}`, import.meta.url),
              "utf8",
            ),
            dom.getInternalVMContext(),
          );
        }
        const form = dom.window[component]();
        const input = dom.window.document.querySelector("#event-image-upload");
        assert.ok(input);
        Object.defineProperty(input, "files", {
          value: [new File(["image"], "cover.webp", { type: "image/webp" })],
        });
        form.$refs = { eventImageUpload: input, magicLinkToken: { value: "" } };
        await form.submitForm();
        assert.equal(form.submitting, false);
        assert.equal(form.errors.length, 1);
        assert.equal(form.errors[0].message, formatMessage);
        assert.ok(input.classList.contains("is-invalid"));
        assert.ok(
          dom.window.document.body.textContent?.includes(
            "Supported formats: JPEG, PNG and GIF.",
          ),
        );
      } finally {
        dom.window.close();
      }
    });
  }
});
