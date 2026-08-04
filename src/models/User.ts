import mongoose from "mongoose";

export interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    required: true,
    unique: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

export default mongoose.model<User>("User", UserSchema);