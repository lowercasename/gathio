// One-off backfill: events created via ICS import (before the import route
// created ActivityPub data) have no actor, so webfinger resolves their handle
// but the actor fetch returns `{}` and fediverse lookups fail. This generates
// the missing keypair, actor, Event object and featured post for every such
// event, using the same helpers as the event creation route.
//
// Usage: node dist/scripts/backfillActivityPubActors.js [--dry-run]

import mongoose from "mongoose";
import moment from "moment-timezone";
import { getConfig } from "../lib/config.js";
import Event from "../models/Event.js";
import {
  createActivityPubActor,
  createActivityPubEvent,
  createFeaturedPost,
} from "../activitypub.js";
import { generateRSAKeypair } from "../util/generator.js";
import { markdownToSanitizedHTML } from "../util/markdown.js";

const dryRun = process.argv.includes("--dry-run");
const config = getConfig();

await mongoose.connect(config.database.mongodb_url);

const events = await Event.find({
  $or: [
    { activityPubActor: { $exists: false } },
    { activityPubActor: { $in: [null, ""] as unknown as string[] } },
  ],
});

console.log(`Found ${events.length} event(s) without an ActivityPub actor.`);

let updated = 0;
for (const event of events) {
  const publicKey = event.publicKey || undefined;
  const keypair = publicKey ? null : generateRSAKeypair();
  const pubkey = publicKey || keypair!.publicKey;
  const timezone = event.timezone || "Etc/UTC";
  const startUTC = moment.tz(event.start, timezone);
  const endUTC = moment.tz(event.end, timezone);
  // Match the creation route: hide the location if registrations require approval
  const location =
    event.approveRegistrations && event.usersCanAttend
      ? null
      : event.location || null;

  const update: Record<string, unknown> = {
    activityPubActor: createActivityPubActor(
      event.id,
      config.general.domain,
      pubkey,
      markdownToSanitizedHTML(event.description || ""),
      event.name || "",
      location,
      event.image || undefined,
      startUTC,
      endUTC,
      timezone,
    ),
  };
  if (!event.activityPubEvent) {
    update.activityPubEvent = createActivityPubEvent(
      event.name || "",
      startUTC,
      endUTC,
      timezone,
      event.description || "",
      location,
    );
  }
  if (!event.activityPubMessages?.length) {
    update.activityPubMessages = [
      {
        id: `https://${config.general.domain}/${event.id}/m/featuredPost`,
        content: JSON.stringify(createFeaturedPost(event.id)),
      },
    ];
  }
  if (keypair) {
    update.publicKey = keypair.publicKey;
    update.privateKey = keypair.privateKey;
  }

  if (dryRun) {
    console.log(`[dry run] Would backfill ${event.id} (${event.name})`);
  } else {
    await Event.updateOne({ _id: event._id }, { $set: update });
    console.log(`Backfilled ${event.id} (${event.name})`);
  }
  updated++;
}

console.log(
  dryRun
    ? `Dry run complete: ${updated} event(s) would be backfilled.`
    : `Done: backfilled ${updated} event(s).`,
);

await mongoose.disconnect();
