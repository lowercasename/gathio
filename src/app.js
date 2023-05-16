import express from "express";
import routes from "./routes.js";
import hbs from "express-handlebars";
import bodyParser from "body-parser";

const app = express();

// Configuration //

//app.use(cors());
//app.use(bodyParser.json());
//app.use(session({ secret: 'slartibartfast', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }));

// View engine //
const hbsInstance = hbs.create({
    defaultLayout: "main",
    partialsDir: ["views/partials/"],
    layoutsDir: "views/layouts/",
    helpers: {
        plural: function (number, text) {
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

// Router //
app.use(bodyParser.json({ type: "application/activity+json" })); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/", routes);

export default app;
