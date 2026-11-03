import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import handlebars from "handlebars";

function findTemplates(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTemplates(filename);
    return /\.(handlebars|hbs)$/.test(filename) ? [filename] : [];
  });
}

for (const filename of findTemplates("views")) {
  test(`${filename} has valid Handlebars syntax`, () => {
    // compile() is lazy; precompile() parses the entire template immediately.
    assert.doesNotThrow(() =>
      handlebars.precompile(readFileSync(filename, "utf8")),
    );
  });
}
