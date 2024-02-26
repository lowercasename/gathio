describe("Restricted Event Creation", () => {
    it("should redirect to the magic link form", () => {
        cy.setCookie(
            "cypressConfigOverride",
            JSON.stringify({
                general: {
                    creator_email_addresses: ["test@test.com"],
                },
            }),
        );
        cy.visit("/new");
        cy.get("h2").should("contain", "Request a link to create a new event");
    });
});
