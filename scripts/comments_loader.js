import { dbPromise, authPromise } from './db-context.js';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Get Project ID from URL
const params = new URLSearchParams(window.location.search);
const projectId = params.get('id');

const commentsContainer = document.getElementById('comments-container');
const commentForm = document.getElementById('comment-form');

// Global Auth State
let currentUser = null;

if (projectId && commentsContainer) {
    initComments();
}

async function initComments() {
    const db = await dbPromise;
    const auth = await authPromise;

    // Initialize Auth Listener
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateFormState(user);
        loadComments(db); // Reload comments to update delete buttons
    });

    setupForm(db, auth);
}

/**
 * Helper: Resolve User Name consistently
 */
function resolveUserName(user) {
    if (!user) return "Usuário";
    const displayName = user.displayName;
    if (displayName && displayName !== "null" && displayName.trim() !== "") {
        return displayName;
    }
    return user.email?.split('@')[0] || "Usuário";
}

/**
 * Helper: Generate Initials Avatar
 */
function getAvatarHTML(user) {
    const name = resolveUserName(user);
    if (user.photoURL) {
        return `<img src="${user.photoURL}" class="user-avatar" referrerPolicy="no-referrer" alt="${name}" onerror="this.replaceWith(getInitialsElement('${name}'))">`;
    }
    return getInitialsString(name);
}

/**
 * Creates the initials element string (simulating component)
 */
