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
  },
  removalPassword: {
    type: String,
    trim: true
  },
  id: {
    type: String,
    trim: true
  }
})

const Followers = new mongoose.Schema({
  // this is the id of the original follow *request*, which we use to validate Undo events
  followId: {
    type: String,
    trim: true
  },
  // this is the actual remote user profile id
  actorId: {
    type: String,
    trim: true
  },
  // this is the stringified JSON of the entire user profile
  actorJson: {
    type: String,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
}, { _id: false })

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

const ActivityPubMessages = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    sparse: true
  },
  content: {
    type: String,
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
  activityJson: {
    type: String,
    trim: true
  },
  actorJson: {
    type: String,
    trim: true
  },
  activityId: {
    type: String,
    trim: true
  },
  actorId: {
    type: String,
    trim: true
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
  prettyName: {
    type: String,
    trim: true
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
  eventGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'EventGroup' },
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
  maxAttendees: {
    type: Number
  },
  comments: [CommentSchema],
  activityPubActor: {
    type: String,
    trim: true
  },
  activityPubEvent: {
    type: String,
    trim: true
  },
  publicKey: {
    type: String,
    trim: true
  },
  privateKey: {
    type: String,
    trim: true
  },
  followers: [Followers],
  activityPubMessages: [ActivityPubMessages]
});

module.exports = mongoose.model('Event', EventSchema);
