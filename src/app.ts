import express from "express";
import hbs from "express-handlebars";

import routes from "./routes.js";
import frontend from "./routes/frontend.js";

const app = express();

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
    },
});
app.engine("handlebars", hbsInstance.engine);
app.set("view engine", "handlebars");
app.set("hbsInstance", hbsInstance);

// Static files //
app.use(express.static("public"));

// Body parser //
app.use(express.json({ type: "application/activity+json" })); // support json encoded bodies
app.use(express.urlencoded({ extended: true }));

// Router //
app.use("/", frontend);
app.use("/", routes);

export default app;
