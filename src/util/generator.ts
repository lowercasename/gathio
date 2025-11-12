import crypto from "crypto";
import { customAlphabet } from "nanoid";

// This alphabet (used to generate all event, group, etc. IDs) is missing '-'
// because ActivityPub doesn't like it in IDs
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
  21,
);

const generateAlphanumericString = (length: number) => {
  return Array(length)
    .fill(0)
    .map(() => Math.random().toString(36).charAt(2))
    .join("");
};

export const generateEventID = () => nanoid();

export const generateEditToken = () => generateAlphanumericString(32);

export const generateMagicLinkToken = () => generateAlphanumericString(32);

export const generateRSAKeypair = () => {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });
};

export const hashString = (input: string) =>
  crypto.createHash("sha256").update(input).digest("hex");
