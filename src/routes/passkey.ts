import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import User from "../models/User.js";
import Passkey from "../models/Passkey.js";
import PasskeyChallenge from "../models/PasskeyChallenge.js";
import MagicLink from "../models/MagicLink.js";
import { getConfigMiddleware, checkAuth } from "../lib/middleware.js";
import { getConfig } from "../lib/config.js";
import { getWebAuthnParams, CHALLENGE_TTL_MS } from "../lib/webauthn.js";

const router = Router();

router.use(getConfigMiddleware);

const findOrCreateUser = async (email: string) => {
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ id: randomUUID(), email });
    await user.save();
  }
  return user;
};

const activeAdminMagicLink = async (
  token: string | undefined,
  email: string | undefined,
) => {
  if (!token || !email) return null;
  return MagicLink.findOne({
    token,
    email,
    expiryTime: { $gt: new Date() },
    permittedActions: "editAnyEvent",
  });
};

const isValidAdminEmail = (email: string): boolean => {
  const adminEmails = getConfig().general.admin_email_addresses;
  return !!adminEmails?.length && adminEmails.includes(email);
};

// Mint a 24-hour admin session. The session is represented as an "edit any
// event" magic link so all existing admin-panel/editing flows work unchanged.
const mintAdminSession = async (email: string) => {
  const token = randomUUID();
  const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const magicLink = new MagicLink({
    email,
    token,
    expiryTime,
    permittedActions: ["editAnyEvent"],
  });
  await magicLink.save();
  return { token, email, expiry: expiryTime.toISOString() };
};

// USER MANAGEMENT
// ---------------
// POST /users — create a new user with UUID and email
router.post("/users", checkAuth, async (req: Request, res: Response) => {
  const email: string = String(req.body.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "An email address is required." });
  }
  try {
    const user = await findOrCreateUser(email);
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// GET /users/:uuid — retrieve a user by UUID
router.get("/users/:uuid", checkAuth, async (req: Request, res: Response) => {
  const user = await User.findOne({ id: req.params.uuid });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const passkeys = await Passkey.find({ user: user._id }).select(
    "credentialId deviceName createdAt",
  );
  return res.json({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    passkeys,
  });
});

// DELETE /users/:uuid — delete a user and their associated passkeys/challenges
router.delete(
  "/users/:uuid",
  checkAuth,
  async (req: Request, res: Response) => {
    const user = await User.findOne({ id: req.params.uuid });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    await Passkey.deleteMany({ user: user._id });
    await PasskeyChallenge.deleteMany({ user: user._id });
    await user.remove();
    return res.json({ success: true });
  },
);

// PASKEY REGISTRATION
// -------------------
// POST /passkey/register/options — generate registration options for an admin.
//
// Registration is gated behind an active admin session (adminToken + adminEmail)
// so the first passkey is only ever created by someone who has proven ownership
// of an admin address via an email magic link. Additional passkeys may be
// added later from the same session or a passkey-backed session. The resulting
// challenge is persisted so registration can be verified later.
router.post(
  "/passkey/register/options",
  async (req: Request, res: Response) => {
    const { adminToken, adminEmail } = req.body;
    const adminLink = await activeAdminMagicLink(adminToken, adminEmail);
    if (!adminLink) {
      return res.status(401).json({
        error: "Admin authentication required to register a passkey.",
      });
    }
    const accountEmail = String(adminEmail).trim().toLowerCase();
    if (!isValidAdminEmail(accountEmail)) {
      return res.status(403).json({
        error: "This email address is not an admin on this instance.",
      });
    }
    const user = await findOrCreateUser(accountEmail);

    const existing = await Passkey.find({ user: user._id });
    const params = getWebAuthnParams();

    const options = await generateRegistrationOptions({
      rpName: params.nickName,
      rpID: params.rpID,
      userName: user.email,
      userDisplayName: user.email,
      attestationType: "none",
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    const passkeyChallenge = new PasskeyChallenge({
      user: user._id,
      email: user.email,
      challenge: options.challenge,
      purpose: "registration",
      expiryTime: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    await passkeyChallenge.save();
    await PasskeyChallenge.deleteMany({
      user: user._id,
      purpose: "registration",
      expiryTime: { $lt: new Date() },
    });

    return res.json(options);
  },
);

// POST /passkey/register — register a new passkey for a user
router.post("/passkey/register", async (req: Request, res: Response) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const { response } = req.body;

  if (!email || !response) {
    return res.status(400).json({ error: "Email and response are required." });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const challenge = await PasskeyChallenge.findOne({
    user: user._id,
    purpose: "registration",
    expiryTime: { $gt: new Date() },
  });
  if (!challenge) {
    return res
      .status(400)
      .json({ error: "No pending registration challenge." });
  }

  const params = getWebAuthnParams();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: params.allowedOrigins,
      expectedRPID: params.rpID,
    });
  } catch {
    return res.status(400).json({ error: "Invalid registration response." });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "Passkey verification failed." });
  }

  const { credential } = verification.registrationInfo;
  const existing = await Passkey.findOne({
    credentialId: credential.id,
  });
  if (existing) {
    return res
      .status(409)
      .json({ error: "This passkey is already registered." });
  }

  await PasskeyChallenge.deleteOne({ _id: challenge._id });

  const passkey = new Passkey({
    user: user._id,
    email: user.email,
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
    deviceName: String(req.body.deviceName || "").slice(0, 64) || undefined,
  });
  await passkey.save();

  // The first registered passkey doubles as the first login: return a fresh
  // admin session so the user is signed in immediately without an email link.
  const session = await mintAdminSession(user.email);
  return res.json({ success: true, passkeyId: passkey._id, ...session });
});

