import mongoose from "mongoose";

export type PasskeyChallengePurpose = "registration" | "authentication";

export interface PasskeyChallenge extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  email: string;
  challenge: string;
  purpose: PasskeyChallengePurpose;
  expiryTime: Date;
}

const PasskeyChallengeSchema = new mongoose.Schema({
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
  challenge: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ["registration", "authentication"],
    required: true,
  },
  expiryTime: {
    type: Date,
    required: true,
  },
});

export default mongoose.model<PasskeyChallenge>(
  "PasskeyChallenge",
  PasskeyChallengeSchema,
);
