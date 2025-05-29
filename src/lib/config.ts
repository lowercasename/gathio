// src/lib/config.ts

import fs from "fs";
import toml from "toml";
import { exitWithError } from "./process.js";
import { Response } from "express";
import { markdownToSanitizedHTML } from "../util/markdown.js";
import i18next from "i18next";

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
    mail_service: "nodemailer" | "sendgrid" | "mailgun" | "none";
    creator_email_addresses: string[];
  };
  database: {
    /** SQLite connection URL, e.g. file:./dev.db or from env DATABASE_URL */
    url: string;
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
  mailgun?: {
    api_key: string;
    api_url: string;
    domain: string;
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
    url: process.env.DATABASE_URL || "file:./dev.db",
  },
};

export const frontendConfig = (res: Response): FrontendConfig => {
  const config = res.locals.config as GathioConfig | undefined;
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
  const rules: InstanceRule[] = [];

  rules.push(
    config.general.show_public_event_list
      ? {
          text: i18next.t("config.instancerule.showpubliceventlist-true"),
          icon: "fas fa-eye",
        }
      : {
          text: i18next.t("config.instancerule.showpubliceventlist-false"),
          icon: "fas fa-eye-slash",
        }
  );

  rules.push(
    config.general.creator_email_addresses?.length
      ? {
          text: i18next.t("config.instancerule.creatoremail-true"),
          icon: "fas fa-user-check",
        }
      : {
          text: i18next.t("config.instancerule.creatoremail-false"),
          icon: "fas fa-users",
        }
  );

  rules.push(
    config.general.delete_after_days > 0
      ? {
          text: i18next.t(
            "config.instancerule.deleteafterdays-true",
            { days: config.general.delete_after_days }
          ),
          icon: "far fa-calendar-times",
        }
      : {
          text: i18next.t("config.instancerule.deleteafterdays-false"),
          icon: "far fa-calendar-check",
        }
  );

  rules.push(
    config.general.is_federated
      ? {
          text: i18next.t("config.instancerule.isfederated-true"),
          icon: "fas fa-globe",
        }
      : {
          text: i18next.t("config.instancerule.isfederated-false"),
          icon: "fas fa-globe",
        }
  );

  return rules;
};

export const instanceDescription = (): string => {
  const config = getConfig();
  const defaultDesc = markdownToSanitizedHTML(
    i18next.t(
      "config.defaultinstancedesc",
      "Welcome to this Gathio instance!"
    )
  );
  const filePath = `./static/instance-description-${i18next.language}.md`;
  try {
    if (fs.existsSync(filePath)) {
      const contents = fs.readFileSync(filePath, "utf-8");
      let desc = markdownToSanitizedHTML(contents);
      return desc.replace(
        /\{\{ ?siteName ?\}\}/g,
        config.general.site_name
      );
    }
    return defaultDesc;
  } catch {
    return defaultDesc;
  }
};

let _resolvedConfig: GathioConfig | null = null;
export const getConfig = (): GathioConfig => {
  if (_resolvedConfig) return _resolvedConfig;

  try {
    const raw = fs.readFileSync("./config/config.toml", "utf-8");
    const parsed = toml.parse(raw) as Partial<GathioConfig>;

    // Merge database.url specially to avoid dropping defaults
    const databaseUrl =
      parsed.database?.url ?? defaultConfig.database.url;

    const merged: GathioConfig = {
      ...defaultConfig,
      ...parsed,
      database: { url: databaseUrl },
    };

    // Disable email in CI/Cypress
    if (process.env.CYPRESS || process.env.CI) {
      merged.general.mail_service = "none";
      console.log("CYPRESS/CI detected — email disabled");
    } else if (merged.general.mail_service === "none") {
      console.warn(
        "Mail service set to 'none'; creators will not receive emails."
      );
    }

    _resolvedConfig = merged;
    return merged;
  } catch {
    exitWithError(
      "Configuration file not found! Rename './config/config-example.toml' to './config/config.toml'."
    );
    process.exit(1);
  }
};

export default getConfig;
