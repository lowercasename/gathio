/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Cypress {
  interface Chainable<Subject> {
    createGroup(
      groupData: {
        eventGroupName: string;
        eventGroupDescription: string;
        eventGroupURL: string;
        hostName: string;
        creatorEmail: string;
      },
      isPublic?: boolean,
    ): Chainable<Subject>;
    createEventWithApproval(eventData: {
      eventName: string;
      eventLocation: string;
      eventStart: string;
      eventEnd: string;
      timezone: string;
      eventDescription: string;
      hostName: string;
      creatorEmail: string;
      maxAttendees?: number;
    }): Chainable<Subject>;
  }
}

Cypress.Commands.add("createEventWithApproval", (eventData) => {
  cy.visit("/new");
  cy.get("#showNewEventFormButton").click();

  cy.get("#eventName").type(eventData.eventName);
  cy.get("#eventLocation").type(eventData.eventLocation);
  cy.get("#eventStart").type(eventData.eventStart);
  cy.get("#eventEnd").type(eventData.eventEnd);

  cy.get("select#timezone + span.select2").click();
  cy.get(".select2-results__option")
    .contains(eventData.timezone)
    .click({ force: true });

  cy.get("#eventDescription").type(eventData.eventDescription);
  cy.get("#hostName").type(eventData.hostName);
  cy.get("#creatorEmail").type(eventData.creatorEmail);

  // Enable attendance and approval
  cy.get("#joinCheckbox").check();
  cy.get("#approveRegistrationsCheckbox").check();

  // Set max attendees if provided
  if (eventData.maxAttendees) {
    cy.get("#maxAttendeesCheckbox").check();
    cy.get("#maxAttendees").type(eventData.maxAttendees.toString());
  }

  cy.get("#newEventFormSubmit").click();

  // Wait for the new page to load
  cy.url({ timeout: 10000 }).should("not.include", "/new");

  // Get the new event ID from the URL
  cy.url().then((url) => {
    const [eventID, editToken] = url.split("/").pop()!.split("?");
    cy.wrap(eventID).as("eventID");
    cy.wrap(editToken.slice(2)).as("editToken");
  });
});

Cypress.Commands.add("createGroup", (groupData, isPublic) => {
  cy.visit("/new");
  cy.get("#showNewEventGroupFormButton").click();

  // Fill in the form
  cy.get("#eventGroupName").type(groupData.eventGroupName);
  cy.get("#eventGroupDescription").type(groupData.eventGroupDescription);
  cy.get("#eventGroupURL").type(groupData.eventGroupURL);
  cy.get("#eventGroupHostName").type(groupData.hostName);
  cy.get("#eventGroupCreatorEmail").type(groupData.creatorEmail);

  if (isPublic) {
    cy.get("#publicGroupCheckbox").check();
  }

  // Submit the form
  cy.get("#newEventGroupForm").submit();

  // Wait for the new page to load
  cy.url({ timeout: 10000 }).should("not.include", "/new");

  // Get the new group ID from the URL
  cy.url().then((url) => {
    const [groupID, editToken] = url.split("/").pop().split("?");
    cy.wrap(groupID).as("groupID");
    cy.wrap(editToken.slice(2)).as("editToken");
  });
});
