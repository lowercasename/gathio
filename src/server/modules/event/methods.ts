import { NextFunction, Request, Response } from "express";
import path from "path";
import { body, validationResult } from "express-validator";
import Jimp from "jimp";
import Event, { IEvent } from "./model";
import EventGroup from "../group/model";
import { DateTime, Settings } from "luxon";
import { ServerError } from "../../util/errorHandler";
import id from "../../util/id";
// import { generateRSAKeypair } from "../../util/activityPub";
import { generateKeyPair } from 'crypto';
Settings.defaultZone = "utc";
// import getConfig from "./util/config";
// const config = getConfig();

const validateEvent = (method: string) => {
    console.log("Validating event payload");
    switch (method) {
        case "createEvent": {
            return [
                body("eventName", "Event name missing.").not().isEmpty(),
                body("eventLocation", "Event location missing.")
                    .not()
                    .isEmpty(),
                body("eventStart").custom((value, { req }) => {
                    if (value <= Date.now()) {
                        throw new Error(
                            "Event start time cannot be earlier than the current time."
                        );
                    }
                    if (value >= req.body.eventEnd) {
                        throw new Error(
                            "Event start time cannot be later than the end time."
                        );
                    }
                    return true;
                }),
                body("eventEnd").custom((value, { req }) => {
                    if (value <= Date.now()) {
                        throw new Error(
                            "Event end time cannot be earlier than the current time."
                        );
                    }
                    if (value <= req.body.eventStart) {
                        throw new Error(
                            "Event end time cannot be earlier than the start time."
                        );
                    }
                    return true;
                }),
                body("creatorEmail", "Email invalid.")
                    .optional({ checkFalsy: true })
                    .isEmail(),
                body("timezone", "Timezone missing.").not().isEmpty(),
                body("eventDescription", "Event description missing.")
                    .not()
                    .isEmpty(),
                body("eventGroupID", "Event group ID missing.")
                    .if(body("eventGroupCheckbox").isIn([true]))
                    .not()
                    .isEmpty(),
                body("eventGroupEditToken", "Event group edit token missing.")
                    .if(body("eventGroupCheckbox").isIn([true]))
                    .not()
                    .isEmpty(),
                body("maxAttendees", "Maximum number of attendees missing.")
                    .if(body("maxAttendeesCheckbox").isIn([true]))
                    .isInt(),
            ];
        }
    }
};

