import { Router, Request, Response } from "express";
import { frontendConfig } from "../lib/config.js";
import Passkey from "../models/Passkey.js";
import PasskeyChallenge from "../models/PasskeyChallenge.js";
import { getConfigMiddleware } from "../lib/middleware.js";
import i18next from "i18next";
import { randomBytes } from "crypto";
import User from "../models/User.js";
import { verify } from "simple-webauthn";

const router = Router();

router.use(getConfigMiddleware);

// /passkey/challenge endpoint
router.post("/passkey/challenge", async (req: Request, res: Response) => {
  const { email } = req.body;

  // Find or create user
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({
      email,
      id: crypto.randomUUID(),
    });
    await user.save();
  }

  const challenge = randomBytes(32).toString("base64url");

  // Store challenge in database
  const passkeyChallenge = new PasskeyChallenge({
    user: user.id,
    challenge,
    expiryTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });
  await passkeyChallenge.save();

  res.json({ challenge });
});

// /passkey/register endpoint
router.post("/passkey/register", async (req: Request, res: Response) => {
  const { email, response } = req.body;

  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  // Find or create passkey
  let passkey = await Passkey.findOne({ user: user.id });
  if (!passkey) {
    passkey = new Passkey({
      user: user.id,
      // In a real implementation, you would store the actual public key here
      publicKey: "public-key-base64",
      credentialId: "credential-id-base64",
      counter: 0,
    });
  }

  // Find challenge
  const challenge = await PasskeyChallenge.findOne({ user: user.id });
  if (!challenge || challenge.expiryTime < new Date()) {
    return res.status(400).json({ error: "Invalid or expired challenge" });
  }

  // Verify the registration response
  const verification = await verify({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: "https://your-origin.com",
    expectedRPID: "your-rp-id",
  });

  if (!verification) {
    return res.status(400).json({ error: "Invalid registration response" });
  }

  // Update the passkey
  passkey.publicKey = verification.publicKey;
  passkey.credentialId = verification.credentialID;
  passkey.counter = verification.counter;
  await passkey.save();

  res.json({ success: true, passkeyId: passkey._id });
});

// /passkey/login endpoint
router.post("/passkey/login", async (req: Request, res: Response) => {
  const { email, response } = req.body;

  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  // Find passkey
  const passkey = await Passkey.findOne({ user: user.id });
  if (!passkey) {
    return res.status(400).json({ error: "Passkey not found" });
  }

  // Find challenge
  const challenge = await PasskeyChallenge.findOne({ user: user.id });
  if (!challenge || challenge.expiryTime < new Date()) {
    return res.status(400).json({ error: "Invalid or expired challenge" });
  }

  // Verify the authentication response
  const verification = await verify({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: "https://your-origin.com",
    expectedRPID: "your-rp-id",
  });

  if (!verification) {
    return res.status(400).json({ error: "Invalid authentication response" });
  }

  // Update the passkey
  passkey.counter = verification.counter;
  await passkey.save();

  res.json({ success: true, passkeyId: passkey._id });
});

export default router;
