const fs = require('fs');

const express = require('express');

const mongoose = require('mongoose');

const shortid = require('shortid');

const randomstring = require("randomstring");

const { body, validationResult } = require('express-validator/check');

const router = express.Router();

const Event = mongoose.model('Event');
const EventGroup = mongoose.model('EventGroup');
const Log = mongoose.model('Log');

var moment = require('moment-timezone');

const marked = require('marked');

const generateRSAKeypair = require('generate-rsa-keypair');
const crypto = require('crypto');
const request = require('request');

const domain = require('./config/domain.js').domain;
const contactEmail = require('./config/domain.js').email;
var sanitizeHtml = require('sanitize-html');

// Extra marked renderer (used to render plaintext event description for page metadata)
// Adapted from https://dustinpfister.github.io/2017/11/19/nodejs-marked/
// &#63; to ? helper
htmlEscapeToText = function (text) {
    return text.replace(/\&\#[0-9]*;|&amp;/g, function (escapeCode) {
        if (escapeCode.match(/amp/)) {
            return '&';
        }
        return String.fromCharCode(escapeCode.match(/[0-9]+/));
    });
}

render_plain = function () {
    var render = new marked.Renderer();
    // render just the text of a link, strong, em
    render.link = function (href, title, text) {
        return text;
    };
	render.strong = function(text) {
		return text;
	}
	render.em = function(text) {
		return text;
	}
    // render just the text of a paragraph
    render.paragraph = function (text) {
        return htmlEscapeToText(text)+'\r\n';
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

const sgMail = require('@sendgrid/mail');

const apiCredentials = require('./config/api.js');

let sendEmails = false;
if (apiCredentials.sendgrid) { // Only set up Sendgrid if an API key is set
	sgMail.setApiKey(apiCredentials.sendgrid);
	sendEmails = true;
}

const fileUpload = require('express-fileupload');
var Jimp = require('jimp');
router.use(fileUpload());

// LOGGING

function addToLog(process, status, message) {
	let logEntry = new Log({
		status: status,
		process: process,
		message: message,
		timestamp: moment()
	});
	logEntry.save().catch(() => { console.log("Error saving log entry!") });
}

// SCHEDULED DELETION

const schedule = require('node-schedule');

const deleteOldEvents = schedule.scheduleJob('59 23 * * *', function(fireDate){
	const too_old = moment.tz('Etc/UTC').subtract(7, 'days').toDate();
	console.log("Old event deletion running! Deleting all events concluding before ", too_old);

	Event.find({ end: { $lte: too_old } }).then((oldEvents) => {
		oldEvents.forEach(event => {
			if (event.image){
				fs.unlink(global.appRoot + '/public/events/' + event.image, (err) => {
				  if (err) {
					addToLog("deleteOldEvents", "error", "Attempt to delete event image for old event "+event.id+" failed with error: " + err);
				  }
					// Image removed
				  addToLog("deleteOldEvents", "error", "Image deleted for old event "+event.id);
				})
			}
			Event.remove({"_id": event._id})
			.then(response => {
				addToLog("deleteOldEvents", "success", "Old event "+event.id+" deleted");
			}).catch((err) => {
				addToLog("deleteOldEvents", "error", "Attempt to delete old event "+event.id+" failed with error: " + err);
			});
		})
	}).catch((err) => {
		addToLog("deleteOldEvents", "error", "Attempt to delete old event "+event.id+" failed with error: " + err);
	});
});


// ACTIVITYPUB HELPER FUNCTIONS
function createWebfinger(eventID, domain) {
  return {
    'subject': `acct:${eventID}@${domain}`,

    'links': [
      {
        'rel': 'self',
        'type': 'application/activity+json',
        'href': `https://${domain}/${eventID}`
      }
    ]
  };
}

function createActivityPubActor(eventID, domain, pubkey, description, name, location, imageFilename, startUTC, endUTC, timezone) {
  let actor = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],

    'id': `https://${domain}/${eventID}`,
    'type': 'Person',
    'preferredUsername': `${eventID}`,
    'inbox': `https://${domain}/activitypub/inbox`,
    'followers': `https://${domain}/${eventID}/followers`,
    'summary': `<p>${description}</p>`,
    'name': name,

    'publicKey': {
      'id': `https://${domain}/${eventID}#main-key`,
      'owner': `https://${domain}/${eventID}`,
      'publicKeyPem': pubkey
    }
  };
  if (location) {
    actor.summary += `<p>Location: ${location}.</p>`
  }
  let displayDate;
  if (startUTC && timezone) {
    displayDate = moment.tz(startUTC, timezone).format('D MMMM YYYY h:mm a');
    actor.summary += `<p>Starting ${displayDate}.</p>`;
  }
  if (imageFilename) {
    actor.icon = {
      'type': 'Image',
      'mediaType': 'image/jpg',
      'url': `https://${domain}/events/${imageFilename}`,
    };
  }
  return JSON.stringify(actor);
}

function updateActivityPubActor(actor, description, name, location, imageFilename, startUTC, endUTC, timezone) {
  if (!actor) return;
  actor.summary = `<p>${description}</p>`;
  actor.name = name;
  if (location) {
    actor.summary += `<p>Location: ${location}.</p>`
  }
  let displayDate;
  if (startUTC && timezone) {
    displayDate = moment.tz(startUTC, timezone).format('D MMMM YYYY h:mm a');
    actor.summary += `<p>Starting ${displayDate}.</p>`;
  }
  if (imageFilename) {
    actor.icon = {
      'type': 'Image',
      'mediaType': 'image/jpg',
      'url': `https://${domain}/events/${imageFilename}`,
    };
  }
  return JSON.stringify(actor);
}

function sendAcceptMessage(thebody, eventID, targetDomain, callback) {
  callback = callback || function() {};
  const guid = crypto.randomBytes(16).toString('hex');
  const actorId = thebody.actor;
  let message = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    'id': `https://${domain}/${guid}`,
    'type': 'Accept',
    'actor': `https://${domain}/${eventID}`,
    'object': thebody,
  };
  // get the inbox
  Event.findOne({
    id: eventID,
    }, function(err, event) {
    if (event) {
      const follower = event.followers.find(el => el.actorId === actorId);
      if (follower) {
        const actorJson = JSON.parse(follower.actorJson);
        const inbox = actorJson.inbox;
        signAndSend(message, eventID, targetDomain, inbox, callback);
      }
    }
    else {
      callback(`Could not find event ${eventID}`, null, 404);
    }
  });
}

