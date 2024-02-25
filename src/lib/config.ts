import fs from "fs";
import toml from "toml";
import { exitWithError } from "./process.js";

interface StaticPage {
    title: string;
    path: string;
    filename: string;
}

interface GathioConfig {
    general: {
        domain: string;
        port: string;
        email: string;
        site_name: string;
        is_federated: boolean;
        email_logo_url: string;
        show_kofi: boolean;
        mail_service: "nodemailer" | "sendgrid";
        creator_email_addresses: string[];
    };
    database: {
        mongodb_url: string;
    };
    nodemailer?: {
        smtp_server: string;
        smtp_port: string;
        smtp_username: string;
        smtp_password: string;
    };
    sendgrid?: {
        api_key: string;
    };
    static_pages: StaticPage[];
}

interface FrontendConfig {
    domain: string;
    siteName: string;
    isFederated: boolean;
    emailLogoUrl: string;
    showKofi: boolean;
    showInstanceInformation: boolean;
    staticPages: StaticPage[];
    version: string;
}

export const frontendConfig = (): FrontendConfig => {
    const config = getConfig();
    return {
        domain: config.general.domain,
        siteName: config.general.site_name,
        isFederated: config.general.is_federated,
        emailLogoUrl: config.general.email_logo_url,
        showKofi: config.general.show_kofi,
        showInstanceInformation: config.static_pages?.length > 0,
        staticPages: config.static_pages,
        version: process.env.npm_package_version || "unknown",
    };
};

// Attempt to load our global config. Will stop the app if the config file
// cannot be read (there's no point trying to continue!)
export const getConfig = (): GathioConfig => {
    try {
        const config = toml.parse(
            fs.readFileSync("./config/config.toml", "utf-8"),
        ) as GathioConfig;
        return config;
    } catch {
        exitWithError(
            "Configuration file not found! Have you renamed './config/config-example.toml' to './config/config.toml'?",
        );
        return process.exit(1);
    }
};

export default getConfig;
