const fs = require('fs');

const express = require('express');

const mongoose = require('mongoose');

// This alphabet (used to generate all event, group, etc. IDs) is missing '-'
// because ActivityPub doesn't like it in IDs
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_', 21);

const randomstring = require("randomstring");

const { body, validationResult } = require('express-validator/check');

const router = express.Router();

const Event = mongoose.model('Event');
const EventGroup = mongoose.model('EventGroup');
const addToLog = require('./helpers.js').addToLog;

var moment = require('moment-timezone');

const marked = require('marked');

const generateRSAKeypair = require('generate-rsa-keypair');
const crypto = require('crypto');
const request = require('request');
const niceware = require('niceware');

const domain = require('./config/domain.js').domain;
const contactEmail = require('./config/domain.js').email;
const mailService = require('./config/domain.js').mailService;
const siteName = require('./config/domain.js').sitename;
const siteLogo = require('./config/domain.js').logo_url;
let isFederated = require('./config/domain.js').isFederated;
let showKofi = require('./config/domain.js').showKofi;
// if the federation config isn't set, things are federated by default
if (isFederated === undefined) {
  isFederated = true;
}
const ap = require('./activitypub.js');

// Extra marked renderer (used to render plaintext event description for page metadata)
// Adapted from https://dustinpfister.github.io/2017/11/19/nodejs-marked/
// &#63; to ? helper
function htmlEscapeToText(text) {
  return text.replace(/\&\#[0-9]*;|&amp;/g, function (escapeCode) {
    if (escapeCode.match(/amp/)) {
      return '&';
    }
    return String.fromCharCode(escapeCode.match(/[0-9]+/));
  });
}

function render_plain() {
  var render = new marked.Renderer();
  // render just the text of a link, strong, em
  render.link = function (href, title, text) {
    return text;
  };
  render.strong = function (text) {
    return text;
  }
  render.em = function (text) {
    return text;
  }
  // render just the text of a paragraph
  render.paragraph = function (text) {
    return htmlEscapeToText(text) + '\r\n';
  };
  // render nothing for headings, images, and br
  render.heading = function (text, level) {
    return '';
  };
  render.image = function (href, title, text) {
    return '';
  };
  render.br = function () {
    return '';
  };
  return render;
}

const ical = require('ical');
const { exportIcal } = require('./helpers.js');

const sgMail = require('@sendgrid/mail');
const nodemailer = require("nodemailer");

const apiCredentials = require('./config/api.js');

let sendEmails = false;
let nodemailerTransporter;
if (mailService) {
  switch (mailService) {
    case 'sendgrid':
      sgMail.setApiKey(apiCredentials.sendgrid);
      console.log("Sendgrid is ready to send emails.");
      sendEmails = true;
      break;
    case 'nodemailer':
      nodemailerTransporter = nodemailer.createTransport({
        host: apiCredentials.smtpServer,
        port: apiCredentials.smtpPort,
        secure: false, // true for 465, false for other ports
        auth: {
          user: apiCredentials.smtpUsername, // generated ethereal user
          pass: apiCredentials.smtpPassword, // generated ethereal password
        },
      });
      nodemailerTransporter.verify((error, success) => {
        if (error) {
          console.log(error);
        } else {
          console.log("Nodemailer SMTP server is ready to send emails.");
          sendEmails = true;
        }
      });
      break;
    default:
      console.error('You have not configured this Gathio instance to send emails! This means that event creators will not receive emails when their events are created, which means they may end up locked out of editing events. Consider setting up an email service.')
  }
}

const fileUpload = require('express-fileupload');
var Jimp = require('jimp');
router.use(fileUpload());

// SCHEDULED DELETION
const schedule = require('node-schedule');
schedule.scheduleJob('59 23 * * *', function (fireDate) {
  const too_old = moment.tz('Etc/UTC').subtract(7, 'days').toDate();
  console.log("Old event deletion running! Deleting all events concluding before ", too_old);

  Event.find({ end: { $lte: too_old } }).then((oldEvents) => {
    oldEvents.forEach(event => {
      const deleteEventFromDB = (id) => {
        Event.remove({ "_id": id })
          .then(response => {
            addToLog("deleteOldEvents", "success", "Old event " + id + " deleted");
          }).catch((err) => {
            addToLog("deleteOldEvents", "error", "Attempt to delete old event " + id + " failed with error: " + err);
          });
      }

      if (event.image) {
        fs.unlink(global.appRoot + '/public/events/' + event.image, (err) => {
          if (err) {
            addToLog("deleteOldEvents", "error", "Attempt to delete event image for old event " + event.id + " failed with error: " + err);
          }
          // Image removed
          addToLog("deleteOldEvents", "error", "Image deleted for old event " + event.id);
        })
      }
      // Check if event has ActivityPub fields
      if (event.activityPubActor && event.activityPubEvent) {
        // Broadcast a Delete profile message to all followers so that at least Mastodon servers will delete their local profile information
        const guidUpdateObject = crypto.randomBytes(16).toString('hex');
        const jsonUpdateObject = JSON.parse(event.activityPubActor);
        const jsonEventObject = JSON.parse(event.activityPubEvent);
        // first broadcast AP messages, THEN delete from DB
        ap.broadcastDeleteMessage(jsonUpdateObject, event.followers, event.id, function (statuses) {
          ap.broadcastDeleteMessage(jsonEventObject, event.followers, event.id, function (statuses) {
            deleteEventFromDB(event._id);
          });
        });
      } else {
        // No ActivityPub data - simply delete the event
        deleteEventFromDB(event._id);
      }
    })
  }).catch((err) => {
    addToLog("deleteOldEvents", "error", "Attempt to delete old event " + event.id + " failed with error: " + err);
  });

  // TODO: While we're here, also remove all provisioned event attendees over a day
  // old (they're not going to become active)
});

// FRONTEND ROUTES

router.get('/', (req, res) => {
  res.render('home', {
    domain,
    email: contactEmail,
    siteName,
    showKofi,
  });
});

router.get('/new', (req, res) => {
  res.render('home');
});

router.get('/new/event', (req, res) => {
  res.render('newevent', {
    domain: domain,
    email: contactEmail,
    siteName: siteName,
  });
});
router.get('/new/event/public', (req, res) => {
  let isPrivate = false;
  let isPublic = true;
  let isOrganisation = false;
  let isUnknownType = false;
  res.render('newevent', {
    title: 'New event',
    isPrivate: isPrivate,
    isPublic: isPublic,
    isOrganisation: isOrganisation,
    isUnknownType: isUnknownType,
    eventType: 'public',
    domain: domain,
    email: contactEmail,
    siteName: siteName,
  });
})

// return the JSON for the featured/pinned post for this event
router.get('/:eventID/featured', (req, res) => {
  if (!isFederated) return res.sendStatus(404);
  const { eventID } = req.params;
  const guidObject = crypto.randomBytes(16).toString('hex');
  const featured = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": `https://${domain}/${eventID}/featured`,
    "type": "OrderedCollection",
    "orderedItems": [
      ap.createFeaturedPost(eventID)
    ]
  }
  res.json(featured);
});

// return the JSON for a given activitypub message
router.get('/:eventID/m/:hash', (req, res) => {
  if (!isFederated) return res.sendStatus(404);
  const { hash, eventID } = req.params;
  const id = `https://${domain}/${eventID}/m/${hash}`;

  Event.findOne({
    id: eventID
  })
    .then((event) => {
      if (!event) {
        res.status(404);
        res.render('404', { url: req.url });
      }
      else {
        const message = event.activityPubMessages.find(el => el.id === id);
        if (message) {
          return res.json(JSON.parse(message.content));
        }
        else {
          res.status(404);
          return res.render('404', { url: req.url });
        }
      }
    })
    .catch((err) => {
      addToLog("getActivityPubMessage", "error", "Attempt to get Activity Pub Message for " + id + " failed with error: " + err);
      res.status(404);
      res.render('404', { url: req.url });
      return;
    });
});

