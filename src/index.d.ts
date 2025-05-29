import "express";
import { GathioConfig } from "./lib/config.ts";
import { EmailService } from "./lib/email.ts";
import { ExpressHandlebars } from "express-handlebars";

interface Locals {
    config: GathioConfig;
}

declare global {
    namespace Express {
        interface Request extends Express.Request {
            hbsInstance: ExpressHandlebars;
            emailService: EmailService;
        }
    }
}
