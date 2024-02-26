import eventData from "../fixtures/eventData.json";

describe("Events", () => {
    beforeEach(() => {
        cy.setCookie(
            "cypressConfigOverride",
            JSON.stringify({
                general: {
                    show_public_event_list: true,
                },
            }),
        );
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

        // Check checkboxes based on eventData
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

        cy.get("#publicEventCheckbox").check();

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

    it("should be visible in the public event list", function () {
        cy.setCookie(
            "cypressConfigOverride",
            JSON.stringify({
                general: {
                    show_public_event_list: true,
                },
            }),
        );
        cy.visit("/");
        cy.get("#upcomingEvents").should("contain", eventData.eventName);
    });
});
