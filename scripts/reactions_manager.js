import { dbPromise, authPromise } from './db-context.js';
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

let currentUser = null;
let authInitialized = false;

/**
 * Initialize global auth listener
 */
async function ensureAuthListener() {
    if (authInitialized) return;
    const auth = await authPromise;
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        window.dispatchEvent(new CustomEvent('bitmundo-auth-change', { detail: user }));
    });
    authInitialized = true;
}

/**
 * Initialize reactions for a target (article or project)
 */
export async function initReactions(targetId, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !targetId) return;

    await ensureAuthListener();
    const db = await dbPromise;

    const renderReactions = (user) => {
        if (!user) {
            // Login Wall for Reactions - Unified Style
            container.innerHTML = `
                <div class="login-wall-prompt" style="padding: 1.5rem; margin-bottom: 0;">
                    <p style="font-size: 0.95rem; margin-bottom: 1rem;">Faça login para reagir</p>
                    <button class="google-btn-small" id="react-login-btn">
                        Entrar com Google
                    </button>
                </div>
            `;

            const btn = container.querySelector('#react-login-btn');
            if (btn) {
                btn.onclick = async () => {
                    const auth = await authPromise;
                    const provider = new GoogleAuthProvider();
                    try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
                };
            }
            return;
        }

        // Render Buttons if Logged In
        container.innerHTML = `
            <div class="reactions-container">
                <button class="reaction-btn like" data-type="like">
                    <span class="reaction-icon">👍</span>
                    <span class="reaction-count">0</span>
                </button>
                <button class="reaction-btn dislike" data-type="dislike">
                    <span class="reaction-icon">👎</span>
                    <span class="reaction-count">0</span>
                </button>
                <button class="reaction-btn heart" data-type="heart">
                    <span class="reaction-icon">❤️</span>
                    <span class="reaction-count">0</span>
                </button>
            </div>
        `;

        const btns = container.querySelectorAll('.reaction-btn');

        // Re-attach listeners for counts
        const countsDoc = doc(db, "reactions", targetId);
        onSnapshot(countsDoc, (snapshot) => {
            const data = snapshot.data() || { like: 0, dislike: 0, heart: 0 };
            btns.forEach(btn => {
                const type = btn.dataset.type;
                btn.querySelector('.reaction-count').innerText = data[type] || 0;
            });
        });

        // Re-attach user choice listener
        const userDoc = doc(db, "reactions", targetId, "users", user.uid);
        onSnapshot(userDoc, (snapshot) => {
            const userChoice = snapshot.data()?.type;
            btns.forEach(btn => {
                if (btn.dataset.type === userChoice) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        });

        // Click Logic
        btns.forEach(btn => {
            btn.onclick = async () => {
                const type = btn.dataset.type;
                await toggleReaction(targetId, type);
            };
        });
    };

    // Initial check is handled by the auth listener below

    // Update on auth change
    window.addEventListener('bitmundo-auth-change', (e) => renderReactions(e.detail));

    // Also trigger immediately if we have user (or lack thereof)
    renderReactions(currentUser);

    return () => {
        unsubCounts();
        if (unsubUser) unsubUser();
    };
}

/**
 * Core Logic: Toggle or Swap Reactions
 */
async function toggleReaction(targetId, newType) {
    const db = await dbPromise;
    const uid = currentUser.uid;

    const userDocRef = doc(db, "reactions", targetId, "users", uid);
    const countsDocRef = doc(db, "reactions", targetId);

    try {
        const userSnap = await getDoc(userDocRef);
        const oldType = userSnap.data()?.type;

        const updates = {};

        if (oldType === newType) {
            // Remove reaction
            await setDoc(userDocRef, { type: null }, { merge: true });
            updates[newType] = increment(-1);
        } else {
            // New or Swapped reaction
            await setDoc(userDocRef, { type: newType }, { merge: true });
            updates[newType] = increment(1);
            if (oldType) {
                updates[oldType] = increment(-1);
            }
        }

        // Apply counts
        await setDoc(countsDocRef, updates, { merge: true });

    } catch (e) {
        console.error("Reaction Error:", e);
        if (e.code === 'permission-denied') {
            alert("Erro de permissão: Você não tem permissão para reagir aqui.");
        } else {
            alert("Erro ao reagir: " + e.message);
        }
    }
}

// Simple Toast Notification for errors/info (optional enhancement)
function showToast(message) {
    // create a simple toast element if it doesn't exist
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}
