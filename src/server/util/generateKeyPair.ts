export default async () => {
  const { generateKeyPair } = require("crypto");

  return new Promise((resolve, reject) => {
    generateKeyPair(
      "rsa",
      {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: "spki",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs8",
          format: "pem",
          cipher: "aes-256-cbc",
          passphrase: "",
        },
      },
      (err: Error, publicKey: string, privateKey: string) => {
        if (err) return reject(err);
        resolve({ publicKey, privateKey });
      }
    );
  });
};
