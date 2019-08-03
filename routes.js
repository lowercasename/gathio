const fs = require('fs');

const express = require('express');

const mongoose = require('mongoose');

const shortid = require('shortid');

const randomstring = require("randomstring");

const { body, validationResult } = require('express-validator/check');

const router = express.Router();

const Event = mongoose.model('Event');
const Log = mongoose.model('Log');

var moment = require('moment-timezone');

const marked = require('marked');

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
				res.set("X-Robots-Tag", "noindex");
				res.render('event', {
					title: event.name,
					escapedName: escapedName,
					eventData: event,
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
					eventHasBegun: eventHasBegun
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

// BACKEND ROUTES

//router.post('/login',
//  passport.authenticate('local', { successRedirect: '/admin',
//                                   failureRedirect: '/login',
//                                   failureFlash: true })
//);


router.post('/newevent', (req, res) => {
	let eventID = shortid.generate();
	let editToken = randomstring.generate();
	let eventImageFilename = "";
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
		usersCanAttend: req.body.joinCheckbox ? true : false,
		showUsersList: req.body.guestlistCheckbox ? true : false,
		usersCanComment: req.body.interactionCheckbox ? true : false,
		firstLoad: true
	});
	event.save()
		.then(() => {
			addToLog("createEvent", "success", "Event " + eventID + "created");
			// Send email with edit link
			if (sendEmails) {
				const msg = {
					to: req.body.creatorEmail,
					from: {
						name: 'Gathio',
						email: 'notifications@gath.io',
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
});

router.post('/importevent', (req, res) => {
	let eventID = shortid.generate();
	let editToken = randomstring.generate();
	if (req.files && Object.keys(req.files).length != 0) {
		importediCalObject = ical.parseICS(req.files.icsImportControl.data.toString('utf8'));
		for (var key in importediCalObject) {
    	importedEventData = importediCalObject[key];
		}
		creatorEmail = importedEventData.organizer.val.replace("MAILTO:", "")
		const event = new Event({
			id: eventID,
			type: 'public',
			name: importedEventData.summary,
			location: importedEventData.location,
			start: importedEventData.start,
			end: importedEventData.end,
			timezone: importedEventData.start.tz,
			description: importedEventData.description,
			image: '',
			creatorEmail: creatorEmail,
			url: '',
			hostName: importedEventData.organizer.params.CN,
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
							email: 'notifications@gath.io',
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

router.post('/editevent/:eventID/:editToken', (req, res) => {
	let submittedEditToken = req.params.editToken;
	Event.findOne(({
		id: req.params.eventID,
		}))
	.then((event) => {
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
				usersCanComment: req.body.interactionCheckbox ? true : false
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
							const msg = {
								to: attendeeEmails,
								from: {
									name: 'Gathio',
									email: 'notifications@gath.io',
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
								email: 'notifications@gath.io',
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

router.post('/attendevent/:eventID', (req, res) => {
	const newAttendee = {
		name: req.body.attendeeName,
		status: 'attending',
		email: req.body.attendeeEmail
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
					const msg = {
						to: req.body.attendeeEmail,
						from: {
							name: 'Gathio',
							email: 'notifications@gath.io',
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
						email: 'notifications@gath.io',
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
						email: 'notifications@gath.io',
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
								email: 'notifications@gath.io',
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
									email: 'notifications@gath.io',
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

router.use(function(req, res, next){
	res.status(404);
	res.render('404', { url: req.url });
	return;
});

addToLog("startup", "success", "Started up successfully");

module.exports = router;
