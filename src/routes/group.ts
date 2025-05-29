//src/routes/group.ts
import { Router, Request, Response } from "express";
import multer from "multer";
import Jimp from "jimp";
import { marked } from "marked";
import { renderPlain } from "../util/markdown.js";
import { generateEditToken, generateEventID } from "../util/generator.js";
import { validateGroupData } from "../util/validation.js";
import { addToLog } from "../helpers.js";
import { getConfigMiddleware, checkMagicLink } from "../lib/middleware.js";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Multer config for image uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!/jpeg|jpg|png|gif/.test(file.mimetype)) {
            return cb(new Error("Only JPEG, PNG and GIF images are allowed."));
        }
        cb(null, true);
    },
});

// Apply config middleware
router.use(getConfigMiddleware);

// POST /group - create new event group
router.post(
    "/group",
    upload.single("imageUpload"),
    checkMagicLink,
    async (req: Request, res: Response) => {
        const { data: groupData, errors } = validateGroupData(req.body);
        if (errors?.length) {
            return res.status(400).json({ errors });
        }
        if (!groupData) {
            return res.status(400).json({
                errors: [{ message: "No group data was provided." }],
            });
        }

        try {
            const groupID = generateEventID();
            const editToken = generateEditToken();
            let imageFile: string | null = null;

            if (req.file?.buffer) {
                try {
                    const img = await Jimp.read(req.file.buffer);
                    await img
                        .resize(920, Jimp.AUTO)
                        .quality(80)
                        .writeAsync(`./public/events/${groupID}.jpg`);
                    imageFile = `${groupID}.jpg`;
                } catch (err) {
                    addToLog(
                        "Jimp",
                        "error",
                        `Group image processing failed: ${err}`,
                    );
                }
            }

            const created = await prisma.eventGroup.create({
                data: {
                    id: groupID,
                    name: groupData.eventGroupName,
                    description: groupData.eventGroupDescription,
                    image: imageFile,
                    creatorEmail: groupData.creatorEmail,
                    url: groupData.eventGroupURL,
                    hostName: groupData.hostName,
                    editToken,
                    firstLoad: true,
                    showOnPublicList: !!groupData.publicBoolean,
                },
            });

            addToLog(
                "createEventGroup",
                "success",
                `Event group ${groupID} created`,
            );

            if (groupData.creatorEmail) {
                req.emailService.sendEmailFromTemplate({
                    to: groupData.creatorEmail,
                    subject: created.name,
                    templateName: "createEventGroup",
                    templateData: {
                        eventGroupID: created.id,
                        editToken: created.editToken,
                    },
                });
            }

            res.status(200).json({
                id: created.id,
                editToken: created.editToken,
                url: `/group/${created.id}?e=${created.editToken}`,
            });
        } catch (err) {
            console.error(err);
            addToLog(
                "createEventGroup",
                "error",
                `Attempt to create event group failed: ${err}`,
            );
            res.status(500).json({ errors: [{ message: String(err) }] });
        }
    },
);

// PUT /group/:eventGroupID - update existing group
router.put(
    "/group/:eventGroupID",
    upload.single("imageUpload"),
    async (req: Request, res: Response) => {
        const { data: groupData, errors } = validateGroupData(req.body);
        if (errors?.length) return res.status(400).json({ errors });
        if (!groupData) {
            return res
                .status(400)
                .json({ errors: [{ message: "No group data." }] });
        }

        try {
            const { eventGroupID } = req.params;
            const submittedToken = req.body.editToken;
            const existing = await prisma.eventGroup.findUnique({
                where: { id: eventGroupID },
            });
            if (!existing) {
                return res
                    .status(404)
                    .json({ errors: [{ message: "Group not found." }] });
            }
            if (existing.editToken !== submittedToken) {
                addToLog(
                    "editEventGroup",
                    "error",
                    `Invalid token for group ${eventGroupID}`,
                );
                return res
                    .status(403)
                    .json({ errors: [{ message: "Edit token invalid." }] });
            }

            let imageFile = existing.image;
            if (req.file?.buffer) {
                try {
                    const img = await Jimp.read(req.file.buffer);
                    await img
                        .resize(920, Jimp.AUTO)
                        .quality(80)
                        .writeAsync(`./public/events/${eventGroupID}.jpg`);
                    imageFile = `${eventGroupID}.jpg`;
                } catch (err) {
                    addToLog(
                        "Jimp",
                        "error",
                        `Group image update failed: ${err}`,
                    );
                }
            }

            await prisma.eventGroup.update({
                where: { id: eventGroupID },
                data: {
                    name: groupData.eventGroupName,
                    description: groupData.eventGroupDescription,
                    url: groupData.eventGroupURL,
                    hostName: groupData.hostName,
                    image: imageFile,
                    showOnPublicList: !!groupData.publicBoolean,
                },
            });

            addToLog(
                "editEventGroup",
                "success",
                `Group ${eventGroupID} updated`,
            );
            res.sendStatus(200);
        } catch (err) {
            console.error(err);
            addToLog(
                "editEventGroup",
                "error",
                `Edit group ${req.params.eventGroupID} failed: ${err}`,
            );
            res.status(500).json({ errors: [{ message: String(err) }] });
        }
    },
);

// POST /known/groups - return basic info for known groups
router.post("/known/groups", async (req: Request, res: Response) => {
    const known = req.body as Record<string, string>;
    if (!known || typeof known !== "object") {
        return res
            .status(400)
            .json({ errors: [{ message: "No known IDs provided." }] });
    }

    try {
        const ids = Object.keys(known);
        const groups = await prisma.eventGroup.findMany({
            where: { id: { in: ids } },
        });
        const valid = groups.filter((g) => g.editToken === known[g.id]);
        const result = valid.map((g) => ({
            id: g.id,
            name: g.name,
            description: marked
                .parse(g.description, { renderer: renderPlain() })
                .split(" ")
                .slice(0, 40)
                .join(" ")
                .trim(),
            image: g.image,
            editToken: g.editToken,
            url: `/group/${g.id}`,
        }));
        res.status(200).json(result);
    } catch (err) {
        console.error(err);
        addToLog(
            "getKnownGroups",
            "error",
            `Known groups lookup failed: ${err}`,
        );
        res.status(500).json({ errors: [{ message: String(err) }] });
    }
});

export default router;
