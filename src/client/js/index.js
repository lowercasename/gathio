import { createApp } from "vue";
import vSelect from "vue-select";

import App from "./NewEventForm.vue";

const app = createApp(App);
app.component("v-select", vSelect);
app.mount("#app");
