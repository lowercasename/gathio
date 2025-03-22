import express from "express";
import hbs, { ExpressHandlebars } from "express-handlebars";
import Handlebars from 'handlebars';
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
import moment from "moment";

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

    // i18next configuration
    await i18next
        .use(Backend)
        .use(LanguageDetector)
        .init({
            backend: {
                loadPath: path.join(getLocalesPath(), '{{lng}}.json'),
            },
            fallbackLng: 'en',
            preload: ['en-US', 'ja'],
            supportedLngs: ['en','en-US', 'ja'],
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
    const hbsInstance: ExpressHandlebars = hbs.create({
        defaultLayout: "main",
        partialsDir: ["views/partials/"],
        layoutsDir: "views/layouts/",
        helpers: {
            json: function (context: any) {
                return JSON.stringify(context);
            },
            // i18nextヘルパーを追加
            ...getI18nHelpers(),
            plural: function (key: string, count: number, options: any) { // ★plural ヘルパーを登録
                const translation = i18next.t(key, { count: count });
                return translation;
            }
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

    i18next.on('languageChanged', function(lng) {
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
