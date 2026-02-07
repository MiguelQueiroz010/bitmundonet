/**
 * Firebase Configuration Manager
 * Handles fallback between static config and localStorage for local development.
 */

async function getStaticConfig() {
    // Detect if we are running in a local environment (Live Server, etc)
    const isLocal = ['localhost', '127.0.0.1', '172.'].some(ip => location.hostname.includes(ip));

    // If local, we DON'T try to import the file to avoid the 404 network error log.
    // The file only exists after the GitHub Actions build/deploy.
    if (isLocal) {
        return null;
    }

    try {
        const module = await import('./firebase-config.js');
        return module.default;
    } catch (e) {
        return null;
    }
}

function isPlaceholder(config) {
    if (!config) return true;
    // Check if any value contains the ${PLACEHOLDER} syntax or is "MISSING"
    return Object.values(config).some(val =>
        typeof val === 'string' && (val.includes('${') || val === 'MISSING')
    );
}

export async function getFirebaseConfig() {
    // 1. Check localStorage (Priority for local development)
    // This avoids a 404 network error in the console when running via Live Server
    const localConfigStr = localStorage.getItem('bitmundo_firebase_config');
    if (localConfigStr) {
        try {
            const localConfig = JSON.parse(localConfigStr);
            if (!isPlaceholder(localConfig)) {
                return localConfig;
            }
        } catch (e) {
            console.error('Error parsing local Firebase config:', e);
        }
    }

    // 2. Check static file (Fallback for GitHub Deploy)
    const staticConfig = await getStaticConfig();
    if (staticConfig && !isPlaceholder(staticConfig)) {
        return staticConfig;
    }

    // 3. Return placeholder/invalid config (will trigger setup UI)
    return staticConfig || {
        apiKey: "MISSING",
        authDomain: "MISSING",
        projectId: "MISSING"
    };
}

export function saveLocalFirebaseConfig(config) {
    if (typeof config === 'string') {
        try {
            let str = config.trim();

            // 1. Remove "const firebaseConfig = " or similar declarations
            str = str.replace(/^(const|let|var)\s+\w+\s*=\s*/, '');

            // 2. Remove trailing semicolon
            str = str.replace(/;$/, '');

            // 3. Ensure it's wrapped in braces if it looks like a list of properties
            if (!str.startsWith('{')) {
                str = '{' + str + '}';
            }

            // 4. Convert JS-style object (unquoted keys) to JSON
            // regex: find keys (alphanumeric + underscore) followed by a colon
            // but ignore things already in quotes
            const jsonStr = str.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
                .replace(/:\s*'([^']*)'/g, ': "$1"'); // convert single quotes to double

            const parsed = JSON.parse(jsonStr);
            localStorage.setItem('bitmundo_firebase_config', JSON.stringify(parsed));
            return true;
        } catch (e) {
            console.error('Error parsing Firebase config:', e, config);
            return false;
        }
    }
    localStorage.setItem('bitmundo_firebase_config', JSON.stringify(config));
    return true;
}

export function clearLocalFirebaseConfig() {
    localStorage.removeItem('bitmundo_firebase_config');
}
