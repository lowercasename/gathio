function eventGroupLinker() {
    return {
        data: {
            eventGroupID: "",
            eventGroupEditToken: "",
            groups: [],
        },
        async init() {
            this.$watch("data.eventGroupID", () => {
                this.$dispatch(
                    "event-group-id-changed",
                    this.data.eventGroupID,
                );
            });
            this.$watch("data.eventGroupEditToken", () => {
                this.$dispatch(
                    "event-group-edit-token-changed",
                    this.data.eventGroupEditToken,
                );
            });
            if (window.eventData && window.eventData.eventGroupID !== "") {
                this.data.eventGroupID = window.eventData.eventGroupID;
            }
            if (window.eventData && window.eventGroupEditToken !== "") {
                this.data.eventGroupEditToken =
                    window.eventData.eventGroupEditToken;
            }
            try {
                const editTokens = JSON.parse(
                    localStorage.getItem("editTokens"),
                );
                if (!editTokens) {
                    return;
                }
                const response = await fetch("/known/groups", {
                    method: "POST",
                    body: JSON.stringify(editTokens),
                    headers: {
                        "Content-Type": "application/json",
                    },
                });
                if (!response.ok) {
                    return;
                }
                const json = await (await response).json();
                this.data.groups = json;
            } catch (e) {
                return false;
            }
        },
        selectGroup(e) {
            const group = this.data.groups.find(
                (group) => group.id === e.target.value,
            );
            if (!group) {
                this.data.eventGroupID = "";
                this.data.eventGroupEditToken = "";
                return;
            }
            this.data.eventGroupID = group.id;
            this.data.eventGroupEditToken = group.editToken;
        },
        showGroupPreview() {
            return (
                this.data.eventGroupID !== "" &&
                this.data.groups.some(
                    (group) =>
                        group.id === this.data.eventGroupID &&
                        group.editToken === this.data.eventGroupEditToken,
                )
            );
        },
        groupPreview() {
            if (!this.showGroupPreview()) {
                return {};
            }
            return this.data.groups.find(
                (group) => group.id === this.data.eventGroupID,
            );
        },
        resetGroupSelector() {
            this.$refs.eventGroupSelect.value = "";
        },
    };
}
