<script>
import Toast from "./Toast.vue";

export default {
    components: {
        Toast,
    },
    props: {
        toasts: Array,
    },
};
</script>

<template>
    <div
        class="toast-container position-fixed top-0 end-0 p-3"
        style="z-index: 11"
    >
        <Toast
            v-for="toast in toasts"
            :message="toast.message"
            :type="toast.type"
            :key="toast.message"
        />
    </div>
</template>
