import sgMail from "@sendgrid/mail";
import sgHelpers from "@sendgrid/helpers";
import { ExpressHandlebars } from "express-handlebars";
import i18next from "i18next";
import nodemailer, { Transporter } from "nodemailer";
import { GathioConfig, getConfig } from "./config.js";
import SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { exitWithError } from "./process.js";
import { addToLog } from "../helpers.js";
import { ICustomQuestionAnswer, IEvent } from "../models/Event.js";
import Mailgun from "mailgun.js";
import { IMailgunClient } from "node_modules/mailgun.js/Types/Interfaces/index.js";

type ResponseBodyError = Error & { response: { body: string } };
const config = getConfig();

type EmailTemplateName =
  | "addEventAttendee"
  | "addEventComment"
  | "attendeeAwaitingApproval"
  | "attendeeAnswered"
  | "attendeeApproved"
  | "attendeeJoined"
  | "attendeePendingConfirmation"
  | "createEvent"
  | "createEventGroup"
  | "createEventMagicLink"
  | "deleteEvent"
  | "editEvent"
  | "eventGroupUpdated"
  | "removeEventAttendee"
  | "subscribed"
  | "unattendEvent";

function isResponseBodyError(err: unknown): err is ResponseBodyError {
  if (err && typeof err === "object" && "response" in err) {
    if (
      err.response &&
      typeof err.response === "object" &&
      "body" in err.response
    ) {
      return true;
    }
  }
  return false;
}

export class EmailService {
  nodemailerTransporter: Transporter | undefined = undefined;
  sgMail: typeof sgMail | undefined = undefined;
  mailgunClient: IMailgunClient | undefined = undefined;
  hbs: ExpressHandlebars;

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
      case "mailgun": {
        if (
          !config.mailgun?.api_key ||
          !config.mailgun?.api_url ||
          !config.mailgun?.domain
        ) {
          return exitWithError(
            "Mailgun is configured as the email service, but not all required fields are provided. Please provide all required fields in the config file.",
          );
        }
        const mailgun = new Mailgun(FormData);
        this.mailgunClient = mailgun.client({
          username: "api",
          key: config.mailgun.api_key,
          url: config.mailgun.api_url,
        });
        // TODO: Can we verify the Mailgun connection?
        console.log("Mailgun is ready to send emails.");
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
          console.error("sendgrid error", e.response.body);
        } else {
          console.error("sendgrid error", e);
        }
        return false;
      }
    } else if (this.mailgunClient) {
      try {
        if (!config.mailgun?.domain) {
          return exitWithError(
            "Mailgun is configured as the email service, but no domain is provided. Please provide a domain in the config file.",
          );
        }
        await this.mailgunClient.messages.create(config.mailgun.domain, {
          from: config.general.email,
          to,
          bcc,
          subject: `${config.general.site_name}: ${subject}`,
          text,
          html,
        });
        return true;
      } catch (e) {
        if (isResponseBodyError(e)) {
          console.error("mailgun error", e.response.body);
        } else {
          console.error("mailgun error", e);
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
    templateData = {},
  }: {
    to: string | string[];
    bcc?: string | string[] | undefined;
    subject: string;
    templateName: EmailTemplateName;
    templateData?: object;
  }): Promise<boolean> {
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
        },
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
        },
      ),
    ]);

    return this.sendEmail({
      to,
      bcc,
      subject: `${config.general.site_name}: ${subject}`,
      text,
      html,
    });
  }
}

// Tell an event's host that someone has RSVPed. Events which require approval
// get the "awaiting approval" email, which asks the host to review the
// request; everything else gets a plain "new RSVP" notification. Delivery
// problems are logged rather than thrown, so a failed notification can't fail
// the RSVP which triggered it.
export async function notifyHostOfNewAttendee({
  emailService,
  event,
  attendeeName,
  answers = [],
  logProcess,
}: {
  emailService: EmailService;
  event: Pick<
    IEvent,
    "id" | "name" | "creatorEmail" | "editToken" | "approveRegistrations"
  >;
  attendeeName: string;
  answers?: ICustomQuestionAnswer[];
  // The `process` name failures are logged under, i.e. the calling handler
  logProcess: string;
}): Promise<void> {
  if (!event.creatorEmail) {
    return;
  }
  const requiresApproval = !!event.approveRegistrations;
  const templateName: EmailTemplateName = requiresApproval
    ? "attendeeAwaitingApproval"
    : "attendeeJoined";
  const subjectKey = requiresApproval
    ? "routes.attendeeawaitingapprovalsubject"
    : "routes.attendeejoinedsubject";
  try {
    const sent = await emailService.sendEmailFromTemplate({
      to: event.creatorEmail,
      subject: i18next.t(subjectKey, { eventName: event.name }),
      templateName,
      templateData: {
        eventID: event.id,
        eventName: event.name,
        attendeeName,
        editToken: event.editToken,
        answers,
      },
    });
    if (!sent) {
      addToLog(
        logProcess,
        "error",
        `Failed to send ${templateName} email for event ${event.id}`,
      );
    }
  } catch (e) {
    console.error(`Error sending ${templateName} email:`, e);
  }
}
