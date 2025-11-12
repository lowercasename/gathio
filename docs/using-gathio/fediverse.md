# Federation

This document contains instructions for how you can expect to interact with Gathio from various ActivityPub-compatible federated services.

## Gathio is federated!

While many events are hosted on the main server, https://gath.io, anyone can use the code available at this very Github repo and set up their own server. So there exist multiple Gathio instances on the Fediverse.

## Interact from your own account, no signup needed

The driving force behind all of this is: while you need to sign up for an account to _create_ an event, RSVP'ing, commenting, and following event updates doesn't require any signup. You can just subscribe to the account from your Fediverse service of choice and interact with it like you normally would.

## Mastodon

Each event created on Gathio has a randomly-generated handle that looks something like `@B2Ee4Rpa1@gath.io`. If you search for this like you search for any user, the account will pop up in your search results and you can follow it. The moment you follow it, two things happen:

1. If the event allows for people to RSVP, you'll get a DM with a poll asking if you are going to attend. If you vote "Yes" in the poll, your @ handle on your instance will be listed on the event page and it will link back to your Mastodon profile. (The following gif shows this flow in action.) If you RSVP then you will be DMed when the organiser changes any details about the event.

   [![](https://tinysubversions.com/pics/mastodon-01.gif)](https://tinysubversions.com/pics/mastodon-01.gif)

2. Regardless of whether you RSVP, following the account means that you will see any updates made by the organiser in your home timeline, like following any normal account. The event account will also automatically boost any conversation about the event so you can see what people are talking about. (This is subject to the same moderation as any Gathio event: if the event organiser deletes the comment from the event page, then the boost will be un-boosted as well.)

If you'd like to comment on the event, you can simply @ the event handle. If the event organiser has enabled commenting on the event, then your comment will automatically appear on the "comments" section of the page. Comments made via @ notification _must_ be public or unlisted, since all Gathio events are public and we don't want to post your private message where everyone can see. If you try to make a DM comment, you'll get a reply back saying that you should contact the event organiser directly.

## Friendica

On Friendica, you can search for the account and add it as a contact. If you do this, then you'll get an event in your "Latest activity" notifications. The event will have the standard check box to RSVP. If you click that, you'll be RSVP'ed in your own local calendar. If the event organiser has enabled RSVPs, then you'll also be listed on the event page itself with your handle and a link to your Friendica profile page.

The event will also show up in your events calendar!

[![](https://tinysubversions.com/pics/friendica-01.gif)](https://tinysubversions.com/pics/friendica-01.gif)

## Technical specification

For developers and maintainers, the [technical specification](https://github.com/lowercasename/gathio/blob/main/FEDERATION.md) defines the expected behaviour of federation on Gathio instances.
