# Federation

This document is meant to be a reference for all the ActivityPub federation-related behavior that gath.io has. This means: every user action that can trigger an Activity, every Object that is created and sent out and/or stored.

## Documentation conventions

To keep things simple, sometimes you will see things formatted like `Create/Note` or `Delete/Event` or `Undo/Follow`. The thing before the slash is the Activity, and the thing after the slash is the Object inside the Activity, in an `object` property. So these are to be read as follows:

- `Create/Note`: a `Create` activity containing a `Note` in the `object` field
- `Delete/Event`: a `Delete` activity containing an `Event` in the `object` field
- `Undo/Follow`: an `Undo` activity containing a `Follow` in the `object` field

When the word "broadcast" is used in this document, it means to send an Activity to individual inbox of each of the followers of a given Actor.

This document has four main sections:

- **Federation philosophy** lays out the general model of how this is intended to federate
- **General Actor information** contains the basics of what to expect from our `Actor` objects
- **Inbox behavior** lists every incoming ActivityPub activity that the server recognizes, and tells you what it does in response to that activity, including any other ActivityPub activities it sends back out.
- **Activities triggered from the web app** tells you what circumstances on the web application cause the server to emit ActivityPub activities. (For example, when an event is updated via the web application, it lets all the ActivityPub followers know that the event has been updated.)

