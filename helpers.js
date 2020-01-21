const mongoose = require('mongoose');
const Log = mongoose.model('Log');
var moment = require('moment-timezone');

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

module.exports = {
  addToLog
}
