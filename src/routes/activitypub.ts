import { Router, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import {
  createFeaturedPost,
  createWebfinger,
  processInbox,
} from "../activitypub.js";
import {
  acceptsActivityPub,
  signedFetch,
  getEventId,
} from "../lib/activitypub.js";
import { frontendConfig } from "../lib/config.js";
import Event from "../models/Event.js";
import { addToLog } from "../helpers.js";
import { getConfigMiddleware } from "../lib/middleware.js";

const router = Router();

router.use(getConfigMiddleware);

/** Send `data` with the appropriate Content-Type based on the client's Accept header. */
function sendActivityPubResponse(req: Request, res: Response, data: unknown) {
  const contentType = acceptsActivityPub(req)
    ? "application/activity+json"
    : "application/json";
  return res.header("Content-Type", contentType).send(data);
}

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
    sendActivityPubResponse(req, res, featured);
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
          sendActivityPubResponse(
            req,
            res,
            JSON.parse(message.content || "{}"),
          );
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
      // "foo@domain" or "@foo@domain"
      const activityPubAccount = resource.replace("acct:", "");
      // "foo" (strip optional leading @ before extracting the username)
      const eventID = activityPubAccount.replace(/^@/, "").replace(/@.*/, "");

      try {
        const event = await Event.findOne({ id: eventID });

        if (!event) {
          return res.status(404).render("404", frontendConfig(res));
        } else {
          sendActivityPubResponse(
            req,
            res,
            createWebfinger(eventID, res.locals.config?.general.domain),
          );
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

    if (event?.followers) {
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

      return sendActivityPubResponse(req, res, followersCollection);
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

router.post(
  "/activitypub/inbox",
  send404IfNotFederated,
  async (req: Request, res: Response) => {
    console.log("[inbox] Received AP message:", {
      type: req.body?.type,
      actor: req.body?.actor,
      object:
        typeof req.body?.object === "string"
          ? req.body.object
          : req.body?.object?.type,
    });
    // validate the incoming message
    const incomingSignature = req.get("signature");
    if (!incomingSignature) {
      console.log("[inbox] No signature header present");
      return res.status(401).send("No signature provided.");
    }
    const signature_header: Record<string, string> = incomingSignature
      .split(",")
      .reduce(
        (acc: Record<string, string>, pair: string) => {
          // Split only on the first '=' to preserve base64 padding (e.g. '==')
          // in the signature value
          const idx = pair.indexOf("=");
          if (idx === -1) return acc;
          const key = pair.slice(0, idx).trim();
          const value = pair
            .slice(idx + 1)
            .trim()
            .replace(/^"/g, "")
            .replace(/"$/g, "");
          acc[key] = value;
          return acc;
        },
        {} as Record<string, string>,
      );

    // Determine the event ID so we can sign the actor fetch request.
    // For Follow activities, the object is the event URL; for others,
    // we try the nested object, to/cc fields, or the body-level to field.
    const ourDomain = res.locals.config?.general.domain;
    let eventID: string | undefined;
    if (typeof req.body.object === "string") {
      eventID = getEventId(req.body.object);
    } else if (
      req.body.object?.object &&
      typeof req.body.object.object === "string"
    ) {
      eventID = getEventId(req.body.object.object);
    }
    // For Create/Note (comments, poll responses): extract from to/cc fields
    if (!eventID && req.body.object?.to && ourDomain) {
      const toArray = Array.isArray(req.body.object.to)
        ? req.body.object.to
        : [req.body.object.to];
      const ccArray = Array.isArray(req.body.object.cc)
        ? req.body.object.cc
        : req.body.object.cc
          ? [req.body.object.cc]
          : [];
      const ourUrl = [...toArray, ...ccArray].find(
        (url: string) =>
          typeof url === "string" && url.includes(`https://${ourDomain}/`),
      );
      if (ourUrl) {
        eventID = getEventId(ourUrl);
      }
    }
    // For Undo/Accept: extract from body-level to field
    if (!eventID && req.body.to && ourDomain) {
      const to = Array.isArray(req.body.to) ? req.body.to[0] : req.body.to;
      if (typeof to === "string" && to.includes(`https://${ourDomain}/`)) {
        eventID = getEventId(to);
      }
    }

    try {
      // Fetch the remote actor's public key, using a signed request
      // (required by instances with Authorized Fetch / Secure Mode enabled)
      const actorUrl = signature_header.keyId?.replace(/#.*$/, "");
      const actorObj = await signedFetch(actorUrl, eventID || "");

      let publicKey = "";
      if (actorObj.publicKey) {
        publicKey = actorObj.publicKey.publicKeyPem;
      }
      if (!publicKey) {
        console.log("[inbox] No public key found on actor:", actorObj.id);
        return res.status(500).send("Actor has no public key.");
      }

      const comparison_string = signature_header.headers
        .split(" ")
        .map((header: string) => {
          if (header === "(request-target)") {
            return "(request-target): post /activitypub/inbox";
          } else {
            return `${header}: ${req.get(header)}`;
          }
        })
        .join("\n");
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(comparison_string, "ascii");
      const result = verifier.verify(publicKey, signature_header.signature, "base64");
      if (result) {
        // actually process the ActivityPub message now that it's been verified
        await processInbox(req, res);
      } else {
        console.log(
          "Signature verification failed for inbox message of type:",
          req.body?.type,
        );
        return res.status(401).send("Signature could not be verified.");
      }
    } catch (err) {
      console.log("[inbox] Error during signature verification:", err);
      return res.status(500).send("Signature verification error.");
    }
  },
);

export default router;
