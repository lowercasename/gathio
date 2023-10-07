import { Request } from "express";

export const acceptsActivityPub = (req: Request) => {
    return (
        req.headers.accept &&
        (req.headers.accept.includes("application/activity+json") ||
            req.headers.accept.includes("application/ld+json"))
    );
};
