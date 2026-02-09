/**
 * emailjs-manager.js
 * Manages local EmailJS configuration for development testing.
 */

export function getLocalEmailJSConfig() {
    const saved = localStorage.getItem('bitmundo_emailjs_config');
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch (e) {
        console.error("Error parsing local EmailJS config:", e);
        return null;
    }
}

export function saveLocalEmailJSConfig(config) {
    if (typeof config === 'string') {
        try {
            const parsed = JSON.parse(config);
            localStorage.setItem('bitmundo_emailjs_config', JSON.stringify(parsed));
            return true;
        } catch (e) {
            console.error("Error parsing EmailJS config string:", e);
            return false;
        }
    }
    localStorage.setItem('bitmundo_emailjs_config', JSON.stringify(config));
    return true;
}

export function clearLocalEmailJSConfig() {
    localStorage.removeItem('bitmundo_emailjs_config');
}
