import fs from "fs";
import toml from "toml";

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
}

// Attempt to load our global config. Will stop the app if the config file
// cannot be read (there's no point trying to continue!)
export default (): GathioConfig => {
    try {
        const config = toml.parse(
            fs.readFileSync("./config/config.toml", "utf-8")
        ) as GathioConfig;
        return config;
    } catch {
        console.error(
            "\x1b[31mConfiguration file not found! Have you renamed './config/config-example.toml' to './config/config.toml'?"
        );
        process.exit(1);
    }
};
