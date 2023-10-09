import { Router, Request, Response, NextFunction } from "express";
import { createFeaturedPost, createWebfinger } from "../activitypub.js";
import { acceptsActivityPub } from "../lib/activitypub.js";
import getConfig, { frontendConfig } from "../lib/config.js";
import Event from "../models/Event.js";
import { addToLog } from "../helpers.js";

const config = getConfig();

const router = Router();

const send404IfNotFederated = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    if (!config.general.is_federated) {
        return res.status(404).render("404", frontendConfig());
    }
    next();
};

router.use(send404IfNotFederated);

// return the JSON for the featured/pinned post for this event
router.get("/:eventID/featured", (req: Request, res: Response) => {
    const { eventID } = req.params;
    const featured = {
        "@context": "https://www.w3.org/ns/activitystreams",
        id: `https://${config.general.domain}/${eventID}/featured`,
        type: "OrderedCollection",
        orderedItems: [createFeaturedPost(eventID)],
    };
    if (acceptsActivityPub(req)) {
        res.header("Content-Type", "application/activity+json").send(featured);
    } else {
        res.header("Content-Type", "application/json").send(featured);
    }
});

// return the JSON for a given activitypub message
router.get("/:eventID/m/:hash", async (req: Request, res: Response) => {
    const { hash, eventID } = req.params;
    const id = `https://${config.general.domain}/${eventID}/m/${hash}`;

    try {
        const event = await Event.findOne({
            id: eventID,
        });
        if (!event) {
            return res.status(404).render("404", frontendConfig());
        } else {
            if (!event.activityPubMessages) {
                return res.status(404).render("404", frontendConfig());
            }
            const message = event.activityPubMessages.find(
                (el) => el.id === id,
            );
            if (message) {
                if (acceptsActivityPub(req)) {
                    res.header(
                        "Content-Type",
                        "application/activity+json",
                    ).send(JSON.parse(message.content || "{}"));
                } else {
                    res.header("Content-Type", "application/json").send(
                        JSON.parse(message.content || "{}"),
                    );
                }
            } else {
                return res.status(404).render("404", frontendConfig());
            }
        }
    } catch (err) {
        addToLog(
            "getActivityPubMessage",
            "error",
            "Attempt to get Activity Pub Message for " +
                id +
                " failed with error: " +
                err,
        );
        return res.status(404).render("404", frontendConfig());
    }
});

router.get("/.well-known/webfinger", async (req, res) => {
    let resource = req.query.resource as string;
    if (!resource || !resource.includes("acct:")) {
        return res
            .status(400)
            .send(
                'Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.',
            );
    } else {
        // "foo@domain"
        let activityPubAccount = resource.replace("acct:", "");
        // "foo"
        let eventID = activityPubAccount.replace(/@.*/, "");

        try {
            const event = await Event.findOne({ id: eventID });

            if (!event) {
                return res.status(404).render("404", frontendConfig());
            } else {
                if (acceptsActivityPub(req)) {
                    res.header(
                        "Content-Type",
                        "application/activity+json",
                    ).send(createWebfinger(eventID, config.general.domain));
                } else {
                    res.header("Content-Type", "application/json").send(
                        createWebfinger(eventID, config.general.domain),
                    );
                }
            }
        } catch (err) {
            addToLog(
                "renderWebfinger",
                "error",
                `Attempt to render webfinger for ${resource} failed with error: ${err}`,
            );
            return res.status(404).render("404", frontendConfig());
        }
    }
});

router.get("/:eventID/followers", async (req, res) => {
    const eventID = req.params.eventID;

    try {
        const event = await Event.findOne({ id: eventID });

        if (event && event.followers) {
            const followers = event.followers.map((el) => el.actorId);
            let followersCollection = {
                type: "OrderedCollection",
                totalItems: followers.length,
                id: `https://${config.general.domain}/${eventID}/followers`,
                first: {
                    type: "OrderedCollectionPage",
                    totalItems: followers.length,
                    partOf: `https://${config.general.domain}/${eventID}/followers`,
                    orderedItems: followers,
                    id: `https://${config.general.domain}/${eventID}/followers?page=1`,
                },
                "@context": ["https://www.w3.org/ns/activitystreams"],
            };

            if (acceptsActivityPub(req)) {
                return res
                    .header("Content-Type", "application/activity+json")
                    .send(followersCollection);
            } else {
                return res
                    .header("Content-Type", "application/json")
                    .send(followersCollection);
            }
        } else {
            return res.status(400).send("Bad request.");
        }
    } catch (err) {
        addToLog(
            "renderFollowers",
            "error",
            `Attempt to render followers for ${eventID} failed with error: ${err}`,
        );
        return res.status(404).render("404", frontendConfig());
    }
});

export default router;
