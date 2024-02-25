$(document).ready(function () {
    if ($("#icsImportControl")[0].files[0] != null) {
        var file = $("#icsImportControl")[0].files[0].name;
        $("#icsImportControl")
            .next("label")
            .html('<i class="far fa-file-alt"></i> ' + file);
    }
    $("#showNewEventFormButton").click(function () {
        $("button").removeClass("active");
        $(
            "#showImportEventFormButton #showNewEventGroupFormButton",
        ).removeClass("active");
        if ($("#newEventFormContainer").is(":visible")) {
            $("#newEventFormContainer").slideUp("fast");
        } else {
            $("#newEventFormContainer").slideDown("fast");
            $("#importEventFormContainer").slideUp("fast");
            $("#newEventGroupFormContainer").slideUp("fast");
            $(this).addClass("active");
        }
    });
    $("#showImportEventFormButton").click(function () {
        $("button").removeClass("active");
        $("#showNewEventFormButton #showNewEventGroupFormButton").removeClass(
            "active",
        );
        if ($("#importEventFormContainer").is(":visible")) {
            $("#importEventFormContainer").slideUp("fast");
        } else {
            $("#importEventFormContainer").slideDown("fast");
            $("#newEventFormContainer").slideUp("fast");
            $("#newEventGroupFormContainer").slideUp("fast");
            $(this).addClass("active");
        }
    });
    $("#showNewEventGroupFormButton").click(function () {
        $("button").removeClass("active");
        $("#showNewEventFormButton #showImportEventFormButton").removeClass(
            "active",
        );
        if ($("#newEventGroupFormContainer").is(":visible")) {
            $("#newEventGroupFormContainer").slideUp("fast");
        } else {
            $("#newEventGroupFormContainer").slideDown("fast");
            $("#newEventFormContainer").slideUp("fast");
            $("#importEventFormContainer").slideUp("fast");
            $(this).addClass("active");
        }
    });
    $("#icsImportControl").change(function () {
        var file = $("#icsImportControl")[0].files[0].name;
        $(this)
            .next("label")
            .html('<i class="far fa-file-alt"></i> ' + file);
    });

    $.uploadPreview({
        input_field: "#event-image-upload",
        preview_box: "#event-image-preview",
        label_field: "#event-image-label",
        label_default: "Choose file",
        label_selected: "Change file",
        no_label: false,
    });
    $.uploadPreview({
        input_field: "#group-image-upload",
        preview_box: "#group-image-preview",
        label_field: "#group-image-label",
        label_default: "Choose file",
        label_selected: "Change file",
        no_label: false,
    });
    autosize($("textarea"));
});

function newEventForm() {
    return {
        data: {
            eventName: "",
            eventLocation: "",
            eventStart: "",
            eventEnd: "",
            timezone: "",
            eventDescription: "",
            eventURL: "",
            hostName: "",
            creatorEmail: "",
            eventGroupID: "",
            eventGroupEditToken: "",
            interactionCheckbox: false,
            joinCheckbox: false,
            maxAttendeesCheckbox: false,
            maxAttendees: "",
        },
        errors: [],
        submitting: false,
        init() {
            // Set up timezone Select2
            this.select2 = $(this.$refs.timezone).select2();
            this.select2.on("select2:select", (event) => {
                this.data.timezone = event.target.value;
            });
            this.data.timezone = this.select2.val();

            // Reset checkboxes
            this.data.eventGroupCheckbox = false;
            this.data.interactionCheckbox = false;
            this.data.joinCheckbox = false;
            this.data.maxAttendeesCheckbox = false;
        },
        async submitForm() {
            this.submitting = true;
            this.errors = [];
            const formData = new FormData();
            for (const [key, value] of Object.entries(this.data)) {
                formData.append(key, value);
            }
            formData.append(
                "imageUpload",
                this.$refs.eventImageUpload.files[0],
            );
            formData.append(
                "magicLinkToken",
                this.$refs.magicLinkToken.value,
            );
            try {
                const response = await fetch("/event", {
                    method: "POST",
                    body: formData,
                });
                this.submitting = false;
                if (!response.ok) {
                    if (response.status !== 400) {
                        this.errors = unexpectedError;
                        return;
                    }
                    const json = await response.json();
                    this.errors = json.errors;
                    $("input, textarea").removeClass("is-invalid");
                    this.errors.forEach((error) => {
                        $(`#${error.field}`).addClass("is-invalid");
                    });
                    return;
                }
                const json = await response.json();
                window.location.assign(json.url);
            } catch (error) {
                console.log(error);
                this.errors = unexpectedError;
                this.submitting = false;
            }
        },
    };
}
function newEventGroupForm() {
    return {
        data: {
            eventGroupName: "",
            eventGroupDescription: "",
            eventGroupURL: "",
            hostName: "",
            creatorEmail: "",
        },
        errors: [],
        submitting: false,
        async submitForm() {
            this.submitting = true;
            this.errors = [];
            const formData = new FormData();
            for (const [key, value] of Object.entries(this.data)) {
                formData.append(key, value);
            }
            formData.append(
                "imageUpload",
                this.$refs.eventGroupImageUpload.files[0],
            );
            formData.append(
                "magicLinkToken",
                this.$refs.magicLinkToken.value,
            );
            try {
                const response = await fetch("/group", {
                    method: "POST",
                    body: formData,
                });
                this.submitting = false;
                if (!response.ok) {
                    if (response.status !== 400) {
                        this.errors = unexpectedError;
                        return;
                    }
                    const json = await response.json();
                    this.errors = json.errors;
                    $("input, textarea").removeClass("is-invalid");
                    this.errors.forEach((error) => {
                        $(`#${error.field}`).addClass("is-invalid");
                    });
                    return;
                }
                const json = await response.json();
                window.location.assign(json.url);
            } catch (error) {
                console.log(error);
                this.errors = unexpectedError;
                this.submitting = false;
            }
        },
    };
}

function importEventForm() {
    return {
        data: {
            creatorEmail: "",
        },
        errors: [],
        submitting: false,
        async submitForm() {
            this.submitting = true;
            this.errors = [];
            const formData = new FormData();
            for (const [key, value] of Object.entries(this.data)) {
                formData.append(key, value);
            }
            formData.append(
                "icsImportControl",
                this.$refs.icsImportControl.files[0],
            );
            formData.append(
                "magicLinkToken",
                this.$refs.magicLinkToken.value,
            );
            try {
                const response = await fetch("/import/event", {
                    method: "POST",
                    body: formData,
                });
                this.submitting = false;
                if (!response.ok) {
                    if (response.status !== 400) {
                        this.errors = unexpectedError;
                        return;
                    }
                    const json = await response.json();
                    this.errors = json.errors;
                    return;
                }
                const json = await response.json();
                window.location.assign(json.url);
            } catch (error) {
                console.log(error);
                this.errors = unexpectedError;
                this.submitting = false;
            }
        },
    };
}
