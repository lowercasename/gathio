// src/lib/middleware.ts

import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import getConfig from "./config.js";
import { merge as deepMerge } from "ts-deepmerge";

const prisma = new PrismaClient();

/**
 * Verifies that a valid, unexpired magic link token was provided in the request body.
 * If no creator_email_addresses are configured, skips the check.
 */
export const checkMagicLink = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const config = getConfig();
  // If no creator emails are set up, we don't require a magic link
  if (!config.general.creator_email_addresses?.length) {
    return next();
  }

  const { magicLinkToken, creatorEmail } = req.body;
  if (!magicLinkToken) {
    return res.status(400).json({
      errors: [{ message: "No magic link token was provided." }],
    });
  }
  if (!creatorEmail) {
    return res.status(400).json({
      errors: [{ message: "No creator email was provided." }],
    });
  }

  // Look up any non-expired magic link matching token + email
  const magicLink = await prisma.magicLink.findFirst({
    where: {
      token: magicLinkToken,
      email: creatorEmail,
      expiryTime: { gt: new Date() },
    },
  });

  // Check that the permittedActions JSON array includes "createEvent"
  const allowed =
    magicLink &&
    Array.isArray(magicLink.permittedActions) &&
    magicLink.permittedActions.includes("createEvent");

  if (!allowed) {
    return res.status(400).json({
      errors: [
        {
          message:
            "Magic link is invalid or has expired. Get a new one <a href='/new'>here</a>.",
        },
      ],
    });
  }

  next();
};

/**
 * Injects the GathioConfig into res.locals.config for every request.
 * Also allows overriding via a Cypress-provided cookie in CI/testing.
 */
export const getConfigMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const config = getConfig();

  // In Cypress tests, allow overriding via JSON in a cookie
  if (
    process.env.CYPRESS === "true" &&
    req.cookies?.cypressConfigOverride
  ) {
    console.log("Overriding config with Cypress override");
    const override = JSON.parse(req.cookies.cypressConfigOverride);
    res.locals.config = deepMerge(config, override);
    return next();
  }

  res.locals.config = config;
  return next();
};
