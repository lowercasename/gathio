import groupData from "../fixtures/groupData.json";

describe("Groups", () => {
  beforeEach(() => {
    cy.setCookie(
      "cypressConfigOverride",
      JSON.stringify({
        general: {
          show_public_event_list: true,
        },
      }),
    );
    cy.createGroup(groupData, true);
  });
  it("should be visible in the public group list", function () {
    cy.setCookie(
      "cypressConfigOverride",
      JSON.stringify({
        general: {
          show_public_event_list: true,
        },
      }),
    );
    cy.visit("/");
    cy.get("#groupsTab").click();
    cy.get("#eventGroups").should("contain", groupData.eventGroupName);
  });
});