const createEvent = async (req: Request, res: Response) => {
    console.log("Creating event!");
    console.log("BODY");
    console.log(req.body);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.log(errors.array());
        throw new ServerError(JSON.stringify(errors.array()), 422);
    }
    try {
        const eventID = id();
        const editToken = id(32);
        const eventImageFilename = req.body.eventImageID
            ? `${req.body.eventImageID}.jpg`
            : false;
        const startUTC = DateTime.fromISO(req.body.eventStart, {
            zone: req.body.timezone,
        });
        const endUTC = DateTime.fromISO(req.body.eventEnd, {
            zone: req.body.timezone,
        });
        console.log(startUTC, endUTC);

        let isPartOfEventGroup = false;
        let eventGroup;
        if (req.body.eventGroupCheckbox) {
            eventGroup = await EventGroup.findOne({
                id: req.body.eventGroupID,
                editToken: req.body.eventGroupEditToken,
            });
            if (eventGroup) {
                isPartOfEventGroup = true;
            }
        }

        // generate RSA keypair for ActivityPub
        let keypair = generateRSAKeypair();

        const keypair = await generateKeyPair('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
  }
}, (err, publicKey, privateKey) => {
  // Handle errors and use the generated key pair.
});


        const event: IEvent = await Event.create({
            id: eventID,
            name: req.body.eventName,
            location: req.body.eventLocation,
            start: startUTC,
            end: endUTC,
            timezone: req.body.timezone,
            description: req.body.eventDescription,
            image: eventImageFilename,
            creatorEmail: req.body.creatorEmail,
            url: req.body.eventURL,
            hostName: req.body.hostName,
            viewPassword: req.body.viewPassword,
            editPassword: req.body.editPassword,
            editToken: editToken,
            eventGroup: isPartOfEventGroup ? eventGroup._id : null,
            usersCanAttend: req.body.joinCheckbox ? true : false,
            showUsersList: req.body.guestlistCheckbox ? true : false,
            usersCanComment: req.body.interactionCheckbox ? true : false,
            maxAttendees: req.body.maxAttendees,
            firstLoad: true,
            // activityPubActor: ap.createActivityPubActor(
            //     eventID,
            //     domain,
            //     pair.public,
            //     marked.parse(req.body.eventDescription),
            //     req.body.eventName,
            //     req.body.eventLocation,
            //     eventImageFilename,
            //     startUTC,
            //     endUTC,
            //     req.body.timezone
            // ),
            // activityPubEvent: ap.createActivityPubEvent(
            //     req.body.eventName,
            //     startUTC,
            //     endUTC,
            //     req.body.timezone,
            //     req.body.eventDescription,
            //     req.body.eventLocation
            // ),
            // activityPubMessages: [
            //     {
            //         id: `https://${domain}/${eventID}/m/featuredPost`,
            //         content: JSON.stringify(
            //             ap.createFeaturedPost(
            //                 eventID,
            //                 req.body.eventName,
            //                 startUTC,
            //                 endUTC,
            //                 req.body.timezone,
            //                 req.body.eventDescription,
            //                 req.body.eventLocation
            //             )
            //         ),
            //     },
            // ],
            // publicKey: pair.public,
            // privateKey: pair.private,
        });
        // addToLog("createEvent", "success", "Event " + eventID + "created");
        // Send email with edit link
        // if (req.body.creatorEmail && sendEmails) {
        //     req.app.get("hbsInstance").renderView(
        //         "./views/emails/createevent.handlebars",
        //         {
        //             eventID,
        //             editToken,
        //             siteName,
        //             siteLogo,
        //             domain,
        //             cache: true,
        //             layout: "email.handlebars",
        //         },
        //         function (err, html) {
        //             const msg = {
        //                 to: req.body.creatorEmail,
        //                 from: {
        //                     name: siteName,
        //                     email: contactEmail,
        //                     address: contactEmail,
        //                 },
        //                 subject: `${siteName}: ${req.body.eventName}`,
        //                 html,
        //             };
        //             switch (mailService) {
        //                 case "sendgrid":
        //                     sgMail.send(msg).catch((e) => {
        //                         console.error(e.toString());
        //                         res.status(500).end();
        //                     });
        //                     break;
        //                 case "nodemailer":
        //                     nodemailerTransporter.sendMail(msg).catch((e) => {
        //                         console.error(e.toString());
        //                         res.status(500).end();
        //                     });
        //                     break;
        //             }
        //         }
        //     );
        // }
        // If the event was added to a group, send an email to any group
        // subscribers
        // if (event.eventGroup && sendEmails) {
        //     EventGroup.findOne({ _id: event.eventGroup._id }).then(
        //         (eventGroup) => {
        //             const subscribers = eventGroup.subscribers.reduce(
        //                 (acc, current) => {
        //                     if (acc.includes(current.email)) {
        //                         return acc;
        //                     }
        //                     return [current.email, ...acc];
        //                 },
        //                 []
        //             );
        //             subscribers.forEach((emailAddress) => {
        //                 req.app.get("hbsInstance").renderView(
        //                     "./views/emails/eventgroupupdated.handlebars",
        //                     {
        //                         siteName,
        //                         siteLogo,
        //                         domain,
        //                         eventID: req.params.eventID,
        //                         eventGroupName: eventGroup.name,
        //                         eventName: event.name,
        //                         eventID: event.id,
        //                         eventGroupID: eventGroup.id,
        //                         emailAddress: encodeURIComponent(emailAddress),
        //                         cache: true,
        //                         layout: "email.handlebars",
        //                     },
        //                     function (err, html) {
        //                         const msg = {
        //                             to: emailAddress,
        //                             from: {
        //                                 name: siteName,
        //                                 email: contactEmail,
        //                             },
        //                             subject: `${siteName}: New event in ${eventGroup.name}`,
        //                             html,
        //                         };
        //                         switch (mailService) {
        //                             case "sendgrid":
        //                                 sgMail.send(msg).catch((e) => {
        //                                     console.error(e.toString());
        //                                     res.status(500).end();
        //                                 });
        //                                 break;
        //                             case "nodemailer":
        //                                 nodemailerTransporter
        //                                     .sendMail(msg)
        //                                     .catch((e) => {
        //                                         console.error(e.toString());
        //                                         res.status(500).end();
        //                                     });
        //                                 break;
        //                         }
        //                     }
        //                 );
        //             });
        //         }
        //     );
        // }
        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        throw new ServerError("Error creating event.", 500);
    }
};

const uploadEventImage = async (req: Request, res: Response) => {
    if (!req.file?.path) {
        throw new ServerError("No file received", 500);
    }

    Jimp.read(req.file.path)
        .then((image) => {
            let imageId = id();
            image
                .resize(920, Jimp.AUTO)
                .quality(80)
                .write(
                    path.join(
                        __dirname,
                        "../../../../dist/client/uploads/" + imageId + ".jpg"
                    )
                );
            res.status(201).send({ id });
        })
        .catch((error) => {
            console.error(error);
            throw new ServerError("Failed to upload image", 500);
        });
};

const getEvent = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ id: req.params.eventID });
        res.send(event);
    } catch (error) {
        res.status(500).send(error.message);
    }
};

export { validateEvent, getEvent, createEvent, uploadEventImage };
