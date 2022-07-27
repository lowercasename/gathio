<script>
export default {
    props: {
        type: String,
        label: String,
        name: String,
        modelValue: String,
        v: {
            type: Object,
        },
        placeholder: String,
        options: Array,
        hint: String,
    },
    emits: ["update:modelValue"],
    data() {
        return {};
    },
    methods: {
        handleInput($event) {
            this.$emit("update:modelValue", $event.target.value);
        },
        handleSelect(option) {
            this.$emit("update:modelValue", option.id);
        },
        handleBlur() {
            if (this.v && this.v.$touch) {
                this.v.$touch();
            }
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
            <v-select
                :class="{
                    'is-invalid': v.$errors.length,
                }"
                v-if="type === 'select'"
                :options="options"
                :value="modelValue"
                @option:selected="handleSelect"
                @search:blur="handleBlur"
                :clearable="false"
                :placeholder="placeholder"
            ></v-select>
            <textarea
                v-else-if="type === 'textarea'"
                :type="type"
                :class="{
                    'form-control': true,
                    'is-invalid': v && v.$errors && v.$errors.length,
                }"
                :id="name"
                :value="modelValue"
                @input="handleInput"
                @blur="handleBlur"
                :placeholder="placeholder"
            ></textarea>
            <input
                v-else
                :type="type"
                :class="{
                    'form-control': true,
                    'is-invalid': v && v.$errors && v.$errors.length,
                }"
                :id="name"
                :value="modelValue"
                @input="handleInput"
                @blur="handleBlur"
                :placeholder="placeholder"
            />
            <div
                v-if="v"
                class="form-errors"
                v-for="error of v.$errors"
                :key="error.$uid"
            >
                <div class="small text-danger">{{ error.$message }}</div>
            </div>
            <small class="form-text" v-if="hint" v-html="hint"></small>
        </div>
    </div>
</template>
