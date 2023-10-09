import { Router, Request, Response } from "express";
import fs from "fs";
import getConfig, { frontendConfig } from "../lib/config.js";
import { markdownToSanitizedHTML } from "../util/markdown.js";

const config = getConfig();
const router = Router();

config.static_pages
    .filter((page) => page.path?.startsWith("/") && page.filename)
    .forEach((page) => {
        router.get(page.path, (_: Request, res: Response) => {
            try {
                if (fs.existsSync(`./static/${page.filename}`)) {
                    const fileBody = fs.readFileSync(
                        `./static/${page.filename}`,
                        "utf-8",
                    );
                    const parsed = markdownToSanitizedHTML(fileBody);
                    return res.render("static", {
                        title: page.title,
                        content: parsed,
                        ...frontendConfig(),
                    });
                }
                return res.status(404).render("404", frontendConfig());
            } catch (err) {
                console.error(err);
                return res.status(404).render("404", frontendConfig());
            }
        });
    });

export default router;
