import fs from "fs";
import toml from "toml";
import { exitWithError } from "./process.js";
import { Response } from "express";
import { markdownToSanitizedHTML } from "../util/markdown.js";

interface StaticPage {
    title: string;
    path: string;
    filename: string;
}

export interface GathioConfig {
    general: {
        domain: string;
        port: string;
        email: string;
        site_name: string;
        delete_after_days: number;
        is_federated: boolean;
        email_logo_url: string;
        show_kofi: boolean;
        show_public_event_list: boolean;
        mail_service: "nodemailer" | "sendgrid" | "none";
        creator_email_addresses: string[];
    };
    database: {
        mongodb_url: string;
    };
    nodemailer?: {
        smtp_url?: string;
        smtp_server: string;
        smtp_port: string;
        smtp_username: string;
        smtp_password: string;
    };
    sendgrid?: {
        api_key: string;
    };
    static_pages?: StaticPage[];
}

interface FrontendConfig {
    domain: string;
    siteName: string;
    isFederated: boolean;
    emailLogoUrl: string;
    showKofi: boolean;
    showPublicEventList: boolean;
    showInstanceInformation: boolean;
    staticPages?: StaticPage[];
    version: string;
}

const defaultConfig: GathioConfig = {
    general: {
        domain: "localhost:3000",
        email: "contact@example.com",
        port: "3000",
        site_name: "gathio",
        is_federated: true,
        delete_after_days: 7,
        email_logo_url: "",
        show_public_event_list: false,
        show_kofi: false,
        mail_service: "none",
        creator_email_addresses: [],
    },
    database: {
        mongodb_url: "mongodb://localhost:27017/gathio",
    },
};

export const frontendConfig = (res: Response): FrontendConfig => {
    const config = res.locals.config;
    if (!config) {
        return {
            domain: defaultConfig.general.domain,
            siteName: defaultConfig.general.site_name,
            isFederated: defaultConfig.general.is_federated,
            emailLogoUrl: defaultConfig.general.email_logo_url,
            showPublicEventList: defaultConfig.general.show_public_event_list,
            showKofi: defaultConfig.general.show_kofi,
            showInstanceInformation: false,
            staticPages: [],
            version: process.env.npm_package_version || "unknown",
        };
    }
    return {
        domain: config.general.domain,
        siteName: config.general.site_name,
        isFederated: !!config.general.is_federated,
        emailLogoUrl: config.general.email_logo_url,
        showPublicEventList: !!config.general.show_public_event_list,
        showKofi: !!config.general.show_kofi,
        showInstanceInformation: !!config.static_pages?.length,
        staticPages: config.static_pages,
        version: process.env.npm_package_version || "unknown",
    };
};

interface InstanceRule {
    icon: string;
    text: string;
}

export const instanceRules = (): InstanceRule[] => {
    const config = getConfig();
    const rules = [];
    rules.push(
        config.general.show_public_event_list
            ? {
                text: "Public events and groups are displayed on the homepage",
                icon: "fas fa-eye",
            }
            : {
                text: "Events and groups can only be accessed by direct link",
                icon: "fas fa-eye-slash",
            },
    );
    rules.push(
        config.general.creator_email_addresses?.length
            ? {
                text: "Only specific people can create events and groups",
                icon: "fas fa-user-check",
            }
            : {
                text: "Anyone can create events and groups",
                icon: "fas fa-users",
            },
    );
    rules.push(
        config.general.delete_after_days > 0
            ? {
                text: `Events are automatically deleted ${config.general.delete_after_days} days after they end`,
                icon: "far fa-calendar-times",
            }
            : {
                text: "Events are permanent, and are never automatically deleted",
                icon: "far fa-calendar-check",
            },
    );
    rules.push(
        config.general.is_federated
            ? {
                text: "This instance federates with other instances using ActivityPub",
                icon: "fas fa-globe",
            }
            : {
                text: "This instance does not federate with other instances",
                icon: "fas fa-globe",
            },
    );
    return rules;
};

export const instanceDescription = (): string => {
    const config = getConfig();
    const defaultInstanceDescription =
        "**{{ siteName }}** is running on Gathio — a simple, federated, privacy-first event hosting platform.";
    let instanceDescription = defaultInstanceDescription;
    try {
        if (fs.existsSync("./static/instance-description.md")) {
            const fileBody = fs.readFileSync(
                "./static/instance-description.md",
                "utf-8",
            );
            instanceDescription = markdownToSanitizedHTML(fileBody);
        }
        // Replace {{siteName}} with the instance name
        instanceDescription = instanceDescription.replace(
            /\{\{ ?siteName ?\}\}/g,
            config?.general.site_name,
        );
        return instanceDescription;
    } catch (err) {
        console.log(err);
        return defaultInstanceDescription;
    }
};

let _resolvedConfig: GathioConfig | null = null;
// Attempt to load our global config. Will stop the app if the config file
// cannot be read (there's no point trying to continue!)
export const getConfig = (): GathioConfig => {
    if (_resolvedConfig) {
        return _resolvedConfig;
    }

    try {
        const config = toml.parse(
            fs.readFileSync("./config/config.toml", "utf-8"),
        ) as GathioConfig;
        const resolvedConfig = {
            ...defaultConfig,
            ...config,
        }
        if (process.env.CYPRESS || process.env.CI) {
            config.general.mail_service = "none";
            console.log(
                "Running in Cypress or CI, not initializing email service.",
            );
        } else if (config.general.mail_service === "none") {
            console.warn(
                "You have not configured this Gathio instance to send emails! This means that event creators will not receive emails when their events are created, which means they may end up locked out of editing events. Consider setting up an email service.",
            );
        }

        _resolvedConfig = resolvedConfig;
        return resolvedConfig;
    } catch {
        exitWithError(
            "Configuration file not found! Have you renamed './config/config-example.toml' to './config/config.toml'?",
        );
        return process.exit(1);
    }
};

export default getConfig;
