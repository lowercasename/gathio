import mongoose from "mongoose";

export interface ISubscriber {
  email?: string;
}

export interface IEventGroup extends mongoose.Document {
  id: string;
  name: string;
  description: string;
  image?: string;
  url?: string;
  creatorEmail?: string;
  hostName?: string;
  editToken?: string;
  firstLoad?: boolean;
  events?: mongoose.Types.ObjectId[];
  subscribers?: ISubscriber[];
}

const Subscriber = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
  },
});

const EventGroupSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    trim: true,
    required: true,
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
  editToken: {
    type: String,
    trim: true,
    minlength: 32,
    maxlength: 32,
  },
  firstLoad: {
    type: Boolean,
    trim: true,
    default: true,
  },
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  subscribers: [Subscriber],
});

export default mongoose.model<IEventGroup>("EventGroup", EventGroupSchema);
