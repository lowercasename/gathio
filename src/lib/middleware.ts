import { NextFunction, Request, Response } from "express";
import MagicLink from "../models/MagicLink.js";
import { getConfig } from "../lib/config.js";
import { merge as deepMerge } from "ts-deepmerge";

export const checkMagicLink = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const config = getConfig();
    if (!config.general.creator_email_addresses?.length) {
        // No creator email addresses are configured, so skip the magic link check
        return next();
    }
    if (!req.body.magicLinkToken) {
        return res.status(400).json({
            errors: [
                {
                    message: "No magic link token was provided.",
                },
            ],
        });
    }
    if (!req.body.creatorEmail) {
        return res.status(400).json({
            errors: [
                {
                    message: "No creator email was provided.",
                },
            ],
        });
    }
    const magicLink = await MagicLink.findOne({
        token: req.body.magicLinkToken,
        email: req.body.creatorEmail,
        expiryTime: { $gt: new Date() },
        permittedActions: "createEvent",
    });
    if (!magicLink || magicLink.email !== req.body.creatorEmail) {
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

// Route-specific middleware which injects the config into the request object
// It can also be used to modify the config based on the request, which
// we use for Cypress testing.
export const getConfigMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const config = getConfig();
    if (process.env.CYPRESS === "true" && req.cookies?.cypressConfigOverride) {
        console.log("Overriding config with Cypress config");
        const override = JSON.parse(req.cookies.cypressConfigOverride);
        res.locals.config = deepMerge(config, override);
        return next();
    }
    res.locals.config = config;
    return next();
};
