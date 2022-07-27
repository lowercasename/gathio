type SendEmailOptions = {
    renderer;
    to: string;
};

export const sendEmail = async ({ to }: SendEmailOptions) => {
    const template = await req.app
        .get("hbsInstance")
        .renderView("./views/emails/createevent.handlebars", {
            eventID,
            editToken,
            siteName,
            siteLogo,
            domain,
            cache: true,
            layout: "email.handlebars",
        });
    if (req.body.creatorEmail && sendEmails) {
        req.app.get("hbsInstance").renderView(
            "./views/emails/createevent.handlebars",
            {
                eventID,
                editToken,
                siteName,
                siteLogo,
                domain,
                cache: true,
                layout: "email.handlebars",
            },
            function (err, html) {
                const msg = {
                    to: req.body.creatorEmail,
                    from: {
                        name: siteName,
                        email: contactEmail,
                        address: contactEmail,
                    },
                    subject: `${siteName}: ${req.body.eventName}`,
                    html,
                };
                switch (mailService) {
                    case "sendgrid":
                        sgMail.send(msg).catch((e) => {
                            console.error(e.toString());
                            res.status(500).end();
                        });
                        break;
                    case "nodemailer":
                        nodemailerTransporter.sendMail(msg).catch((e) => {
                            console.error(e.toString());
                            res.status(500).end();
                        });
                        break;
                }
            }
        );
    }
};
