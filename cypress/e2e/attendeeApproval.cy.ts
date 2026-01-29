/** Visit a URL as a fresh visitor with no stored tokens. */
function visitFresh(url: string) {
    cy.visit(url, {
        onBeforeLoad(win) {
            win.localStorage.clear();
        },
    });
}

/** RSVP to an event as a guest (from a fresh visitor context). */
function rsvpAsGuest(eventID: string, name: string) {
    visitFresh(`/${eventID}`);
    cy.get("button#attendEvent").click();
    cy.get("#attendModal").should("be.visible");
    cy.get("#attendeeName").type(name);
    cy.get("form#attendEventForm").submit();
    cy.get("#rsvpSuccessModal", { timeout: 10000 }).should("be.visible");
}

describe("Attendee Approval Feature", () => {
    const baseEventData = {
        eventName: "Approval Test Event",
        eventLocation: "123 Test Street",
        eventStart: "2030-01-01T12:00",
        eventEnd: "2030-01-01T14:00",
        timezone: "America/New York",
        eventDescription: "Test event for approval feature",
        hostName: "Test Host",
        creatorEmail: "host@example.com",
    };

    describe("Event Creation with Approval Setting", () => {
        it("creates event with approval required checkbox", () => {
            cy.createEventWithApproval(baseEventData);

            // Verify we're on the event page with edit token
            cy.url().should("match", /\/[a-zA-Z0-9_-]+\?e=/);
            cy.get(".p-name").should("have.text", baseEventData.eventName);
        });

        it("shows approveRegistrationsCheckbox only when joinCheckbox checked", () => {
            cy.visit("/new");
            cy.get("#showNewEventFormButton").click();

            // Initially joinCheckbox is unchecked, approval checkbox should be hidden
            cy.get("#joinCheckbox").should("not.be.checked");
            cy.get("#approveRegistrationsCheckbox").should("not.be.visible");

            // Check joinCheckbox, approval checkbox should become visible
            cy.get("#joinCheckbox").check();
            cy.get("#approveRegistrationsCheckbox").should("be.visible");

            // Uncheck joinCheckbox, approval checkbox should hide again
            cy.get("#joinCheckbox").uncheck();
            cy.get("#approveRegistrationsCheckbox").should("not.be.visible");
        });

        it("persists approval setting when editing", function () {
            cy.createEventWithApproval(baseEventData);

            cy.get("#editEvent").click();
            cy.get("#editModal").should("be.visible");

            // Check that approval checkbox is checked in edit form
            cy.get("#editModal #approveRegistrationsCheckbox").should("be.checked");
        });
    });

    describe("Regular RSVP Flow - Control Tests", () => {
        beforeEach(() => {
            // Create event WITHOUT approval required
            cy.visit("/new");
            cy.get("#showNewEventFormButton").click();

            cy.get("#eventName").type("No Approval Event");
            cy.get("#eventLocation").type("456 Public Street");
            cy.get("#eventStart").type("2030-01-01T12:00");
            cy.get("#eventEnd").type("2030-01-01T14:00");

            cy.get("select#timezone + span.select2").click();
            cy.get(".select2-results__option")
                .contains("America/New York")
                .click({ force: true });

            cy.get("#eventDescription").type("Event without approval");
            cy.get("#hostName").type("Test Host");
            cy.get("#creatorEmail").type("host@example.com");

            cy.get("#joinCheckbox").check();
            // Do NOT check approveRegistrationsCheckbox

            cy.get("#newEventFormSubmit").click();
            cy.url({ timeout: 10000 }).should("not.include", "/new");

            cy.url().then((url) => {
                const [eventID, editToken] = url.split("/").pop()!.split("?");
                cy.wrap(eventID).as("eventID");
                cy.wrap(editToken.slice(2)).as("editToken");
            });
        });

        it("shows location immediately after RSVP (no approval)", function () {
            visitFresh(`/${this.eventID}`);

            // Location should be visible (no approval required)
            cy.get(".p-location").should("be.visible");
            cy.get(".p-location").should("contain.text", "456 Public Street");

            // RSVP to the event
            cy.get("button#attendEvent").click();
            cy.get("#attendModal").should("be.visible");
            cy.get("#attendeeName").type("Regular Guest");
            cy.get("form#attendEventForm").submit();

            // Location should still be visible
            cy.get(".p-location").should("be.visible");
        });

        it("does not show pending badge", function () {
            visitFresh(`/${this.eventID}`);

            cy.get("button#attendEvent").click();
            cy.get("#attendModal").should("be.visible");
            cy.get("#attendeeName").type("Regular Guest");
            cy.get("form#attendEventForm").submit();

            // Attendee should be in the list without pending badge
            cy.get(".attendeesList").should("contain.text", "Regular Guest");
            cy.get(".badge-warning").should("not.exist");
        });
    });

    describe("Approval-Required RSVP Flow", () => {
        beforeEach(function () {
            cy.createEventWithApproval(baseEventData);
        });

        it("hides location from public view", function () {
            // Visit as non-authenticated user
            visitFresh(`/${this.eventID}`);

            // Location should be hidden
            cy.get(".p-location").should("not.exist");
            cy.get(".hidden-section").should("contain.text", "Location hidden");
        });

        it("shows rsvppending modal with secret link after RSVP", function () {
            visitFresh(`/${this.eventID}`);

            cy.get("button#attendEvent").click();
            cy.get("#attendModal").should("be.visible");
            cy.get("#attendeeName").type("Pending Guest");
            cy.get("#removalPassword").invoke("val").as("guestPassword");
            cy.get("form#attendEventForm").submit();

            // Should show the pending RSVP modal
            cy.get("#rsvpSuccessModal", { timeout: 10000 }).should("be.visible");
            cy.get("#rsvpSuccessModalLabel").should(
                "contain.text",
                "Awaiting approval",
            );
            cy.get("#rsvpSecretLink").should("be.visible");
            cy.get("#rsvpSecretLink")
                .invoke("val")
                .should("contain", "?p=");
        });

        it("hides attendee list from unapproved viewers", function () {
            // First RSVP as a guest
            visitFresh(`/${this.eventID}`);

            cy.get("button#attendEvent").click();
            cy.get("#attendModal").should("be.visible");
            cy.get("#attendeeName").type("First Guest");
            cy.get("form#attendEventForm").submit();

            // Close modal
            cy.get("#rsvpSuccessModal", { timeout: 10000 }).should("be.visible");
            cy.get("#rsvpSuccessModal .close").click();

            // Attendee list should show hidden message
            cy.get(".hidden-section").should(
                "contain.text",
                "hidden",
            );
        });
    });

    describe("Host View of Pending Attendees", () => {
        beforeEach(function () {
            cy.createEventWithApproval(baseEventData);

            // Add a pending attendee (guest RSVP without host approval)
            cy.get<string>("@eventID").then((eventID) => {
                rsvpAsGuest(eventID, "Pending Guest");
            });
            cy.get("#rsvpSuccessModal .close").click();
        });

        it("displays pending badge (.badge-warning)", function () {
            // Return to host view
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".attendeesList").should("contain.text", "Pending Guest");
            cy.get(".badge-warning").should("be.visible");
        });

        it("shows approve button (.approve-attendee)", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".approve-attendee").should("be.visible");
        });

        it("does NOT show copy link button for pending attendees", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            // The copy link button should not exist for pending attendees
            cy.get(".copy-attendee-link").should("not.exist");
        });

        it("shows remove button (.remove-attendee)", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".remove-attendee").should("be.visible");
        });
    });

    describe("Host Approves Attendee", () => {
        beforeEach(function () {
            cy.createEventWithApproval(baseEventData);

            // Add a pending attendee
            cy.get<string>("@eventID").then((eventID) => {
                rsvpAsGuest(eventID, "To Be Approved");
            });
            cy.get("#rsvpSuccessModal .close").click();
        });

        it("approves via .approve-attendee click", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            // Verify pending state
            cy.get(".badge-warning").should("exist");

            // Click approve
            cy.get(".approve-attendee").click();

            // Page should reload and badge should be gone
            cy.get(".attendeesList").should("contain.text", "To Be Approved");
            cy.get(".badge-warning").should("not.exist");
        });

        it("removes pending badge after approval", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".approve-attendee").click();

            cy.get(".attendeesList").should("contain.text", "To Be Approved");
            cy.get(".badge-warning").should("not.exist");
        });

        it("shows copy link button (.copy-attendee-link) after approval", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".approve-attendee").click();

            // After approval, copy link button should appear
            cy.get(".copy-attendee-link").should("be.visible");
        });
    });

    describe("Host Removes Attendee", () => {
        beforeEach(function () {
            cy.createEventWithApproval(baseEventData);

            // Add a pending attendee
            cy.get<string>("@eventID").then((eventID) => {
                rsvpAsGuest(eventID, "To Be Removed");
            });
            cy.get("#rsvpSuccessModal .close").click();
        });

        it("removes via modal confirmation", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".attendeesList").should("contain.text", "To Be Removed");

            // Click remove button
            cy.get(".remove-attendee").click();

            // Modal should appear
            cy.get("#removeAttendeeModal").should("be.visible");

            // Confirm removal
            cy.get("#confirmRemoveAttendee").click();

            // Attendee should be gone
            cy.get(".attendeesList").should("not.exist");
            cy.contains("No attendees yet").should("be.visible");
        });

        it("attendee disappears from list", function () {
            cy.visit(`/${this.eventID}?e=${this.editToken}`);

            cy.get(".attendeesList li").should("have.length.at.least", 1);

            cy.get(".remove-attendee").click();
            cy.get("#removeAttendeeModal").should("be.visible");
            cy.get("#confirmRemoveAttendee").click();

            // List should be empty or not exist
            cy.get('[data-attendee-name="To Be Removed"]').should("not.exist");
        });
    });

    describe("Approved Attendee View", () => {
        beforeEach(function () {
            cy.createEventWithApproval(baseEventData);

            // Add an attendee and capture their secret link
            cy.get<string>("@eventID").then((eventID) => {
                rsvpAsGuest(eventID, "Approved Guest");
            });
            cy.get("#rsvpSecretLink")
                .invoke("val")
                .then((link) => {
                    cy.wrap(link).as("approvedGuestLink");
                });
            cy.get("#rsvpSuccessModal .close").click();

            // Host approves the attendee
            cy.get<string>("@eventID").then((eventID) => {
                cy.get<string>("@editToken").then((editToken) => {
                    cy.visit(`/${eventID}?e=${editToken}`);
                });
            });
            cy.get(".approve-attendee").click();
            cy.get(".badge-warning").should("not.exist");
        });

        it("shows location with ?p= link", function () {
            // Visit as approved attendee with ?p= link
            visitFresh(this.approvedGuestLink as string);

            // Location should be visible
            cy.get(".p-location").should("be.visible");
            cy.get(".p-location").should("contain.text", "123 Test Street");
        });

        it("shows map buttons", function () {
            visitFresh(this.approvedGuestLink as string);

            // Map buttons should be visible
            cy.contains("Google Maps").should("be.visible");
            cy.contains("OpenStreetMap").should("be.visible");
        });

        it("shows full attendee list", function () {
            visitFresh(this.approvedGuestLink as string);

            cy.get(".attendeesList").should("be.visible");
            cy.get(".attendeesList").should("contain.text", "Approved Guest");
            // Should not show "attendees hidden" message
            cy.get(".hidden-section").should("not.exist");
        });
    });

    describe("Unapproved Attendee View", () => {
        beforeEach(function () {
            cy.createEventWithApproval(baseEventData);

            // First add an approved attendee
            cy.get<string>("@eventID").then((eventID) => {
                rsvpAsGuest(eventID, "Approved Guest");
            });
            cy.get("#rsvpSuccessModal .close").click();

            // Host approves them
            cy.get<string>("@eventID").then((eventID) => {
                cy.get<string>("@editToken").then((editToken) => {
                    cy.visit(`/${eventID}?e=${editToken}`);
                });
            });
            cy.get(".approve-attendee").click();
            cy.get(".badge-warning").should("not.exist");

            // Now add an unapproved attendee
            cy.get<string>("@eventID").then((eventID) => {
                rsvpAsGuest(eventID, "Unapproved Guest");
            });
            cy.get("#rsvpSecretLink")
                .invoke("val")
                .then((link) => {
                    cy.wrap(link).as("unapprovedGuestLink");
                });
            cy.get("#rsvpSuccessModal .close").click();
        });

        it("hides location even with ?p= link", function () {
            visitFresh(this.unapprovedGuestLink as string);

            // Location should be hidden for unapproved attendee
            cy.get(".p-location").should("not.exist");
            cy.get(".hidden-section").should("contain.text", "Location hidden");
        });

        it("hides map buttons", function () {
            visitFresh(this.unapprovedGuestLink as string);

            // Map buttons should not be visible
            cy.contains("Google Maps").should("not.exist");
            cy.contains("OpenStreetMap").should("not.exist");
        });

        it("shows only own name", function () {
            visitFresh(this.unapprovedGuestLink as string);

            // Should see own name
            cy.get(".attendeesList").should("contain.text", "Unapproved Guest");
            // Should not see other attendees
            cy.get(".attendeesList").should("not.contain.text", "Approved Guest");
        });

        it('shows "attendees hidden" message', function () {
            visitFresh(this.unapprovedGuestLink as string);

            cy.get(".hidden-section").should("contain.text", "hidden");
        });
    });

    describe("Capacity with Approvals", () => {
        const capacityEventData = {
            ...baseEventData,
            eventName: "Capacity Test Event",
            maxAttendees: 2,
        };

        beforeEach(function () {
            cy.createEventWithApproval(capacityEventData);
        });

        it("pending attendees don't count toward capacity", function () {
            // Add a pending attendee
            rsvpAsGuest(this.eventID, "Pending One");
            cy.get("#rsvpSuccessModal .close").click();

            // Check capacity message - should still show 2 spots (pending doesn't count)
            cy.get("#attendees-alert").should("contain.text", "2 spots remaining");
        });

        it("approved attendees count toward capacity", function () {
            // Add and approve an attendee
            rsvpAsGuest(this.eventID, "To Approve");
            cy.get("#rsvpSuccessModal .close").click();

            // Approve them
            cy.visit(`/${this.eventID}?e=${this.editToken}`);
            cy.get(".approve-attendee").click();

            // Capacity should now show 1 spot remaining
            cy.get("#attendees-alert").should("contain.text", "1 spot remaining");
        });

        it("blocks RSVPs when approved reach capacity", function () {
            // Add two attendees and approve both
            rsvpAsGuest(this.eventID, "First Approved");
            cy.get("#rsvpSuccessModal .close").click();

            // Approve first
            cy.visit(`/${this.eventID}?e=${this.editToken}`);
            cy.get(".approve-attendee").click();

            // Add second
            rsvpAsGuest(this.eventID, "Second Approved");
            cy.get("#rsvpSuccessModal .close").click();

            // Approve second
            cy.visit(`/${this.eventID}?e=${this.editToken}`);
            cy.get(".approve-attendee").click();

            // Now capacity is full
            cy.get("#attendees-alert").should("contain.text", "capacity");

            // RSVP button should not exist
            cy.get("button#attendEvent").should("not.exist");
        });
    });
});
