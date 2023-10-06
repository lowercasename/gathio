import mongoose from "mongoose";

export interface ILog extends mongoose.Document {
  status: string;
  process: string;
  message: string;
  timestamp: Date;
}

const LogSchema = new mongoose.Schema({
  status: {
    type: String,
    trim: true,
    required: true,
  },
  process: {
    type: String,
    trim: true,
    required: true,
  },
  message: {
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

export default mongoose.model<ILog>("Log", LogSchema);
