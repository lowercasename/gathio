import mongoose from "mongoose";

export interface Passkey extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  email: string;
  publicKey: Buffer;
  credentialId: string;
  counter: number;
  transports: string[];
  deviceName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PasskeySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    publicKey: {
      type: Buffer,
      required: true,
    },
    credentialId: {
      type: String,
      required: true,
      unique: true,
    },
    counter: {
      type: Number,
      required: true,
      default: 0,
    },
    transports: {
      type: [String],
      default: [],
    },
    deviceName: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<Passkey>("Passkey", PasskeySchema);
