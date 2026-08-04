import mongoose from "mongoose";

export interface PasskeyChallenge {
  id: string;
  email: string;
  challenge: string;
  expiryTime: Date;
}

const PasskeyChallengeSchema = new mongoose.Schema({
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
  expiryTime: {
    type: Date,
    required: true,
  },
});

export default mongoose.model<PasskeyChallenge>("PasskeyChallenge", PasskeyChallengeSchema);