// PASKEY AUTHENTICATION
// ---------------------
// GET /passkey/challenge — generate a one-time authentication challenge for a
// user (login options). The email may be provided via query param or body.
router.get("/passkey/challenge", authOptions);
// POST /passkey/login/options — alias of GET /passkey/challenge for clients
// that prefer a POST.
router.post("/passkey/login/options", authOptions);

async function authOptions(req: Request, res: Response) {
  const email = String(req.query.email || req.body?.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    return res
      .status(400)
      .json({ error: "An email address is required to generate a challenge." });
  }
  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(404)
      .json({ error: "No passkeys are registered for this address." });
  }
  const passkeys = await Passkey.find({ user: user._id });
  if (!passkeys.length) {
    return res
      .status(404)
      .json({ error: "No passkeys are registered for this address." });
  }

  const params = getWebAuthnParams();
  const options = await generateAuthenticationOptions({
    rpID: params.rpID,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports as AuthenticatorTransport[],
    })),
    userVerification: "preferred",
  });

  const passkeyChallenge = new PasskeyChallenge({
    user: user._id,
    email: user.email,
    challenge: options.challenge,
    purpose: "authentication",
    expiryTime: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  await passkeyChallenge.save();
  await PasskeyChallenge.deleteMany({
    user: user._id,
    purpose: "authentication",
    expiryTime: { $lt: new Date() },
  });

  return res.json({ challengeId: passkeyChallenge._id.toString(), options });
}

// POST /passkey/challenge/:uuid — validate a completed authentication challenge
// and, on success, mint a 24h admin session (magic link) for the passkey owner.
router.post("/passkey/challenge/:uuid", async (req: Request, res: Response) => {
  const { response } = req.body;
  const challenge = await PasskeyChallenge.findById(req.params.uuid).populate(
    "user",
  );
  if (!challenge || challenge.expiryTime < new Date()) {
    return res.status(400).json({ error: "Invalid or expired challenge." });
  }
  const passkey = await Passkey.findOne({
    credentialId: response?.id,
  });
  const challengeUser = challenge.user as unknown as { _id: string };
  if (!passkey || String(passkey.user) !== String(challengeUser._id)) {
    return res
      .status(400)
      .json({ error: "No matching passkey for this challenge." });
  }

  const params = getWebAuthnParams();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: params.allowedOrigins,
      expectedRPID: params.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransport[],
      },
    });
  } catch {
    return res.status(400).json({ error: "Invalid authentication response." });
  }

  if (!verification.verified) {
    return res.status(400).json({ error: "Authentication failed." });
  }

  passkey.counter = verification.authenticationInfo.newCounter;
  await passkey.save();
  await PasskeyChallenge.deleteOne({ _id: challenge._id });

  const email = challenge.email;
  if (!isValidAdminEmail(email)) {
    return res.status(403).json({
      error: "This passkey is not associated with an admin account.",
    });
  }

  return res.json(await mintAdminSession(email));
});

// DELETE /passkey/challenge/:uuid — expire a pending challenge
router.delete(
  "/passkey/challenge/:uuid",
  async (req: Request, res: Response) => {
    await PasskeyChallenge.deleteOne({ _id: req.params.uuid });
    return res.json({ success: true });
  },
);

export default router;