// return the webfinger record required for the initial activitypub handshake
router.get('/.well-known/webfinger', (req, res) => {
  if (!isFederated) return res.sendStatus(404);
  let resource = req.query.resource;
  if (!resource || !resource.includes('acct:')) {
    return res.status(400).send('Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.');
  }
  else {
    // "foo@domain"
    let activityPubAccount = resource.replace('acct:', '');
    // "foo"
    let eventID = activityPubAccount.replace(/@.*/, '');
    Event.findOne({
      id: eventID
    })
      .then((event) => {
        if (!event) {
          res.status(404);
          res.render('404', { url: req.url });
        }
        else {
          res.json(ap.createWebfinger(eventID, domain));
        }
      })
      .catch((err) => {
        addToLog("renderWebfinger", "error", "Attempt to render webfinger for " + req.params.eventID + " failed with error: " + err);
        res.status(404);
        res.render('404', { url: req.url });
        return;
      });
  }
});

router.get('/:eventID', (req, res) => {
  Event.findOne({
    id: req.params.eventID
  })
    .lean() // Required, see: https://stackoverflow.com/questions/59690923/handlebars-access-has-been-denied-to-resolve-the-property-from-because-it-is
    .populate('eventGroup')
    .then((event) => {
      if (event) {
        const parsedLocation = event.location.replace(/\s+/g, '+');
        let displayDate;
        if (moment.tz(event.end, event.timezone).isSame(event.start, 'day')) {
          // Happening during one day
          displayDate = moment.tz(event.start, event.timezone).format('dddd D MMMM YYYY [<span class="text-muted">from</span>] h:mm a') + moment.tz(event.end, event.timezone).format(' [<span class="text-muted">to</span>] h:mm a [<span class="text-muted">](z)[</span>]');
        }
        else {
          displayDate = moment.tz(event.start, event.timezone).format('dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a') + moment.tz(event.end, event.timezone).format(' [<span class="text-muted">–</span>] dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a [<span class="text-muted">](z)[</span>]');
        }
        let eventStartISO = moment.tz(event.start, "Etc/UTC").toISOString();
        let eventEndISO = moment.tz(event.end, "Etc/UTC").toISOString();
        let parsedStart = moment.tz(event.start, event.timezone).format('YYYYMMDD[T]HHmmss');
        let parsedEnd = moment.tz(event.end, event.timezone).format('YYYYMMDD[T]HHmmss');
        let eventHasConcluded = false;
        if (moment.tz(event.end, event.timezone).isBefore(moment.tz(event.timezone))) {
          eventHasConcluded = true;
        }
        let eventHasBegun = false;
        if (moment.tz(event.start, event.timezone).isBefore(moment.tz(event.timezone))) {
          eventHasBegun = true;
        }
        let fromNow = moment.tz(event.start, event.timezone).fromNow();
        let parsedDescription = marked.parse(event.description);
        let eventEditToken = event.editToken;

        let escapedName = event.name.replace(/\s+/g, '+');

        let eventHasCoverImage = false;
        if (event.image) {
          eventHasCoverImage = true;
        }
        else {
          eventHasCoverImage = false;
        }
        let eventHasHost = false;
        if (event.hostName) {
          eventHasHost = true;
        }
        else {
          eventHasHost = false;
        }
        let firstLoad = false;
        if (event.firstLoad === true) {
          firstLoad = true;
          Event.findOneAndUpdate({ id: req.params.eventID }, { firstLoad: false }, function (err, raw) {
            if (err) {
              res.send(err);
            }
          });
        }
        let editingEnabled = false;
        if (Object.keys(req.query).length !== 0) {
          if (!req.query.e) {
            editingEnabled = false;
            console.log("No edit token set");
          }
          else {
            if (req.query.e === eventEditToken) {
              editingEnabled = true;
            }
            else {
              editingEnabled = false;
            }
          }
        }
        let eventAttendees = event.attendees.sort((a, b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0))
          .map(el => {
            if (!el.id) {
              el.id = el._id;
            }
            if (el.number > 1) {
              el.name = `${el.name} (${el.number} people)`;
            }
            return el;
          })
          .filter((obj, pos, arr) => {
            return obj.status === 'attending' && arr.map(mapObj => mapObj.id).indexOf(obj.id) === pos;
          });

        let spotsRemaining, noMoreSpots;
        let numberOfAttendees = eventAttendees.reduce((acc, attendee) => {
          if (attendee.status === 'attending') {
            return acc + attendee.number || 1;
          }
          return acc;
        }, 0);
        if (event.maxAttendees) {
          spotsRemaining = event.maxAttendees - numberOfAttendees;
          if (spotsRemaining <= 0) {
            noMoreSpots = true;
          }
        }
        let metadata = {
          title: event.name,
          description: marked.parse(event.description, { renderer: render_plain() }).split(" ").splice(0, 40).join(" ").trim(),
          image: (eventHasCoverImage ? `https://${domain}/events/` + event.image : null),
          url: `https://${domain}/` + req.params.eventID
        };
        if (req.headers.accept && (req.headers.accept.includes('application/activity+json') || req.headers.accept.includes('application/json') || req.headers.accept.includes('application/json+ld'))) {
          res.json(JSON.parse(event.activityPubActor));
        }
        else {
          res.set("X-Robots-Tag", "noindex");
          res.render('event', {
            domain: domain,
            isFederated: isFederated,
            email: contactEmail,
            title: event.name,
            escapedName: escapedName,
            eventData: event,
            eventAttendees: eventAttendees,
            numberOfAttendees,
            spotsRemaining: spotsRemaining,
            noMoreSpots: noMoreSpots,
            eventStartISO: eventStartISO,
            eventEndISO: eventEndISO,
            parsedLocation: parsedLocation,
            parsedStart: parsedStart,
            parsedEnd: parsedEnd,
            displayDate: displayDate,
            fromNow: fromNow,
            timezone: event.timezone,
            parsedDescription: parsedDescription,
            editingEnabled: editingEnabled,
            eventHasCoverImage: eventHasCoverImage,
            eventHasHost: eventHasHost,
            firstLoad: firstLoad,
            eventHasConcluded: eventHasConcluded,
            eventHasBegun: eventHasBegun,
            metadata: metadata,
            siteName: siteName
          })
        }
      }
      else {
        res.status(404);
        res.render('404', { url: req.url });
      }

    })
    .catch((err) => {
      addToLog("displayEvent", "error", "Attempt to display event " + req.params.eventID + " failed with error: " + err);
      console.log(err)
      res.status(404);
      res.render('404', { url: req.url });
      return;
    });
})

router.get('/:eventID/followers', (req, res) => {
  if (!isFederated) return res.sendStatus(404);
  const eventID = req.params.eventID;
  Event.findOne({
    id: eventID
  })
    .then((event) => {
      if (event) {
        const followers = event.followers.map(el => el.actorId);
        let followersCollection = {
          "type": "OrderedCollection",
          "totalItems": followers.length,
          "id": `https://${domain}/${eventID}/followers`,
          "first": {
            "type": "OrderedCollectionPage",
            "totalItems": followers.length,
            "partOf": `https://${domain}/${eventID}/followers`,
            "orderedItems": followers,
            "id": `https://${domain}/${eventID}/followers?page=1`
          },
          "@context": ["https://www.w3.org/ns/activitystreams"]
        };
        return res.json(followersCollection);
      }
      else {
        return res.status(400).send('Bad request.');
      }
    })
})