window.getInitialsElement = (name) => {
    const initials = (name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const el = document.createElement('div');
    el.className = 'user-avatar-placeholder';
    el.innerText = initials;
    return el;
};

// Helper for string injection (non-DOM)
function getInitialsString(name) {
    const initials = (name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    return `<div class="user-avatar-placeholder">${initials}</div>`;
}


/**
 * Handle UI state based on Auth
 */
function updateFormState(user) {
    if (!commentForm) return;

    const userField = document.getElementById('comment-user');
    const formBox = commentForm.closest('.comment-form-box');

    // Remove existing auth UI if present to rebuild
    const existingAuthUI = formBox.querySelector('.auth-ui-container');
    if (existingAuthUI) existingAuthUI.remove();

    // Create Auth UI Container
    const authContainer = document.createElement('div');
    authContainer.className = 'auth-ui-container';
    authContainer.style.marginBottom = '1rem';

    if (user) {
        // Logged In Design
        const avatarHTML = getAvatarHTML(user);

        const displayName = resolveUserName(user);
        authContainer.innerHTML = `
            <div class="auth-user-info">
                ${avatarHTML}
                <div style="flex-grow: 1;">
                    <div style="font-weight: bold; color: #fff;">${displayName}</div>
                    <div style="font-size: 0.75rem; color: #aaa;">Logado via Google</div>
                </div>
                <button type="button" class="logout-btn" id="btn-logout" style="pointer-events: all; cursor: pointer;">Sair</button>
            </div>
        `;

        // Hide manual name input as we use auth name
        if (userField) userField.style.display = 'none';

        // Add Logout Listener - Use setTimeout to ensure DOM is ready
        formBox.insertBefore(authContainer, commentForm);

        setTimeout(async () => {
            const btn = document.getElementById('btn-logout');
            if (btn) {
                btn.onclick = async () => {
                    const auth = await authPromise;
                    await signOut(auth);
                };
            }
        }, 50);

    } else {
        // Logged Out Design
        authContainer.innerHTML = `
            <button type="button" class="google-btn" id="btn-login-google">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18">
                Entrar com Google para Comentar
            </button>
        `;

        if (userField) userField.style.display = 'none'; // Keep hidden, force login

        // Add Login Listener
        formBox.insertBefore(authContainer, commentForm);
        document.getElementById('btn-login-google').addEventListener('click', async () => {
            const auth = await authPromise;
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (e) {
                console.error("Login failed", e);

                if (e.code === 'auth/unauthorized-domain') {
                    alert("ERRO DE DOMÍNIO: Este domínio (localhost/IP) não está autorizado no Firebase.\n\nVá em Authentication > Settings > Authorized Domains e adicione-o.");
                } else if (e.code === 'auth/popup-closed-by-user') {
                    // Ignore
                } else {
                    alert("Erro ao fazer login: " + e.message);
                }
            }
        });
    }
}

/**
 * Real-time listener for comments
 */
let unsubscribe = null;

function loadComments(db) {
    if (unsubscribe) unsubscribe();

    const q = query(
        collection(db, "comments"),
        where("projectId", "==", projectId),
        orderBy("timestamp", "desc")
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            commentsContainer.innerHTML = '<p style="color: rgba(255,255,255,0.3); text-align: center;">Nenhum comentário ainda. Seja o primeiro!</p>';
            return;
        }

        const allComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sorting: Pinned first, then by timestamp
        allComments.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;

            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });

        const parentComments = allComments.filter(c => !c.parentId);
        const replies = allComments.filter(c => c.parentId);

        commentsContainer.innerHTML = parentComments.map(comment => {
            const date = comment.timestamp ? new Date(comment.timestamp.seconds * 1000).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Agora mesmo';

            // Check ownership
            const isOwner = currentUser && (comment.uid === currentUser.uid);
            const deleteBtn = isOwner ?
                `<button class="delete-comment-btn" onclick="window.deleteMyComment('${comment.id}')" title="Excluir meu comentário">✕</button>` : '';

            // Avatar Handling in List
            const authorName = (comment.user === "null" || !comment.user || comment.user === "Usuário") ? "Usuário" : comment.user;
            const avatar = comment.userPhoto ?
                `<img src="${comment.userPhoto}" class="comment-avatar-small" referrerPolicy="no-referrer" onerror="this.outerHTML=getInitialsString('${authorName}')">` :
                getInitialsString(authorName);

            const pinnedBadge = comment.pinned ? `<span class="pinned-badge">📌 Fixado</span>` : '';

            // Filter replies for this comment
            const commentReplies = replies.filter(r => r.parentId === comment.id);
            const repliesHTML = commentReplies.map(reply => {
                const replyDate = reply.timestamp ? new Date(reply.timestamp.seconds * 1000).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : 'Agora mesmo';

                const replyIsOwner = currentUser && (reply.uid === currentUser.uid);
                const replyDeleteBtn = replyIsOwner ?
                    `<button class="delete-comment-btn" onclick="window.deleteMyComment('${reply.id}')" title="Excluir minha resposta">✕</button>` : '';

                const replyAvatar = reply.userPhoto ?
                    `<img src="${reply.userPhoto}" class="comment-avatar-small" referrerPolicy="no-referrer" onerror="this.outerHTML=getInitialsString('${reply.user}')">` :
                    getInitialsString(reply.user);

                return `
                    <div class="reply-card">
                        <div class="comment-header">
                            <div class="comment-header-main">
                                ${replyAvatar}
                                <span class="comment-author">${(reply.user === "null" || !reply.user || reply.user === "Usuário") ? "Usuário" : reply.user}</span>
                                <span class="comment-date">${replyDate}</span>
                            </div>
                            ${replyDeleteBtn}
                        </div>
                        <div class="comment-body">
                            ${reply.text}
                        </div>
                    </div>
                `;
            }).join('');

            const replySection = repliesHTML ? `<div class="comment-replies">${repliesHTML}</div>` : '';
            const replyBtn = currentUser ? `
                <button class="reply-btn" onclick="window.showReplyForm('${comment.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                    Responder
                </button>
            ` : '';

            return `
                <div class="comment-card ${comment.pinned ? 'pinned' : ''}" id="comment-${comment.id}">
                    <div class="comment-header">
                        <div class="comment-header-main">
                            ${avatar}
                            <div style="display: flex; flex-direction: column;">
                                <div style="display: flex; align-items: center;">
                                    ${pinnedBadge}
                                    <span class="comment-author">${(comment.user === "null" || !comment.user || comment.user === "Usuário") ? "Usuário" : comment.user}</span>
                                </div>
                                <span class="comment-date">${date}</span>
                            </div>
                        </div>
                        ${deleteBtn}
                    </div>
                    <div class="comment-body">
                        ${comment.text}
                    </div>
                    <div class="comment-actions">
                        ${replyBtn}
                    </div>
                    <div id="reply-form-container-${comment.id}"></div>
                    ${replySection}
                </div>
            `;
        }).join('');
    }, (error) => {
        console.error("Comments listener error:", error);
        commentsContainer.innerHTML = '<p style="color: rgba(255,0,0,0.5); text-align: center;">Erro ao carregar comentários.</p>';
    });
}

