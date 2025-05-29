//src/routes/activitypub.ts
import { Router, Request, Response, NextFunction } from "express";
import { createFeaturedPost, createWebfinger } from "../activitypub.js";
import { acceptsActivityPub } from "../lib/activitypub.js";
import { frontendConfig } from "../lib/config.js";
import { getConfigMiddleware } from "../lib/middleware.js";
import { addToLog } from "../helpers.js";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

router.use(getConfigMiddleware);

const send404IfNotFederated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!res.locals.config?.general.is_federated) {
    return res.status(404).render("404", frontendConfig(res));
  }
  next();
};

// GET /:eventID/featured - featured post
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

    const contentType = acceptsActivityPub(req)
      ? "application/activity+json"
      : "application/json";

    res.header("Content-Type", contentType).send(featured);
  }
);

// GET /:eventID/m/:hash - specific ActivityPub message
router.get(
  "/:eventID/m/:hash",
  send404IfNotFederated,
  async (req: Request, res: Response) => {
    const { eventID, hash } = req.params;
    const id = `https://${res.locals.config?.general.domain}/${eventID}/m/${hash}`;

    try {
      const message = await prisma.activityPubMessage.findUnique({ where: { id } });
      if (!message) {
        return res.status(404).render("404", frontendConfig(res));
      }

      const parsed = JSON.parse(message.content || "{}");
      const contentType = acceptsActivityPub(req)
        ? "application/activity+json"
        : "application/json";

      res.header("Content-Type", contentType).send(parsed);
    } catch (err) {
      addToLog(
        "getActivityPubMessage",
        "error",
        `Attempt to get ActivityPub message ${id} failed: ${err}`
      );
      return res.status(404).render("404", frontendConfig(res));
    }
  }
);

// GET /.well-known/nodeinfo
router.get(
  "/.well-known/nodeinfo",
  send404IfNotFederated,
  (_req: Request, res: Response) => {
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
        'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"'
      )
      .send(nodeInfo);
  }
);

// GET /.well-known/nodeinfo/2.2
router.get(
  "/.well-known/nodeinfo/2.2",
  send404IfNotFederated,
  async (_req: Request, res: Response) => {
    try {
      const eventCount = await prisma.event.count();
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
        services: { inbound: [], outbound: [] },
        openRegistrations: true,
        usage: { users: { total: eventCount } },
      };

      res
        .header(
          "Content-Type",
          'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"'
        )
        .send(nodeInfo);
    } catch (err) {
      addToLog(
        "getNodeInfo",
        "error",
        `Failed to fetch nodeinfo: ${err}`
      );
      return res.status(500).send("Error generating nodeinfo");
    }
  }
);

// GET /.well-known/webfinger
router.get(
  "/.well-known/webfinger",
  send404IfNotFederated,
  async (req: Request, res: Response) => {
    const resource = String(req.query.resource || "");
    if (!resource.startsWith("acct:")) {
      return res.status(400).send(
        'Bad request. Use "acct:USER@DOMAIN" as the resource.'
      );
    }

    const acct = resource.replace("acct:", "");
    const eventID = acct.split("@")[0];

    try {
      const event = await prisma.event.findUnique({ where: { id: eventID } });
      if (!event) {
        return res.status(404).render("404", frontendConfig(res));
      }

      const webfinger = createWebfinger(eventID, res.locals.config?.general.domain);
      const contentType = acceptsActivityPub(req)
        ? "application/activity+json"
        : "application/json";

      res.header("Content-Type", contentType).send(webfinger);
    } catch (err) {
      addToLog(
        "renderWebfinger",
        "error",
        `Webfinger for ${resource} failed: ${err}`
      );
      return res.status(500).send("Error rendering webfinger");
    }
  }
);

// GET /:eventID/followers
router.get(
  "/:eventID/followers",
  send404IfNotFederated,
  async (req: Request, res: Response) => {
    const { eventID } = req.params;

    try {
      const followers = await prisma.follower.findMany({
        where: { eventId: eventID },
      });

      const items = followers.map((f) => f.actorId).filter(Boolean) as string[];
      const collection = {
        type: "OrderedCollection",
        totalItems: items.length,
        id: `https://${res.locals.config?.general.domain}/${eventID}/followers`,
        first: {
          type: "OrderedCollectionPage",
          totalItems: items.length,
          partOf: `https://${res.locals.config?.general.domain}/${eventID}/followers`,
          orderedItems: items,
          id: `https://${res.locals.config?.general.domain}/${eventID}/followers?page=1`,
        },
        "@context": ["https://www.w3.org/ns/activitystreams"],
      };

      const contentType = acceptsActivityPub(req)
        ? "application/activity+json"
        : "application/json";

      res.header("Content-Type", contentType).send(collection);
    } catch (err) {
      addToLog(
        "renderFollowers",
        "error",
        `Followers for ${eventID} failed: ${err}`
      );
      return res.status(500).render("404", frontendConfig(res));
    }
  }
);

export default router;
