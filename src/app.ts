import express from "express";
import hbs from "express-handlebars";

import routes from "./routes.js";
import frontend from "./routes/frontend.js";
import activitypub from "./routes/activitypub.js";
import event from "./routes/event.js";
import group from "./routes/group.js";
import staticPages from "./routes/static.js";

import { initEmailService } from "./lib/email.js";

const app = express();

app.locals.sendEmails = initEmailService();

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
    },
});
app.engine("handlebars", hbsInstance.engine);
app.set("view engine", "handlebars");
app.set("hbsInstance", hbsInstance);

// Static files //
app.use(express.static("public"));

// Body parser //
app.use(express.json({ type: "application/activity+json" }));
app.use(express.json({ type: "application/ld+json" }));
app.use(express.json({ type: "application/json" }));
app.use(express.urlencoded({ extended: true }));

// Router //
app.use("/", staticPages);
app.use("/", frontend);
app.use("/", activitypub);
app.use("/", event);
app.use("/", group);
app.use("/", routes);

export default app;
