import mongoose from "mongoose";
import { getConfig } from "./lib/config.js";
import app from "./app.js";

const config = getConfig();

// This keeps Mongoose 5's behaviour: query filters on paths that aren't in the
// schema are sent to MongoDB as written rather than silently dropped
// TODO: Arguably we don't keep doing this for ever
mongoose.set("strictQuery", false);
mongoose.connect(config.database.mongodb_url);
mongoose.connection
  .on("connected", () => {
    console.log("Mongoose connection open!");
  })
  .on("error", (err: Error) => {
    console.log(`Connection error: ${err.message}`);
  });

app.listen(config.general.port, () => {
  console.log(
    `Welcome to gathio! The app is now running on http://localhost:${config.general.port}`,
  );
});
