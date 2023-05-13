import mongoose from "mongoose";

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

export default mongoose.model("EventGroup", EventGroupSchema);