router.get('/group/:eventGroupID', (req, res) => {
  EventGroup.findOne({
    id: req.params.eventGroupID
  })
    .lean() // Required, see: https://stackoverflow.com/questions/59690923/handlebars-access-has-been-denied-to-resolve-the-property-from-because-it-is
    .then(async (eventGroup) => {
      if (eventGroup) {
        let parsedDescription = marked.parse(eventGroup.description);
        let eventGroupEditToken = eventGroup.editToken;

        let escapedName = eventGroup.name.replace(/\s+/g, '+');

        let eventGroupHasCoverImage = false;
        if (eventGroup.image) {
          eventGroupHasCoverImage = true;
        }
        else {
          eventGroupHasCoverImage = false;
        }
        let eventGroupHasHost = false;
        if (eventGroup.hostName) {
          eventGroupHasHost = true;
        }
        else {
          eventGroupHasHost = false;
        }

        let events = await Event.find({ eventGroup: eventGroup._id }).lean().sort('start');

        events.map(event => {
          if (moment.tz(event.end, event.timezone).isSame(event.start, 'day')) {
            // Happening during one day
            event.displayDate = moment.tz(event.start, event.timezone).format('D MMM YYYY');
          }
          else {
            event.displayDate = moment.tz(event.start, event.timezone).format('D MMM YYYY') + moment.tz(event.end, event.timezone).format(' - D MMM YYYY');
          }
          if (moment.tz(event.end, event.timezone).isBefore(moment.tz(event.timezone))) {
            event.eventHasConcluded = true;
          } else {
            event.eventHasConcluded = false;
          }
          return (({ id, name, displayDate, eventHasConcluded }) => ({ id, name, displayDate, eventHasConcluded }))(event);
        });

        let upcomingEventsExist = false;
        if (events.some(e => e.eventHasConcluded === false)) {
          upcomingEventsExist = true;
        }

        let firstLoad = false;
        if (eventGroup.firstLoad === true) {
          firstLoad = true;
          EventGroup.findOneAndUpdate({ id: req.params.eventGroupID }, { firstLoad: false }, function (err, raw) {
            if (err) {
              res.send(err);
            }
          });
        }
        let editingEnabled = false;
        if (Object.keys(req.query).length !== 0) {
          if (!req.query.e) {
            editingEnabled = false;
            console.log("No edit token set");
          }
          else {
            if (req.query.e === eventGroupEditToken) {
              editingEnabled = true;
            }
            else {
              editingEnabled = false;
            }
          }
        }
        let metadata = {
          title: eventGroup.name,
          description: marked.parse(eventGroup.description, { renderer: render_plain() }).split(" ").splice(0, 40).join(" ").trim(),
          image: (eventGroupHasCoverImage ? `https://${domain}/events/` + eventGroup.image : null),
          url: `https://${domain}/` + req.params.eventID
        };
        res.set("X-Robots-Tag", "noindex");
        res.render('eventgroup', {
          domain: domain,
          title: eventGroup.name,
          eventGroupData: eventGroup,
          escapedName: escapedName,
          events: events,
          upcomingEventsExist: upcomingEventsExist,
          parsedDescription: parsedDescription,
          editingEnabled: editingEnabled,
          eventGroupHasCoverImage: eventGroupHasCoverImage,
          eventGroupHasHost: eventGroupHasHost,
          firstLoad: firstLoad,
          metadata: metadata
        })
      }
      else {
        res.status(404);
        res.render('404', { url: req.url });
      }

    })
    .catch((err) => {
      addToLog("displayEventGroup", "error", "Attempt to display event group " + req.params.eventGroupID + " failed with error: " + err);
      console.log(err)
      res.status(404);
      res.render('404', { url: req.url });
      return;
    });
})

router.get('/group/:eventGroupID/feed.ics', (req, res) => {
  EventGroup.findOne({
    id: req.params.eventGroupID
  })
    .lean() // Required, see: https://stackoverflow.com/questions/59690923/handlebars-access-has-been-denied-to-resolve-the-property-from-because-it-is
    .then(async (eventGroup) => {
      if (eventGroup) {
        let events = await Event.find({ eventGroup: eventGroup._id }).lean().sort('start');
        const string = exportIcal(events, eventGroup.name);
        res.set('Content-Type', 'text/calendar');
        return res.send(string);
      }
    })
    .catch((err) => {
      addToLog("eventGroupFeed", "error", "Attempt to display event group feed for " + req.params.eventGroupID + " failed with error: " + err);
      console.log(err)
      res.status(404);
      res.render('404', { url: req.url });
      return;
    });
});

router.get('/exportevent/:eventID', (req, res) => {
  Event.findOne({
    id: req.params.eventID
  })
    .populate('eventGroup')
    .then((event) => {
      if (event) {
        const string = exportIcal([event]);
        res.send(string);
      }
    })
    .catch((err) => {
      addToLog("exportEvent", "error", "Attempt to export event " + req.params.eventID + " failed with error: " + err);
      console.log(err)
      res.status(404);
      res.render('404', { url: req.url });
      return;
    });
});

router.get('/exportgroup/:eventGroupID', (req, res) => {
  EventGroup.findOne({
    id: req.params.eventGroupID
  })
    .lean() // Required, see: https://stackoverflow.com/questions/59690923/handlebars-access-has-been-denied-to-resolve-the-property-from-because-it-is
    .then(async (eventGroup) => {
      if (eventGroup) {
        let events = await Event.find({ eventGroup: eventGroup._id }).lean().sort('start');
        const string = exportIcal(events);
        res.send(string);
      }
    })
    .catch((err) => {
      addToLog("exportEvent", "error", "Attempt to export event group " + req.params.eventGroupID + " failed with error: " + err);
      console.log(err)
      res.status(404);
      res.render('404', { url: req.url });
      return;
    });
});

// BACKEND ROUTES

