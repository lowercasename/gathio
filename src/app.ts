import express from "express";
import cookieParser from "cookie-parser";

import routes from "./routes.js";
import frontend from "./routes/frontend.js";
import activitypub from "./routes/activitypub.js";
import event from "./routes/event.js";
import group from "./routes/group.js";
import staticPages from "./routes/static.js";
import magicLink from "./routes/magicLink.js";

import { initEmailService } from "./lib/email.js";
import {
    activityPubContentType,
    alternateActivityPubContentType,
} from "./lib/activitypub.js";
import { HandlebarsSingleton } from "./lib/handlebars.js";

const app = express();

initEmailService().then((sendEmails) => (app.locals.sendEmails = sendEmails));

// View engine //
app.engine("handlebars", HandlebarsSingleton.instance.engine);
app.set("view engine", "handlebars");
app.set("hbsInstance", HandlebarsSingleton.instance);

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
