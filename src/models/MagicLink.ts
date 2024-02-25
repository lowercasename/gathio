import mongoose from "mongoose";

export type MagicLinkAction = "createEvent";

export interface MagicLink {
    id: string;
    email: string;
    token: string;
    expiryTime: Date;
    permittedActions: MagicLinkAction[];
}

const MagicLinkSchema = new mongoose.Schema({
    email: {
        type: String,
        trim: true,
        required: true,
    },
    token: {
        type: String,
        trim: true,
        required: true,
    },
    expiryTime: {
        type: Date,
        trim: true,
        required: true,
    },
    permittedActions: {
        type: [String],
        required: true,
    },
});

export default mongoose.model<MagicLink>("MagicLink", MagicLinkSchema);
