const eventData = {
    eventName: "Your Event Name",
    eventLocation: "Event Location",
    timezone: "Europe/London",
    eventDescription: "Event Description",
    eventURL: "https://example.com",
    imagePath: "path/to/your/image.jpg", // If you have an image to upload
    hostName: "Your Name",
    creatorEmail: "test@example.com",
    eventGroupCheckbox: false,
    eventGroupID: "YourEventGroupID",
    eventGroupEditToken: "YourEventGroupEditToken",
    interactionCheckbox: true,
    joinCheckbox: true,
    maxAttendeesCheckbox: true,
    maxAttendees: 10,
    eventStart: "",
    eventEnd: "",
};

describe("Events", () => {
    beforeEach(() => {
        cy.clearLocalStorage();

        cy.visit("/new");
        cy.get("#showNewEventFormButton").click();

        cy.get("#eventName").type(eventData.eventName);
        cy.get("#eventLocation").type(eventData.eventLocation);
        cy.get("#eventStart").click();
        // This opens a datepicker, so find the first non-disabled day and click it
        cy.get(".datepicker--cell-day:not(.-disabled-)").first().click();
        cy.get("#eventStart").invoke("val").as("eventStart");
        // Click away from the datepicker to close it
        cy.get("#eventName").click();
        cy.get("#eventEnd").click();
        // This opens a datepicker, so find the last non-disabled day and click it
        cy.get(".datepicker--cell-day:not(.-disabled-)").last().click();
        cy.get("#eventEnd").invoke("val").as("eventEnd");
        // Click away from the datepicker to close it
        cy.get("#eventName").click();
        // #timezone is a Select2 dropdown, so select the option you want
        cy.get("#timezone").select(eventData.timezone, { force: true });

        cy.get("#eventDescription").type(eventData.eventDescription);
        cy.get("#eventURL").type(eventData.eventURL);
        // Upload an image
        // if (eventData.imagePath) {
        //   cy.get("#eventImageUpload").attachFile(eventData.imagePath);
        // }

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
        let [startDate, startTime] = this.eventStart.split(", ");
        let [endDate, endTime] = this.eventEnd.split(", ");
        // Remove leading zeroes from the times
        startTime = startTime.replace(/^0+/, "");
        endTime = endTime.replace(/^0+/, "");
        cy.get(".dt-duration").should("contain.text", startDate);
        cy.get(".dt-duration").should("contain.text", endDate);
        cy.get(".dt-duration").should("contain.text", startTime);
        cy.get(".dt-duration").should("contain.text", endTime);
    });

    it("allows you to attend an event", function () {
        cy.get("button#attendEvent").click();
        cy.get("#attendeeName").type("Test Attendee");
        cy.get("#attendeeNumber").clear().type("2");
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
});
