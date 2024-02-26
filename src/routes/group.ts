import { Router, Response, Request } from "express";
import multer from "multer";
import { generateEditToken, generateEventID } from "../util/generator.js";
import { validateGroupData } from "../util/validation.js";
import Jimp from "jimp";
import { addToLog } from "../helpers.js";
import EventGroup from "../models/EventGroup.js";
import { sendEmailFromTemplate } from "../lib/email.js";
import { marked } from "marked";
import { renderPlain } from "../util/markdown.js";
import { checkMagicLink, getConfigMiddleware } from "../lib/middleware.js";

const storage = multer.memoryStorage();
// Accept only JPEG, GIF or PNG images, up to 10MB
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (_, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        if (!mimetype) {
            return cb(new Error("Only JPEG, PNG and GIF images are allowed."));
        }
        cb(null, true);
    },
});

const router = Router();

router.use(getConfigMiddleware);

router.post(
    "/group",
    upload.single("imageUpload"),
    checkMagicLink,
    async (req: Request, res: Response) => {
        const { data: groupData, errors } = validateGroupData(req.body);
        if (errors && errors.length > 0) {
            return res.status(400).json({ errors });
        }
        if (!groupData) {
            return res.status(400).json({
                errors: [
                    {
                        message: "No group data was provided.",
                    },
                ],
            });
        }

        try {
            const groupID = generateEventID();
            const editToken = generateEditToken();
            let groupImageFilename;

            if (req.file?.buffer) {
                groupImageFilename = await Jimp.read(req.file.buffer)
                    .then((img) => {
                        img.resize(920, Jimp.AUTO) // resize
                            .quality(80) // set JPEG quality
                            .write("./public/events/" + groupID + ".jpg"); // save
                        return groupID + ".jpg";
                    })
                    .catch((err) => {
                        addToLog(
                            "Jimp",
                            "error",
                            "Attempt to edit image failed with error: " + err,
                        );
                    });
            }

            const eventGroup = new EventGroup({
                id: groupID,
                name: groupData.eventGroupName,
                description: groupData.eventGroupDescription,
                image: groupImageFilename,
                creatorEmail: groupData.creatorEmail,
                url: groupData.eventGroupURL,
                hostName: groupData.hostName,
                editToken: editToken,
                firstLoad: true,
                showOnPublicList: groupData.publicBoolean,
            });

            await eventGroup.save();

            addToLog(
                "createEventGroup",
                "success",
                "Event group " + groupID + " created",
            );

            // Send email with edit link
            if (groupData.creatorEmail && req.app.locals.sendEmails) {
                sendEmailFromTemplate(
                    groupData.creatorEmail,
                    `${eventGroup.name}`,
                    "createEventGroup",
                    {
                        eventGroupID: eventGroup.id,
                        editToken: eventGroup.editToken,
                        siteName: res.locals.config?.general.site_name,
                        siteLogo: res.locals.config?.general.email_logo_url,
                        domain: res.locals.config?.general.domain,
                    },
                    req,
                );
            }

            res.status(200).json({
                id: groupID,
                editToken: editToken,
                url: `/group/${groupID}?e=${editToken}`,
            });
        } catch (err) {
            console.error(err);
            addToLog(
                "createEvent",
                "error",
                "Attempt to create event failed with error: " + err,
            );
            return res.status(500).json({
                errors: [
                    {
                        message: err,
                    },
                ],
            });
        }
    },
);

router.put(
    "/group/:eventGroupID",
    upload.single("imageUpload"),
    async (req: Request, res: Response) => {
        const { data: groupData, errors } = validateGroupData(req.body);
        if (errors && errors.length > 0) {
            return res.status(400).json({ errors });
        }
        if (!groupData) {
            return res.status(400).json({
                errors: [
                    {
                        message: "No group data was provided.",
                    },
                ],
            });
        }

        try {
            const submittedEditToken = req.body.editToken;
            const eventGroup = await EventGroup.findOne({
                id: req.params.eventGroupID,
            });
            if (!eventGroup) {
                return res.status(404).json({
                    errors: [
                        {
                            message: "Event group not found.",
                        },
                    ],
                });
            }

            if (eventGroup.editToken !== submittedEditToken) {
                // Token doesn't match
                addToLog(
                    "editEventGroup",
                    "error",
                    `Attempt to edit event group ${req.params.eventGroupID} failed with error: token does not match`,
                );
                return res.status(403).json({
                    errors: [
                        {
                            message: "Edit token is invalid.",
                        },
                    ],
                });
            }
            // Token matches
            // If there is a new image, upload that first
            let eventGroupID = req.params.eventGroupID;
            let eventGroupImageFilename = eventGroup.image;
            if (req.file?.buffer) {
                Jimp.read(req.file.buffer)
                    .then((img) => {
                        img.resize(920, Jimp.AUTO) // resize
                            .quality(80) // set JPEG quality
                            .write(`./public/events/${eventGroupID}.jpg`); // save
                    })
                    .catch((err) => {
                        addToLog(
                            "Jimp",
                            "error",
                            "Attempt to edit image failed with error: " + err,
                        );
                    });
                eventGroupImageFilename = eventGroupID + ".jpg";
            }

            const updatedEventGroup = {
                name: req.body.eventGroupName,
                description: req.body.eventGroupDescription,
                url: req.body.eventGroupURL,
                hostName: req.body.hostName,
                image: eventGroupImageFilename,
                showOnPublicList: groupData.publicBoolean,
            };

            await EventGroup.findOneAndUpdate(
                { id: req.params.eventGroupID },
                updatedEventGroup,
            );

            addToLog(
                "editEventGroup",
                "success",
                "Event group " + req.params.eventGroupID + " edited",
            );

            res.sendStatus(200);
        } catch (err) {
            console.error(err);
            addToLog(
                "editEventGroup",
                "error",
                "Attempt to edit event group " +
                    req.params.eventGroupID +
                    " failed with error: " +
                    err,
            );
            return res.status(500).json({
                errors: [
                    {
                        message: err,
                    },
                ],
            });
        }
    },
);

// Accepts a JSON object of event/group IDs mapped to edit tokens.
// Returns an object of basic group data for each of the IDs
// which are valid groups and have an edit token which matches.
router.post("/known/groups", async (req: Request, res: Response) => {
    const known = req.body;
    if (!known) {
        return res.status(400).json({
            errors: [
                {
                    message: "No known IDs were provided.",
                },
            ],
        });
    }

    try {
        const knownIDs = Object.keys(known);
        const groups = await EventGroup.find({
            id: { $in: knownIDs },
        });
        const knownGroups = groups.filter((group) => {
            return group.editToken === known[group.id];
        });
        const groupData = knownGroups.map((group) => {
            return {
                id: group.id,
                name: group.name,
                description: marked
                    .parse(group.description, {
                        renderer: renderPlain(),
                    })
                    .split(" ")
                    .splice(0, 40)
                    .join(" ")
                    .trim(),
                image: group.image,
                editToken: group.editToken,
                url: `/group/${group.id}`,
            };
        });
        return res.status(200).json(groupData);
    } catch (err) {
        console.error(err);
        addToLog(
            "getKnownGroups",
            "error",
            "Attempt to get known groups failed with error: " + err,
        );
        return res.status(500).json({
            errors: [
                {
                    message: err,
                },
            ],
        });
    }
});

export default router;
