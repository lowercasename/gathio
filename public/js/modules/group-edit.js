$(document).ready(function () {
    $.uploadPreview({
        input_field: "#group-image-upload",
        preview_box: "#group-image-preview",
        label_field: "#group-image-label",
        label_default: "Choose file",
        label_selected: "Change file",
        no_label: false,
    });
    autosize($("textarea"));
    if (window.groupData.image) {
        $("#group-image-preview").css(
            "background-image",
            `url('/events/${window.groupData.image}')`,
        );
        $("#group-image-preview").css("background-size", "cover");
        $("#group-image-preview").css("background-position", "center center");
    }
    $("#timezone").val(window.groupData.timezone).trigger("change");
});

function editEventGroupForm() {
    return {
        data: {
            eventGroupName: window.groupData.name,
            eventGroupDescription: window.groupData.description,
            eventGroupURL: window.groupData.url,
            hostName: window.groupData.hostName,
            creatorEmail: window.groupData.creatorEmail,
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
            formData.append("editToken", window.groupData.editToken);
            try {
                const response = await fetch(`/group/${window.groupData.id}`, {
                    method: "PUT",
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
                window.location.reload();
            } catch (error) {
                console.log(error);
                this.errors = unexpectedError;
                this.submitting = false;
            }
        },
    };
}
