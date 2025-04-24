import hbs, { ExpressHandlebars } from "express-handlebars";
import { RenderViewOptions } from "express-handlebars/types/index.js";

export class HandlebarsSingleton {
    static #instance: HandlebarsSingleton;
    hbsInstance: hbs.ExpressHandlebars;

    private constructor() { 
        this.hbsInstance = hbs.create({
            defaultLayout: "main",
            partialsDir: ["views/partials/"],
            layoutsDir: "views/layouts/",
            helpers: {
                plural: function (number: number, text: string) {
                    const singular = number === 1;
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
                json: function (context: object) {
                    return JSON.stringify(context);
                },
            },
        });
    }

    public static get instance(): HandlebarsSingleton {
        if (!HandlebarsSingleton.#instance) {
            HandlebarsSingleton.#instance = new HandlebarsSingleton();
        }

        return HandlebarsSingleton.#instance;
    }
    
    public get engine(): ExpressHandlebars["engine"] {
        return this.hbsInstance.engine;
    }

    /**
     * Finally, any singleton can define some business logic, which can be
     * executed on its instance.
     */
    public renderView(viewPath: string, options: RenderViewOptions): Promise<string> {
        return this.hbsInstance.renderView(viewPath, options);
    }
}
