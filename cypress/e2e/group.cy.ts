const groupData = {
    eventGroupName: "Test Group",
    eventGroupDescription: "Test Group Description",
    eventGroupURL: "https://example.com",
    hostName: "Test Host",
    creatorEmail: "test@example.com",
};

describe("Groups", () => {
    beforeEach(() => {
        cy.visit("/new");
        cy.get("#showNewEventGroupFormButton").click();

        // Fill in the form
        cy.get("#eventGroupName").type(groupData.eventGroupName);
        cy.get("#eventGroupDescription").type(groupData.eventGroupDescription);
        cy.get("#eventGroupURL").type(groupData.eventGroupURL);
        cy.get("#eventGroupHostName").type(groupData.hostName);
        cy.get("#eventGroupCreatorEmail").type(groupData.creatorEmail);

        // Submit the form
        cy.get("#newEventGroupForm").submit();

        // Wait for the new page to load
        cy.url().should("not.include", "/new");

        // Get the new group ID from the URL
        cy.url().then((url) => {
            const [groupID, editToken] = url.split("/").pop().split("?");
            cy.wrap(groupID).as("groupID");
            cy.wrap(editToken.slice(2)).as("editToken");
        });
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
        // // Wait for the modal to not be visible
        // cy.get("#editModal").should("not.be.visible");
        // // Check that all the data is correct
        // cy.get(".p-name").should("have.text", "Edited Event Name");
        // cy.get(".p-location").should("have.text", "Edited Event Location");
        // cy.get(".p-summary").should("contain.text", "Edited Event Description");
        // cy.get("#hosted-by").should("contain.text", "Hosted by Edited Name");
        // cy.get(".dt-duration").should(
        //     "contain.text",
        //     "Sunday 1 December 2030 from 12:00 am to 1:00 am",
        // );
        // cy.get(".dt-duration")
        //     .invoke("text")
        //     .should("match", /AE(D|S)T/);
        // // Check that the comment form is not visible
        // cy.get("#postComment").should("not.exist");
        // // Check that the attendee form is not visible
        // cy.get("#attendEvent").should("not.exist");
    });
});
