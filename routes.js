const fs = require('fs');

const express = require('express');

const mongoose = require('mongoose');

const shortid = require('shortid');

const randomstring = require("randomstring");

const { body, validationResult } = require('express-validator/check');

const router = express.Router();

const Event = mongoose.model('Event');
const Log = mongoose.model('Log');

var moment = require('moment');

const marked = require('marked');

const ical = require('ical');

const apiCredentials = require('./config/api.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiCredentials.sendgrid);

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
	const too_old = moment().subtract(7, 'days').toDate();
	console.log(too_old);

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
	console.log("Showing event")
	console.log("req.params.eventID",req.params.eventID)
	Event.findOne({
		id: req.params.eventID
		})
		.then((event) => {
			console.log("event",event)
			if (event) {
				parsedLocation = event.location.replace(/\s+/g, '+');
				if (moment(event.end).isSame(event.start, 'day')){
					// Happening during one day
					displayDate = moment(event.start).format('dddd D MMMM YYYY [<span class="text-muted">from</span>] h:mm a') + moment(event.end).format(' [<span class="text-muted">to</span>] h:mm a');
				}
				else {
					displayDate = moment(event.start).format('dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a') + moment(event.end).format(' [<span class="text-muted">–</span>] dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a');
				}
				parsedStart = moment(event.start).format('YYYYMMDD[T]HHmmss');
				parsedEnd = moment(event.end).format('YYYYMMDD[T]HHmmss');
				let eventHasConcluded = false;
				if (moment(event.end).isBefore(moment())){
					eventHasConcluded = true;
				}
				fromNow = moment(event.start).fromNow();
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
				res.render('event', {title: event.name, escapedName: escapedName, eventData: event, parsedLocation: parsedLocation, parsedStart: parsedStart, parsedEnd: parsedEnd, displayDate: displayDate, fromNow: fromNow, parsedDescription: parsedDescription, editingEnabled: editingEnabled, eventHasCoverImage: eventHasCoverImage, eventHasHost: eventHasHost, firstLoad: firstLoad, eventHasConcluded: eventHasConcluded })
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
				.quality(60) // set JPEG quality
				.write('./public/events/' + eventID + '.jpg'); // save
		});
		eventImageFilename = eventID + '.jpg';
	}
	const event = new Event({
		id: eventID,
		type: req.body.eventType,
		name: req.body.eventName,
		location: req.body.eventLocation,
		start: req.body.eventStart,
		end: req.body.eventEnd,
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
			sgMail.send(msg).then(() => {
				res.writeHead(302, {
  				'Location': '/' + eventID + '?e=' + editToken
				});
				res.end();
			}).catch(e => {
				console.error(e.toString());
				res.status(500).end();
			});
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
				addToLog("createEvent", "success", "Event " + eventID + "created");
				// Send email with edit link
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
				sgMail.send(msg).then(() => {
					res.writeHead(302, {
	  				'Location': '/' + eventID + '?e=' + editToken
					});
					res.end();
				}).catch(e => {
					console.error(e.toString());
					res.status(500).end();
				});
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
						.quality(60) // set JPEG quality
						.write('./public/events/' + eventID + '.jpg'); // save
				});
				eventImageFilename = eventID + '.jpg';
			}
			const updatedEvent = {
				name: req.body.eventName,
				location: req.body.eventLocation,
				start: req.body.eventStart,
				end: req.body.eventEnd,
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

			res.writeHead(302, {
				'Location': '/' + req.params.eventID
				});
			res.end();
		})
		.catch((err) => { res.send('Database error, please try again :('); addToLog("addEventAttendee", "error", "Attempt to add attendee to event " + req.params.eventID + " failed with error: " + err); });
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
