import mongoose from "mongoose";

export interface IAttendee {
  name: string;
  status?: string;
  email?: string;
  removalPassword?: string;
  id?: string;
  number?: number;
  created?: Date;
  _id: string;
  visibility?: "public" | "private";
  approved?: boolean; // Host has approved this attendee to view protected info
}

export interface IReply {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
}

export interface IComment {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
  activityJson?: string;
  actorJson?: string;
  activityId?: string;
  actorId?: string;
  replies?: IReply[];
}

export interface IFollower {
  followId?: string;
  actorId?: string;
  actorJson?: string;
  name?: string;
}

export interface IActivityPubMessage {
  id?: string;
  content?: string;
}

export interface IEvent extends mongoose.Document {
  id: string;
  type: string;
  name: string;
  location: string;
  start: Date;
  end: Date;
  timezone: string;
  description: string;
  image?: string;
  url?: string;
  creatorEmail?: string;
  hostName?: string;
  viewPassword?: string;
  editPassword?: string;
  editToken?: string;
  eventGroup?: mongoose.Types.ObjectId;
  usersCanAttend?: boolean;
  showUsersList?: boolean;
  usersCanComment?: boolean;
  firstLoad?: boolean;
  attendees?: IAttendee[];
  maxAttendees?: number;
  comments?: IComment[];
  activityPubActor?: string;
  activityPubEvent?: string;
  publicKey?: string;
  privateKey?: string;
  followers?: IFollower[];
  activityPubMessages?: IActivityPubMessage[];
  showOnPublicList?: boolean;
  approveRegistrations?: boolean; // Per-event: hide location until attendee approved
}

export const getApprovedAttendeeCount = (
  event: Pick<IEvent, "attendees" | "approveRegistrations">,
): number => {
  if (!event.attendees) return 0;
  return event.attendees.reduce((acc, a) => {
    if (a.status !== "attending") return acc;
    if (event.approveRegistrations && !a.approved) return acc;
    return acc + (a.number || 1);
  }, 0);
};

const Attendees = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
  },
  removalPassword: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },
  id: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
  },
  // The number of people that are attending under one 'attendee' object
  number: {
    type: Number,
    trim: true,
    default: 1,
  },
  visibility: {
    type: String,
    trim: true,
    default: "public",
  },
  created: Date,
  approved: {
    type: Boolean,
    default: false,
  },
});

const Followers = new mongoose.Schema(
  {
    // this is the id of the original follow *request*, which we use to validate Undo events
    followId: {
      type: String,
      trim: true,
    },
    // this is the actual remote user profile id
    actorId: {
      type: String,
      trim: true,
    },
    // this is the stringified JSON of the entire user profile
    actorJson: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const ReplySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
  },
  author: {
    type: String,
    trim: true,
    required: true,
  },
  content: {
    type: String,
    trim: true,
    required: true,
  },
  timestamp: {
    type: Date,
    trim: true,
    required: true,
  },
});

const ActivityPubMessages = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
  },
  content: {
    type: String,
    trim: true,
    required: true,
  },
});

const CommentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
  },
  author: {
    type: String,
    trim: true,
    required: true,
  },
  content: {
    type: String,
    trim: true,
    required: true,
  },
  timestamp: {
    type: Date,
    trim: true,
    required: true,
  },
  activityJson: {
    type: String,
    trim: true,
  },
  actorJson: {
    type: String,
    trim: true,
  },
  activityId: {
    type: String,
    trim: true,
  },
  actorId: {
    type: String,
    trim: true,
  },
  replies: [ReplySchema],
});

const EventSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
    trim: true,
    required: true,
  },
  name: {
    type: String,
    trim: true,
    required: true,
  },
  location: {
    type: String,
    trim: true,
    required: true,
  },
  start: {
    // Stored as a UTC timestamp
    type: Date,
    trim: true,
    required: true,
  },
  end: {
    // Stored as a UTC timestamp
    type: Date,
    trim: true,
    required: true,
  },
  timezone: {
    type: String,
    default: "Etc/UTC",
  },
  description: {
    type: String,
    trim: true,
    required: true,
  },
  image: {
    type: String,
    trim: true,
  },
  url: {
    type: String,
    trim: true,
  },
  creatorEmail: {
    type: String,
    trim: true,
  },
  hostName: {
    type: String,
    trim: true,
  },
  viewPassword: {
    type: String,
    trim: true,
  },
  editPassword: {
    type: String,
    trim: true,
  },
  editToken: {
    type: String,
    trim: true,
    minlength: 32,
    maxlength: 32,
  },
  eventGroup: { type: mongoose.Schema.Types.ObjectId, ref: "EventGroup" },
  usersCanAttend: {
    type: Boolean,
    trim: true,
    default: false,
  },
  showUsersList: {
    type: Boolean,
    trim: true,
    default: false,
  },
  usersCanComment: {
    type: Boolean,
    trim: true,
    default: false,
  },
  firstLoad: {
    type: Boolean,
    trim: true,
    default: true,
  },
  attendees: [Attendees],
  maxAttendees: {
    type: Number,
  },
  comments: [CommentSchema],
  activityPubActor: {
    type: String,
    trim: true,
  },
  activityPubEvent: {
    type: String,
    trim: true,
  },
  publicKey: {
    type: String,
    trim: true,
  },
  privateKey: {
    type: String,
    trim: true,
  },
  followers: [Followers],
  activityPubMessages: [ActivityPubMessages],
  showOnPublicList: {
    type: Boolean,
    default: false,
  },
  approveRegistrations: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model<IEvent>("Event", EventSchema);