router.post('/newevent', async (req, res) => {
  let eventID = nanoid();
  let editToken = randomstring.generate();
  let eventImageFilename = "";
  let isPartOfEventGroup = false;
  if (req.files && Object.keys(req.files).length !== 0) {
    let eventImageBuffer = req.files.imageUpload.data;
    Jimp.read(eventImageBuffer, (err, img) => {
      if (err) addToLog("Jimp", "error", "Attempt to edit image failed with error: " + err);
      img
        .resize(920, Jimp.AUTO) // resize
        .quality(80) // set JPEG quality
        .write('./public/events/' + eventID + '.jpg'); // save
    });
    eventImageFilename = eventID + '.jpg';
  }
  let startUTC = moment.tz(req.body.eventStart, 'D MMMM YYYY, hh:mm a', req.body.timezone);
  let endUTC = moment.tz(req.body.eventEnd, 'D MMMM YYYY, hh:mm a', req.body.timezone);
  let eventGroup;
  if (req.body.eventGroupCheckbox) {
    eventGroup = await EventGroup.findOne({
      id: req.body.eventGroupID,
      editToken: req.body.eventGroupEditToken
    })
    if (eventGroup) {
      isPartOfEventGroup = true;
    }
  }

  // generate RSA keypair for ActivityPub
  let pair = generateRSAKeypair();

  const event = new Event({
    id: eventID,
    type: req.body.eventType,
    name: req.body.eventName,
    location: req.body.eventLocation,
    start: startUTC,
    end: endUTC,
    timezone: req.body.timezone,
    description: req.body.eventDescription,
    image: eventImageFilename,
    creatorEmail: req.body.creatorEmail,
    url: req.body.eventURL,
    hostName: req.body.hostName,
    viewPassword: req.body.viewPassword,
    editPassword: req.body.editPassword,
    editToken: editToken,
    eventGroup: isPartOfEventGroup ? eventGroup._id : null,
    usersCanAttend: req.body.joinCheckbox ? true : false,
    showUsersList: req.body.guestlistCheckbox ? true : false,
    usersCanComment: req.body.interactionCheckbox ? true : false,
    maxAttendees: req.body.maxAttendees,
    firstLoad: true,
    activityPubActor: ap.createActivityPubActor(eventID, domain, pair.public, marked.parse(req.body.eventDescription), req.body.eventName, req.body.eventLocation, eventImageFilename, startUTC, endUTC, req.body.timezone),
    activityPubEvent: ap.createActivityPubEvent(req.body.eventName, startUTC, endUTC, req.body.timezone, req.body.eventDescription, req.body.eventLocation),
    activityPubMessages: [{ id: `https://${domain}/${eventID}/m/featuredPost`, content: JSON.stringify(ap.createFeaturedPost(eventID, req.body.eventName, startUTC, endUTC, req.body.timezone, req.body.eventDescription, req.body.eventLocation)) }],
    publicKey: pair.public,
    privateKey: pair.private
  });
  event.save()
    .then((event) => {
      addToLog("createEvent", "success", "Event " + eventID + "created");
      // Send email with edit link
      if (req.body.creatorEmail && sendEmails) {
        req.app.get('hbsInstance').renderView('./views/emails/createevent.handlebars', { eventID, editToken, siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
          const msg = {
            to: req.body.creatorEmail,
            from: {
              name: siteName,
              email: contactEmail,
              address: contactEmail
            },
            subject: `${siteName}: ${req.body.eventName}`,
            html,
          };
          switch (mailService) {
            case 'sendgrid':
              sgMail.send(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
            case 'nodemailer':
              nodemailerTransporter.sendMail(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
          }
        });
      }
      // If the event was added to a group, send an email to any group
      // subscribers
      if (event.eventGroup && sendEmails) {
        EventGroup.findOne({ _id: event.eventGroup._id })
          .then((eventGroup) => {
            const subscribers = eventGroup.subscribers.reduce((acc, current) => {
              if (acc.includes(current.email)) {
                return acc;
              }
              return [current.email, ...acc];
            }, []);
            subscribers.forEach(emailAddress => {
              req.app.get('hbsInstance').renderView('./views/emails/eventgroupupdated.handlebars', { siteName, siteLogo, domain, eventID: req.params.eventID, eventGroupName: eventGroup.name, eventName: event.name, eventID: event.id, eventGroupID: eventGroup.id, emailAddress: encodeURIComponent(emailAddress), cache: true, layout: 'email.handlebars' }, function (err, html) {
                const msg = {
                  to: emailAddress,
                  from: {
                    name: siteName,
                    email: contactEmail,
                  },
                  subject: `${siteName}: New event in ${eventGroup.name}`,
                  html,
                };
                switch (mailService) {
                  case 'sendgrid':
                    sgMail.send(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                  case 'nodemailer':
                    nodemailerTransporter.sendMail(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                }
              });
            });
          });
      }
      res.writeHead(302, {
        'Location': '/' + eventID + '?e=' + editToken
      });
      res.end();
    })
    .catch((err) => { res.status(500).send('Database error, please try again :( - ' + err); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err); });
});

router.post('/importevent', (req, res) => {
  let eventID = nanoid();
  let editToken = randomstring.generate();
  if (req.files && Object.keys(req.files).length !== 0) {
    let iCalObject = ical.parseICS(req.files.icsImportControl.data.toString('utf8'));
    let importedEventData = iCalObject[Object.keys(iCalObject)];

    let creatorEmail;
    if (req.body.creatorEmail) {
      creatorEmail = req.body.creatorEmail;
    } else if (importedEventData.organizer) {
      creatorEmail = importedEventData.organizer.val.replace("MAILTO:", "");
    }

    const event = new Event({
      id: eventID,
      type: 'public',
      name: importedEventData.summary,
      location: importedEventData.location,
      start: importedEventData.start,
      end: importedEventData.end,
      timezone: typeof importedEventData.start.tz !== 'undefined' ? importedEventData.start.tz : "Etc/UTC",
      description: importedEventData.description,
      image: '',
      creatorEmail: creatorEmail,
      url: '',
      hostName: importedEventData.organizer ? importedEventData.organizer.params.CN.replace(/["]+/g, '') : "",
      viewPassword: '',
      editPassword: '',
      editToken: editToken,
      usersCanAttend: false,
      showUsersList: false,
      usersCanComment: false,
      firstLoad: true
    });
    event.save()
      .then(() => {
        addToLog("createEvent", "success", "Event " + eventID + " created");
        // Send email with edit link
        if (creatorEmail && sendEmails) {
          req.app.get('hbsInstance').renderView('./views/emails/createevent.handlebars', { eventID, editToken, siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
            const msg = {
              to: req.body.creatorEmail,
              from: {
                name: siteName,
                email: contactEmail,
                address: contactEmail
              },
              subject: `${siteName}: ${importedEventData.summary}`,
              html,
            };
            switch (mailService) {
              case 'sendgrid':
                sgMail.send(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
              case 'nodemailer':
                nodemailerTransporter.sendMail(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
            }
          });
        }
        res.writeHead(302, {
          'Location': '/' + eventID + '?e=' + editToken
        });
        res.end();
      })
      .catch((err) => { res.send('Database error, please try again :('); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err); });
  }
  else {
    console.log("Files array is empty!")
    res.status(500).end();
  }
});

router.post('/neweventgroup', (req, res) => {
  let eventGroupID = nanoid();
  let editToken = randomstring.generate();
  let eventGroupImageFilename = "";
  if (req.files && Object.keys(req.files).length !== 0) {
    let eventImageBuffer = req.files.imageUpload.data;
    Jimp.read(eventImageBuffer, (err, img) => {
      if (err) addToLog("Jimp", "error", "Attempt to edit image failed with error: " + err);
      img
        .resize(920, Jimp.AUTO) // resize
        .quality(80) // set JPEG quality
        .write('./public/events/' + eventGroupID + '.jpg'); // save
    });
    eventGroupImageFilename = eventGroupID + '.jpg';
  }
  const eventGroup = new EventGroup({
    id: eventGroupID,
    name: req.body.eventGroupName,
    description: req.body.eventGroupDescription,
    image: eventGroupImageFilename,
    creatorEmail: req.body.creatorEmail,
    url: req.body.eventGroupURL,
    hostName: req.body.hostName,
    editToken: editToken,
    firstLoad: true
  });
  eventGroup.save()
    .then(() => {
      addToLog("createEventGroup", "success", "Event group " + eventGroupID + " created");
      // Send email with edit link
      if (req.body.creatorEmail && sendEmails) {
        req.app.get('hbsInstance').renderView('./views/emails/createeventgroup.handlebars', { eventGroupID, editToken, siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
          const msg = {
            to: req.body.creatorEmail,
            from: {
              name: siteName,
              email: contactEmail,
              address: contactEmail
            },
            subject: `${siteName}: ${req.body.eventGroupName}`,
            html,
          };
          switch (mailService) {
            case 'sendgrid':
              sgMail.send(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
            case 'nodemailer':
              nodemailerTransporter.sendMail(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
          }
        });
      }
      res.writeHead(302, {
        'Location': '/group/' + eventGroupID + '?e=' + editToken
      });
      res.end();
    })
    .catch((err) => { res.send('Database error, please try again :( - ' + err); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err); });
});

router.post('/verifytoken/event/:eventID', (req, res) => {
  Event.findOne({
    id: req.params.eventID,
    editToken: req.body.editToken,
  })
    .then(event => {
      if (event) return res.sendStatus(200);
      return res.sendStatus(404);
    })
});

router.post('/verifytoken/group/:eventGroupID', (req, res) => {
  EventGroup.findOne({
    id: req.params.eventGroupID,
    editToken: req.body.editToken,
  })
    .then(group => {
      if (group) return res.sendStatus(200);
      return res.sendStatus(404);
    })
});


router.post('/editevent/:eventID/:editToken', (req, res) => {
  let submittedEditToken = req.params.editToken;
  Event.findOne(({
    id: req.params.eventID,
  }))
    .then(async (event) => {
      if (event.editToken === submittedEditToken) {
        // Token matches

        // If there is a new image, upload that first
        let eventID = req.params.eventID;
        let eventImageFilename = event.image;
        if (req.files && Object.keys(req.files).length !== 0) {
          let eventImageBuffer = req.files.imageUpload.data;
          Jimp.read(eventImageBuffer, (err, img) => {
            if (err) throw err;
            img
              .resize(920, Jimp.AUTO) // resize
              .quality(80) // set JPEG
              .write('./public/events/' + eventID + '.jpg'); // save
          });
          eventImageFilename = eventID + '.jpg';
        }
        let startUTC = moment.tz(req.body.eventStart, 'D MMMM YYYY, hh:mm a', req.body.timezone);
        let endUTC = moment.tz(req.body.eventEnd, 'D MMMM YYYY, hh:mm a', req.body.timezone);

        let isPartOfEventGroup = false;
        let eventGroup;
        if (req.body.eventGroupCheckbox) {
          eventGroup = await EventGroup.findOne({
            id: req.body.eventGroupID,
            editToken: req.body.eventGroupEditToken
          })
          if (eventGroup) {
            isPartOfEventGroup = true;
          }
        }
        const updatedEvent = {
          name: req.body.eventName,
          location: req.body.eventLocation,
          start: startUTC,
          end: endUTC,
          timezone: req.body.timezone,
          description: req.body.eventDescription,
          url: req.body.eventURL,
          hostName: req.body.hostName,
          image: eventImageFilename,
          usersCanAttend: req.body.joinCheckbox ? true : false,
          showUsersList: req.body.guestlistCheckbox ? true : false,
          usersCanComment: req.body.interactionCheckbox ? true : false,
          maxAttendees: req.body.maxAttendeesCheckbox ? req.body.maxAttendees : null,
          eventGroup: isPartOfEventGroup ? eventGroup._id : null,
          activityPubActor: ap.updateActivityPubActor(JSON.parse(event.activityPubActor || null), req.body.eventDescription, req.body.eventName, req.body.eventLocation, eventImageFilename, startUTC, endUTC, req.body.timezone),
          activityPubEvent: ap.updateActivityPubEvent(JSON.parse(event.activityPubEvent || null), req.body.eventName, req.body.startUTC, req.body.endUTC, req.body.timezone),
        }
        let diffText = '<p>This event was just updated with new information.</p><ul>';
        let displayDate;
        if (event.name !== updatedEvent.name) {
          diffText += `<li>the event name changed to ${updatedEvent.name}</li>`;
        }
        if (event.location !== updatedEvent.location) {
          diffText += `<li>the location changed to ${updatedEvent.location}</li>`;
        }
        if (event.start.toISOString() !== updatedEvent.start.toISOString()) {
          displayDate = moment.tz(updatedEvent.start, updatedEvent.timezone).format('dddd D MMMM YYYY h:mm a');
          diffText += `<li>the start time changed to ${displayDate}</li>`;
        }
        if (event.end.toISOString() !== updatedEvent.end.toISOString()) {
          displayDate = moment.tz(updatedEvent.end, updatedEvent.timezone).format('dddd D MMMM YYYY h:mm a');
          diffText += `<li>the end time changed to ${displayDate}</li>`;
        }
        if (event.timezone !== updatedEvent.timezone) {
          diffText += `<li>the time zone changed to ${updatedEvent.timezone}</li>`;
        }
        if (event.description !== updatedEvent.description) {
          diffText += `<li>the event description changed</li>`;
        }
        diffText += `</ul>`;
        Event.findOneAndUpdate({ id: req.params.eventID }, updatedEvent, function (err, raw) {
          if (err) {
            addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err);
            res.send(err);
          }
        })
          .then(() => {
            addToLog("editEvent", "success", "Event " + req.params.eventID + " edited");
            // send update to ActivityPub subscribers
            Event.findOne({ id: req.params.eventID }, function (err, event) {
              if (!event) return;
              let attendees = event.attendees.filter(el => el.id);
              if (!err) {
                // broadcast an identical message to all followers, will show in home timeline
                const guidObject = crypto.randomBytes(16).toString('hex');
                const jsonObject = {
                  "@context": "https://www.w3.org/ns/activitystreams",
                  "id": `https://${domain}/${req.params.eventID}/m/${guidObject}`,
                  "name": `RSVP to ${event.name}`,
                  "type": "Note",
                  'cc': 'https://www.w3.org/ns/activitystreams#Public',
                  "content": `${diffText} See here: <a href="https://${domain}/${req.params.eventID}">https://${domain}/${req.params.eventID}</a>`,
                }
                ap.broadcastCreateMessage(jsonObject, event.followers, eventID)
                // also broadcast an Update profile message to all followers so that at least Mastodon servers will update the local profile information
                const jsonUpdateObject = JSON.parse(event.activityPubActor);
                ap.broadcastUpdateMessage(jsonUpdateObject, event.followers, eventID)
                // also broadcast an Update/Event for any calendar apps that are consuming our Events
                const jsonEventObject = JSON.parse(event.activityPubEvent);
                ap.broadcastUpdateMessage(jsonEventObject, event.followers, eventID)

                // DM to attendees
                for (const attendee of attendees) {
                  const jsonObject = {
                    "@context": "https://www.w3.org/ns/activitystreams",
                    "name": `RSVP to ${event.name}`,
                    "type": "Note",
                    "content": `<span class=\"h-card\"><a href="${attendee.id}" class="u-url mention">@<span>${attendee.name}</span></a></span> ${diffText} See here: <a href="https://${domain}/${req.params.eventID}">https://${domain}/${req.params.eventID}</a>`,
                    "tag": [{ "type": "Mention", "href": attendee.id, "name": attendee.name }]
                  }
                  // send direct message to user
                  ap.sendDirectMessage(jsonObject, attendee.id, eventID);
                }
              }
            })
            // Send update to all attendees
            if (sendEmails) {
              Event.findOne({ id: req.params.eventID }).then((event) => {
                const attendeeEmails = event.attendees.filter(o => o.status === 'attending' && o.email).map(o => o.email);
                if (attendeeEmails.length) {
                  console.log("Sending emails to: " + attendeeEmails);
                  req.app.get('hbsInstance').renderView('./views/emails/editevent.handlebars', { diffText, eventID: req.params.eventID, siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
                    const msg = {
                      to: attendeeEmails,
                      from: {
                        name: siteName,
                        email: contactEmail,
                        address: contactEmail
                      },
                      subject: `${siteName}: ${event.name} was just edited`,
                      html,
                    };
                    switch (mailService) {
                      case 'sendgrid':
                        sgMail.sendMultiple(msg).catch(e => {
                          console.error(e.toString());
                          res.status(500).end();
                        });
                        break;
                      case 'nodemailer':
                        nodemailerTransporter.sendMail(msg).catch(e => {
                          console.error(e.toString());
                          res.status(500).end();
                        });
                        break;
                    }
                  });
                }
                else {
                  console.log("Nothing to send!");
                }
              })
            }
            res.writeHead(302, {
              'Location': '/' + req.params.eventID + '?e=' + req.params.editToken
            });
            res.end();
          })
          .catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err); });
      }
      else {
        // Token doesn't match
        res.send('Sorry! Something went wrong');
        addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: token does not match");
      }
    })
    .catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err); });
});

