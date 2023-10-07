import crypto from "crypto";

const generateAlphanumericString = (length: number) => {
    return Array(length)
        .fill(0)
        .map((x) => Math.random().toString(36).charAt(2))
        .join("");
};

export const generateEditToken = () => generateAlphanumericString(32);

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
