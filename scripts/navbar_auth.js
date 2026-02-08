import { authPromise } from './db-context.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

const authContainerId = 'navbar-auth-container';

async function initNavbarAuth() {
    const auth = await authPromise;

    // Polling because navbar is loaded via W3Data (async)
    let container = null;
    let attempts = 0;
    while (!container && attempts < 50) { // Wait up to 5 seconds
        container = document.getElementById(authContainerId);
        if (container) break;
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!container) {
        console.warn("Navbar Auth Container not found after 5s");
        return;
    }

    onAuthStateChanged(auth, (user) => {
        // Dispatch global event for other modules (comments, reactions)
        window.dispatchEvent(new CustomEvent('bitmundo-auth-change', { detail: user }));
        updateNavbarUI(user, container);
    });
}

function resolveUserName(user) {
    if (!user) return "Usuário";
    const displayName = user.displayName;
    if (displayName && displayName !== "null" && displayName.trim() !== "") {
        return displayName;
    }
    return user.email?.split('@')[0] || "Usuário";
}

function updateNavbarUI(user, container) {
    if (user) {
        const name = resolveUserName(user);
        const photo = user.photoURL;

        container.innerHTML = `
            <div class="nav-user-profile">
                <div class="nav-user-avatar-wrapper">
                    <img src="${photo}" alt="${name}" class="nav-user-avatar" onerror="this.src='/media/user_default.png'">
                </div>
                <div class="nav-user-info-dropdown">
                    <span class="nav-user-name">${name}</span>
                    <button id="nav-logout-btn" class="nav-auth-btn-logout">Sair</button>
                </div>
            </div>
        `;

        const logoutBtn = container.querySelector('#nav-logout-btn');
        logoutBtn.onclick = async () => {
            const auth = await authPromise;
            await signOut(auth);
        };
    } else {
        container.innerHTML = `
            <button id="nav-login-btn" class="nav-auth-btn login">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="16">
                Entrar
            </button>
        `;

        const loginBtn = container.querySelector('#nav-login-btn');
        loginBtn.onclick = async () => {
            const auth = await authPromise;
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (e) {
                console.error("Navbar Login Failed", e);
            }
        };
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbarAuth);
} else {
    initNavbarAuth();
}
