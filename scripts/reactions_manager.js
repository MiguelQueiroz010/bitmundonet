import { dbPromise, authPromise } from './db-context.js';
import { doc, getDoc, setDoc, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

let currentUser = null;
let authInitialized = false;
let isProcessing = false; // TRAVA DE SEGURANÇA: impede spam de cliques

/**
 * Listener global de autenticação
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
 * Inicializa as reações
 */
export async function initReactions(targetId, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !targetId) return;

    await ensureAuthListener();
    const db = await dbPromise;

    // Variáveis para armazenar os unsubscribes (limpeza de memória)
    let unsubCounts = () => {};
    let unsubUser = () => {};

    const renderReactions = (user) => {
        // Limpa listeners anteriores se o user mudar
        unsubCounts();
        unsubUser();

        if (!user) {
            container.innerHTML = `
                <div class="login-wall-prompt" style="padding: 1.5rem; margin-bottom: 0;">
                    <p style="font-size: 0.95rem; margin-bottom: 1rem;">Faça login para reagir</p>
                    <button class="google-btn-small" id="react-login-btn">Entrar com Google</button>
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

        // Listener dos contadores globais
        unsubCounts = onSnapshot(doc(db, "reactions", targetId), (snapshot) => {
            const data = snapshot.data() || { like: 0, dislike: 0, heart: 0 };
            btns.forEach(btn => {
                const type = btn.dataset.type;
                btn.querySelector('.reaction-count').innerText = data[type] || 0;
            });
        });

        // Listener da escolha específica deste usuário
        unsubUser = onSnapshot(doc(db, "reactions", targetId, "users", user.uid), (snapshot) => {
            const userChoice = snapshot.data()?.type;
            btns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === userChoice);
            });
        });

        // Lógica de clique
        btns.forEach(btn => {
            btn.onclick = () => toggleReaction(targetId, btn.dataset.type);
        });
    };

    window.addEventListener('bitmundo-auth-change', (e) => renderReactions(e.detail));
    renderReactions(currentUser);

    // Retorna função de limpeza
    return () => {
        unsubCounts();
        unsubUser();
    };
}

/**
 * Lógica de troca/remoção de reação com TRAVA ANTI-SPAM
 */
async function toggleReaction(targetId, newType) {
    if (isProcessing) return; // Se já estiver salvando, ignora o clique
    
    const db = await dbPromise;
    if (!currentUser) return;

    isProcessing = true; // Ativa a trava
    const uid = currentUser.uid;
    const userDocRef = doc(db, "reactions", targetId, "users", uid);
    const countsDocRef = doc(db, "reactions", targetId);

    try {
        const userSnap = await getDoc(userDocRef);
        const oldType = userSnap.data()?.type;
        const updates = {};

        if (oldType === newType) {
            // Remove reação
            await setDoc(userDocRef, { type: null }, { merge: true });
            updates[newType] = increment(-1);
        } else {
            // Nova ou Troca
            await setDoc(userDocRef, { type: newType }, { merge: true });
            updates[newType] = increment(1);
            if (oldType) updates[oldType] = increment(-1);
        }

        await setDoc(countsDocRef, updates, { merge: true });

    } catch (e) {
        console.error("Erro na Reação:", e);
        if (e.code === 'permission-denied') showToast("Login expirado ou sem permissão.");
    } finally {
        // Libera a trava após 500ms (evita duplo clique acidental)
        setTimeout(() => { isProcessing = false; }, 500);
    }
}

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:10px 20px;border-radius:8px;z-index:10000;opacity:0;transition:opacity 0.3s;pointer-events:none;`;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}