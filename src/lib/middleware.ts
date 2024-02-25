import { Request, Response } from "express";
import MagicLink from "../models/MagicLink.js";
import getConfig from "../lib/config.js";

const config = getConfig();

export const checkMagicLink = async (
    req: Request,
    res: Response,
    next: any,
) => {
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