// this sends a message "to:" an individual fediverse user
function sendDirectMessage(apObject, actorId, eventID, callback) {
  callback = callback || function() {};
  const guidCreate = crypto.randomBytes(16).toString('hex');
  const guidObject = crypto.randomBytes(16).toString('hex');
  let d = new Date();

  apObject.published = d.toISOString();
  apObject.attributedTo = `https://${domain}/${eventID}`;
  apObject.to = actorId;
  apObject.id = `https://${domain}/m/${guidObject}`;
  apObject.content = unescape(apObject.content)

  let createMessage = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    'id': `https://${domain}/m/${guidCreate}`,
    'type': 'Create',
    'actor': `https://${domain}/${eventID}`,
    'to': [actorId],
    'object': apObject
  };

  let myURL = new URL(actorId);
  let targetDomain = myURL.hostname;
  // get the inbox
  Event.findOne({
    id: eventID,
    }, function(err, event) {
    if (event) {
      const follower = event.followers.find(el => el.actorId === actorId);
      if (follower) {
        const actorJson = JSON.parse(follower.actorJson);
        const inbox = actorJson.inbox;
        signAndSend(createMessage, eventID, targetDomain, inbox, callback);
      }
      else {
        callback(`No follower found with the id ${actorId}`, null, 404);
      }
    }
    else {
      callback(`No event found with the id ${eventID}`, null, 404);
    }
  });
}

// this function sends something to the timeline of every follower in the followers array
function broadcastMessage(apObject, followers, eventID, callback) {
  callback = callback || function() {};
  let guidCreate = crypto.randomBytes(16).toString('hex');
  console.log('broadcasting');
  // iterate over followers
  for (const follower of followers) {
    let actorId = follower.actorId;
    let myURL = new URL(actorId);
    let targetDomain = myURL.hostname;
    // get the inbox
    Event.findOne({
      id: eventID,
      }, function(err, event) {
      console.log('found the event for broadcast')
      if (event) {
        const follower = event.followers.find(el => el.actorId === actorId);
        if (follower) {
          const actorJson = JSON.parse(follower.actorJson);
          const inbox = actorJson.inbox;
          console.log('found the inbox for', actorId)
          const createMessage = {
            '@context': 'https://www.w3.org/ns/activitystreams',
            'id': `https://${domain}/m/${guidCreate}`,
            'type': 'Create',
            'actor': `https://${domain}/${eventID}`,
            'to': [actorId],
            'object': apObject
          };
          signAndSend(createMessage, eventID, targetDomain, inbox, function(err, resp, status) {
            if (err) {
              console.log(`Didn't sent to ${actorId}, status ${status} with error ${err}`);
            }
            else {
              console.log('sent to', actorId);
            }
          });
        }
        else {
          callback(`No follower found with the id ${actorId}`, null, 404);
        }
      }
      else {
        callback(`No event found with the id ${eventID}`, null, 404);
      }
    });
  } // end followers
}

