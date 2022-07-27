<script>
import axios from "axios";

export default {
    props: {
        name: String,
        hint: String,
        label: String,
        modelValue: String,
    },
    emits: ["addToast", "update:modelValue", "setEventImageID"],
    data() {
        return {
            file: null,
        };
    },
    methods: {
        handleUpload($event) {
            this.file = event.target.files[0];
            if (!this.file) {
                return;
            }
            let formData = new FormData();
            formData.append("file", this.file);
            axios
                .post("/api/image", formData, {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                })
                .then((response) => {
                    console.log(response);
                    if (response.data.id) {
                        this.$emit("setEventImageID", response.data.id);
                        this.$emit("addToast", {
                            message: "Image uploaded successfully.",
                            type: "success",
                        });
                        return;
                    }
                    throw new Error("Image ID not returned.");
                })
                .catch((error) => {
                    this.$emit("addToast", {
                        message: "Error uploading image. Please try again.",
                        type: "danger",
                    });
                });
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
            <input
                type="file"
                class="form-control"
                :id="name"
                :value="modelValue"
                @input="handleUpload"
            />
            <!-- <div -->
            <!--     v-if="v" -->
            <!--     class="form-errors" -->
            <!--     v-for="error of v.$errors" -->
            <!--     :key="error.$uid" -->
            <!-- > -->
            <!--     <div class="small text-danger">{{ error.$message }}</div> -->
            <!-- </div> -->
            <small class="form-text" v-if="hint" v-html="hint"></small>
        </div>
    </div>
</template>
