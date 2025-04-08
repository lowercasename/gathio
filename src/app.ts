import express from "express";
import hbs from "express-handlebars";
import cookieParser from "cookie-parser";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { LanguageDetector, handle } from 'i18next-http-middleware';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const require = createRequire(import.meta.url);
const handlebarsI18next = require('handlebars-i18next');

// ESモジュールで__dirnameを再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import routes from "./routes.js";
import frontend from "./routes/frontend.js";
import activitypub from "./routes/activitypub.js";
import event from "./routes/event.js";
import group from "./routes/group.js";
import staticPages from "./routes/static.js";
import magicLink from "./routes/magicLink.js";

import { initEmailService } from "./lib/email.js";
import { getI18nHelpers } from "./helpers.js";
import {
    activityPubContentType,
    alternateActivityPubContentType,
} from "./lib/activitypub.js";

const app = express();

app.locals.sendEmails = initEmailService();

// ESモジュールで__dirnameを再現する部分を関数化
const getLocalesPath = () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return path.join(__dirname, '..', 'locales');
};

async function initializeApp() {
    // Cookies //
    app.use(cookieParser());

    // カスタム言語検出ミドルウェア
    // app.use((req, res, next) => {
    //     const acceptLanguage = req.headers['accept-language'];
    //     if (acceptLanguage && acceptLanguage.includes('ja')) {
    //         res.cookie('i18next', 'ja', {
    //             maxAge: 365 * 24 * 60 * 60 * 1000,
    //             httpOnly: true,
    //             sameSite: 'lax'
    //         });
    //     }
    //     next();
    // });

    // i18next configuration
    await i18next
        .use(Backend)
        .use(LanguageDetector)
        .init({
            backend: {
                loadPath: path.join(getLocalesPath(), '{{lng}}.json'),
            },
            fallbackLng: 'en',
            preload: ['en', 'ja'],
            supportedLngs: ['en', 'ja'],
            nonExplicitSupportedLngs: true,
            load: 'languageOnly',
            debug: true,
            detection: {
                order: ['header', 'cookie'],
                lookupHeader: 'accept-language',
                lookupCookie: 'i18next',
                caches: ['cookie']
            },
            interpolation: {
                escapeValue: false
            }
        });

    app.use(handle(i18next));

    // 言語を明示的に切り替える
    app.use((req, res, next) => {
        const currentLanguage = i18next.language;
        i18next.changeLanguage(req.language);
        const newLanguage = i18next.language;
        console.log('Language Change:', {
            header: req.headers['accept-language'],
            detected: req.language,
            currentLanguage: currentLanguage,
            newLanguage: newLanguage
        });
        next();
    });

    // デバッグ用
    app.use((req, res, next) => {
        console.log('Language Detection:', {
            header: req.headers['accept-language'],
            detected: req.language,
            i18next: i18next.language
        });
        next();
    });

    // View engine //
    const hbsInstance = hbs.create({
        defaultLayout: "main",
        partialsDir: ["views/partials/"],
        layoutsDir: "views/layouts/",
        helpers: {
            plural: function (number: number, text: string) {
                var singular = number === 1;
                // If no text parameter was given, just return a conditional s.
                if (typeof text !== "string") return singular ? "" : "s";
                // Split with regex into group1/group2 or group1(group3)
                var match = text.match(/^([^()\/]+)(?:\/(.+))?(?:\((\w+)\))?/);
                // If no match, just append a conditional s.
                if (!match) return text + (singular ? "" : "s");
                // We have a good match, so fire away
                return (
                    (singular && match[1]) || // Singular case
                    match[2] || // Plural case: 'bagel/bagels' --> bagels
                    match[1] + (match[3] || "s")
                ); // Plural case: 'bagel(s)' or 'bagel' --> bagels
            },
            json: function (context: any) {
                return JSON.stringify(context);
            },
            // i18nextヘルパーを追加
            ...getI18nHelpers()
        },
    });

    // i18nextHelperの呼び出し方法を変更
    if (typeof handlebarsI18next === 'function') {
        handlebarsI18next(hbsInstance.handlebars, i18next);
    } else if (typeof handlebarsI18next.default === 'function') {
        handlebarsI18next.default(hbsInstance.handlebars, i18next);
    } else {
        console.error('handlebars-i18next helper is not properly loaded');
    }

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
