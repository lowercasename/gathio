import { randomInt } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// based on https://github.com/diracdeltas/niceware/issues/61

const __dirname = dirname(fileURLToPath(import.meta.url));
const result = readFileSync(
    join(__dirname, "../../eff_large_wordlist.txt"),
    "utf8",
);
const wordList = Object.freeze(
    result.split("\n").map((line) => Object.freeze(line.split("\t")[1])),
);

/**
 * Generates a random 'diceware' password, which is a memorable password
 * consisting of several words.
 */
export function generatePassphrase(wordCount: number = 6): string {
    const words = [];
    for (let i = 0; i < wordCount; i++) {
        words.push(wordList[randomInt(0, wordList.length)]);
    }
    return words.join("-");
}
