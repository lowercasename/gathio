import { Request } from "express";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import { getConfig } from "./config.js";
import SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { exitWithError } from "./process.js";
import { renderTemplate } from "./handlebars.js";
const config = getConfig();

type EmailTemplate =
    | "addEventAttendee"
    | "addEventComment"
    | "createEvent"
    | "createEventGroup"
    | "createEventMagicLink"
    | "deleteEvent"
    | "editEvent"
    | "eventGroupUpdated"
    | "subscribed"
    | "unattendEvent";

export const initEmailService = async (): Promise<boolean> => {
    if (process.env.CYPRESS || process.env.CI) {
        console.log(
            "Running in Cypress or CI, not initializing email service.",
        );
        return false;
    }
    switch (config.general.mail_service) {
        case "sendgrid":
            if (!config.sendgrid?.api_key) {
                return exitWithError(
                    "Sendgrid is configured as the email service, but no API key is provided. Please provide an API key in the config file.",
                );
            }
            sgMail.setApiKey(config.sendgrid.api_key);
            console.log("Sendgrid is ready to send emails.");
            return true;
        case "nodemailer":
            if (
                !config.nodemailer?.smtp_server ||
                !config.nodemailer?.smtp_port ||
                !config.nodemailer?.smtp_username ||
                !config.nodemailer?.smtp_password
            ) {
                return exitWithError(
                    "Nodemailer is configured as the email service, but not all required fields are provided. Please provide all required fields in the config file.",
                );
            }
            const nodemailerConfig = {
                host: config.nodemailer?.smtp_server,
                port: Number(config.nodemailer?.smtp_port) || 587,
                auth: {
                    user: config.nodemailer?.smtp_username,
                    pass: config.nodemailer?.smtp_password,
                },
            } as SMTPTransport.Options;
            const nodemailerTransporter =
                nodemailer.createTransport(nodemailerConfig);
            const nodemailerVerified = await nodemailerTransporter.verify();
            if (nodemailerVerified) {
                console.log("Nodemailer is ready to send emails.");
                return true;
            } else {
                return exitWithError(
                    "Error verifying Nodemailer transporter. Please check your Nodemailer configuration.",
                );
            }
        case "none":
        default:
            console.warn(
                "You have not configured this Gathio instance to send emails! This means that event creators will not receive emails when their events are created, which means they may end up locked out of editing events. Consider setting up an email service.",
            );
            return false;
    }
};

export const sendEmail = async (
    to: string,
    subject: string,
    text: string,
    html?: string,
): Promise<boolean> => {
    switch (config.general.mail_service) {
        case "sendgrid":
            try {
                await sgMail.send({
                    to,
                    from: config.general.email,
                    subject: `${config.general.site_name}: ${subject}`,
                    text,
                    html,
                });
                return true;
            } catch (e: any) {
                if (e.response) {
                    console.error(e.response.body);
                } else {
                    console.error(e);
                }
                return false;
            }
        case "nodemailer":
            try {
                const nodemailerConfig = {
                    host: config.nodemailer?.smtp_server,
                    port: Number(config.nodemailer?.smtp_port) || 587,
                    auth: {
                        user: config.nodemailer?.smtp_username,
                        pass: config.nodemailer?.smtp_password,
                    },
                } as SMTPTransport.Options;
                const nodemailerTransporter =
                    nodemailer.createTransport(nodemailerConfig);
                await nodemailerTransporter.sendMail({
                    from: config.general.email,
                    to,
                    subject,
                    text,
                    html,
                });
                return true;
            } catch (e) {
                console.error(e);
                return false;
            }
        default:
            return false;
    }
};

export const sendEmailFromTemplate = async (
    to: string,
    subject: string,
    template: EmailTemplate,
    templateData: Record<string, unknown>,
    req: Request,
): Promise<boolean> => {
    const html = await renderTemplate(req, `${template}/${template}Html`, {
        siteName: config.general.site_name,
        siteLogo: config.general.email_logo_url,
        domain: config.general.domain,
        cache: true,
        layout: "email.handlebars",
        ...templateData,
    });
    const text = await renderTemplate(
        req,
        `${template}/${template}Text`,
        templateData,
    );
    return await sendEmail(to, subject, text, html);
};
