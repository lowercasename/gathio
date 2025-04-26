import express from "express";
import cookieParser from "cookie-parser";
import { create as createHandlebars, ExpressHandlebars } from "express-handlebars";

import routes from "./routes.js";
import frontend from "./routes/frontend.js";
import activitypub from "./routes/activitypub.js";
import event from "./routes/event.js";
import group from "./routes/group.js";
import staticPages from "./routes/static.js";
import magicLink from "./routes/magicLink.js";
import {
    activityPubContentType,
    alternateActivityPubContentType,
} from "./lib/activitypub.js";
import { EmailService } from "./lib/email.js";
import getConfig from "./lib/config.js";

const app = express();
const config = getConfig();

const hbsInstance = createHandlebars({
    defaultLayout: "main",
    partialsDir: ["views/partials/"],
    layoutsDir: "views/layouts/",
    helpers: {
        plural: function (number: number, text: string) {
            const singular = number === 1;
            // If no text parameter was given, just return a conditional s.
            if (typeof text !== "string") return singular ? "" : "s";
            // Split with regex into group1/group2 or group1(group3)
            const match = text.match(/^([^()\/]+)(?:\/(.+))?(?:\((\w+)\))?/);
            // If no match, just append a conditional s.
            if (!match) return text + (singular ? "" : "s");
            // We have a good match, so fire away
            return (
                (singular && match[1]) || // Singular case
                match[2] || // Plural case: 'bagel/bagels' --> bagels
                match[1] + (match[3] || "s")
            ); // Plural case: 'bagel(s)' or 'bagel' --> bagels
        },
        json: function (context: object) {
            return JSON.stringify(context);
        },
    },
});

const emailService = new EmailService(config, hbsInstance);
emailService.verify();

app.use((req: express.Request, _: express.Response, next: express.NextFunction) => {
    req.hbsInstance = hbsInstance;
    req.emailService = emailService;
    next()
    return
})

// View engine //
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

// Cookies //
app.use(cookieParser());

// Router //
app.use("/", staticPages);
app.use("/", frontend);
app.use("/", activitypub);
app.use("/", event);
app.use("/", group);
app.use("/", magicLink);
app.use("/", routes);

export default app;