function broadcastUpdateMessage(apObject, followers, eventID, callback) {
  callback = callback || function() {};
  let guidUpdate = crypto.randomBytes(16).toString('hex');
  console.log('broadcasting update');
  // iterate over followers
  for (const follower of followers) {
    let actorId = follower.actorId;
    let myURL = new URL(actorId);
    let targetDomain = myURL.hostname;
    // get the inbox
    Event.findOne({
      id: eventID,
      }, function(err, event) {
      console.log('found the event for broadcast')
      if (event) {
        const follower = event.followers.find(el => el.actorId === actorId);
        if (follower) {
          const actorJson = JSON.parse(follower.actorJson);
          const inbox = actorJson.inbox;
          console.log('found the inbox for', actorId)
          const createMessage = {
            '@context': 'https://www.w3.org/ns/activitystreams',
            'id': `https://${domain}/m/${guidUpdate}`,
            'type': 'Update',
            'actor': `https://${domain}/${eventID}`,
            'object': apObject
          };
          console.log('UPDATE')
          console.log(JSON.stringify(createMessage));
          signAndSend(createMessage, eventID, targetDomain, inbox, function(err, resp, status) {
            if (err) {
              console.log(`Didn't sent to ${actorId}, status ${status} with error ${err}`);
            }
            else {
              console.log('sent to', actorId);
            }
          });
        }
        else {
          callback(`No follower found with the id ${actorId}`, null, 404);
        }
      }
      else {
        callback(`No event found with the id ${eventID}`, null, 404);
      }
    });
  } // end followers
}
function signAndSend(message, eventID, targetDomain, inbox, callback) {
  let inboxFragment = inbox.replace('https://'+targetDomain,'');
  // get the private key
	Event.findOne({
		id: eventID
		})
		.then((event) => {
      if (event) { 
        const privateKey = event.privateKey;
        const signer = crypto.createSign('sha256');
        let d = new Date();
        let stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}`;
        signer.update(stringToSign);
        signer.end();
        const signature = signer.sign(privateKey);
        const signature_b64 = signature.toString('base64');
        const header = `keyId="https://${domain}/${eventID}",headers="(request-target) host date",signature="${signature_b64}"`;
        request({
          url: inbox,
          headers: {
            'Host': targetDomain,
            'Date': d.toUTCString(),
            'Signature': header
          },
          method: 'POST',
          json: true,
          body: message
        }, function (error, response){
          if (error) {
            console.log('Error:', error, response.body);
            callback(error, null, 500);
          }
          else {
            console.log('Response:', response.statusCode);
            // Add the message to the database
            const messageID = message.id;
            const newMessage = {
              id: message.id,
              content: JSON.stringify(message)
            };
            Event.findOne({
              id: eventID,
              }, function(err,event) {
              if (!event) return;
              event.activityPubMessages.push(newMessage);
              event.save()
              .then(() => {
                addToLog("addActivityPubMessage", "success", "ActivityPubMessage added to event " + eventID);
                console.log('successful ActivityPubMessage add');
                callback(null, message.id, 200);
              })
              .catch((err) => { addToLog("addActivityPubMessage", "error", "Attempt to add ActivityPubMessage to event " + eventID + " failed with error: " + err);
                console.log('error', err)
                callback(err, null, 500);
              });
            })
          }
        });
      }
      else {
        callback(`No record found for ${eventID}.`, null, 404);
      }
    });
}

// FRONTEND ROUTES

router.get('/', (req, res) => {
  res.render('home', {
    domain: domain,
    email: contactEmail,
  });
});

router.get('/new', (req, res) => {
	res.render('home');
});

//router.get('/login', (req, res) => {
//	res.render('admin');
//})

//router.get('/login', (req, res) => {
//	res.render('login');
//});
//
//router.get('/register', (req, res) => {
//	res.render('register');
//});

router.get('/new/event', (req, res) => {
	res.render('newevent');
});
router.get('/new/event/public', (req, res) => {
	let isPrivate = false;
	let isPublic = true;
	let isOrganisation = false;
	let isUnknownType = false;
//	let eventType = req.params.eventType;
//	if (eventType == "private"){
//		isPrivate = true;
//	}
//	else if (eventType == "public"){
//		isPublic = true;
//	}
//	else if (eventType == "organisation"){
//		isOrganisation = true;
//	}
//	else {
//		isUnknownType = true;
//	}
	res.render('newevent', {
		title: 'New event',
		isPrivate: isPrivate,
		isPublic: isPublic,
		isOrganisation: isOrganisation,
		isUnknownType: isUnknownType,
		eventType: 'public'
	});
})

router.get('/.well-known/webfinger', (req, res) => {
  console.log(req.query);
  let resource = req.query.resource;
  if (!resource || !resource.includes('acct:')) {
    return res.status(400).send('Bad request. Please make sure "acct:USER@DOMAIN" is what you are sending as the "resource" query parameter.');
  }
  else {
    // "foo@domain"
    let activityPubAccount = resource.replace('acct:','');
    // "foo"
    let eventID = activityPubAccount.replace(/@.*/,'');
    console.log(eventID);
    Event.findOne({
      id: eventID
    })
    .then((event) => {
      if (!event) {
        res.status(404);
        res.render('404', { url: req.url });
      }
      else {
        res.json(createWebfinger(eventID, domain));
      }
    })
		.catch((err) => {
			addToLog("renderWebfinger", "error", "Attempt to render webfinger for " + req.params.eventID + " failed with error: " + err);
			console.log(err)
			res.status(404);
			res.render('404', { url: req.url });
			return;
		});
    //let db = req.app.get('db');
    //let result = db.prepare('select webfinger from accounts where name = ?').get(name);
    //if (result === undefined) {
    //  return res.status(404).send(`No record found for ${name}.`);
    //}
    //else {
    //  res.json(JSON.parse(result.webfinger));
    //}
  }
});

router.get('/:eventID', (req, res) => {
	Event.findOne({
		id: req.params.eventID
		})
		.populate('eventGroup')
		.then((event) => {
			if (event) {
				parsedLocation = event.location.replace(/\s+/g, '+');
				if (moment.tz(event.end, event.timezone).isSame(event.start, 'day')){
					// Happening during one day
					displayDate = moment.tz(event.start, event.timezone).format('dddd D MMMM YYYY [<span class="text-muted">from</span>] h:mm a') + moment.tz(event.end, event.timezone).format(' [<span class="text-muted">to</span>] h:mm a [<span class="text-muted">](z)[</span>]');
				}
				else {
					displayDate = moment.tz(event.start, event.timezone).format('dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a') + moment.tz(event.end, event.timezone).format(' [<span class="text-muted">–</span>] dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a [<span class="text-muted">](z)[</span>]');
				}
				eventStartISO = moment.tz(event.start, "Etc/UTC").toISOString();
				eventEndISO = moment.tz(event.end, "Etc/UTC").toISOString();
				parsedStart = moment.tz(event.start, event.timezone).format('YYYYMMDD[T]HHmmss');
				parsedEnd = moment.tz(event.end, event.timezone).format('YYYYMMDD[T]HHmmss');
				let eventHasConcluded = false;
				if (moment.tz(event.end, event.timezone).isBefore(moment.tz(event.timezone))){
					eventHasConcluded = true;
				}
				let eventHasBegun = false;
				if (moment.tz(event.start, event.timezone).isBefore(moment.tz(event.timezone))){
					eventHasBegun = true;
				}
				fromNow = moment.tz(event.start, event.timezone).fromNow();
				parsedDescription = marked(event.description);
				eventEditToken = event.editToken;

				escapedName = event.name.replace(/\s+/g, '+');

				let eventHasCoverImage = false;
				if( event.image ) {
					eventHasCoverImage = true;
				}
				else {
					eventHasCoverImage = false;
				}
				let eventHasHost = false;
				if( event.hostName ) {
					eventHasHost = true;
				}
				else {
					eventHasHost = false;
				}
				let firstLoad = false;
				if (event.firstLoad === true) {
					firstLoad = true;
					Event.findOneAndUpdate({id: req.params.eventID}, {firstLoad: false}, function(err, raw) {
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
						if (req.query.e === eventEditToken){
							editingEnabled = true;
						}
						else {
							editingEnabled = false;
						}
					}
				}
				let eventAttendees = event.attendees.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
                let spotsRemaining, noMoreSpots;
                if (event.maxAttendees) {
                    spotsRemaining = event.maxAttendees - eventAttendees.length;
                    if (spotsRemaining <= 0) {
                        noMoreSpots = true;
                    }
				}
				let metadata = {
					title: event.name,
					description: marked(event.description, { renderer: render_plain()}).split(" ").splice(0,40).join(" ").trim(),
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
            email: contactEmail,
            title: event.name,
            escapedName: escapedName,
            eventData: event,
            eventAttendees: eventAttendees,
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
  const eventID = req.params.eventID;
	Event.findOne({
		id: eventID
		})
		.then((event) => {
			if (event) {
        console.log(event.followers);
        const followers = event.followers.map(el => el.actorId);
        console.log(followers)
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
          "@context":["https://www.w3.org/ns/activitystreams"]
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
		.then(async (eventGroup) => {
			if (eventGroup) {
				parsedDescription = marked(eventGroup.description);
				eventGroupEditToken = eventGroup.editToken;

				escapedName = eventGroup.name.replace(/\s+/g, '+');

				let eventGroupHasCoverImage = false;
				if( eventGroup.image ) {
					eventGroupHasCoverImage = true;
				}
				else {
					eventGroupHasCoverImage = false;
				}
				let eventGroupHasHost = false;
				if( eventGroup.hostName ) {
					eventGroupHasHost = true;
				}
				else {
					eventGroupHasHost = false;
				}

				let events = await Event.find({eventGroup: eventGroup._id}).sort('start')

				events.forEach(event => {
					if (moment.tz(event.end, event.timezone).isSame(event.start, 'day')){
						// Happening during one day
						event.displayDate = moment.tz(event.start, event.timezone).format('D MMM YYYY');
					}
					else {
						event.displayDate = moment.tz(event.start, event.timezone).format('D MMM YYYY') + moment.tz(event.end, event.timezone).format(' - D MMM YYYY');
					}
					if (moment.tz(event.end, event.timezone).isBefore(moment.tz(event.timezone))){
						event.eventHasConcluded = true;
					} else {
						event.eventHasConcluded = false;
					}
				})

				let upcomingEventsExist = false;
				if (events.some(e => e.eventHasConcluded === false)) {
					upcomingEventsExist = true;
				}

				let firstLoad = false;
				if (eventGroup.firstLoad === true) {
					firstLoad = true;
					EventGroup.findOneAndUpdate({id: req.params.eventGroupID}, {firstLoad: false}, function(err, raw) {
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
						if (req.query.e === eventGroupEditToken){
							editingEnabled = true;
						}
						else {
							editingEnabled = false;
						}
					}
				}
				let metadata = {
					title: eventGroup.name,
					description: marked(eventGroup.description, { renderer: render_plain()}).split(" ").splice(0,40).join(" ").trim(),
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

// BACKEND ROUTES

//router.post('/login',
//  passport.authenticate('local', { successRedirect: '/admin',
//                                   failureRedirect: '/login',
//                                   failureFlash: true })
//);


router.post('/newevent', async (req, res) => {
	let eventID = shortid.generate();
  // this is a hack, activitypub does not like "-" in ids so we are essentially going
  // to have a 63-character alphabet instead of a 64-character one
  eventID = eventID.replace(/-/g,'_');
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
	startUTC = moment.tz(req.body.eventStart, 'D MMMM YYYY, hh:mm a', req.body.timezone);
	endUTC = moment.tz(req.body.eventEnd, 'D MMMM YYYY, hh:mm a', req.body.timezone);
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
    activityPubActor: createActivityPubActor(eventID, domain, pair.public, marked(req.body.eventDescription), req.body.eventName, req.body.eventLocation, eventImageFilename, req.body.startUTC, req.body.endUTC, req.body.timezone),
    publicKey: pair.public,
    privateKey: pair.private
	});
	event.save()
		.then((event) => {
			addToLog("createEvent", "success", "Event " + eventID + "created");
			// Send email with edit link
			if (sendEmails) {
				const msg = {
					to: req.body.creatorEmail,
					from: {
						name: 'Gathio',
						email: contactEmail,
					},
					templateId: 'd-00330b8278ab463e9f88c16566487d97',
					dynamic_template_data: {
						subject: 'gathio: ' + req.body.eventName,
						eventID: eventID,
						editToken: editToken
					},
				};
				sgMail.send(msg).catch(e => {
					console.error(e.toString());
					res.status(500).end();
				});
			}
			res.writeHead(302, {
			'Location': '/' + eventID + '?e=' + editToken
			});
			res.end();
		})
		.catch((err) => { res.send('Database error, please try again :( - ' + err); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err);});
});

router.post('/importevent', (req, res) => {
	let eventID = shortid.generate();
	let editToken = randomstring.generate();
	if (req.files && Object.keys(req.files).length !== 0) {
		importediCalObject = ical.parseICS(req.files.icsImportControl.data.toString('utf8'));
		for (var key in importediCalObject) {
    		importedEventData = importediCalObject[key];
		}
		console.log(importedEventData)
		let creatorEmail;
		if (req.body.creatorEmail) {
			creatorEmail = req.body.creatorEmail
		} else if (importedEventData.organizer) {
			creatorEmail = importedEventData.organizer.val.replace("MAILTO:", "");
		} else {
			res.status(500).send("Please supply an email address on the previous page.");
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
			hostName: importedEventData.organizer ? importedEventData.organizer.params.CN : "",
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
				if (sendEmails) {
					const msg = {
						to: creatorEmail,
						from: {
							name: 'Gathio',
							email: contactEmail,
						},
						templateId: 'd-00330b8278ab463e9f88c16566487d97',
						dynamic_template_data: {
							subject: 'gathio: ' + req.body.eventName,
							eventID: eventID,
							editToken: editToken
						},
					};
					sgMail.send(msg).catch(e => {
						console.error(e.toString());
						res.status(500).end();
					});
				}
				res.writeHead(302, {
				'Location': '/' + eventID + '?e=' + editToken
				});
				res.end();
			})
			.catch((err) => { res.send('Database error, please try again :('); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err);});
	}
	else {
		console.log("Files array is empty!")
		res.status(500).end();
	}
});

router.post('/neweventgroup', (req, res) => {
	let eventGroupID = shortid.generate();
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
			if (sendEmails) {
				const msg = {
					to: req.body.creatorEmail,
					from: {
						name: 'Gathio',
						email: contactEmail,
					},
					templateId: 'd-4c5ddcb34ac44ec5b2313c6da4e405f3',
					dynamic_template_data: {
						subject: 'gathio: ' + req.body.eventGroupName,
						eventGroupID: eventGroupID,
						editToken: editToken
					},
				};
				sgMail.send(msg).catch(e => {
					console.error(e.toString());
					res.status(500).end();
				});
			}
			res.writeHead(302, {
				'Location': '/group/' + eventGroupID + '?e=' + editToken
			});
			res.end();
		})
		.catch((err) => { res.send('Database error, please try again :( - ' + err); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err);});
});

router.post('/editevent/:eventID/:editToken', (req, res) => {
	console.log(req.body);
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
			startUTC = moment.tz(req.body.eventStart, 'D MMMM YYYY, hh:mm a', req.body.timezone);
			endUTC = moment.tz(req.body.eventEnd, 'D MMMM YYYY, hh:mm a', req.body.timezone);
			
			var isPartOfEventGroup = false;
			if (req.body.eventGroupCheckbox) {
				var eventGroup = await EventGroup.findOne({
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
        activityPubActor: updateActivityPubActor(JSON.parse(event.activityPubActor), req.body.eventDescription, req.body.eventName, req.body.eventLocation, eventImageFilename, startUTC, endUTC, req.body.timezone)
			}
      let diffText = '<p>This event was just updated with new information.</p><ul>';
      let displayDate;
      // TODO: send an Update Profile message if needed?
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
        console.log(typeof event.timezone, JSON.stringify(event.timezone), JSON.stringify(updatedEvent.timezone))
        diffText += `<li>the time zone changed to ${updatedEvent.timezone}</li>`;
      }
      if (event.description !== updatedEvent.description) {
        diffText += `<li>the event description changed</li>`; 
      }
      diffText += `</ul>`;
			Event.findOneAndUpdate({id: req.params.eventID}, updatedEvent, function(err, raw) {
				if (err) {
					addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err);
					res.send(err);
				}
			})
			.then(() => {
				addToLog("editEvent", "success", "Event " + req.params.eventID + " edited");
        // send update to ActivityPub subscribers
        Event.findOne({id: req.params.eventID}, function(err,event) {
          if (!event) return;
          let attendees = event.attendees.filter(el => el.id);
          if (!err) {
            // broadcast an identical message to all followers, will show in home timeline
            const guidObject = crypto.randomBytes(16).toString('hex');
            const jsonObject = {
              "@context": "https://www.w3.org/ns/activitystreams",
              "id": `https://${domain}/m/${guidObject}`,
              "name": `RSVP to ${event.name}`,
              "type": "Note",
               "content": `${diffText} See here: <a href="https://${domain}/${req.params.eventID}">https://${domain}/${req.params.eventID}</a>`,
            }
            broadcastMessage(jsonObject, event.followers, eventID)
            // also broadcast an Update profile message to all followers so that at least Mastodon servers will update the local profile information
            const guidUpdateObject = crypto.randomBytes(16).toString('hex');
            const jsonUpdateObject = JSON.parse(event.activityPubActor);
            broadcastUpdateMessage(jsonUpdateObject, event.followers, eventID)

            // DM to attendees
            for (const attendee of attendees) {
                const jsonObject = {
                "@context": "https://www.w3.org/ns/activitystreams",
                "name": `RSVP to ${event.name}`,
                "type": "Note",
                "content": `<span class=\"h-card\"><a href="${attendee.id}" class="u-url mention">@<span>${attendee.name}</span></a></span> ${diffText} See here: <a href="https://${domain}/${req.params.eventID}">https://${domain}/${req.params.eventID}</a>`,
                "tag":[{"type":"Mention","href":attendee.id,"name":attendee.name}]
              }
              // send direct message to user
              sendDirectMessage(jsonObject, attendee.id, eventID);
            }
          }
        })
				if (sendEmails) {
					Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
						attendeeEmails = ids;
						if (!error && attendeeEmails !== ""){
							console.log("Sending emails to: " + attendeeEmails);
							const msg = {
								to: attendeeEmails,
								from: {
									name: 'Gathio',
									email: contactEmail,
								},
								templateId: 'd-e21f3ca49d82476b94ddd8892c72a162',
								dynamic_template_data: {
									subject: 'gathio: Event edited',
									actionType: 'edited',
									eventExists: true,
									eventID: req.params.eventID
								}
							}
							sgMail.sendMultiple(msg);
						}
						else {
							console.log("Nothing to send!");
						}
					})
				}
				res.writeHead(302, {
					'Location': '/' + req.params.eventID  + '?e=' + req.params.editToken
					});
				res.end();
			})
			.catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err);});
		}
		else {
			// Token doesn't match
			res.send('Sorry! Something went wrong');
			addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: token does not match");
		}
	})
	.catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err);});
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
			EventGroup.findOneAndUpdate({id: req.params.eventGroupID}, updatedEventGroup, function(err, raw) {
				if (err) {
					addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: " + err);
					res.send(err);
				}
			})
			.then(() => {
				addToLog("editEventGroup", "success", "Event group " + req.params.eventGroupID + " edited");
				// if (sendEmails) {
				// 	Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
				// 		attendeeEmails = ids;
				// 		if (!error && attendeeEmails != ""){
				// 			console.log("Sending emails to: " + attendeeEmails);
				// 			const msg = {
				// 				to: attendeeEmails,
				// 				from: {
				// 					name: 'Gathio',
				// 					email: contactEmail,
				// 				},
				// 				templateId: 'd-e21f3ca49d82476b94ddd8892c72a162',
				// 				dynamic_template_data: {
				// 					subject: 'gathio: Event edited',
				// 					actionType: 'edited',
				// 					eventExists: true,
				// 					eventID: req.params.eventID
				// 				}
				// 			}
				// 			sgMail.sendMultiple(msg);
				// 		}
				// 		else {
				// 			console.log("Nothing to send!");
				// 		}
				// 	})
				// }
				res.writeHead(302, {
					'Location': '/group/' + req.params.eventGroupID  + '?e=' + req.params.editToken
					});
				res.end();
			})
			.catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: " + err);});
		}
		else {
			// Token doesn't match
			res.send('Sorry! Something went wrong');
			addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: token does not match");
		}
	})
	.catch((err) => { console.error(err); res.send('Sorry! Something went wrong!'); addToLog("editEventGroup", "error", "Attempt to edit event group " + req.params.eventGroupID + " failed with error: " + err);});
});

