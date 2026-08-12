/** Visit a URL as a fresh visitor with no stored tokens. */
function visitFresh(url: string) {
  cy.visit(url, {
    onBeforeLoad(win) {
      win.localStorage.clear();
    },
  });
}

describe("Custom RSVP Questions", () => {
  const openNewEventForm = () => {
    cy.visit("/new");
    cy.get("#showNewEventFormButton").click();
  };

  /**
   * Open the RSVP modal and wait out Bootstrap's fade transition. When it
   * finishes, the modal steals focus (Bootstrap calls modal.focus() on shown),
   * which would silently swallow keystrokes typed mid-transition.
   */
  const openAttendModal = () => {
    cy.get("button#attendEvent").click();
    cy.get("#attendModal").should("be.visible");
    cy.get("#attendModal").should("have.focus");
  };

  const fillBaseEventForm = () => {
    openNewEventForm();

    cy.get("#eventName").type("Custom Questions Event");
    cy.get("#eventLocation").type("789 Question Street");
    cy.get("#eventStart").type("2030-01-01T12:00");
    cy.get("#eventEnd").type("2030-01-01T14:00");

    cy.get("select#timezone + span.select2").click();
    cy.get(".select2-results__option")
      .contains("America/New York")
      .click({ force: true });

    cy.get("#eventDescription").type("Event with custom questions");
    cy.get("#hostName").type("Test Host");
    cy.get("#creatorEmail").type("host@example.com");

    cy.get("#joinCheckbox").check();
  };

  const submitEventForm = () => {
    cy.get("#newEventFormSubmit").click();
    cy.url({ timeout: 10000 }).should("not.include", "/new");
    cy.url().then((url) => {
      const [eventID, editToken] = url.split("/").pop()!.split("?");
      cy.wrap(eventID).as("eventID");
      cy.wrap(editToken.slice(2)).as("editToken");
    });
  };

  describe("Question Builder", () => {
    beforeEach(openNewEventForm);

    it("shows the question builder only when attendance is enabled", () => {
      cy.get("#joinCheckbox").should("not.be.checked");
      cy.get("#addCustomQuestionButton").should("not.be.visible");

      cy.get("#joinCheckbox").check();
      cy.get("#addCustomQuestionButton").should("be.visible");

      cy.get("#joinCheckbox").uncheck();
      cy.get("#addCustomQuestionButton").should("not.be.visible");
    });

    it("adds and removes questions", () => {
      cy.get("#joinCheckbox").check();
      cy.get("#addCustomQuestionButton").click();
      cy.get("#customQuestionPrompt0").should("be.visible");

      cy.get("#removeCustomQuestion0").click();
      cy.get("#customQuestionPrompt0").should("not.exist");
    });

    it("seeds two choices for multiple choice questions", () => {
      cy.get("#joinCheckbox").check();
      cy.get("#addCustomQuestionButton").click();
      cy.get("#customQuestionType0").select("Multiple choice");

      cy.get("#customQuestion0Option0").should("be.visible");
      cy.get("#customQuestion0Option1").should("be.visible");
      cy.get("#customQuestion0Option2").should("not.exist");
    });

    it("allows a maximum of six questions", () => {
      cy.get("#joinCheckbox").check();
      for (let i = 0; i < 6; i++) {
        cy.get("#addCustomQuestionButton").click();
      }
      cy.get("#customQuestionPrompt5").should("be.visible");
      cy.get("#addCustomQuestionButton").should("not.be.visible");

      cy.get("#removeCustomQuestion5").click();
      cy.get("#addCustomQuestionButton").should("be.visible");
    });
  });

  describe("RSVP flow with custom questions", () => {
    beforeEach(() => {
      fillBaseEventForm();

      // A short text question
      cy.get("#addCustomQuestionButton").click();
      cy.get("#customQuestionPrompt0").type("What pizza would you like?");

      // A multiple choice question
      cy.get("#addCustomQuestionButton").click();
      cy.get("#customQuestionPrompt1").type("Choose a team");
      cy.get("#customQuestionType1").select("Multiple choice");
      cy.get("#customQuestion1Option0").type("Red");
      cy.get("#customQuestion1Option1").type("Blue");

      submitEventForm();
    });

    it("asks the questions in the RSVP modal and shows answers to the host", function () {
      visitFresh(`/${this.eventID}`);

      openAttendModal();
      cy.get("#attendeeName").type("Pizza Guest");
      cy.get('#attendModal input[name^="customQuestionAnswer-"]')
        .type("Margherita")
        .should("have.value", "Margherita");
      cy.get('#attendModal select[name^="customQuestionAnswer-"]').select(
        "Blue",
      );
      cy.get("form#attendEventForm").submit();

      // The guest sees themselves in the list, but not their answers
      cy.get(".attendeesList").should("contain.text", "Pizza Guest");
      cy.get(".attendee-answers").should("not.exist");

      // The host sees the answers
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.get(".attendee-answers")
        .should("contain.text", "What pizza would you like?")
        .and("contain.text", "Margherita")
        .and("contain.text", "Choose a team")
        .and("contain.text", "Blue");
    });

    it("allows RSVPing without answering the questions", function () {
      visitFresh(`/${this.eventID}`);

      openAttendModal();
      cy.get("#attendeeName").type("Quiet Guest");
      cy.get("form#attendEventForm").submit();

      cy.get(".attendeesList").should("contain.text", "Quiet Guest");

      // The host sees the questions listed with 'No answer' placeholders
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.get(".attendee-answers")
        .should("contain.text", "What pizza would you like?")
        .and("contain.text", "No answer");
    });

    it("keeps answers linked when questions are edited", function () {
      visitFresh(`/${this.eventID}`);
      openAttendModal();
      cy.get("#attendeeName").type("Editing Guest");
      cy.get('#attendModal input[name^="customQuestionAnswer-"]').type(
        "Margherita",
      );
      cy.get('#attendModal select[name^="customQuestionAnswer-"]').select(
        "Blue",
      );
      cy.get("form#attendEventForm").submit();
      cy.get(".attendeesList").should("contain.text", "Editing Guest");

      // The host rewords the text question and deletes the choice question
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.get("#editEvent").click();
      cy.get("#editModal").should("be.visible");
      // Wait out Bootstrap's fade transition, which ends by focusing the
      // modal element (see openAttendModal above)
      cy.get("#editModal").should("have.focus");
      cy.get("#editModal #customQuestionPrompt0").clear();
      cy.get("#editModal #customQuestionPrompt0").type(
        "Which pizza would make you happiest?",
      );
      cy.get("#editModal #removeCustomQuestion1").click();
      cy.get("#editModal #editEventForm").submit();
      cy.get("#editModal").should("not.be.visible");

      // The answer follows the reworded question; the deleted question's
      // answer survives under its original prompt
      cy.get(".attendee-answers")
        .should("contain.text", "Which pizza would make you happiest?")
        .and("contain.text", "Margherita")
        .and("contain.text", "Choose a team")
        .and("contain.text", "Blue");
    });

    it("rejects tampered multiple choice answers", function () {
      // Read the choice question's field name from the RSVP modal, then
      // submit an answer that isn't one of its options directly
      visitFresh(`/${this.eventID}`);
      cy.get('#attendModal select[name^="customQuestionAnswer-"]')
        .invoke("attr", "name")
        .then((fieldName) => {
          cy.request(
            "POST",
            `/attendee/provision?eventID=${this.eventID}`,
          ).then((provisionResponse) => {
            cy.request({
              method: "POST",
              url: `/event/${this.eventID}/attendee`,
              form: true,
              followRedirect: false,
              body: {
                removalPassword: provisionResponse.body.removalPassword,
                attendeeName: "Tampering Guest",
                attendeeNumber: "1",
                [fieldName!]: "Not A Choice",
              },
            }).then((response) => {
              expect(response.status).to.eq(302);
              expect(response.headers.location).to.contain("m=badanswer");
            });
          });
        });

      // Nothing was stored for the tampered RSVP - the event still has no
      // attendees at all, so the list doesn't render
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.get(".attendeesList").should("not.exist");
    });

    it("persists questions in the edit form", function () {
      cy.get("#editEvent").click();
      cy.get("#editModal").should("be.visible");

      cy.get("#editModal #customQuestionPrompt0").should(
        "have.value",
        "What pizza would you like?",
      );
      cy.get("#editModal #customQuestionType1").should(
        "have.value",
        "multipleChoice",
      );
      cy.get("#editModal #customQuestion1Option0").should("have.value", "Red");
      cy.get("#editModal #customQuestion1Option1").should("have.value", "Blue");
    });
  });

  describe("Standalone answers form", () => {
    // The answers link is keyed on a SHA-256 hash of the attendee's removal
    // password, mirroring what the server puts in the fediverse DM
    const sha256Hex = (win: Cypress.AUTWindow, input: string) =>
      win.crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(input))
        .then((buffer) =>
          Array.from(new Uint8Array(buffer))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
        );

    beforeEach(function () {
      fillBaseEventForm();
      cy.get("#addCustomQuestionButton").click();
      cy.get("#customQuestionPrompt0").type("What will you bring?");
      cy.get("#addCustomQuestionButton").click();
      cy.get("#customQuestionPrompt1").type("Choose a team");
      cy.get("#customQuestionType1").select("Multiple choice");
      cy.get("#customQuestion1Option0").type("Red");
      cy.get("#customQuestion1Option1").type("Blue");
      submitEventForm();

      // RSVP as a guest without answering, capturing the removal password
      cy.get("@eventID").then((eventID) => {
        visitFresh(`/${eventID}`);
      });
      openAttendModal();
      // Snapshot the value rather than aliasing the query - query aliases
      // are re-run on retrieval, and the field is empty after the reload
      cy.get("#attendModal #removalPassword")
        .invoke("val")
        .then((removalPassword) => {
          cy.wrap(String(removalPassword)).as("removalPassword");
        });
      cy.get("#attendeeName").type("Late Answerer");
      cy.get("form#attendEventForm").submit();
      cy.get(".attendeesList").should("contain.text", "Late Answerer");

      cy.get("@removalPassword").then((removalPassword) => {
        cy.window()
          .then((win) => sha256Hex(win, String(removalPassword)))
          .as("answersHash");
      });
    });

    it("saves answers, shows them to the host, then locks the form", function () {
      cy.visit(`/event/${this.eventID}/answers/${this.answersHash}`);
      cy.contains("What will you bring?").should("be.visible");
      cy.get('input[name^="customQuestionAnswer-"]').type("A big salad");
      cy.get('select[name^="customQuestionAnswer-"]').select("Red");
      cy.get("form").submit();

      // Redirected to the event page with the confirmation message
      cy.url().should("include", "m=answers");
      cy.contains("Your answers have been sent to the event host").should(
        "be.visible",
      );

      // The host sees the answers
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.get(".attendee-answers")
        .should("contain.text", "A big salad")
        .and("contain.text", "Red");

      // The form is now locked
      cy.visit(`/event/${this.eventID}/answers/${this.answersHash}`);
      cy.contains("You've already answered these questions").should(
        "be.visible",
      );
      cy.get('input[name^="customQuestionAnswer-"]').should("not.exist");
    });

    it("does not claim success for an all-blank submission", function () {
      cy.visit(`/event/${this.eventID}/answers/${this.answersHash}`);
      cy.get("form").submit();

      cy.url().should("include", "m=noanswers");
      cy.contains("You didn't answer any of the questions").should(
        "be.visible",
      );
      // The form is still open for another attempt
      cy.get('input[name^="customQuestionAnswer-"]').should("exist");
    });

    it("404s for an unknown link", function () {
      cy.request({
        url: `/event/${this.eventID}/answers/0000000000000000000000000000000000000000000000000000000000000000`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 404);
    });
  });

  describe("First load welcome banner", () => {
    beforeEach(() => {
      // Create the event via the API so no page view consumes the flag first
      cy.request({
        method: "POST",
        url: "/event",
        form: true,
        body: {
          eventName: "Welcome Banner Event",
          eventLocation: "1 Banner Street",
          eventStart: "2030-01-01T12:00",
          eventEnd: "2030-01-01T14:00",
          timezone: "America/New_York",
          eventDescription: "Testing the welcome banner",
          eventURL: "",
          hostName: "Test Host",
          creatorEmail: "",
          publicCheckbox: "false",
          eventGroupCheckbox: "false",
          interactionCheckbox: "false",
          joinCheckbox: "true",
          maxAttendeesCheckbox: "false",
          maxAttendees: "",
          approveRegistrationsCheckbox: "false",
          customQuestions: "[]",
          magicLinkToken: "",
        },
      }).then((response) => {
        cy.wrap(response.body.eventID).as("eventID");
        cy.wrap(response.body.editToken).as("editToken");
      });
    });

    it("is shown only to the host, once", function () {
      // A guest loading the page first neither sees nor consumes it
      visitFresh(`/${this.eventID}`);
      cy.contains("Welcome to your event!").should("not.exist");

      // The host sees it on their first visit with the edit token
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.contains("Welcome to your event!").should("be.visible");

      // And only on the first visit
      cy.visit(`/${this.eventID}?e=${this.editToken}`);
      cy.contains("Welcome to your event!").should("not.exist");
    });
  });
});
