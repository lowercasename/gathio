$(document).ready(function () {
  $.uploadPreview({
    input_field: "#event-image-upload",
    preview_box: "#event-image-preview",
    label_field: "#event-image-label",
    label_default: "Choose file",
    label_selected: "Change file",
    no_label: false,
  });
  if (window.eventData.image) {
    $("#event-image-preview").css(
      "background-image",
      `url('/events/${window.eventData.image}')`,
    );
    $("#event-image-preview").css("background-size", "cover");
    $("#event-image-preview").css("background-position", "center center");
  }
});

$("#editModal").on("shown.bs.modal", function (e) {
  console.log("hii");
  const ta = document.querySelector("#editModal textarea");
  ta.style.display = "none";
  autosize(ta);
  ta.style.display = "";
  // Call the update method to recalculate the size:
  autosize.update(ta);
});

function editEventForm() {
  return {
    data: {
      eventName: window.eventData.name,
      eventLocation: window.eventData.location,
      eventStart: window.eventData.startForDateInput,
      eventEnd: window.eventData.endForDateInput,
      timezone: window.eventData.timezone,
      eventDescription: window.eventData.description,
      eventURL: window.eventData.url,
      hostName: window.eventData.hostName,
      creatorEmail: window.eventData.creatorEmail,
      eventGroupID: window.eventData.eventGroupID,
      eventGroupEditToken: window.eventData.eventGroupEditToken,
      publicCheckbox: window.eventData.showOnPublicList,
      interactionCheckbox: window.eventData.usersCanComment,
      joinCheckbox: window.eventData.usersCanAttend,
      maxAttendeesCheckbox: window.eventData.maxAttendees !== null,
      maxAttendees: window.eventData.maxAttendees,
    },
    errors: [],
    submitting: false,
    init() {
      // Set up Select2
      this.select2 = $(this.$refs.timezone).select2();
      this.select2.on("select2:select", (event) => {
        this.data.timezone = event.target.value;
      });
      this.select2.val(this.data.timezone).trigger("change");

      // Set checkboxes
      this.data.eventGroupCheckbox = !!window.eventData.eventGroupID;
      this.data.interactionCheckbox = window.eventData.usersCanComment;
      this.data.joinCheckbox = window.eventData.usersCanAttend;
      this.data.maxAttendeesCheckbox = window.eventData.maxAttendees !== null;
      this.data.publicCheckbox = window.eventData.showOnPublicList;
    },
    updateEventEnd() {
      if (
        this.data.eventEnd === "" ||
        this.data.eventEnd < this.data.eventStart
      ) {
        this.data.eventEnd = this.data.eventStart;
      }
    },
    async submitForm() {
      this.submitting = true;
      this.errors = [];
      const formData = new FormData();
      for (const [key, value] of Object.entries(this.data)) {
        formData.append(key, value);
      }
      formData.append("imageUpload", this.$refs.eventImageUpload.files[0]);
      formData.append("editToken", window.eventData.editToken);
      try {
        const response = await fetch(`/event/${window.eventData.id}`, {
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
          // Set Bootstrap validation classes using 'field' property
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
