import mongoose from "mongoose";

export interface User extends mongoose.Document {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<User>("User", UserSchema);
