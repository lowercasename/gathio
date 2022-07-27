<script>
import useVuelidate from "@vuelidate/core";
import {
    required,
    email,
    integer,
    minValue,
    requiredIf,
} from "@vuelidate/validators";
import { getTimeZones } from "@vvo/tzdb";
import axios from "axios";
import FormField from "./components/FormField.vue";
import DateTimeField from "./components/DateTimeField.vue";
import UploadField from "./components/UploadField.vue";
import Toaster from "./components/Toaster.vue";

const dateValidator = (value) => Date.parse(value) >= Date.now();

export default {
    components: {
        FormField,
        DateTimeField,
        UploadField,
        Toaster,
    },
    setup() {
        return { v$: useVuelidate() };
    },
    data() {
        return {
            eventName: "",
            eventLocation: "",
            eventStart: "",
            eventEnd: 0,
            timezone: "",
            eventDescription: "",
            eventURL: "",
            hostName: "",
            creatorEmail: "",
            eventGroupCheckbox: false,
            eventGroupID: "",
            eventGroupEditToken: "",
            interactionCheckbox: false,
            joinCheckbox: false,
            maxAttendeesCheckbox: false,
            maxAttendees: "",
            eventImage: null,
            eventImageID: null, // Returned by uploader when image is uploaded
            timezones: getTimeZones().map((o) => ({
                label: o.name.replace("_", " "),
                id: o.name,
            })),
            toasts: [],
            serverErrors: [],
        };
    },
    validations() {
        return {
            eventName: { required },
            eventLocation: { required },
            creatorEmail: { email },
            eventStart: { required, dateValidator },
            eventEnd: { required, dateValidator },
            timezone: { required },
            eventDescription: { required },
            eventGroupID: {
                required: requiredIf(this.eventGroupCheckbox),
            },
            eventGroupEditToken: {
                required: requiredIf(this.eventGroupCheckbox),
            },
            maxAttendees: {
                required: requiredIf(this.maxAttendeesCheckbox),
            },
        };
    },
    methods: {
        submitForm($event) {
            $event.preventDefault();
            // this.v$.$touch();
            // if (this.v$.$invalid) {
            //     return false;
            // }
            const payload = {
                eventName: this.eventName,
                eventLocation: this.eventLocation,
                eventStart: this.eventStart,
                eventEnd: this.eventEnd,
                timezone: this.timezone,
                eventDescription: this.eventDescription,
                eventURL: this.eventURL,
                hostName: this.hostName,
                creatorEmail: this.creatorEmail,
                eventGroupCheckbox: this.eventGroupCheckbox,
                eventGroupID: this.eventGroupID,
                eventGroupEditToken: this.eventGroupEditToken,
                interactionCheckbox: this.interactionCheckbox,
                joinCheckbox: this.joinCheckbox,
                maxAttendeesCheckbox: this.maxAttendeesCheckbox,
                maxAttendees: this.maxAttendees,
                eventImageID: this.eventImageID,
            };
            console.log(payload);
            axios
                .post("/api/event", payload)
                .then((response) => {
                    console.log(response);
                })
                .catch((error) => {
                    if (error.response.data.statusCode === 422) {
                        const validationErrors = JSON.parse(
                            error.response.data.message
                        ).map((o) => o.msg);
                        this.serverErrors = validationErrors;
                    }
                });
        },
        addToast({ message, type }) {
            this.toasts.push({ message, type });
            setTimeout(() => this.toasts.pop(), 10000);
        },
        setEventImageID(id) {
            console.log(id);
            this.eventImageID = id;
        },
    },
};
</script>