router.post('/deleteevent/:eventID/:editToken', (req, res) => {
	let submittedEditToken = req.params.editToken;
	Event.findOne(({
		id: req.params.eventID,
		}))
	.then((event) => {
		if (event.editToken === submittedEditToken) {
			// Token matches

			if (event.image){
				eventImage = event.image;
			}

			// Send emails here otherwise they don't exist lol
			if (sendEmails) {
				Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
					attendeeEmails = ids;
					if (!error){
						console.log("Sending emails to: " + attendeeEmails);
						const msg = {
							to: attendeeEmails,
							from: {
								name: 'Gathio',
								email: contactEmail,
							},
							templateId: 'd-e21f3ca49d82476b94ddd8892c72a162',
							dynamic_template_data: {
								subject: 'gathio: Event "' + event.name + '" deleted',
								actionType: 'deleted',
								eventExists: false,
								eventID: req.params.eventID
							}
						}
						sgMail.sendMultiple(msg);
					}
					else {
						console.log("Nothing to send!");
					}
				});
			}

			Event.deleteOne({id: req.params.eventID}, function(err, raw) {
				if (err) {
					res.send(err);
					addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: " + err);
				}
			})
			.then(() => {
				// Delete image
				if (eventImage){
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
			.catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: " + err);});
		}
		else {
			// Token doesn't match
			res.send('Sorry! Something went wrong');
			addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: token does not match");
		}
	})
	.catch((err) => { res.send('Sorry! Something went wrong: ' + err); addToLog("deleteEvent", "error", "Attempt to delete event " + req.params.eventID + " failed with error: " + err);});
});

router.post('/deleteeventgroup/:eventGroupID/:editToken', (req, res) => {
	let submittedEditToken = req.params.editToken;
	EventGroup.findOne(({
		id: req.params.eventGroupID,
		}))
	.then(async (eventGroup) => {
		if (eventGroup.editToken === submittedEditToken) {
			// Token matches

			let linkedEvents = await Event.find({eventGroup: eventGroup._id});

			let linkedEventIDs = linkedEvents.map(event => event._id);
			let eventGroupImage = false;
			if (eventGroup.image){
				eventGroupImage = eventGroup.image;
			}

			EventGroup.deleteOne({id: req.params.eventGroupID}, function(err, raw) {
				if (err) {
					res.send(err);
					addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err);
				}
			})
			.then(() => {
				// Delete image
				if (eventGroupImage){
					fs.unlink(global.appRoot + '/public/events/' + eventGroupImage, (err) => {
					  if (err) {
						res.send(err);
						addToLog("deleteEventGroup", "error", "Attempt to delete event image for event group " + req.params.eventGroupID + " failed with error: " + err);
					  }
					})
				}
				Event.update({_id: {$in: linkedEventIDs}}, { $set: { eventGroup: null } }, { multi: true })
				.then(response => {
					console.log(response);
					addToLog("deleteEventGroup", "success", "Event group " + req.params.eventGroupID + " deleted");
					res.writeHead(302, {
						'Location': '/'
						});
					res.end();
				})
				.catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err);});
			})
			.catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err);});
		}
		else {
			// Token doesn't match
			res.send('Sorry! Something went wrong');
			addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: token does not match");
		}
	})
	.catch((err) => { res.send('Sorry! Something went wrong: ' + err); addToLog("deleteEventGroup", "error", "Attempt to delete event group " + req.params.eventGroupID + " failed with error: " + err);});
});

