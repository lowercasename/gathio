import { Request } from "express";
import { ExpressHandlebars } from "express-handlebars";

export const renderTemplate = async (
    req: Request,
    templateName: string,
    data: Record<string, unknown>,
): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        req.app
            .get("hbsInstance")
            .renderView(
                `./views/emails/${templateName}.handlebars`,
                data,
                (err: any, html: string) => {
                    if (err) {
                        console.error(err);
                        reject(err);
                    }
                    resolve(html);
                },
            );
    });
};

export const renderEmail = async (
    hbsInstance: ExpressHandlebars,
    templateName: string,
    data: Record<string, unknown>,
): Promise<{ html: string, text: string }> => {
    const [html, text] = await Promise.all([
        hbsInstance.renderView(
            `./views/emails/${templateName}Html.handlebars`,
            {
                cache: true,
                layout: "email.handlebars",
                ...data,
            }
        ),
        hbsInstance.renderView(
            `./views/emails/${templateName}Text.handlebars`,
            {
                cache: true,
                layout: "email.handlebars",
                ...data,
            }
        ),
    ]);
    return { html, text }
}
