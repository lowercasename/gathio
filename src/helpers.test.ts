import assert from "node:assert/strict";
import { describe, it } from "node:test";
import handlebars from "handlebars";
import i18next from "i18next";
import { getI18nHelpers } from "./helpers.js";

describe("getI18nHelpers", () => {
  it("passes Handlebars hash arguments to i18next interpolation", async () => {
    await i18next.init({
      lng: "en",
      resources: {
        en: {
          translation: {
            plusOnes: "Up to {{count}}",
          },
        },
      },
    });

    const helpers = getI18nHelpers();
    handlebars.registerHelper("t", helpers.t);

    assert.equal(handlebars.compile('{{t "plusOnes" count=3}}')({}), "Up to 3");
  });
});
