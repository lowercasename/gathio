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

const domain = require('./config/domain.js').domain;
const contactEmail = require('./config/domain.js').email;
const siteName = require('./config/domain.js').sitename

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
const icalGenerator = require('ical-generator');
const cal = icalGenerator({
	domain: 'gath.io',
	name: 'Gathio'
});

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


// FRONTEND ROUTES

router.get('/', (req, res) => {
  res.render('home');
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
						if (req.query.e == eventEditToken){
							editingEnabled = true;
						}
						else {
							editingEnabled = false;
						}
					}
				}
				let eventAttendees = event.attendees.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0))
        .map(el => {
          if (!el.id) {
            el.id = el._id;
          }
          return el;
        })
        .filter((obj, pos, arr) => {
            return arr.map(mapObj => mapObj.id).indexOf(obj.id) === pos;
        });

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
					image: (eventHasCoverImage ? 'https://gath.io/events/' + event.image : null),
					url: 'https://gath.io/' + req.params.eventID
				};
				res.set("X-Robots-Tag", "noindex");
				res.render('event', {
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
				if (events.some(e => e.eventHasConcluded == false)) {
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
						if (req.query.e == eventGroupEditToken){
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
					image: (eventGroupHasCoverImage ? 'https://gath.io/events/' + eventGroup.image : null),
					url: 'https://gath.io/' + req.params.eventID
				};
				res.set("X-Robots-Tag", "noindex");
				res.render('eventgroup', {
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

router.get('/exportevent/:eventID', (req, res) => {
	Event.findOne({
		id: req.params.eventID
		})
		.populate('eventGroup')
		.then((event) => {
			if (event) {
				const icalEvent = cal.createEvent({
					start: moment.tz(event.start, event.timezone),
					end: moment.tz(event.start, event.timezone),
					timezone: event.timezone,
					timestamp: moment(),
					summary: event.name,
					description: event.description,
					organizer: {
						name: event.hostName ? event.hostName : "Anonymous",
						email: event.creatorEmail
					},
					location: event.location,
					url: 'https://gath.io/' + event.id
				});

				let string = cal.toString();
				console.log(string)
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
})

// BACKEND ROUTES

//router.post('/login',
//  passport.authenticate('local', { successRedirect: '/admin',
//                                   failureRedirect: '/login',
//                                   failureFlash: true })
//);


router.post('/newevent', async (req, res) => {
	let eventID = shortid.generate();
	let editToken = randomstring.generate();
	let eventImageFilename = "";
	let isPartOfEventGroup = false;
	if (req.files && Object.keys(req.files).length != 0) {
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
		firstLoad: true
	});
	event.save()
		.then((event) => {
			addToLog("createEvent", "success", "Event " + eventID + "created");
			// Send email with edit link
			if (sendEmails) {
        req.app.get('hbsInstance').renderView('./views/emails/createevent.handlebars', {eventID, editToken, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) {
          const msg = {
            to: req.body.creatorEmail,
            from: {
              name: siteName,
              email: contactEmail,
            },
            subject: `${siteName}: ${req.body.eventName}`,
            html,
          };
          sgMail.send(msg).catch(e => {
            console.error(e.toString());
            res.status(500).end();
          });
        });
			}
			res.writeHead(302, {
			'Location': '/' + eventID + '?e=' + editToken
			});
			res.end();
		})
		.catch((err) => { res.status(500).send('Database error, please try again :( - ' + err); addToLog("createEvent", "error", "Attempt to create event failed with error: " + err);});
});

router.post('/importevent', (req, res) => {
	let eventID = shortid.generate();
	let editToken = randomstring.generate();
	if (req.files && Object.keys(req.files).length != 0) {
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
			timezone: typeof importedEventData.start.tz != 'undefined' ? importedEventData.start.tz : "Etc/UTC",
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
				if (sendEmails) {
          req.app.get('hbsInstance').renderView('./views/emails/createevent.handlebars', {eventID, editToken, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) {
            const msg = {
              to: req.body.creatorEmail,
              from: {
                name: siteName,
                email: contactEmail,
              },
              subject: `${siteName}: ${req.body.eventName}`,
              html,
            };
            sgMail.send(msg).catch(e => {
              console.error(e.toString());
              res.status(500).end();
            });
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
	if (req.files && Object.keys(req.files).length != 0) {
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
        req.app.get('hbsInstance').renderView('./views/emails/createeventgroup.handlebars', {eventGroupID, editToken, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) {
          const msg = {
            to: req.body.creatorEmail,
            from: {
              name: siteName,
              email: contactEmail,
            },
            subject: `${siteName}: ${req.body.eventGroupName}`,
            html,
          };
          sgMail.send(msg).catch(e => {
            console.error(e.toString());
            res.status(500).end();
          });
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
			if (req.files && Object.keys(req.files).length != 0) {
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
				eventGroup: isPartOfEventGroup ? eventGroup._id : null
			}
			Event.findOneAndUpdate({id: req.params.eventID}, updatedEvent, function(err, raw) {
				if (err) {
					addToLog("editEvent", "error", "Attempt to edit event " + req.params.eventID + " failed with error: " + err);
					res.send(err);
				}
			})
			.then(() => {
				addToLog("editEvent", "success", "Event " + req.params.eventID + " edited");
				if (sendEmails) {
					Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
						attendeeEmails = ids;
						if (!error && attendeeEmails != ""){
							console.log("Sending emails to: " + attendeeEmails);
              req.app.get('hbsInstance').renderView('./views/emails/editevent.handlebars', {diffText, eventID: req.params.eventID, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) {
                const msg = {
                  to: attendeeEmails,
                  from: {
                    name: siteName,
                    email: contactEmail,
                  },
                  subject: `${siteName}: ${event.name} was just edited`,
                  html,
                };
                sgMail.sendMultiple(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
              });
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
			if (req.files && Object.keys(req.files).length != 0) {
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
				// 					email: 'notifications@gath.io',
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

router.post('/deleteimage/:eventID/:editToken', (req, res) => {
	let submittedEditToken = req.params.editToken;
	Event.findOne(({
		id: req.params.eventID,
	}))
	.then((event) => {
		if (event.editToken === submittedEditToken) {
			// Token matches
			if (event.image){
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
			if (event.image){
				eventImage = event.image;
			}

			// Send emails here otherwise they don't exist lol
			if (sendEmails) {
				Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
					attendeeEmails = ids;
					if (!error){
						console.log("Sending emails to: " + attendeeEmails);
            req.app.get('hbsInstance').renderView('./views/emails/deleteevent.handlebars', {siteName, domain, eventName: event.name, cache: true, layout: 'email.handlebars'}, function(err, html) {
              const msg = {
                to: attendeeEmails,
                from: {
                  name: siteName,
                  email: contactEmail,
                },
                subject: `${siteName}: ${event.name} was deleted`,
                html,
              };
              sgMail.sendMultiple(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
            });
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
		email: req.body.attendeeEmail,
		removalPassword: req.body.removeAttendancePassword
	};

	Event.findOne({
		id: req.params.eventID,
		}, function(err,event) {
		event.attendees.push(newAttendee);
		event.save()
		.then(() => {
			addToLog("addEventAttendee", "success", "Attendee added to event " + req.params.eventID);
			if (sendEmails) {
				if (req.body.attendeeEmail){
          req.app.get('hbsInstance').renderView('./views/emails/addeventattendee.handlebars', {eventID: req.params.eventID, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) {
            const msg = {
              to: req.body.attendeeEmail,
              from: {
                name: siteName,
                email: contactEmail,
              },
              subject: `${siteName}: You're RSVPed to ${event.name}`,
              html,
            };
            sgMail.send(msg).catch(e => {
              console.error(e.toString());
              res.status(500).end();
            });
          });
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
	    { $pull: { attendees: { removalPassword: req.body.removeAttendancePassword } } }
	)
	.then(response => {
		console.log(response)
		addToLog("unattendEvent", "success", "Attendee removed self from event " + req.params.eventID);
		if (sendEmails) {
			if (req.body.attendeeEmail){
        req.app.get('hbsInstance').renderView('./views/emails/unattendevent.handlebars', {eventID: req.params.eventID, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) { const msg = {
            to: req.body.attendeeEmail,
            from: {
              name: siteName,
              email: contactEmail,
            },
						subject: `${siteName}: You have been removed from an event`,
            html,
          };
          sgMail.send(msg).catch(e => {
            console.error(e.toString());
            res.status(500).end();
          });
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
			if (req.body.attendeeEmail){
        req.app.get('hbsInstance').renderView('./views/emails/removeeventattendee.handlebars', {eventName: req.params.eventName, siteName, domain, cache: true, layout: 'email.handlebars'}, function(err, html) { const msg = {
            to: req.body.attendeeEmail,
            from: {
              name: siteName,
              email: contactEmail,
            },
						subject: `${siteName}: You have been removed from an event`,
            html,
          };
          sgMail.send(msg).catch(e => {
            console.error(e.toString());
            res.status(500).end();
          });
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
		event.comments.push(newComment);
		event.save()
		.then(() => {
			addToLog("addEventComment", "success", "Comment added to event " + req.params.eventID);
			if (sendEmails) {
				Event.findOne({id: req.params.eventID}).distinct('attendees.email', function(error, ids) {
				attendeeEmails = ids;
					if (!error){
						console.log("Sending emails to: " + attendeeEmails);
            req.app.get('hbsInstance').renderView('./views/emails/addeventcomment.handlebars', {siteName, domain, eventID: req.params.eventID, commentAuthor: req.body.commentAuthor, cache: true, layout: 'email.handlebars'}, function(err, html) {
              const msg = {
                to: attendeeEmails,
                from: {
                  name: siteName,
                  email: contactEmail,
                },
                subject: `${siteName}: New comment in ${event.name}`,
                html,
              };
              sgMail.sendMultiple(msg).catch(e => {
                console.error(e.toString());
                res.status(500).end();
              });
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
              req.app.get('hbsInstance').renderView('./views/emails/addeventcomment.handlebars', {siteName, domain, eventID: req.params.eventID, commentAuthor: req.body.replyAuthor, cache: true, layout: 'email.handlebars'}, function(err, html) {
                const msg = {
                  to: attendeeEmails,
                  from: {
                    name: siteName,
                    email: contactEmail,
                  },
                  subject: `${siteName}: New comment in ${event.name}`,
                  html,
                };
                sgMail.sendMultiple(msg).catch(e => {
                  console.error(e.toString());
                  res.status(500).end();
                });
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

router.use(function(req, res, next){
	res.status(404);
	res.render('404', { url: req.url });
	return;
});

addToLog("startup", "success", "Started up successfully");

module.exports = router;