router.post('/editeventgroup/:eventGroupID/:editToken', (req, res) => {
  let submittedEditToken = req.params.editToken;
  EventGroup.findOne(({
    id: req.params.eventGroupID,
  }))
    .then((eventGroup) => {
      if (eventGroup.editToken === submittedEditToken) {
        // Token matches

        // If there is a new image, upload that first
        let eventGroupID = req.params.eventGroupID;
        let eventGroupImageFilename = eventGroup.image;
        if (req.files && Object.keys(req.files).length !== 0) {
          let eventImageBuffer = req.files.eventGroupImageUpload.data;
          Jimp.read(eventImageBuffer, (err, img) => {
            if (err) throw err;
            img
              .resize(920, Jimp.AUTO) // resize
              .quality(80) // set JPEG
              .write('./public/events/' + eventGroupID + '.jpg'); // save
          });
          eventGroupImageFilename = eventGroupID + '.jpg';
        }
        const updatedEventGroup = {
          name: req.body.eventGroupName,
          description: req.body.eventGroupDescription,
          url: req.body.eventGroupURL,
          hostName: req.body.hostName,
          image: eventGroupImageFilename
        }
        EventGroup.findOneAndUpdate({ id: req.params.eventGroupID }, updatedEventGroup, function (err, raw) {
          if (err) {
            addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: " + err);
            res.send(err);
          }
        })
          .then(() => {
            addToLog("editEventGroup", "success", "Event group " + req.params.eventGroupID + " edited");
            res.writeHead(302, {
              'Location': '/group/' + req.params.eventGroupID + '?e=' + req.params.editToken
            });
            res.end();
          })
          .catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: " + err); });
      }
      else {
        // Token doesn't match
        res.send('Sorry! Something went wrong');
        addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: token does not match");
      }
    })
    .catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: " + err); });
});

