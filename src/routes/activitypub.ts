import { Router, Request, Response, NextFunction } from "express";
import { createFeaturedPost, createWebfinger } from "../activitypub.js";
import { acceptsActivityPub } from "../lib/activitypub.js";
import { frontendConfig } from "../lib/config.js";
import Event from "../models/Event.js";
import { addToLog } from "../helpers.js";
import { getConfigMiddleware } from "../lib/middleware.js";

const router = Router();

router.use(getConfigMiddleware);

const send404IfNotFederated = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!res.locals.config?.general.is_federated) {
    return res.status(404).render("404", frontendConfig(res));
  }
  next();
};

// return the JSON for the featured/pinned post for this event
router.get(
  "/:eventID/featured",
  send404IfNotFederated,
  (req: Request, res: Response) => {
    const { eventID } = req.params;
    const featured = {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `https://${res.locals.config?.general.domain}/${eventID}/featured`,
      type: "OrderedCollection",
      orderedItems: [createFeaturedPost(eventID)],
    };
    if (acceptsActivityPub(req)) {
      res.header("Content-Type", "application/activity+json").send(featured);
    } else {
      res.header("Content-Type", "application/json").send(featured);
    }
  },
);

// return the JSON for a given activitypub message
router.get(
  "/:eventID/m/:hash",
  send404IfNotFederated,
  async (req: Request, res: Response) => {
    const { hash, eventID } = req.params;
    const id = `https://${res.locals.config?.general.domain}/${eventID}/m/${hash}`;

    try {
      const event = await Event.findOne({
        id: eventID,
      });
      if (!event) {
        return res.status(404).render("404", frontendConfig(res));
      } else {
        if (!event.activityPubMessages) {
          return res.status(404).render("404", frontendConfig(res));
        }
        const message = event.activityPubMessages.find((el) => el.id === id);
        if (message) {
          if (acceptsActivityPub(req)) {
            res
              .header("Content-Type", "application/activity+json")
              .send(JSON.parse(message.content || "{}"));
          } else {
            res
              .header("Content-Type", "application/json")
              .send(JSON.parse(message.content || "{}"));
          }
        } else {
          return res.status(404).render("404", frontendConfig(res));
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
      return res.status(404).render("404", frontendConfig(res));
    }
  },
);

router.get("/.well-known/nodeinfo", send404IfNotFederated, (req, res) => {
  if (!res.locals.config?.general.is_federated) {
    return res.status(404).render("404", frontendConfig(res));
  }
  const nodeInfo = {
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.2",
        href: `https://${res.locals.config?.general.domain}/.well-known/nodeinfo/2.2`,
      },
    ],
  };
  res
    .header(
      "Content-Type",
      'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"',
    )
    .send(nodeInfo);
});

router.get(
  "/.well-known/nodeinfo/2.2",
  send404IfNotFederated,
  async (req, res) => {
    const eventCount = await Event.countDocuments();

    if (!res.locals.config?.general.is_federated) {
      return res.status(404).render("404", frontendConfig(res));
    }
    const nodeInfo = {
      version: "2.2",
      instance: {
        name: res.locals.config?.general.site_name,
        description:
          "Federated, no-registration, privacy-respecting event hosting.",
      },
      software: {
        name: "Gathio",
        version: process.env.npm_package_version || "unknown",
        repository: "https://github.com/lowercasename/gathio",
        homepage: "https://gath.io",
      },
      protocols: ["activitypub"],
      services: {
        inbound: [],
        outbound: [],
      },
      openRegistrations: true,
      usage: {
        users: {
          total: eventCount,
        },
      },
    };
    res
      .header(
        "Content-Type",
        'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"',
      )
      .send(nodeInfo);
  },
);

router.get(
  "/.well-known/webfinger",
  send404IfNotFederated,
  async (req, res) => {
    const resource = req.query.resource as string;
    if (!resource || !resource.includes("acct:")) {
      return res
        .status(400)
        .send(
          'Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.',
        );
    } else {
      // "foo@domain"
      const activityPubAccount = resource.replace("acct:", "");
      // "foo"
      const eventID = activityPubAccount.replace(/@.*/, "");

      try {
        const event = await Event.findOne({ id: eventID });

        if (!event) {
          return res.status(404).render("404", frontendConfig(res));
        } else {
          if (acceptsActivityPub(req)) {
            res
              .header("Content-Type", "application/activity+json")
              .send(
                createWebfinger(eventID, res.locals.config?.general.domain),
              );
          } else {
            res
              .header("Content-Type", "application/json")
              .send(
                createWebfinger(eventID, res.locals.config?.general.domain),
              );
          }
        }
      } catch (err) {
        addToLog(
          "renderWebfinger",
          "error",
          `Attempt to render webfinger for ${resource} failed with error: ${err}`,
        );
        return res.status(404).render("404", frontendConfig(res));
      }
    }
  },
);

router.get("/:eventID/followers", send404IfNotFederated, async (req, res) => {
  const eventID = req.params.eventID;

  try {
    const event = await Event.findOne({ id: eventID });

    if (event && event.followers) {
      const followers = event.followers.map((el) => el.actorId);
      const followersCollection = {
        type: "OrderedCollection",
        totalItems: followers.length,
        id: `https://${res.locals.config?.general.domain}/${eventID}/followers`,
        first: {
          type: "OrderedCollectionPage",
          totalItems: followers.length,
          partOf: `https://${res.locals.config?.general.domain}/${eventID}/followers`,
          orderedItems: followers,
          id: `https://${res.locals.config?.general.domain}/${eventID}/followers?page=1`,
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
    return res.status(404).render("404", frontendConfig(res));
  }
});

export default router;
