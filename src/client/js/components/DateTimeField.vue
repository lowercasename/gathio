<script>
export default {
    props: {
        name: String,
        label: String,
        v: {
            type: Object,
            required: true,
        },
    },
    emits: ["update:modelValue"],
    data() {
        return {
            day: `${
                this.modelValue ? new Date(this.modelValue).getDate() : ""
            }`,
            month: `${
                this.modelValue ? new Date(this.modelValue).getMonth() + 1 : ""
            }`,
            year: `${
                this.modelValue ? new Date(this.modelValue).getFullYear() : ""
            }`,
            hour: `${
                this.modelValue ? new Date(this.modelValue).getHour() : ""
            }`,
            minute: `${
                this.modelValue ? new Date(this.modelValue).getMinute() : ""
            }`,
            valid: false,
            dirty: {
                day: false,
                month: false,
                year: false,
                hour: false,
                minute: false,
            },
        };
    },
    methods: {
        shiftFocus($event, afterLength, nextField) {
            if ($event.target.value.toString().length < afterLength) return;
            this.$refs[nextField].select();
        },
        updateValue() {
            // Don't parse while not all fields are dirty
            if (Object.values(this.dirty).some((b) => b === false)) {
                return;
            }
            const timestring =
                this.year.toString().padStart(4, 0) +
                "-" +
                this.month.toString().padStart(2, 0) +
                "-" +
                this.day.toString().padStart(2, 0) +
                "T" +
                this.hour.toString().padStart(2, 0) +
                ":" +
                this.minute.toString().padStart(2, 0) +
                ":00";
            const timestamp = Date.parse(timestring);
            if (Number.isNaN(timestamp)) return;

            this.$emit("update:modelValue", timestring);
        },
        handleBlur($event, data, pad) {
            this[data] = this[data].padStart(pad, "0");
            this.dirty[data] = true;
            this.validate();
        },
        validate() {
            // Don't validate while not all fields are dirty
            if (Object.values(this.dirty).some((b) => b === false)) {
                return;
            }
            this.updateValue();
            this.v.$touch();
        },
    },
    computed: {
        error() {
            return this.v.$errors.length;
        },
    },
};
</script>

<template>
    <div class="row mb-3">
        <div class="col-sm-2">
            <label :for="name" class="col-form-label">{{ label }}</label>
        </div>
        <div class="col">
            <div
                :class="{
                    'form-control': true,
                    'date-time-field': true,
                    'is-invalid': v.$dirty && error,
                }"
                @keyup.capture="updateValue"
            >
                <input
                    ref="day"
                    type="text"
                    placeholder="dd"
                    class="date-time-field__day"
                    v-model="day"
                    @input="shiftFocus($event, 2, 'month')"
                    @blur="handleBlur($event, 'day', 2)"
                />
                <span class="date-time-field__divider">/</span>
                <input
                    ref="month"
                    type="text"
                    placeholder="mm"
                    class="date-time-field__month"
                    v-model="month"
                    @input="shiftFocus($event, 2, 'year')"
                    @blur="handleBlur($event, 'month', 2)"
                />
                <span class="date-time-field__divider">/</span>
                <input
                    ref="year"
                    type="text"
                    placeholder="yyyy"
                    class="date-time-field__year"
                    v-model="year"
                    @input="shiftFocus($event, 4, 'hour')"
                    @blur="handleBlur($event, 'year', 4)"
                />
                <span class="date-time-field__divider mx-1"></span>
                <input
                    ref="hour"
                    type="text"
                    placeholder="hh"
                    class="date-time-field__hour"
                    v-model="hour"
                    @input="shiftFocus($event, 2, 'minute')"
                    @blur="handleBlur($event, 'hour', 2)"
                />
                <span class="date-time-field__divider">:</span>
                <input
                    ref="minute"
                    type="text"
                    placeholder="mm"
                    class="date-time-field__minute"
                    v-model="minute"
                    @blur="handleBlur($event, 'minute', 2)"
                />
            </div>
            <div class="small text-danger" v-if="v.$dirty && error">
                Please enter a valid date in the future.
            </div>
        </div>
    </div>
</template>
