import mongoose from "mongoose";
import { getConfig } from "./lib/config.js";
import app from "./app.js";

const config = getConfig();

mongoose.connect(config.database.mongodb_url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("useCreateIndex", true);
mongoose.Promise = global.Promise;
mongoose.connection
  .on("connected", () => {
    console.log("Mongoose connection open!");
  })
  .on("error", (err) => {
    console.log("Connection error: ${err.message}");
  });

const server = app.listen(config.general.port, () => {
  console.log(
    `Welcome to gathio! The app is now running on http://localhost:${
      server.address().port
    }`
  );
});