router.post('/deleteimage/:eventID/:editToken', (req, res) => {
  let submittedEditToken = req.params.editToken;
  Event.findOne(({
    id: req.params.eventID,
  }))
    .then((event) => {
      if (event.editToken === submittedEditToken) {
        // Token matches
        if (event.image) {
          eventImage = event.image;
        } else {
          res.status(500).send('This event doesn\'t have a linked image. What are you even doing');
        }
        fs.unlink(global.appRoot + '/public/events/' + eventImage, (err) => {
          if (err) {
            res.status(500).send(err);
            addToLog("deleteEventImage", "error", "Attempt to delete event image for event " + req.params.eventID + " failed with error: " + err);
          }
          // Image removed
          addToLog("deleteEventImage", "success", "Image for event " + req.params.eventID + " deleted");
          event.image = "";
          event.save()
            .then(response => {
              res.status(200).send('Success');
            })
            .catch(err => {
              res.status(500).send(err);
              addToLog("deleteEventImage", "error", "Attempt to delete event image for event " + req.params.eventID + " failed with error: " + err);
            })
        });
      }
    });
});

router.post('/deleteevent/:eventID/:editToken', (req, res) => {
  let submittedEditToken = req.params.editToken;
  let eventImage;
  Event.findOne(({
    id: req.params.eventID,
  }))
    .then((event) => {
      if (event.editToken === submittedEditToken) {
        // Token matches

        let eventImage;
        if (event.image) {
          eventImage = event.image;
        }

        // broadcast a Delete profile message to all followers so that at least Mastodon servers will delete their local profile information
        const guidUpdateObject = crypto.randomBytes(16).toString('hex');
        const jsonUpdateObject = JSON.parse(event.activityPubActor);
        // first broadcast AP messages, THEN delete from DB
        ap.broadcastDeleteMessage(jsonUpdateObject, event.followers, req.params.eventID, function (statuses) {
          Event.deleteOne({ id: req.params.eventID }, function (err, raw) {
            if (err) {
              res.send(err);
              addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: " + err);
            }
          })
            .then(() => {
              // Delete image
              if (eventImage) {
                fs.unlink(global.appRoot + '/public/events/' + eventImage, (err) => {
                  if (err) {
                    res.send(err);
                    addToLog("deleteEvent", "error", "Attempt to delete event image for event " + req.params.eventID + " failed with error: " + err);
                  }
                  // Image removed
                  addToLog("deleteEvent", "success", "Event " + req.params.eventID + " deleted");
                })
              }
              res.writeHead(302, {
                'Location': '/'
              });
              res.end();
            })
            .catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: " + err); });
        });
        // Send emails here otherwise they don't exist lol
        if (sendEmails) {
          Event.findOne({ id: req.params.eventID }).then((event) => {
            const attendeeEmails = event.attendees.filter(o => o.status === 'attending' && o.email).map(o => o.email);
            if (attendeeEmails.length) {
              console.log("Sending emails to: " + attendeeEmails);
              req.app.get('hbsInstance').renderView('./views/emails/deleteevent.handlebars', { siteName, siteLogo, domain, eventName: event.name, cache: true, layout: 'email.handlebars' }, function (err, html) {
                const msg = {
                  to: attendeeEmails,
                  from: {
                    name: siteName,
                    email: contactEmail,
                    address: contactEmail
                  },
                  subject: `${siteName}: ${event.name} was deleted`,
                  html,
                };
                switch (mailService) {
                  case 'sendgrid':
                    sgMail.sendMultiple(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                  case 'nodemailer':
                    nodemailerTransporter.sendMail(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                }
              });
            }
            else {
              console.log("Nothing to send!");
            }
          });
        }
      }
      else {
        // Token doesn't match
        res.send('Sorry! Something went wrong');
        addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: token does not match");
      }
    })
    .catch((err) => { res.send('Sorry! Something went wrong: ' + err); addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: " + err); });
});

router.post('/deleteeventgroup/:eventGroupID/:editToken', (req, res) => {
  let submittedEditToken = req.params.editToken;
  EventGroup.findOne(({
    id: req.params.eventGroupID,
  }))
    .then(async (eventGroup) => {
      if (eventGroup.editToken === submittedEditToken) {
        // Token matches

        let linkedEvents = await Event.find({ eventGroup: eventGroup._id });

        let linkedEventIDs = linkedEvents.map(event => event._id);
        let eventGroupImage = false;
        if (eventGroup.image) {
          eventGroupImage = eventGroup.image;
        }

        EventGroup.deleteOne({ id: req.params.eventGroupID }, function (err, raw) {
          if (err) {
            res.send(err);
            addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err);
          }
        })
          .then(() => {
            // Delete image
            if (eventGroupImage) {
              fs.unlink(global.appRoot + '/public/events/' + eventGroupImage, (err) => {
                if (err) {
                  res.send(err);
                  addToLog("deleteEventGroup", "error", "Attempt to delete event image for event group " + req.params.eventGroupID + " failed with error: " + err);
                }
              })
            }
            Event.update({ _id: { $in: linkedEventIDs } }, { $set: { eventGroup: null } }, { multi: true })
              .then(response => {
                console.log(response);
                addToLog("deleteEventGroup", "success", "Event group " + req.params.eventGroupID + " deleted");
                res.writeHead(302, {
                  'Location': '/'
                });
                res.end();
              })
              .catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err); });
          })
          .catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err); });
      }
      else {
        // Token doesn't match
        res.send('Sorry! Something went wrong');
        addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: token does not match");
      }
    })
    .catch((err) => { res.send('Sorry! Something went wrong: ' + err); addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err); });
});

router.post('/attendee/provision', async (req, res) => {
  const removalPassword = niceware.generatePassphrase(6).join('-');
  const newAttendee = {
    status: 'provisioned',
    removalPassword,
    created: Date.now(),
  };

  const event = await Event.findOne({ id: req.query.eventID }).catch(e => {
    addToLog("provisionEventAttendee", "error", "Attempt to provision attendee in event " + req.query.eventID + " failed with error: " + e);
    return res.sendStatus(500);
  });

  if (!event) {
    return res.sendStatus(404);
  }

  event.attendees.push(newAttendee);
  await event.save().catch(e => {
    console.log(e);
    addToLog("provisionEventAttendee", "error", "Attempt to provision attendee in event " + req.query.eventID + " failed with error: " + e);
    return res.sendStatus(500);
  });
  addToLog("provisionEventAttendee", "success", "Attendee provisioned in event " + req.query.eventID);

  // Return the removal password and the number of free spots remaining
  let freeSpots;
  if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
    freeSpots = event.maxAttendees - event.attendees.reduce((acc, a) => acc + (a.status === 'attending' ? (a.number || 1) : 0), 0);
  } else {
    freeSpots = undefined;
  }
  return res.json({ removalPassword, freeSpots });
});

