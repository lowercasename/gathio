import mongoose from "mongoose";

export interface Passkey {
  id: string;
  email: string;
  publicKey: string;
  credentialId: string;
  counter: number;
  createdAt: Date;
  updatedAt: Date;
}

const PasskeySchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  publicKey: {
    type: String,
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
}, {
  timestamps: true,
});

export default mongoose.model<Passkey>("Passkey", PasskeySchema);