/**
 * Global function for delete button (since it's injected HTML)
 */
window.deleteMyComment = async (commentId) => {
    if (!confirm("Deseja realmente excluir isso?")) return;

    try {
        const db = await dbPromise;
        await deleteDoc(doc(db, "comments", commentId));
    } catch (e) {
        alert("Erro ao excluir: " + e.message);
    }
};

/**
 * Handle reply UI
 */
window.showReplyForm = (parentId) => {
    const container = document.getElementById(`reply-form-container-${parentId}`);
    if (!container) return;

    // Close other reply forms if open? Or just don't duplicate.
    if (container.innerHTML !== "") {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="reply-form-container">
            <textarea id="reply-text-${parentId}" placeholder="Escreva sua resposta..."></textarea>
            <div class="reply-form-actions">
                <button class="reply-cancel-btn" onclick="document.getElementById('reply-form-container-${parentId}').innerHTML=''">Cancelar</button>
                <button class="reply-submit-btn" id="submit-reply-${parentId}" onclick="window.submitReply('${parentId}')">Responder</button>
            </div>
        </div>
    `;

    document.getElementById(`reply-text-${parentId}`).focus();
};

window.submitReply = async (parentId) => {
    if (!currentUser) {
        alert("Você precisa estar logado!");
        return;
    }

    const textInput = document.getElementById(`reply-text-${parentId}`);
    const submitBtn = document.getElementById(`submit-reply-${parentId}`);
    const text = textInput.value.trim();

    if (!text) return;

    try {
        submitBtn.disabled = true;
        submitBtn.innerText = "Enviando...";

        const db = await dbPromise;
        const commentData = {
            projectId: projectId,
            parentId: parentId,
            user: resolveUserName(currentUser),
            userPhoto: currentUser.photoURL,
            uid: currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "comments"), commentData);
        document.getElementById(`reply-form-container-${parentId}`).innerHTML = "";
    } catch (e) {
        console.error("Error replying:", e);
        alert("Erro ao responder: " + e.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Responder";
    }
};

/**
 * Handle new comment submission
 */
function setupForm(db, auth) {
    if (!commentForm) return;

    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert("Você precisa fazer login para comentar!");
            return;
        }

        const textInput = document.getElementById('comment-text');
        const submitBtn = commentForm.querySelector('.comment-submit-btn');

        const commentData = {
            projectId: projectId,
            user: resolveUserName(currentUser),
            userPhoto: currentUser.photoURL,
            uid: currentUser.uid,
            text: textInput.value,
            timestamp: serverTimestamp()
        };

        try {
            submitBtn.disabled = true;
            submitBtn.innerText = 'ENVIANDO...';

            await addDoc(collection(db, "comments"), commentData);

            textInput.value = '';
            submitBtn.innerText = 'ENVIAR COMENTÁRIO';
        } catch (error) {
            console.error("Error adding comment: ", error);
            alert("Erro ao enviar: " + error.message);
        } finally {
            submitBtn.disabled = false;
        }
    });
}
