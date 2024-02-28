import { Router, Request, Response } from "express";
import fs from "fs";
import getConfig, { frontendConfig } from "../lib/config.js";
import { markdownToSanitizedHTML } from "../util/markdown.js";
import { getConfigMiddleware } from "../lib/middleware.js";

const config = getConfig();
const router = Router();

router.use(getConfigMiddleware);

if (config.static_pages?.length) {
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
                            ...frontendConfig(res),
                        });
                    }
                    return res.status(404).render("404", frontendConfig(res));
                } catch (err) {
                    console.error(err);
                    return res.status(404).render("404", frontendConfig(res));
                }
            });
        });
}

export default router;
