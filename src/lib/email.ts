import sgMail from "@sendgrid/mail";
import sgHelpers from "@sendgrid/helpers";
import { ExpressHandlebars } from "express-handlebars";
import nodemailer, { Transporter } from "nodemailer";
import { GathioConfig, getConfig } from "./config.js";
import SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { exitWithError } from "./process.js";

const config = getConfig();

type EmailTemplateName =
    | "addEventAttendee"
    | "addEventComment"
    | "createEvent"
    | "createEventGroup"
    | "createEventMagicLink"
    | "deleteEvent"
    | "editEvent"
    | "eventGroupUpdated"
    | "removeEventAttendee"
    | "subscribed"
    | "unattendEvent";

export class EmailService {
    nodemailerTransporter: Transporter | undefined = undefined;
    sgMail: typeof sgMail | undefined = undefined;
    hbs: ExpressHandlebars

    public constructor(config: GathioConfig, hbs: ExpressHandlebars) {
        this.hbs = hbs;
        switch (config.general.mail_service) {
            case "sendgrid": {
                if (!config.sendgrid?.api_key) {
                    return exitWithError(
                        "Sendgrid is configured as the email service, but no API key is provided. Please provide an API key in the config file.",
                    );
                }
                this.sgMail = sgMail;
                this.sgMail.setApiKey(config.sendgrid.api_key);
                console.log("Sendgrid is ready to send emails.");
                break;
            }
            case "nodemailer": {
                if (config.nodemailer?.smtp_url) {
                    this.nodemailerTransporter = nodemailer.createTransport(
                        config.nodemailer?.smtp_url,
                    );
                } else {
                    if (
                        !config.nodemailer?.smtp_server ||
                        !config.nodemailer?.smtp_port
                    ) {
                        return exitWithError(
                            "Nodemailer is configured as the email service, but not all required fields are provided. Please provide all required fields in the config file.",
                        );
                    }
                    const nodemailerConfig = {
                        host: config.nodemailer?.smtp_server,
                        port: Number(config.nodemailer?.smtp_port) || 587,
                        tls: {
                            // do not fail on invalid certs
                            rejectUnauthorized: false,
                        },
                    } as SMTPTransport.Options;

                    if (config.nodemailer?.smtp_username) {
                        nodemailerConfig.auth = {
                            user: config.nodemailer?.smtp_username,
                            pass: config.nodemailer?.smtp_password,
                        };
                    }
                    this.nodemailerTransporter =
                        nodemailer.createTransport(nodemailerConfig);
                }
            }

        }
    }

    public async verify(): Promise<boolean> {
        if (this.nodemailerTransporter) {
            const nodemailerVerified = await this.nodemailerTransporter.verify();
            if (nodemailerVerified) {
                console.log("Nodemailer is ready to send emails.");
                return true;
            } else {
                return exitWithError(
                    "Error verifying Nodemailer transporter. Please check your Nodemailer configuration.",
                );
            }
        }
        return true;
    }

    public async sendEmail({
        to,
        bcc,
        subject,
        text,
        html,
    }: {
        to: string | string[];
        bcc?: string | string[];
        subject: string;
        text: string;
        html?: string;
    }): Promise<boolean> {
        if (this.sgMail) {
            try {
                await this.sgMail.send({
                    to,
                    bcc,
                    from: config.general.email,
                    subject,
                    text,
                    html,
                });
                return true;
            } catch (e: unknown | sgHelpers.classes.ResponseError) {
                if (e instanceof sgHelpers.classes.ResponseError) {
                    console.error('sendgrid error', e.response.body);
                } else {
                    console.error('sendgrid error', e);
                }
                return false;
            }
        } else if (this.nodemailerTransporter) {
            try {
                await this.nodemailerTransporter.sendMail({
                    from: config.general.email,
                    to,
                    bcc,
                    subject,
                    text,
                    html,
                });
                return true;
            } catch (e) {
                console.error(e);
                return false;
            }
        } else {
            // no mailer, so noop
            return true;
        }
    }

    public async sendEmailFromTemplate({
        to,
        bcc = "",
        subject,
        templateName,
        templateData = {}
    }: {
        to: string | string[];
        bcc?: string | string[] | undefined;
        subject: string;
        templateName: EmailTemplateName;
        templateData?: object;
    },
    ): Promise<boolean> {
        const [html, text] = await Promise.all([
            this.hbs.renderView(
                `./views/emails/${templateName}/${templateName}Html.handlebars`,
                {
                    domain: config.general.domain,
                    contactEmail: config.general.email,
                    siteName: config.general.site_name,
                    mailService: config.general.mail_service,
                    siteLogo: config.general.email_logo_url,
                    isFederated: config.general.is_federated || true,
                    cache: true,
                    layout: "email.handlebars",
                    ...templateData,
                }
            ),
            this.hbs.renderView(
                `./views/emails/${templateName}/${templateName}Text.handlebars`,
                {
                    domain: config.general.domain,
                    contactEmail: config.general.email,
                    siteName: config.general.site_name,
                    mailService: config.general.mail_service,
                    siteLogo: config.general.email_logo_url,
                    isFederated: config.general.is_federated || true,
                    cache: true,
                    layout: "email.handlebars",
                    ...templateData,
                }
            ),
        ]);

        return this.sendEmail({
            to,
            bcc,
            subject: `${config.general.site_name}: ${subject}`,
            text,
            html
        });
    }
}
