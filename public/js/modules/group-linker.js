function eventGroupLinker() {
    return {
        data: {
            eventGroupID: "",
            eventGroupEditToken: "",
            groups: [],
        },
        manualGroupInputVisible: false,
        eventGroupOptionTemplate(state) {
            if (!state.id) {
                return state.text;
            }
            if (!this.data.groups.length) {
                return state.text;
            }
            const group = this.data.groups.find(
                (group) => group.id === state.id,
            );
            if (!group) {
                return state.text;
            }
            const template = `
                <span class="group-preview">
                    <img src="${
                        group.image
                            ? `/events/${group.image}`
                            : "/images/seigaiha-single.png"
                    }" class="group-preview__image" />
                    <div class="group-preview__text">
                        <strong>${group.name}</strong>
                        <p class="text-muted">${group.description}</p>
                    </div>
                </span>`;
            return $(template);
        },
        async init() {
            this.select2 = $(this.$refs.eventGroupSelect).select2({
                placeholder: "No group selected",
                templateResult: this.eventGroupOptionTemplate.bind(this),
                templateSelection: this.eventGroupOptionTemplate.bind(this),
                selectionCssClass: "group-select-dropdown",
            });
            this.select2.on("select2:select", (event) => {
                this.selectGroup(event);
            });
            this.select2.on("select2:unselect", () => {
                this.data.eventGroupID = "";
                this.data.eventGroupEditToken = "";
            });
            this.$watch("data.eventGroupID", () => {
                this.$dispatch(
                    "event-group-id-changed",
                    this.data.eventGroupID,
                );
                const matchingGroup = this.data.groups.find(
                    (group) =>
                        group.id === this.data.eventGroupID &&
                        group.editToken === this.data.eventGroupEditToken,
                );
                if (matchingGroup) {
                    this.select2.val(matchingGroup.id).trigger("change");
                } else {
                    this.resetGroupSelector();
                }
            });
            this.$watch("data.eventGroupEditToken", () => {
                this.$dispatch(
                    "event-group-edit-token-changed",
                    this.data.eventGroupEditToken,
                );
                const matchingGroup = this.data.groups.find(
                    (group) =>
                        group.id === this.data.eventGroupID &&
                        group.editToken === this.data.eventGroupEditToken,
                );
                if (matchingGroup) {
                    this.select2.val(matchingGroup.id).trigger("change");
                } else {
                    this.resetGroupSelector();
                }
            });
            this.$watch("data.groups", () => {
                this.select2.val(this.data.eventGroupID).trigger("change");
            });
            if (window.eventData && !!window.eventData.eventGroupID) {
                this.data.eventGroupID = window.eventData.eventGroupID;
            }
            if (window.eventData && !!window.eventGroupEditToken) {
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
                const json = await response.json();
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
        resetGroupSelector() {
            this.select2.val(null).trigger("change");
        },
    };
}
