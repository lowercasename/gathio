import express from "express";
import cookieParser from "cookie-parser";
import {
    create as createHandlebars,
    ExpressHandlebars,
} from "express-handlebars";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { LanguageDetector, handle } from "i18next-http-middleware";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";

const require = createRequire(import.meta.url);
const handlebarsI18next = require("handlebars-i18next");

// Recreate __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import routes from "./routes.js";
import frontend from "./routes/frontend.js";
import activitypub from "./routes/activitypub.js";
import event from "./routes/event.js";
import group from "./routes/group.js";
import staticPages from "./routes/static.js";
import magicLink from "./routes/magicLink.js";
import { getI18nHelpers } from "./helpers.js";
import {
    activityPubContentType,
    alternateActivityPubContentType,
} from "./lib/activitypub.js";
import moment from "moment";
import { EmailService } from "./lib/email.js";
import getConfig from "./lib/config.js";

const app = express();
const config = getConfig();

// function to construct __dirname with ES module
const getLocalesPath = () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return path.join(__dirname, "..", "locales");
};

async function initializeApp() {
    // Cookies //
    app.use(cookieParser());

    // i18next configuration
    await i18next
        .use(Backend)
        .use(LanguageDetector)
        .init({
            backend: {
                loadPath: path.join(getLocalesPath(), "{{lng}}.json"),
            },
            fallbackLng: "en",
            preload: ["en", "ja"],
            supportedLngs: ["en", "ja"],
            nonExplicitSupportedLngs: true,
            load: "languageOnly",
            debug: false,
            detection: {
                order: ["header", "cookie"],
                lookupHeader: "accept-language",
                lookupCookie: "i18next",
                caches: ["cookie"],
            },
            interpolation: {
                escapeValue: false,
            },
        });

    app.use(handle(i18next));

    // to Switch language
    app.use((req, res, next) => {
        const currentLanguage = i18next.language;
        i18next.changeLanguage(req.language);
        const newLanguage = i18next.language;
        // Uncomment for debugging
        //        console.log('Language Change:', {
        //            header: req.headers['accept-language'],
        //            detected: req.language,
        //            currentLanguage: currentLanguage,
        //            newLanguage: newLanguage
        //        });
        next();
    });

    // Uncomment for debugging
    //    app.use((req, res, next) => {
    //        console.log('Language Detection:', {
    //            header: req.headers['accept-language'],
    //            detected: req.language,
    //            i18next: i18next.language
    //        });
    //        next();
    //    });

    // View engine //
    const hbsInstance = createHandlebars({
        defaultLayout: "main",
        partialsDir: ["views/partials/"],
        layoutsDir: "views/layouts/",
        helpers: {
            // add i18next helpers
            ...getI18nHelpers(),
            plural: function (key: string, count: number, options: any) {
                // Register the plural helper
                const translation = i18next.t(key, { count: count });
                return translation;
            },
            json: function (context: object) {
                return JSON.stringify(context);
            },
        },
    });

    const emailService = new EmailService(config, hbsInstance);
    emailService.verify();

    app.use(
        (
            req: express.Request,
            _: express.Response,
            next: express.NextFunction,
        ) => {
            req.hbsInstance = hbsInstance;
            req.emailService = emailService;
            next();
            return;
        },
    );

    // View engine //
    app.engine("handlebars", hbsInstance.engine);
    app.set("view engine", "handlebars");
    app.set("hbsInstance", hbsInstance);

    // calling i18nextHelper
    if (typeof handlebarsI18next === "function") {
        handlebarsI18next(hbsInstance.handlebars, i18next);
    } else if (typeof handlebarsI18next.default === "function") {
        handlebarsI18next.default(hbsInstance.handlebars, i18next);
    } else {
        console.error("handlebars-i18next helper is not properly loaded");
    }

    i18next.on("languageChanged", function (lng) {
        moment.locale(lng);
    });

    app.engine("handlebars", hbsInstance.engine);
    app.set("view engine", "handlebars");
    app.set("hbsInstance", hbsInstance);

    // Static files //
    app.use(express.static("public"));

    // Body parser //
    app.use(express.json({ type: alternateActivityPubContentType }));
    app.use(express.json({ type: activityPubContentType }));
    app.use(express.json({ type: "application/json" }));
    app.use(express.urlencoded({ extended: true }));

    // Router //
    app.use("/", staticPages);
    app.use("/", frontend);
    app.use("/", activitypub);
    app.use("/", event);
    app.use("/", group);
    app.use("/", magicLink);
    app.use("/", routes);
}

initializeApp().catch(console.error);

export default app;
