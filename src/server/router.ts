import express from "express";
import path from "path";
import multer from "multer";
import getConfig from "./util/config";
const config = getConfig();

// File uploads //
const upload = multer({
  dest: path.join(__dirname, "../../dist/client/temp"),
});

import {
  validateEvent,
  getEvent,
  createEvent,
  uploadEventImage,
} from "./modules/event/methods";

const renderDefaults = {
  domain: config.general.domain,
  email: config.general.email,
  siteName: config.general.site_name,
};

// Frontend routes //
const frontend = express.Router();
frontend.get("/", (req, res) => {
  res.render("index", {
    ...renderDefaults,
    showKofi: config.general.show_kofi,
  });
});

frontend.get("/new-event", (req, res) => {
  res.render("new-event", { ...renderDefaults });
});

frontend.get("/new-group", (req, res) => {
  res.render("new-group", { ...renderDefaults });
});

frontend.get("/import-event", (req, res) => {
  res.render("import-event", { ...renderDefaults });
});

// API routes //
const api = express.Router();
api.get("/event/:eventID", getEvent);
api.post("/event", validateEvent("createEvent"), createEvent);
api.post("/image", upload.single("file"), uploadEventImage);

export { frontend, api };
