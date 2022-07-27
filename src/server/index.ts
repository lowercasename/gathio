import express, { Request, Response, NextFunction } from "express";
import "express-async-errors";
import multer from "multer";
import path from "path";
import { create } from "express-handlebars";
import mongoose from "mongoose";
import getConfig from "./util/config";
import { getFile } from "./util/server";
import { frontend, api } from "./router";
import { handleError } from "./util/errorHandler";

// Initialize Express app //
const config = getConfig();
const app = express();
// global.approot = path.resolve(__dirname);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
console.log(path.join(__dirname, "../client/views/partials"));

// Initialize Handlebars view engine //
const handlebars = create({
    extname: "hbs",
    defaultLayout: "base",
    partialsDir: path.join(__dirname, "../client/views/partials"),
    layoutsDir: path.join(__dirname, "../client/views/layouts"),
    helpers: {
        plural(amount: number, text: string) {
            const singular = amount === 1;
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
    },
});
app.engine("hbs", handlebars.engine);
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "../client/views"));

// Router //
app.use("/", frontend);
app.use("/api", api);

// Error handler
app.use(handleError);
// app.use((error: TypeError, req: Request, res: Response, next: NextFunction) => {
//     return res.status(500).json({ error: error.toString() });
// });

// Static files //
app.use(express.static("./dist/client"));

// Start MongoDB database //
mongoose.connect(config.database.mongodb_url);
mongoose.Promise = global.Promise;
mongoose.connection
    .on("connected", () => {
        console.log("Mongoose connection open!");
    })
    .on("error", (err) => {
        console.error(`Connection error: ${err.message}`);
        process.exit(1);
    });

// Start Express server //
app.listen(config.general.port, () => {
    console.log(
        `Welcome to gathio! The app is now running on http://localhost:${config.general.port}`
    );
});
