const eventData = {
    eventName: "Your Event Name",
    eventLocation: "Event Location",
    timezone: "America/New York",
    eventDescription: "Event Description",
    eventURL: "https://example.com",
    hostName: "Your Name",
    creatorEmail: "test@example.com",
    eventGroupCheckbox: false,
    eventGroupID: "YourEventGroupID",
    eventGroupEditToken: "YourEventGroupEditToken",
    interactionCheckbox: true,
    joinCheckbox: true,
    maxAttendeesCheckbox: true,
    maxAttendees: 10,
    eventStart: "2030-01-01T00:00",
    eventEnd: "2030-01-01T01:00",
};

describe("Events", () => {
    beforeEach(() => {
        cy.visit("/new");
        cy.get("#showNewEventFormButton").click();

        cy.get("#eventName").type(eventData.eventName);
        cy.get("#eventLocation").type(eventData.eventLocation);
        // These are datetime-local inputs
        cy.get("#eventStart").type(eventData.eventStart);
        cy.get("#eventEnd").type(eventData.eventEnd);

        cy.get(".select2-container").click();
        cy.get(".select2-results__option")
            .contains(eventData.timezone)
            .click({ force: true });

        cy.get("#eventDescription").type(eventData.eventDescription);
        cy.get("#eventURL").type(eventData.eventURL);

        cy.get("#hostName").type(eventData.hostName);
        cy.get("#creatorEmail").type(eventData.creatorEmail);

        // Check checkboxes based on eventData
        if (eventData.eventGroupCheckbox) {
            cy.get("#eventGroupCheckbox").check();
            cy.get("#eventGroupID").type(eventData.eventGroupID);
            cy.get("#eventGroupEditToken").type(eventData.eventGroupEditToken);
        }

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
        cy.url().should("not.include", "/new");

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

    it("allows you to attend an event", function () {
        cy.get("button#attendEvent").click();
        cy.get("#attendeeName").type("Test Attendee");
        cy.get("#attendeeNumber").focus().clear();
        cy.get("#attendeeNumber").type("2");
        cy.get("form#attendEventForm").submit();
        cy.get("#attendees-alert").should("contain.text", "8 spots remaining");
        cy.get(".attendeesList").should(
            "contain.text",
            "Test Attendee (2 people)",
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
                Accept: "application/activity+json",
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
                Accept: "application/activity+json",
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
        cy.get("#editEventForm #eventName").focus().clear();
        cy.get("#editEventForm #eventLocation").focus().clear();
        cy.get("#editEventForm #eventStart").focus().clear();
        cy.get("#editEventForm #eventEnd").focus().clear();
        cy.get("#editEventForm #eventDescription").focus().clear();
        cy.get("#editEventForm #eventURL").focus().clear();
        cy.get("#editEventForm #hostName").focus().clear();
        cy.get("#editEventForm #creatorEmail").focus().clear();
        cy.get("#editEventForm #maxAttendees").focus().clear();

        cy.get("#editEventForm #eventName").type("Edited Event Name");
        cy.get("#editEventForm #eventLocation").type("Edited Event Location");
        // These are datetime-local inputs
        cy.get("#editEventForm #eventStart").type("2030-12-01T00:00");
        cy.get("#editEventForm #eventEnd").type("2030-12-01T01:00");

        cy.get("#editEventForm .select2-container").click();
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
});
