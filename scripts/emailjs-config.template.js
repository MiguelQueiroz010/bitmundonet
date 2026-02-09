/**
 * EmailJS Configuration Template for BitMundo
 * 
 * PLACEHOLDERS will be replaced during the GitHub Actions build process.
 */

const emailjsConfig = {
    SERVICE_ID: "${EMAILJS_SERVICE_ID}",
    TEMPLATE_ID: "${EMAILJS_TEMPLATE_ID}",
    PUBLIC_KEY: "${EMAILJS_PUBLIC_KEY}"
};

export default emailjsConfig;
