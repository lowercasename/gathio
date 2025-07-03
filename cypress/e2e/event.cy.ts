import eventData from "../fixtures/eventData.json";
import crypto from "crypto";

describe("Events", () => {
    beforeEach(() => {
        cy.visit("/new");
        cy.get("#showNewEventFormButton").click();

        cy.get("#eventName").type(eventData.eventName);
        cy.get("#eventLocation").type(eventData.eventLocation);
        // These are datetime-local inputs
        cy.get("#eventStart").type(eventData.eventStart);
        cy.get("#eventEnd").type(eventData.eventEnd);

        cy.get("select#timezone + span.select2").click();
        cy.get(".select2-results__option")
            .contains(eventData.timezone)
            .click({ force: true });

        cy.get("#eventDescription").type(eventData.eventDescription);
        cy.get("#eventURL").type(eventData.eventURL);

        cy.get("#hostName").type(eventData.hostName);
        cy.get("#creatorEmail").type(eventData.creatorEmail);

        if (eventData.interactionCheckbox) {
            cy.get("#interactionCheckbox").check();
        }

        if (eventData.joinCheckbox) {
            cy.get("#joinCheckbox").check();
        }

        if (eventData.maxAttendeesCheckbox) {
            cy.get("#maxAttendeesCheckbox").check();
            cy.get("#maxAttendees").type(eventData.maxAttendees.toString());
        }

        // Submit the form
        cy.get("#newEventFormSubmit").click();

        // Wait for the new page to load
        cy.url({ timeout: 10000 }).should("not.include", "/new");

        // Get the new event ID from the URL
        cy.url().then((url) => {
            const [eventID, editToken] = url.split("/").pop().split("?");
            cy.wrap(eventID).as("eventID");
            cy.wrap(editToken).as("editToken");
        });
    });
    it("creates a new event", function () {
        // Check that all the data is correct
        cy.get(".p-name").should("have.text", eventData.eventName);
        cy.get(".p-location").should("have.text", eventData.eventLocation);
        cy.get(".p-summary").should("contain.text", eventData.eventDescription);
        cy.get("#hosted-by").should(
            "contain.text",
            `Hosted by ${eventData.hostName}`,
        );
        cy.get("#attendees-alert").should("contain.text", "10 spots remaining");
        cy.get(".dt-duration").should(
            "contain.text",
            "Tuesday 1 January 2030 from 12:00 am to 1:00 am (EST)",
        );
    });

    it("allows you to attend an event - visible in public list", function () {
        cy.get("button#attendEvent").click();
        cy.get("#attendeeName").type("Test Attendee");
        cy.get("#attendeeNumber").focus();
        cy.get("#attendeeNumber").clear();
        cy.get("#attendeeNumber").type("2");
        cy.get("form#attendEventForm").submit();
        cy.get("#attendees-alert").should("contain.text", "8 spots remaining");
        cy.get(".attendeesList").should(
            "contain.text",
            "Test Attendee (2 people)",
        );
    });

    it("allows you to attend an event - hidden from public list", function () {
        cy.get("button#attendEvent").click();
        cy.get("#attendeeName").type("Test Attendee");
        cy.get("#attendeeNumber").focus();
        cy.get("#attendeeNumber").clear();
        cy.get("#attendeeNumber").type("2");
        cy.get("#attendeeVisible").uncheck();
        cy.get("form#attendEventForm").submit();
        cy.get("#attendees-alert").should("contain.text", "8 spots remaining");
        cy.get(".attendeesList").should(
            "contain.text",
            "Test Attendee (2 people) (hidden from public list)",
        );
    });

    it("allows you to comment on an event", function () {
        cy.get("#commentAuthor").type("Test Author");
        cy.get("#commentContent").type("Test Comment");
        cy.get("#postComment").click();
        cy.get(".comment").should("contain.text", "Test Author");
        cy.get(".comment").should("contain.text", "Test Comment");
    });

    it("displays the ActivityPub featured post", function () {
        cy.log(this.eventID);

        cy.request({
            url: `/${this.eventID}/featured`,
            headers: {
                Accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
            },
        }).then((response) => {
            expect(response.body).to.have.property("@context");
            expect(response.body).to.have.property("id");
            expect(response.body).to.have.property("type");
            expect(response.body).to.have.property("orderedItems");
            expect(response.body.orderedItems)
                .to.be.an("array")
                .and.to.have.lengthOf(1);
            const featuredPost = response.body.orderedItems[0];
            expect(featuredPost).to.have.property("@context");
            expect(featuredPost).to.have.property("id");
            expect(featuredPost).to.have.property("type");
            expect(featuredPost).to.have.property("name");
            expect(featuredPost).to.have.property("content");
            expect(featuredPost).to.have.property("attributedTo");
        });
    });

    it("responds correctly to ActivityPub webfinger requests", function () {
        cy.request({
            url: `/.well-known/webfinger?resource=acct:${
                this.eventID
            }@${Cypress.env("CYPRESS_DOMAIN")}`,
            headers: {
                Accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
            },
        }).then((response) => {
            expect(response.body).to.have.property("subject");
            expect(response.body).to.have.property("links");
            expect(response.body.links)
                .to.be.an("array")
                .and.to.have.lengthOf(1);
            const link = response.body.links[0];
            expect(link).to.have.property("rel");
            expect(link).to.have.property("type");
            expect(link).to.have.property("href");
        });
    });

    it("edits an event", function () {
        cy.get("#editEvent").click();

        // The edit form is the same as the new form, so we can just re-use the same selectors
        // but we need to clear the fields first
        cy.get("#editEventForm #eventName").focus();
        cy.get("#editEventForm #eventName").clear();
        cy.get("#editEventForm #eventLocation").focus();
        cy.get("#editEventForm #eventLocation").clear();
        cy.get("#editEventForm #eventStart").focus();
        cy.get("#editEventForm #eventStart").clear();
        cy.get("#editEventForm #eventEnd").focus();
        cy.get("#editEventForm #eventEnd").clear();
        cy.get("#editEventForm #eventDescription").focus();
        cy.get("#editEventForm #eventDescription").clear();
        cy.get("#editEventForm #eventURL").focus();
        cy.get("#editEventForm #eventURL").clear();
        cy.get("#editEventForm #hostName").focus();
        cy.get("#editEventForm #hostName").clear();
        cy.get("#editEventForm #creatorEmail").focus();
        cy.get("#editEventForm #creatorEmail").clear();
        cy.get("#editEventForm #maxAttendees").focus();
        cy.get("#editEventForm #maxAttendees").clear();

        cy.get("#editEventForm #eventName").type("Edited Event Name");
        cy.get("#editEventForm #eventLocation").type("Edited Event Location");
        // These are datetime-local inputs
        cy.get("#editEventForm #eventStart").type("2030-12-01T00:00");
        cy.get("#editEventForm #eventEnd").type("2030-12-01T01:00");

        cy.get("#editEventForm select#timezone + span.select2").click();
        cy.get(".select2-results__option")
            .contains("Australia/Sydney")
            .click({ force: true });

        cy.get("#editEventForm #eventDescription").type(
            "Edited Event Description",
        );
        cy.get("#editEventForm #eventURL").type("https://edited.example.com");
        cy.get("#editEventForm #hostName").type("Edited Name");
        cy.get("#editEventForm #creatorEmail").type("edited@example.com");

        cy.get("#editEventForm #maxAttendeesCheckbox").uncheck();

        cy.get("#editEventForm #interactionCheckbox").uncheck();

        cy.get("#editEventForm #joinCheckbox").uncheck();

        // Submit the form
        cy.get("#editEventForm").submit();

        // Wait for the modal to not be visible
        cy.get("#editModal").should("not.be.visible");

        // Check that all the data is correct
        cy.get(".p-name").should("have.text", "Edited Event Name");
        cy.get(".p-location").should("have.text", "Edited Event Location");
        cy.get(".p-summary").should("contain.text", "Edited Event Description");
        cy.get("#hosted-by").should("contain.text", "Hosted by Edited Name");
        cy.get(".dt-duration").should(
            "contain.text",
            "Sunday 1 December 2030 from 12:00 am to 1:00 am",
        );
        cy.get(".dt-duration")
            .invoke("text")
            .should("match", /AE(D|S)T/);
        // Check that the comment form is not visible
        cy.get("#postComment").should("not.exist");
        // Check that the attendee form is not visible
        cy.get("#attendEvent").should("not.exist");
    });

    it("sets a group for an event", function () {
        // For this we need to create a group first. This will load the group edit token
        // into our localStorage, and will then appear in the group select dropdown.
        // We then go back to the event page, edit the event, and set the group.
        cy.createGroup({
            eventGroupName: "Test Group",
            eventGroupDescription: "Test Group Description",
            eventGroupURL: "https://example.com",
            hostName: "Test Host",
            creatorEmail: "test@example.com",
        });

        cy.visit(`/${this.eventID}`);
        cy.url().should("include", this.editToken);

        cy.get("#editEvent").click();
        cy.get("#editEventForm #eventGroupCheckbox").check();
        cy.get("select#eventGroupSelect + span.select2").click();
        cy.get(".select2-results__option")
            .contains("Test Group")
            .click({ force: true });
        cy.get("#editEventForm").submit();

        cy.get("#editModal").should("not.be.visible");

        cy.get("#event-group").should("contain.text", "Test Group");
    });

    it("removes you from the event with a one-click unattend link", function () {
        cy.get("button#attendEvent").click();
        cy.get("#attendeeName").type("Test Attendee");
        cy.get("#attendeeNumber").focus();
        cy.get("#attendeeNumber").clear();
        cy.get("#attendeeNumber").type("2");
        cy.get("#removalPassword")
            .invoke("val")
            .then((removalPassword) => {
                cy.wrap(removalPassword).as("removalPassword");
                cy.log(this.removalPassword);
                cy.get("form#attendEventForm").submit();
                cy.get("#attendees-alert").should(
                    "contain.text",
                    "8 spots remaining",
                );
                cy.get(".attendeesList").should(
                    "contain.text",
                    "Test Attendee (2 people)",
                );
                const removalPasswordHash = crypto
                    .createHash("sha256")
                    .update(removalPassword)
                    .digest("hex");
                const unattendLink = `http://localhost:3000/event/${this.eventID}/unattend/${removalPasswordHash}`;
                cy.visit(unattendLink);
                cy.get("#event__message").should(
                    "contain.text",
                    "You have been removed from this event.",
                );
                cy.get("#attendees-alert").should(
                    "contain.text",
                    "10 spots remaining",
                );
                cy.get("#eventAttendees").should(
                    "contain.text",
                    "No attendees yet!",
                );
            });
    });
    describe("Query string editing tokens", function () {
        it("given a valid editing token is in the URL, should add it to localStorage", function () {
            cy.visit(`/${this.eventID}?${this.editToken}`).then(() => {
                expect(localStorage.getItem("editTokens")).to.include(
                    this.editToken.split("=")[1],
                );
            });
        });

        it("given an invalid editing token is in the URL, should delete it from the URL", function () {
            cy.visit(`/${this.eventID}?e=invalid`).then(() => {
                expect(localStorage.getItem("editTokens")).to.not.include(
                    "invalid",
                );
            });
        });

        it("given a valid editing token in localStorage, should add it to the URL", function () {
            cy.visit(`/${this.eventID}`).then(() => {
                cy.url().should("include", this.editToken);
            });
        });

        it("given an invalid editing token in localStorage, should remove it from localStorage", function () {
            cy.clearAllLocalStorage();
            localStorage.setItem("editTokens", "invalid");
            cy.visit(`/${this.eventID}`).then(() => {
                const editTokens = localStorage.getItem("editTokens");
                if (editTokens !== null) {
                    expect(editTokens).to.not.include("invalid");
                } else {
                    // If it's null, the invalid token was successfully removed
                    expect(editTokens).to.be.null;
                }
            });
        });
    });
});
