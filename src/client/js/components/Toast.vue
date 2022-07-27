<script>
export default {
    props: {
        message: String,
        type: String,
    },
    data() {
        return {
            visible: true,
        };
    },
    methods: {
        destroyToast() {
            this.visible = false;
        },
    },
};
</script>

<template>
    <div
        :class="{
            toast: true,
            show: visible,
            fade: true,
            'align-items-center': true,
            'text-light': type !== 'default',
            'bg-success': type === 'success',
            'bg-danger': type === 'danger',
            'bg-warning': type === 'warning',
        }"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
    >
        <div class="d-flex">
            <div class="toast-body">
                <i
                    class="fa-solid fa-circle-check me-1"
                    style="opacity: 0.9"
                    v-if="type === 'success'"
                ></i>
                <i
                    class="fa-solid fa-circle-xmark me-1"
                    style="opacity: 0.9"
                    v-if="type === 'danger'"
                ></i>
                <i
                    class="fa-solid fa-circle-exclamation me-1"
                    style="opacity: 0.9"
                    v-if="type === 'warning'"
                ></i>
                {{ message }}
            </div>
            <button
                type="button"
                :class="{
                    'btn-close me-2 m-auto': true,
                    'btn-close-white': type !== 'default',
                }"
                @click="destroyToast"
                aria-label="Close"
            ></button>
        </div>
    </div>
</template>
