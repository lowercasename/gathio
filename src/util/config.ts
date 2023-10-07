import getConfig from "../lib/config.js";

const config = getConfig();

interface FrontendConfig {
    domain: string;
    email: string;
    siteName: string;
    showKofi: boolean;
    isFederated: boolean;
}

export const frontendConfig = (): FrontendConfig => ({
    domain: config.general.domain,
    email: config.general.email,
    siteName: config.general.site_name,
    showKofi: config.general.show_kofi,
    isFederated: config.general.is_federated,
});