<template>
    <Toaster :toasts="toasts" />
    <form @submit="submitForm">
        <FormField
            name="eventName"
            type="text"
            label="Event name"
            v-model="eventName"
            :v="v$.eventName"
            placeholder="Make it snappy."
        />
        <FormField
            name="eventLocation"
            type="text"
            label="Location"
            v-model="eventLocation"
            :v="v$.eventLocation"
            placeholder="Online event? Put the link here."
        />
        <DateTimeField
            v-model="eventStart"
            name="eventStart"
            label="Starts"
            :v="v$.eventStart"
        />
        <DateTimeField
            v-model="eventEnd"
            name="eventEnd"
            label="Ends"
            :v="v$.eventEnd"
        />
        <FormField
            name="timezone"
            type="select"
            label="Timezone"
            v-model="timezone"
            :v="v$.timezone"
            :options="timezones"
            placeholder="Start typing your nearest city."
        />
        <FormField
            name="eventDescription"
            type="textarea"
            label="Description"
            v-model="eventDescription"
            :v="v$.eventDescription"
            placeholder="You can always change it later."
            hint='<a
            href="https://commonmark.org/help/">Markdown</a> formatting
            supported.'
        />
        <FormField
            name="eventURL"
            type="text"
            label="Link"
            v-model="eventURL"
            placeholder="For tickets or another event page (optional)."
        />
        <UploadField
            name="eventImage"
            hint="Recommended dimensions"
            label="Header image"
            v-model="eventImage"
            @addToast="addToast"
            @setEventImageID="setEventImageID"
        />
        <FormField
            name="hostName"
            type="text"
            label="Host name"
            v-model="hostName"
            placeholder="Will be shown on the event page (optional)."
        />
        <FormField
            name="creatorEmail"
            type="email"
            label="Your email"
            v-model="creatorEmail"
            :v="v$.creatorEmail"
            placeholder="Optional."
            hint="If you provide your email, we will send your secret editing password here, and use it to notify you of updates to the event."
        />
        <div class="row mb-3">
            <div class="col-sm-2">Options</div>
            <div class="col-sm-10">
                <div class="form-check">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="eventGroupCheckbox"
                        v-model="eventGroupCheckbox"
                    />
                    <label class="form-check-label" for="eventGroupCheckbox">
                        This event is part of an event group
                    </label>
                </div>
                <div
                    v-if="eventGroupCheckbox"
                    class="card text-dark bg-light my-2"
                    id="eventGroupData"
                >
                    <div class="card-header">
                        <strong>Link this event to an event group</strong>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label for="eventGroupID" class="form-label"
                                >Event group ID</label
                            >
                            <input
                                type="text"
                                :class="{
                                    'form-control': true,
                                    'is-invalid':
                                        v$.eventGroupID.$errors.length,
                                }"
                                id="eventGroupID"
                                v-model="eventGroupID"
                                @blur="v$.eventGroupID.$touch"
                            />
                            <div
                                class="form-errors"
                                v-for="error of v$.eventGroupID.$errors"
                                :key="error.$uid"
                            >
                                <div class="small text-danger">
                                    {{ error.$message }}
                                </div>
                            </div>
                            <small class="form-text"
                                >You can find this short string of characters in
                                the event group's link, in your confirmation
                                email, or on the event group's page.</small
                            >
                        </div>
                        <div class="mb-3">
                            <label for="eventGroupEditToken" class="form-label"
                                >Event group secret editing code</label
                            >
                            <input
                                type="text"
                                :class="{
                                    'form-control': true,
                                    'is-invalid':
                                        v$.eventGroupEditToken.$errors.length,
                                }"
                                id="eventGroupEditToken"
                                v-model="eventGroupEditToken"
                                @blur="v$.eventGroupEditToken.$touch"
                            />
                            <div
                                class="form-errors"
                                v-for="error of v$.eventGroupEditToken.$errors"
                                :key="error.$uid"
                            >
                                <div class="small text-danger">
                                    {{ error.$message }}
                                </div>
                            </div>
                            <small class="form-text"
                                >You can find this long string of characters in
                                the confirmation email you received when you
                                created the event group.</small
                            >
                        </div>
                    </div>
                </div>
                <div class="form-check">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="interactionCheckbox"
                        name="interactionCheckbox"
                        v-model="interactionCheckbox"
                    />
                    <label class="form-check-label" for="interactionCheckbox">
                        Users can post comments on this event
                    </label>
                </div>
                <div class="form-check">
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="joinCheckbox"
                        name="joinCheckbox"
                        v-model="joinCheckbox"
                    />
                    <label class="form-check-label" for="joinCheckbox">
                        Users can mark themselves as attending this event
                    </label>
                </div>
                <div
                    class="form-check"
                    id="maxAttendeesCheckboxContainer"
                    v-show="joinCheckbox"
                >
                    <input
                        class="form-check-input"
                        type="checkbox"
                        id="maxAttendeesCheckbox"
                        name="maxAttendeesCheckbox"
                        v-model="maxAttendeesCheckbox"
                    />
                    <label class="form-check-label" for="maxAttendeesCheckbox">
                        Set a limit on the maximum number of attendees
                    </label>
                </div>
            </div>
        </div>
        <div
            class="row mb-3"
            id="maxAttendeesContainer"
            v-show="joinCheckbox && maxAttendeesCheckbox"
        >
            <label for="maxAttendees" class="col-sm-2 col-form-label"
                >Attendee limit</label
            >
            <div class="col-sm-10">
                <input
                    type="number"
                    id="maxAttendees"
                    name="maxAttendees"
                    placeholder="Enter a number."
                    v-model="maxAttendees"
                    :class="{
                        'form-control': true,
                        'is-invalid': v$.maxAttendees.$errors.length,
                    }"
                    @blur="v$.maxAttendees.$touch"
                />
                <div
                    class="form-errors"
                    v-for="error of v$.maxAttendees.$errors"
                    :key="error.$uid"
                >
                    <div class="small text-danger">
                        {{ error.$message }}
                    </div>
                </div>
            </div>
        </div>
        <div class="row mb-3">
            <div
                class="alert alert-danger fade show"
                v-if="serverErrors?.length"
            >
                <h5>Hold up!</h5>
                Event not created. Please fix the following errors and try
                again:
                <ul class="mt-2">
                    <li v-for="error in serverErrors">
                        {{ error }}
                    </li>
                </ul>
            </div>
        </div>
        <div class="row mb-3">
            <div class="col pt-3 pb-3 text-center">
                <button type="submit" class="btn btn-primary w-50">
                    Create
                </button>
            </div>
        </div>
    </form>
</template>
