const mongoose = require('mongoose');

const Attendees = new mongoose.Schema({
	name: {
		type: String,
		trim: true
	},
	status: {
		type: String,
		trim: true
	},
	email: {
		type: String,
		trim: true
	}
})

const ReplySchema = new mongoose.Schema({
	id: {
		type: String,
		required: true,
    unique: true,
		sparse: true
	},
	author: {
		type: String,
		trim: true,
		required: true
	},
	content: {
		type: String,
		trim: true,
		required: true
	},
	timestamp: {
		type: Date,
		trim: true,
		required: true
	}
})

const CommentSchema = new mongoose.Schema({
	id: {
		type: String,
		required: true,
    unique: true,
		sparse: true
	},
	author: {
		type: String,
		trim: true,
		required: true
	},
	content: {
		type: String,
		trim: true,
		required: true
	},
	timestamp: {
		type: Date,
		trim: true,
		required: true
	},
	replies: [ReplySchema]
})

const EventSchema = new mongoose.Schema({
	id: {
		type: String,
		required: true,
    unique: true
	},
	type: {
    type: String,
    trim: true,
		required: true
  },
  name: {
    type: String,
    trim: true,
		required: true
  },
  location: {
    type: String,
    trim: true,
		required: true
  },
	start: { // Stored as a UTC timestamp
    type: Date,
    trim: true,
		required: true
  },
	end: { // Stored as a UTC timestamp
    type: Date,
    trim: true,
		required: true
  },
  timezone: {
		type: String,
		default: 'Etc/UTC'
  },
	description: {
		type: String,
		trim: true,
		required: true
	},
	image: {
		type: String,
		trim: true
	},
	url: {
		type: String,
		trim: true
	},
	creatorEmail: {
		type: String,
		trim: true
	},
	hostName: {
		type: String,
		trim: true
	},
	viewPassword: {
    type: String,
    trim: true
  },
	editPassword: {
    type: String,
    trim: true
  },
	editToken: {
    type: String,
    trim: true,
		minlength: 32,
		maxlength: 32
  },
	usersCanAttend: {
    type: Boolean,
    trim: true,
		default: false
  },
	showUsersList: {
    type: Boolean,
    trim: true,
		default: false
  },
	usersCanComment: {
    type: Boolean,
    trim: true,
		default: false
  },
	firstLoad: {
		type: Boolean,
		trim: true,
		default: true
	},
	attendees: [Attendees],
	comments: [CommentSchema]
});

module.exports = mongoose.model('Event', EventSchema);