Please note: there is an unfortunate collision between the English language and the ActivityPub spec that can make this document confusing. When this document uses the word 'event' with a lowercase-e and not in monospace, it refers to the thing that is being tracked in gathio: events that are being organized. When this document uses the word `Event` with a capital E and in monospace, it refers to the [`Event` object defined in the ActivityStreams Vocabulary spec](https://www.w3.org/TR/activitystreams-vocabulary/#dfn-event).

## Federation philosophy

The first-class Actor in gathio is an event. So every time an event organizer creates a page for a new event, there is a new, followable Actor on the fediverse. The idea is that humans want to follow events and get updates on important changes to the events.

This differs from other ActivityPub-compatible software I've seen, which considers _people_ first class, and you follow an Actor representing a person and then you get updates on all their events. I think that is silly, and I like my model better. From my perspective, the accounts of _people_ should live on people-focused services like Mastodon/Pleroma/Friendica/etc. This service is for events, and thus events are its first-class Actor.

Also, gathio prides itself on deleting ALL data related to an event 7 days after the event is over. So we don't retain old messages once an event is deleted, and events are meant to be represented by Actors that only exist for the duration of the event plus 7 days. This is handled via thorough `Delete` messaging.

The point of federating this is so that people can simply follow an event and get all the updates they care about, and even RSVP to and comment on the event directly from their ActivityPub client. This is all without signing up or anything on gathio.

## General Actor information

Every event has an Actor. The Actor looks like this:

```json
{
    "@context": [
        "https://www.w3.org/ns/activitystreams",
        "https://w3id.org/security/v1"
    ],
    "id": "https://DOMAIN/EVENTID",
    "type": "Person",
    "preferredUsername": "EVENTID",
    "inbox": "https://DOMAIN/activitypub/inbox",
    "outbox": "https://DOMAIN/EVENTID/outbox",
    "followers": "https://DOMAIN/EVENTID/followers",
    "summary": "<p><p>DESCRIPTION</p>\n</p><p>Location: LOCATION.</p><p>Starting DATETIME (human readable).</p>",
    "name": "EVENTNAME",
    "featured": "https://DOMAIN/EVENTID/featured",
    "publicKey": {
        "id": "https://DOMAIN/EVENTID#main-key",
        "owner": "https://DOMAIN/EVENTID",
        "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nOURPUBLICKEY\n-----END PUBLIC KEY-----\n"
    },
    "icon": {
        "type": "Image",
        "mediaType": "image/jpg",
        "url": "https://DOMAIN/events/EVENTID.jpg"
    }
}
```

The Actor is of type "Person". This is because we choose to interpret the ActivityPub "Person" designation as any individual actor that can be followed and interacted with like a person.

There is always a featured post `OrderedCollection` at the url "https://DOMAIN/EVENTID/featured", and it always contains the full object of a single featured post that can be retrieved at "https://DOMAIN/EVENTID/m/featuredPost". This featured post (a "pinned post" in Mastodon parlance) contains basic instructions for how to follow and interact with the event. Implementations like Mastodon will render this in the timeline, which both lets us give users a small tutorial and also means the timeline doesn't appear "blank" on first follow.

## Inbox behavior

This section describes how gathio responds to _incoming messages_ to its inbox.

### Inbox structure

Gathio has a single, universal inbox shared between all Actors. The url is:

`https://DOMAIN/activitypub/inbox`

You can talk to gathio by POSTing to that url as you would any ActivityPub server. The `to` (or sometimes `cc` field) is what lets us know which event Actor you're interacting with.

### Follow

When the server receives a `Follow` Activity, it grabs the `actor` property on the `Follow`, and then makes a GET request to that URI with `'Content-Type': 'application/activity+json'` (we assume that `actor` is a dereferencable uri that returns us the JSON for the Actor).

Assuming we can find the Actor object, then we emit an `Accept` Activity back to the server, containing the full `Follow` that we just parsed. This lets the other server know that we have fully processed the follow request.

After this, we _also_ send a `Create` Activity to the actor's inbox, containing an `Event` object with the information for this event. This is, at the moment, future compatibility for servers that consume `Event` objects. This is sent as a "direct message", directly to the inbox with no `cc` field and not addressing the public timeline.

And finally we send the user a `Create` Activity containing a `Question` object. The `Question` is an invitation to RSVP to the event. Mastodon renders this as a poll to the user, which lets them send back to us a "Yes" RSVP directly from their client UI should they so choose. This is also sent as a "direct message". Some clients like Friendica, simply ignore `Question` objects, which is fine since the user can use built-in RSVP function of Friendica to RSVP anyway (see below).

### Unfollow

When the server receives an `Undo/Follow`, it checks to see if that follower exists in the database. If it does, then it deletes the follower from the database.

We currently do _not_ send an `Accept/Undo` in response, as I'm not sure this is ever needed in the wild.

### RSVP

The plan is to have this support two ways to RSVP:

1. The user answers the `Question` sent out to the prospective attendee in the form of a `Create/Note` in the style of Mastodon polls. This is mostly a hack for implementations like Mastodon that don't have vocabulary built in to RSVP to `Event`s.
2. The user sends a `Accept/Event` or `Undo/Accept/Event` back to our server. This is for implementations like Friendica that support `Event` and do things like automatically render incoming events in their UI with an RSVP interface. We currently don't accept `Reject/Event` or `TentativeAccept/Event` because gathio has no concept of a "Maybe" or "No" RSVP. It probably should have that in the future, at which case we could meaningfully parse this stuff.

**The `Question` method**

If the inbox gets a `Create/Note`, there is a chance that this is a response to a `Question` that we sent a user. So the first thing we do is check its `inReplyTo` property. If it matches the id of a `Question` we sent this user, and this user is still following us, then we fetch the user's profile info. This is to make sure we have their newest `preferredUsername` in their `Actor` object (falling back to `name` and then `actor`), which we will honor as the name we display on the RSVP. We then add this person to our database as an attendee of the event.

Next we confirm that the user has RSVPed. We do this by sending them a `Create/Note` via direct message. The note tells them they RSVPed, and gives them a URL they can click on to instantly un-RSVP if they need to.

**The `Accept/Event` method**

If the inbox gets an `Accept/Event`, then it assumes this is an affirmative RSVP from the actor who sent it. We check to see if the `id` of the `Event` matches the `id` of an `Event` that we sent ot this actor. If it does, then it must be a valid, affirmative RSVP. We then get the `preferredUsername` or `name` from the actor object, and add that actor to the database as an attendee. TODO: support either object URI or embedded object here.

Next we confirm that the user has RSVPed. We do this by sending them a `Create/Note` via direct message. The note tells them they RSVPed, and gives them a URL they can click on to instantly un-RSVP if they need to.

### Comment on an event

If we are CC'ed on a _public or unlisted_ `Create/Note`, then that is considered to be a comment on the event, which we store in our database and render on the event page if the administrator has enabled commenting.

After the comment is added and rendered on the front page, we also broadcast to our followers an `Announce/Note`, containing a copy of the `Note` we just received. Some implementations treat this as a "boost", where people following our account, but not necessarily following the account that wrote the `Note`, will see the `Note` rendered with credit to the original author, promoted on behalf of our account.

### Delete comment

Since a user can comment on the event via ActivityPub, they should be able to delete their comment via ActivityPub as well. When the inbox gets a `Delete/Note` and we can match the note and its sender to a comment in our database, we delete the comment and it is no longer rendered on the event page. The comment is also deleted from its profile via sending a `Delete/Note` out to all followers (corresponding to the comment that was copied to the event actor's profile, not the Note originally made by the commenter on their own server, we don't own that!).

### Incoming private messages

_TODO_: If someone tries to DM the event, we need to reply with a message like "Sorry, this service only supports posting public messages to the event page. Try contacting the event organizer directly if you need to have a private conversation."

## Activities triggered from the web app

### Create event

When an event is created, we create the webfinger and `Actor` object necessary for the Actor to be found. We also create an `Event` object that is stored in the database; this is later referenced and updated so we can send things out to calendar applications.

### Update event

When any field of an event is updated, we send a `Create/Note` out to all of the followers, containing a message that says something like "Such and such event just changed its start time to (blah), click here to see more." So this causes the message to appear in the home feed of all followers.

We also send a direct message with a `Create/Note` to everyone who is RSVPed informing them of the same thing, since changes to the event are high priority for them to know about.

And finally we send an `Update/Event` out with the new event details in the `Event` object, so that people's federated calendar apps can sync.

### Delete event

When an event is deleted by its administrator, or the event has been deleted due to it being one week after the event has ended, we send a `Delete/Actor` out to followers. This lets followers know that the event has been deleted, and their server should remove its profile from their database. (On Mastodon this results in an automatic "unfollow", which is good because we want people's follow counts to go back to normal after an event is over and has been deleted.)

We also send a `Delete/Event` out to followers. For an application like Friendica, this removes the event from the calendar of a follower.

### Comment on an event

When a comment is created via the web application, a `Create/Note` is sent to update the home timelines of all the event's followers. This way if you're following the event and someone who is not on the Fediverse makes a comment on the event, you are informed (but not direct messaged, because that would be annoying).

### TODO: Delete comment

When a comment that was created via the web app is deleted from the web app, it should also propagate a `Delete/Note` out to followers, which would remove that comment from the profile/timeline for the event.