router.post('/attendevent/:eventID', async (req, res) => {
  // Do not allow empty removal passwords
  if (!req.body.removalPassword) {
    return res.sendStatus(500);
  }
  const event = await Event.findOne({ id: req.params.eventID }).catch(e => {
    addToLog("attendEvent", "error", "Attempt to attend event " + req.params.eventID + " failed with error: " + e);
    return res.sendStatus(500);
  });
  if (!event) {
    return res.sendStatus(404);
  }
  const attendee = event.attendees.find(a => a.removalPassword === req.body.removalPassword);
  if (!attendee) {
    return res.sendStatus(404);
  }
  // Do we have enough free spots in this event to accomodate this attendee?
  // First, check if the event has a max number of attendees
  if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
    const freeSpots = event.maxAttendees - event.attendees.reduce((acc, a) => acc + (a.status === 'attending' ? (a.number || 1) : 0), 0);
    if (req.body.attendeeNumber > freeSpots) {
      return res.sendStatus(403);
    }
  }

  Event.findOneAndUpdate({ id: req.params.eventID, 'attendees.removalPassword': req.body.removalPassword }, {
    "$set": {
      "attendees.$.status": "attending",
      "attendees.$.name": req.body.attendeeName,
      "attendees.$.email": req.body.attendeeEmail,
      "attendees.$.number": req.body.attendeeNumber,
    }
  }).then((event) => {
    addToLog("addEventAttendee", "success", "Attendee added to event " + req.params.eventID);
    if (sendEmails) {
      if (req.body.attendeeEmail) {
        req.app.get('hbsInstance').renderView('./views/emails/addeventattendee.handlebars', { eventID: req.params.eventID, siteName, siteLogo, domain, removalPassword: req.body.removalPassword, cache: true, layout: 'email.handlebars' }, function (err, html) {
          const msg = {
            to: req.body.attendeeEmail,
            from: {
              name: siteName,
              email: contactEmail,
            },
            subject: `${siteName}: You're RSVPed to ${event.name}`,
            html,
          };
          switch (mailService) {
            case 'sendgrid':
              sgMail.send(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
            case 'nodemailer':
              nodemailerTransporter.sendMail(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
          }
        });
      }
    }
    res.redirect(`/${req.params.eventID}`);
  })
    .catch((error) => {
      res.send('Database error, please try again :(');
      addToLog("addEventAttendee", "error", "Attempt to add attendee to event " + req.params.eventID + " failed with error: " + error);
    });
});

router.post('/unattendevent/:eventID', (req, res) => {
  const removalPassword = req.body.removalPassword;
  // Don't allow blank removal passwords!
  if (!removalPassword) {
    return res.sendStatus(500);
  }

  Event.update(
    { id: req.params.eventID },
    { $pull: { attendees: { removalPassword } } }
  )
    .then(response => {
      console.log(response)
      addToLog("unattendEvent", "success", "Attendee removed self from event " + req.params.eventID);
      if (sendEmails) {
        if (req.body.attendeeEmail) {
          req.app.get('hbsInstance').renderView('./views/emails/unattendevent.handlebars', { eventID: req.params.eventID, siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
            const msg = {
              to: req.body.attendeeEmail,
              from: {
                name: siteName,
                email: contactEmail,
              },
              subject: `${siteName}: You have been removed from an event`,
              html,
            };
            switch (mailService) {
              case 'sendgrid':
                sgMail.send(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
              case 'nodemailer':
                nodemailerTransporter.sendMail(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
            }
          });
        }
      }
      res.writeHead(302, {
        'Location': '/' + req.params.eventID
      });
      res.end();
    })
    .catch((err) => {
      res.send('Database error, please try again :('); addToLog("removeEventAttendee", "error", "Attempt to remove attendee from event " + req.params.eventID + " failed with error: " + err);
    });
});

// this is a one-click unattend that requires a secret URL that only the person who RSVPed over
// activitypub knows
router.get('/oneclickunattendevent/:eventID/:attendeeID', (req, res) => {
  // Mastodon will "click" links that sent to its users, presumably as a prefetch?
  // Anyway, this ignores the automated clicks that are done without the user's knowledge
  if (req.headers['user-agent'] && req.headers['user-agent'].includes('Mastodon')) {
    return res.sendStatus(200);
  }
  Event.update(
    { id: req.params.eventID },
    { $pull: { attendees: { _id: req.params.attendeeID } } }
  )
    .then(response => {
      addToLog("oneClickUnattend", "success", "Attendee removed via one click unattend " + req.params.eventID);
      if (sendEmails) {
        // currently this is never called because we don't have the email address
        if (req.body.attendeeEmail) {
          req.app.get('hbsInstance').renderView('./views/emails/removeeventattendee.handlebars', { eventName: req.params.eventName, siteName, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
            const msg = {
              to: req.body.attendeeEmail,
              from: {
                name: siteName,
                email: contactEmail,
              },
              subject: `${siteName}: You have been removed from an event`,
              html,
            };
            switch (mailService) {
              case 'sendgrid':
                sgMail.send(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
              case 'nodemailer':
                nodemailerTransporter.sendMail(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
            }
          });
        }
      }
      res.writeHead(302, {
        'Location': '/' + req.params.eventID
      });
      res.end();
    })
    .catch((err) => {
      res.send('Database error, please try again :('); addToLog("removeEventAttendee", "error", "Attempt to remove attendee by admin from event " + req.params.eventID + " failed with error: " + err);
    });
});

router.post('/removeattendee/:eventID/:attendeeID', (req, res) => {
  Event.update(
    { id: req.params.eventID },
    { $pull: { attendees: { _id: req.params.attendeeID } } }
  )
    .then(response => {
      console.log(response)
      addToLog("removeEventAttendee", "success", "Attendee removed by admin from event " + req.params.eventID);
      if (sendEmails) {
        // currently this is never called because we don't have the email address
        if (req.body.attendeeEmail) {
          req.app.get('hbsInstance').renderView('./views/emails/removeeventattendee.handlebars', { eventName: req.params.eventName, siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
            const msg = {
              to: req.body.attendeeEmail,
              from: {
                name: siteName,
                email: contactEmail,
              },
              subject: `${siteName}: You have been removed from an event`,
              html,
            };
            switch (mailService) {
              case 'sendgrid':
                sgMail.send(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
              case 'nodemailer':
                nodemailerTransporter.sendMail(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
                break;
            }
          });
        }
      }
      res.writeHead(302, {
        'Location': '/' + req.params.eventID
      });
      res.end();
    })
    .catch((err) => {
      res.send('Database error, please try again :('); addToLog("removeEventAttendee", "error", "Attempt to remove attendee by admin from event " + req.params.eventID + " failed with error: " + err);
    });
});

/*
 * Create an email subscription on an event group.
 */
router.post('/subscribe/:eventGroupID', (req, res) => {
  const subscriber = {
    email: req.body.emailAddress,
  };
  if (!subscriber.email) {
    return res.sendStatus(500);
  }

  EventGroup.findOne(({
    id: req.params.eventGroupID,
  }))
    .then((eventGroup) => {
      if (!eventGroup) {
        return res.sendStatus(404);
      }
      eventGroup.subscribers.push(subscriber);
      eventGroup.save();
      if (sendEmails) {
        req.app.get('hbsInstance').renderView('./views/emails/subscribed.handlebars', { eventGroupName: eventGroup.name, eventGroupID: eventGroup.id, emailAddress: encodeURIComponent(subscriber.email), siteName, siteLogo, domain, cache: true, layout: 'email.handlebars' }, function (err, html) {
          const msg = {
            to: subscriber.email,
            from: {
              name: siteName,
              email: contactEmail,
            },
            subject: `${siteName}: You have subscribed to an event group`,
            html,
          };
          switch (mailService) {
            case 'sendgrid':
              sgMail.send(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
            case 'nodemailer':
              nodemailerTransporter.sendMail(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
              break;
          }
        });
      }
      return res.redirect(`/group/${eventGroup.id}`)
    })
    .catch((error) => {
      addToLog("addSubscription", "error", "Attempt to subscribe " + req.body.emailAddress + " to event group " + req.params.eventGroupID + " failed with error: " + error);
      return res.sendStatus(500);
    });
});

/*
 * Delete an existing email subscription on an event group.
 */
router.get('/unsubscribe/:eventGroupID', (req, res) => {
  const email = req.query.email;
  console.log(email);
  if (!email) {
    return res.sendStatus(500);
  }

  EventGroup.update(
    { id: req.params.eventGroupID },
    { $pull: { subscribers: { email } } }
  )
    .then(response => {
      return res.redirect('/');
    })
    .catch((error) => {
      addToLog("removeSubscription", "error", "Attempt to unsubscribe " + req.query.email + " from event group " + req.params.eventGroupID + " failed with error: " + error);
      return res.sendStatus(500);
    });
});

router.post('/post/comment/:eventID', (req, res) => {
  let commentID = nanoid();
  const newComment = {
    id: commentID,
    author: req.body.commentAuthor,
    content: req.body.commentContent,
    timestamp: moment()
  };

  Event.findOne({
    id: req.params.eventID,
  }, function (err, event) {
    if (!event) return;
    event.comments.push(newComment);
    event.save()
      .then(() => {
        addToLog("addEventComment", "success", "Comment added to event " + req.params.eventID);
        // broadcast an identical message to all followers, will show in their home timeline
        // and in the home timeline of the event
        const guidObject = crypto.randomBytes(16).toString('hex');
        const jsonObject = {
          "@context": "https://www.w3.org/ns/activitystreams",
          "id": `https://${domain}/${req.params.eventID}/m/${guidObject}`,
          "name": `Comment on ${event.name}`,
          "type": "Note",
          'cc': 'https://www.w3.org/ns/activitystreams#Public',
          "content": `<p>${req.body.commentAuthor} commented: ${req.body.commentContent}.</p><p><a href="https://${domain}/${req.params.eventID}/">See the full conversation here.</a></p>`,
        }
        ap.broadcastCreateMessage(jsonObject, event.followers, req.params.eventID)
        if (sendEmails) {
          Event.findOne({ id: req.params.eventID }).then((event) => {
            const attendeeEmails = event.attendees.filter(o => o.status === 'attending' && o.email).map(o => o.email);
            if (attendeeEmails.length) {
              console.log("Sending emails to: " + attendeeEmails);
              req.app.get('hbsInstance').renderView('./views/emails/addeventcomment.handlebars', { siteName, siteLogo, domain, eventID: req.params.eventID, commentAuthor: req.body.commentAuthor, cache: true, layout: 'email.handlebars' }, function (err, html) {
                const msg = {
                  to: attendeeEmails,
                  from: {
                    name: siteName,
                    email: contactEmail,
                  },
                  subject: `${siteName}: New comment in ${event.name}`,
                  html,
                };
                switch (mailService) {
                  case 'sendgrid':
                    sgMail.sendMultiple(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                  case 'nodemailer':
                    nodemailerTransporter.sendMail(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                }
              });
            }
            else {
              console.log("Nothing to send!");
            }
          });
        }
        res.writeHead(302, {
          'Location': '/' + req.params.eventID
        });
        res.end();
      })
      .catch((err) => { res.send('Database error, please try again :(' + err); addToLog("addEventComment", "error", "Attempt to add comment to event " + req.params.eventID + " failed with error: " + err); });
  });
});

router.post('/post/reply/:eventID/:commentID', (req, res) => {
  let replyID = nanoid();
  let commentID = req.params.commentID;
  const newReply = {
    id: replyID,
    author: req.body.replyAuthor,
    content: req.body.replyContent,
    timestamp: moment()
  };
  Event.findOne({
    id: req.params.eventID,
  }, function (err, event) {
    if (!event) return;
    var parentComment = event.comments.id(commentID);
    parentComment.replies.push(newReply);
    event.save()
      .then(() => {
        addToLog("addEventReply", "success", "Reply added to comment " + commentID + " in event " + req.params.eventID);
        // broadcast an identical message to all followers, will show in their home timeline
        const guidObject = crypto.randomBytes(16).toString('hex');
        const jsonObject = {
          "@context": "https://www.w3.org/ns/activitystreams",
          "id": `https://${domain}/${req.params.eventID}/m/${guidObject}`,
          "name": `Comment on ${event.name}`,
          "type": "Note",
          'cc': 'https://www.w3.org/ns/activitystreams#Public',
          "content": `<p>${req.body.replyAuthor} commented: ${req.body.replyContent}</p><p><a href="https://${domain}/${req.params.eventID}/">See the full conversation here.</a></p>`,
        }
        ap.broadcastCreateMessage(jsonObject, event.followers, req.params.eventID)
        if (sendEmails) {
          Event.findOne({ id: req.params.eventID }).then((event) => {
            const attendeeEmails = event.attendees.filter(o => o.status === 'attending' && o.email).map(o => o.email);
            if (attendeeEmails.length) {
              console.log("Sending emails to: " + attendeeEmails);
              req.app.get('hbsInstance').renderView('./views/emails/addeventcomment.handlebars', { siteName, siteLogo, domain, eventID: req.params.eventID, commentAuthor: req.body.replyAuthor, cache: true, layout: 'email.handlebars' }, function (err, html) {
                const msg = {
                  to: attendeeEmails,
                  from: {
                    name: siteName,
                    email: contactEmail,
                  },
                  subject: `${siteName}: New comment in ${event.name}`,
                  html,
                };
                switch (mailService) {
                  case 'sendgrid':
                    sgMail.sendMultiple(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                  case 'nodemailer':
                    nodemailerTransporter.sendMail(msg).catch(e => {
                      console.error(e.toString());
                      res.status(500).end();
                    });
                    break;
                }
              });
            }
            else {
              console.log("Nothing to send!");
            }
          });
        }
        res.writeHead(302, {
          'Location': '/' + req.params.eventID
        });
        res.end();
      })
      .catch((err) => { res.send('Database error, please try again :('); addToLog("addEventReply", "error", "Attempt to add reply to comment " + commentID + " in event " + req.params.eventID + " failed with error: " + err); });
  });
});

router.post('/deletecomment/:eventID/:commentID/:editToken', (req, res) => {
  let submittedEditToken = req.params.editToken;
  Event.findOne(({
    id: req.params.eventID,
  }))
    .then((event) => {
      if (event.editToken === submittedEditToken) {
        // Token matches
        event.comments.id(req.params.commentID).remove();
        event.save()
          .then(() => {
            addToLog("deleteComment", "success", "Comment deleted from event " + req.params.eventID);
            res.writeHead(302, {
              'Location': '/' + req.params.eventID + '?e=' + req.params.editToken
            });
            res.end();
          })
          .catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteComment", "error", "Attempt to delete comment " + req.params.commentID + "from event " + req.params.eventID + " failed with error: " + err); });
      }
      else {
        // Token doesn't match
        res.send('Sorry! Something went wrong');
        addToLog("deleteComment", "error", "Attempt to delete comment " + req.params.commentID + "from event " + req.params.eventID + " failed with error: token does not match");
      }
    })
    .catch((err) => { res.send('Sorry! Something went wrong: ' + err); addToLog("deleteComment", "error", "Attempt to delete comment " + req.params.commentID + "from event " + req.params.eventID + " failed with error: " + err); });
});

router.post('/activitypub/inbox', (req, res) => {
  if (!isFederated) return res.sendStatus(404);
  // validate the incoming message
  const signature = req.get('Signature');
  let signature_header = signature.split(',').map(pair => {
    return pair.split('=').map(value => {
      return value.replace(/^"/g, '').replace(/"$/g, '')
    });
  }).reduce((acc, el) => {
    acc[el[0]] = el[1];
    return acc;
  }, {});

  // get the actor
  // TODO if this is a Delete for an Actor this won't work
  request({
    url: signature_header.keyId,
    headers: {
      'Accept': 'application/activity+json',
      'Content-Type': 'application/activity+json'
    }
  }, function (error, response, actor) {
    let publicKey = '';

    try {
      if (JSON.parse(actor).publicKey) {
        publicKey = JSON.parse(actor).publicKey.publicKeyPem;
      }
    }
    catch (err) {
      return res.status(500).send('Actor could not be parsed' + err);
    }

    let comparison_string = signature_header.headers.split(' ').map(header => {
      if (header === '(request-target)') {
        return '(request-target): post /activitypub/inbox';
      }
      else {
        return `${header}: ${req.get(header)}`
      }
    }).join('\n');

    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(comparison_string, 'ascii')
    const publicKeyBuf = new Buffer(publicKey, 'ascii')
    const signatureBuf = new Buffer(signature_header.signature, 'base64')
    try {
      const result = verifier.verify(publicKeyBuf, signatureBuf)
      if (result) {
        // actually process the ActivityPub message now that it's been verified
        ap.processInbox(req, res);
      }
      else {
        return res.status(401).send('Signature could not be verified.');
      }
    }
    catch (err) {
      return res.status(401).send('Signature could not be verified: ' + err);
    }
  });
});

router.use(function (req, res, next) {
  res.status(404);
  res.render('404', { url: req.url });
  return;
});

addToLog("startup", "success", "Started up successfully");

module.exports = router;