router.post('/attendevent/:eventID', (req, res) => {
	const newAttendee = {
		name: req.body.attendeeName,
		status: 'attending',
		email: req.body.attendeeEmail
	};

	Event.findOne({
		id: req.params.eventID,
		}, function(err,event) {
    if (!event) return;
		event.attendees.push(newAttendee);
		event.save()
		.then(() => {
			addToLog("addEventAttendee", "success", "Attendee added to event " + req.params.eventID);
			if (sendEmails) {
				if (req.body.attendeeEmail){
					const msg = {
						to: req.body.attendeeEmail,
						from: {
							name: 'Gathio',
							email: contactEmail,
						},
						templateId: 'd-977612474bba49c48b58e269f04f927c',
						dynamic_template_data: {
							subject: 'gathio: ' + event.name,
							eventID: req.params.eventID
						},
					};
					sgMail.send(msg);
				}
			}

			res.writeHead(302, {
				'Location': '/' + req.params.eventID
				});
			res.end();
		})
		.catch((err) => { res.send('Database error, please try again :('); addToLog("addEventAttendee", "error", "Attempt to add attendee to event " + req.params.eventID + " failed with error: " + err); });
	});
});

router.post('/unattendevent/:eventID', (req, res) => {
	Event.update(
	    { id: req.params.eventID },
	    { $pull: { attendees: { email: req.body.attendeeEmail } } }
	)
	.then(response => {
		console.log(response)
		addToLog("removeEventAttendee", "success", "Attendee removed from event " + req.params.eventID);
		if (sendEmails) {
			if (req.body.attendeeEmail){
				const msg = {
					to: req.body.attendeeEmail,
					from: {
						name: 'Gathio',
						email: contactEmail,
					},
					templateId: 'd-56c97755d6394c23be212fef934b0f1f',
					dynamic_template_data: {
						subject: 'gathio: You have been removed from an event',
						eventID: req.params.eventID
					},
				};
				sgMail.send(msg);
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

router.post('/removeattendee/:eventID/:attendeeID', (req, res) => {
	Event.update(
	    { id: req.params.eventID },
	    { $pull: { attendees: { _id: req.params.attendeeID } } }
	)
	.then(response => {
		console.log(response)
		addToLog("removeEventAttendee", "success", "Attendee removed by admin from event " + req.params.eventID);
		if (sendEmails) {
			if (req.body.attendeeEmail){
				const msg = {
					to: req.body.attendeeEmail,
					from: {
						name: 'Gathio',
						email: contactEmail,
					},
					templateId: 'd-f8ee9e1e2c8a48e3a329d1630d0d371f',
					dynamic_template_data: {
						subject: 'gathio: You have been removed from an event',
						eventID: req.params.eventID
					},
				};
				sgMail.send(msg);
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

router.post('/post/comment/:eventID', (req, res) => {
	let commentID = shortid.generate();
	const newComment = {
		id: commentID,
		author: req.body.commentAuthor,
		content: req.body.commentContent,
		timestamp: moment()
	};

	Event.findOne({
		id: req.params.eventID,
		}, function(err,event) {
    if (!event) return;
		event.comments.push(newComment);
		event.save()
		.then(() => {
			addToLog("addEventComment", "success", "Comment added to event " + req.params.eventID);
			if (sendEmails) {
				Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
				attendeeEmails = ids;
					if (!error){
						console.log("Sending emails to: " + attendeeEmails);
						const msg = {
							to: attendeeEmails,
							from: {
								name: 'Gathio',
								email: contactEmail,
							},
							templateId: 'd-756d078561e047aba307155f02b6686d',
							dynamic_template_data: {
								subject: 'gathio: New comment in ' + event.name,
								commentAuthor: req.body.commentAuthor,
								eventID: req.params.eventID
							}
						}
						sgMail.sendMultiple(msg);
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
	let replyID = shortid.generate();
	let commentID = req.params.commentID;
	const newReply = {
		id: replyID,
		author: req.body.replyAuthor,
		content: req.body.replyContent,
		timestamp: moment()
	};
	Event.findOne({
		id: req.params.eventID,
		}, function(err,event) {
      if (!event) return;
			var parentComment = event.comments.id(commentID);
			parentComment.replies.push(newReply);
			event.save()
			.then(() => {
				addToLog("addEventReply", "success", "Reply added to comment " + commentID + " in event " + req.params.eventID);
				if (sendEmails) {
					Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
						attendeeEmails = ids;
						if (!error){
							console.log("Sending emails to: " + attendeeEmails);
							const msg = {
								to: attendeeEmails,
								from: {
									name: 'Gathio',
									email: contactEmail,
								},
								templateId: 'd-756d078561e047aba307155f02b6686d',
								dynamic_template_data: {
									subject: 'gathio: New comment in ' + event.name,
									commentAuthor: req.body.commentAuthor,
									eventID: req.params.eventID
								}
							}
							sgMail.sendMultiple(msg);
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
					'Location': '/' + req.params.eventID  + '?e=' + req.params.editToken
					});
				res.end();
			})
			.catch((err) => { res.send('Sorry! Something went wrong (error deleting): ' + err); addToLog("deleteComment", "error", "Attempt to delete comment " + req.params.commentID + "from event " + req.params.eventID + " failed with error: " + err);});
		}
		else {
			// Token doesn't match
			res.send('Sorry! Something went wrong');
			addToLog("deleteComment", "error", "Attempt to delete comment " + req.params.commentID + "from event " + req.params.eventID + " failed with error: token does not match");
		}
	})
	.catch((err) => { res.send('Sorry! Something went wrong: ' + err); addToLog("deleteComment", "error", "Attempt to delete comment " + req.params.commentID + "from event " + req.params.eventID + " failed with error: " + err);});
});

router.post('/activitypub/inbox', (req, res) => {
  console.log('got an inbox message of type', req.body.type, req.body)

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
  request({
    url: signature_header.keyId,
    headers: {
      'Accept': 'application/activity+json',
      'Content-Type': 'application/activity+json'
    }}, function (error, response, actor) {
    publicKey = JSON.parse(actor).publicKey.publicKeyPem;

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
    const result = verifier.verify(publicKeyBuf, signatureBuf)
    console.log('VALIDATE RESULT:', result)
    if (!result) {
      res.status(401).send('Signature could not be verified.');
    }
    else {
      processInbox(req, res);
    }
  });
});


function processInbox(req, res) {
  if (req.body.object) console.log('containing object of type', req.body.object.type)
	// if a Follow activity hits the inbox
  if (typeof req.body.object === 'string' && req.body.type === 'Follow') {
    const myURL = new URL(req.body.actor);
    let targetDomain = myURL.hostname;
    let eventID = req.body.object.replace(`https://${domain}/`,'');
    // Add the user to the DB of accounts that follow the account
    // get the follower's username
    request({
      url: req.body.actor,
      headers: {
        'Accept': 'application/activity+json',
        'Content-Type': 'application/activity+json'
      }}, function (error, response, body) {
        body = JSON.parse(body)
        const name = body.preferredUsername || body.name || attributedTo;
        const newFollower = {
          actorId: req.body.actor,
          followId: req.body.id,
          name: name,
          actorJson: JSON.stringify(body)
        };
        Event.findOne({
          id: eventID,
          }, function(err,event) {
          // if this account is NOT already in our followers list, add it
          if (event && !event.followers.map(el => el.actorId).includes(req.body.actor)) {
            console.log('made it!')
            event.followers.push(newFollower);
            event.save()
            .then(() => {
              addToLog("addEventFollower", "success", "Follower added to event " + eventID);
              console.log('successful follower add');
              // Accept the follow request
              sendAcceptMessage(req.body, eventID, targetDomain, function(err, resp, status) {
                if (err) {
                  console.log(`Didn't send Accept to ${req.body.actor}, status ${status} with error ${err}`);
                }
                else {
                  console.log('sent Accept to', req.body.actor);
                  // if users can self-RSVP, send a Question to the new follower
                  if (event.usersCanAttend) {
                    const jsonObject = {
                      "@context": "https://www.w3.org/ns/activitystreams",
                      "name": `RSVP to ${event.name}`,
                      "type": "Question",
                       "content": `<span class=\"h-card\"><a href="${req.body.actor}" class="u-url mention">@<span>${name}</span></a></span> Will you attend ${event.name}? (If you reply "Yes", you'll be listed as an attendee on the event page.)`,
                       "oneOf": [
                         {"type":"Note","name": "Yes"},
                         {"type":"Note","name": "No"},
                         {"type":"Note","name": "Maybe"}
                       ],
                      "endTime":event.start.toISOString(),
                      "tag":[{"type":"Mention","href":req.body.actor,"name":name}]
                    }
                    // send direct message to user
                    sendDirectMessage(jsonObject, req.body.actor, eventID, function (error, response, statuscode) {
                      if (error) {
                        console.log(error);
                        res.status(statuscode).json(error);
                      }
                      else {
                        res.status(statuscode).json({messageid: response});
                      }
                    });
                  }
                }
              });
            })
            .catch((err) => { res.status(500).send('Database error, please try again :('); addToLog("addEventFollower", "error", "Attempt to add follower to event " + eventID + " failed with error: " + err); 
            console.log('ERROR', err);
            });
          }
        })
      }) //end request
  }
	// if an Undo activity with a Follow object hits the inbox
  if (req.body && req.body.type === 'Undo' && req.body.object && req.body.object.type === 'Follow') {
    // get the record of all followers for this account
    const eventID = req.body.object.object.replace(`https://${domain}/`,'');
    Event.findOne({
      id: eventID,
      }, function(err,event) {
        if (!event) return;
        // check to see if the Follow object's id matches the id we have on record
        // is this even someone who follows us
        const indexOfFollower = event.followers.findIndex(el => el.actorId === req.body.object.actor);
        if (indexOfFollower !== -1) {
          // does the id we have match the id we are being given
          if (event.followers[indexOfFollower].followId === req.body.object.id) {
            // we have a match and can trust the Undo! remove this person from the followers list
            event.followers.splice(indexOfFollower, 1);
            event.save()
            .then(() => {
              res.send(200);
              addToLog("removeEventFollower", "success", "Follower removed from event " + eventID);
              console.log('successful follower removal')
            })
            .catch((err) => { res.send('Database error, please try again :('); addToLog("removeEventFollower", "error", "Attempt to remove follower from event " + eventID + " failed with error: " + err); 
              console.log('error', err)
            });
          }
        }
    });
  }
	// if a Create activity with a Note object hits the inbox, it might be a vote in a poll
  if (req.body && req.body.type === 'Create' && req.body.object && req.body.object.type === 'Note' && req.body.object.inReplyTo && req.body.object.to) {
    console.log('create note inreplyto!!!')
    // figure out what this is in reply to -- it should be addressed specifically to us
    let {name, attributedTo, inReplyTo, to} = req.body.object;
    // if it's an array just grab the first element, since a poll should only broadcast back to the pollster
    if (Array.isArray(to)) {
      to = to[0];
    }
    const eventID = to.replace(`https://${domain}/`,'');
    // make sure this person is actually a follower
    Event.findOne({
      id: eventID,
      }, function(err,event) {
        if (!event) return;
        // is this even someone who follows us
        const indexOfFollower = event.followers.findIndex(el => el.actorId === req.body.object.attributedTo);
        if (indexOfFollower !== -1) {
          console.log('this person does follow us!')
          // compare the inReplyTo to its stored message, if it exists and it's going to the right follower then this is a valid reply
          const message = event.activityPubMessages.find(el => {
            const content = JSON.parse(el.content);
            return inReplyTo === (content.object && content.object.id);
          });
          if (message) {
            console.log(message);
            const content = JSON.parse(message.content);
            // check if the message we sent out was sent to the actor this incoming message is attributedTo
            if (content.to[0] === attributedTo) {
              // it's a match, this is a valid poll response, add RSVP to database
              // fetch the profile information of the user
							request({
								url: attributedTo,
								headers: {
									'Accept': 'application/activity+json',
									'Content-Type': 'application/activity+json'
								}}, function (error, response, body) {
                  body = JSON.parse(body)
                  // if this account is NOT already in our attendees list, add it
                  if (!event.attendees.map(el => el.id).includes(attributedTo)) {
                    const attendeeName = body.preferredUsername || body.name || attributedTo;
                    const newAttendee = {
                      name: attendeeName,
                      status: 'attending',
                      id: attributedTo
                    };
                    event.attendees.push(newAttendee);
                    event.save()
                    .then(() => {
                      addToLog("addEventAttendee", "success", "Attendee added to event " + req.params.eventID);
                      console.log('added attendee', attendeeName)
                      res.send(200);
                    })
                    .catch((err) => { res.send('Database error, please try again :('); addToLog("addEventAttendee", "error", "Attempt to add attendee to event " + req.params.eventID + " failed with error: " + err); });
                  }
							});
            }
          }
        }
    });
  }
  if (req.body && req.body.type === 'Delete') {
    // figure out if we have a matching comment by id
    const deleteObjectId = req.body.object.id;
    // find all events with comments from the author
    Event.find({
      "comments.actorId":req.body.actor
      }, function(err,events) {
      if (!events) {
        res.sendStatus(404);
        return;
      }

      // find the event with THIS comment from the author
      let eventWithComment = events.find(event => {
        let comments = event.comments;
        return comments.find(comment => {
          if (!comment.activityJson) {
            return false;
          }
          return JSON.parse(comment.activityJson).object.id === req.body.object.id;
        })
      });

      if (!eventWithComment) {
        res.sendStatus(404);
        return;
      }

      // delete the comment
      // find the index of the comment
      let indexOfComment = eventWithComment.comments.findIndex(comment => {
        return JSON.parse(comment.activityJson).object.id === req.body.object.id;
      });
      eventWithComment.comments.splice(indexOfComment, 1);
			eventWithComment.save()
			.then(() => {
				addToLog("deleteComment", "success", "Comment deleted from event " + eventWithComment.id);
        console.log('deleted comment!')
        res.sendStatus(200);
			})
			.catch((err) => { res.sendStatus(500); addToLog("deleteComment", "error", "Attempt to delete comment " + req.body.object.id + "from event " + eventWithComment.id + " failed with error: " + err);});
    });
  }
	// if we are CC'ed on a public or unlisted Create/Note, then this is a comment to us we should replicate
  if (req.body && req.body.type === 'Create' && req.body.object && req.body.object.type === 'Note' && req.body.object.to) {
    console.log('create note!!')
    // figure out what this is in reply to -- it should be addressed specifically to us
    let {name, attributedTo, inReplyTo, to, cc} = req.body.object;
    // normalize cc into an array
    if (typeof cc === 'string') {
      cc = [cc];
    }
    // normalize to into an array
    if (typeof to === 'string') {
      to = [to];
    }
    
    // if this is a public message (in the to or cc fields)
    if (to.includes('https://www.w3.org/ns/activitystreams#Public') || (Array.isArray(cc) && cc.includes('https://www.w3.org/ns/activitystreams#Public'))) {
      // figure out which event(s) of ours it was addressing
      ourEvents = cc.filter(el => el.includes(`https://${domain}/`))
                    .map(el => el.replace(`https://${domain}/`,''));
      // comments should only be on one event. if more than one, ignore (spam, probably) 
      if (ourEvents.length === 1) {
        let eventID = ourEvents[0];
        // add comment
        let commentID = shortid.generate();
        // get the actor for the commenter
        request({
          url: req.body.actor,
          headers: {
            'Accept': 'application/activity+json',
            'Content-Type': 'application/activity+json'
          }}, function (error, response, actor) {
          if (!error) {
            const parsedActor = JSON.parse(actor);
            const name = parsedActor.preferredUsername || parsedActor.name || req.body.actor;
            const newComment = {
              id: commentID,
              actorId: req.body.actor,
              activityId: req.body.object.id,
              author: name,
              content: sanitizeHtml(req.body.object.content, {allowedTags: [], allowedAttributes: {}}).replace('@'+eventID,''),
              timestamp: moment(),
              activityJson: JSON.stringify(req.body),
              actorJson: actor
            };

            Event.findOne({
              id: eventID,
              }, function(err,event) {
              if (!event) {
                return res.sendStatus(404);
              }
              if (!event.usersCanComment) {
                return res.sendStatus(200);
              }
              event.comments.push(newComment);
              event.save()
              .then(() => {
                addToLog("addEventComment", "success", "Comment added to event " + eventID);
                console.log('added comment');
                res.sendStatus(200);
              })
              .catch((err) => { res.status(500).send('Database error, please try again :(' + err); addToLog("addEventComment", "error", "Attempt to add comment to event " + eventID + " failed with error: " + err); console.log('error', err)});
            });
          }
        });
      } // end ourevent
    } // end public message
    // if it's not a public message, let them know that we only support public messages right now
    else {
      // figure out which event(s) of ours it was addressing
      ourEvents = cc.concat(to).filter(el => el.includes(`https://${domain}/`))
                    .map(el => el.replace(`https://${domain}/`,''));
      // comments should only be on one event. if more than one, ignore (spam, probably) 
      if (ourEvents.length === 1) {
        let eventID = ourEvents[0];
        // get the user's actor info
        request({
          url: req.body.actor,
          headers: {
            'Accept': 'application/activity+json',
            'Content-Type': 'application/activity+json'
          }}, function (error, response, actor) { 
            actor = JSON.parse(actor);
            const name = actor.preferredUsername || actor.name || req.body.actor;
            const jsonObject = {
              "@context": "https://www.w3.org/ns/activitystreams",
              "type": "Note",
              "inReplyTo": req.body.object.id,
              "content": `<span class=\"h-card\"><a href="${req.body.actor}" class="u-url mention">@<span>${name}</span></a></span> Sorry, this service only supports posting public messages to the event page. Try contacting the event organizer directly if you need to have a private conversation.`,
              "tag":[{"type":"Mention","href":req.body.actor,"name":name}]
            }
            res.send(200);
            sendDirectMessage(jsonObject, req.body.actor, eventID);
          }
        );
      }
    }
  }
}

router.use(function(req, res, next){
	res.status(404);
	res.render('404', { url: req.url });
	return;
});

addToLog("startup", "success", "Started up successfully");

module.exports = router;
