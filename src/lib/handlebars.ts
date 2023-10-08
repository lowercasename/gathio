import { Request } from "express";

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
