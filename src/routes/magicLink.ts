// src/routes/magicLink.ts

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { frontendConfig } from "../lib/config.js";
import { generateMagicLinkToken } from "../util/generator.js";
import { getConfigMiddleware } from "../lib/middleware.js";
import i18next from "i18next";

const prisma = new PrismaClient();
const router = Router();

router.use(getConfigMiddleware);

router.post("/magic-link/event/create", async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        return res.render("createEventMagicLink", {
            ...frontendConfig(res),
            message: {
                type: "danger",
                text: i18next.t("routes.magiclink.provideemail"),
            },
        });
    }

    const allowedEmails: string[] | undefined =
        res.locals.config?.general.creator_email_addresses;
    if (!allowedEmails?.length) {
        // No creator emails configured; skip magic-link check
        return res.redirect("/new");
    }

    if (!allowedEmails.includes(email)) {
        return res.render("createEventMagicLink", {
            ...frontendConfig(res),
            message: {
                type: "success",
                text: i18next.t("routes.magiclink.thanks"),
            },
        });
    }

    const token = generateMagicLinkToken();
    const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    try {
        // Create new magic link
        await prisma.magicLink.create({
            data: {
                email,
                token,
                expiryTime,
                permittedActions: ["createEvent"], // JSON field
            },
        });

        // Delete expired magic links
        await prisma.magicLink.deleteMany({
            where: {
                expiryTime: { lt: new Date() },
            },
        });

        // Send the email
        await req.emailService.sendEmailFromTemplate({
            to: email,
            subject: i18next.t("routes.magiclink.mailsubject"),
            templateName: "createEventMagicLink",
            templateData: { token },
        });

        return res.render("createEventMagicLink", {
            ...frontendConfig(res),
            message: {
                type: "success",
                text: i18next.t("routes.magiclink.thanks"),
            },
        });
    } catch (err) {
        console.error("MagicLink error:", err);
        addToLog(
            "createMagicLink",
            "error",
            `Attempt to create magic link for ${email} failed: ${err}`,
        );
        return res.render("createEventMagicLink", {
            ...frontendConfig(res),
            message: {
                type: "danger",
                text:
                    i18next.t("routes.magiclink.error") || "An error occurred.",
            },
        });
    }
});

export default router;
