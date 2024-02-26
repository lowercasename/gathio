import groupData from "../fixtures/groupData.json";

describe("Groups", () => {
    beforeEach(() => {
        cy.createGroup(groupData, false);
    });
    it("creates a new group", function () {
        cy.get("#eventGroupName").should("have.text", groupData.eventGroupName);
        cy.get("#eventDescription").should(
            "contain.text",
            groupData.eventGroupDescription,
        );
        cy.get("#eventGroupURL").should(
            "contain.text",
            groupData.eventGroupURL,
        );
        cy.get("#hostName").should("contain.text", groupData.hostName);
        cy.get("#eventGroupID").should("contain.text", this.groupID);
        cy.get("#eventGroupEditToken").should("contain.text", this.editToken);
    });

    it("edits a group", function () {
        cy.get("#editGroup").click();

        cy.get("#editEventGroupForm #eventGroupName").focus().clear();
        cy.get("#editEventGroupForm #eventGroupDescription").focus().clear();
        cy.get("#editEventGroupForm #eventGroupURL").focus().clear();
        cy.get("#editEventGroupForm #eventGroupHostName").focus().clear();
        cy.get("#editEventGroupForm #eventGroupCreatorEmail").focus().clear();

        cy.get("#editEventGroupForm #eventGroupName").type("Edited Group Name");
        cy.get("#editEventGroupForm #eventGroupDescription").type(
            "Edited Group Description",
        );
        cy.get("#editEventGroupForm #eventGroupURL").type(
            "https://edited.example.com",
        );
        cy.get("#editEventGroupForm #eventGroupHostName").type("Edited Name");
        cy.get("#editEventGroupForm #eventGroupCreatorEmail").type(
            "edited@example.com",
        );

        // Submit the form
        cy.get("#editEventGroupForm").submit();

        // Wait for the modal to not be visible
        cy.get("#editModal").should("not.be.visible");

        // Check that all the data is correct
        cy.get("#eventGroupName").should("have.text", "Edited Group Name");
        cy.get("#eventDescription").should(
            "contain.text",
            "Edited Group Description",
        );
        cy.get("#eventGroupURL").should(
            "contain.text",
            "https://edited.example.com",
        );
        cy.get("#hostName").should("contain.text", "Edited Name");
    });
});
