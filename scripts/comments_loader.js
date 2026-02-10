import { dbPromise, authPromise } from './db-context.js';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getLocalEmailJSConfig } from './emailjs-manager.js';

// EMAILJS CONFIGURATION
let EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";
let EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
let EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";

async function loadEmailJSConfig() {
    // 1. Check Local Storage first (for development)
    const localConfig = getLocalEmailJSConfig();
    if (localConfig) {
        EMAILJS_SERVICE_ID = localConfig.serviceId;
        EMAILJS_TEMPLATE_ID = localConfig.templateId;
        EMAILJS_PUBLIC_KEY = localConfig.publicKey;
        console.log("Using local EmailJS configuration");
        return;
    }

    // 2. Fallback to generated config file (for deployment)
    try {
        const module = await import('./emailjs-config.js');
        const config = module.default;
        if (config && !config.PUBLIC_KEY.includes('${')) {
            EMAILJS_PUBLIC_KEY = config.PUBLIC_KEY;
            EMAILJS_SERVICE_ID = config.SERVICE_ID;
            EMAILJS_TEMPLATE_ID = config.TEMPLATE_ID;
        }
    } catch (e) {
        console.warn("EmailJS config not found, using defaults/placeholders.");
    }
}

async function initEmailJS() {
    await loadEmailJSConfig();

    // Check if already loaded (e.g. via another script tag)
    const existing = window.emailjs || window.emailJS;
    if (existing) {
        if (typeof existing.init === 'function') {
            existing.init(EMAILJS_PUBLIC_KEY);
            return;
        }
    }

    if (!window.emailjs) {
        const script = document.createElement('script');
        // Use relative path to be safe in different environments
        script.src = "scripts/lib/email.min.js";
        script.async = true;

        script.onload = () => {
            // EmailJS v3+ often attaches to window.emailjs or global emailjs
            const ej = window.emailjs || window.emailJS || (typeof emailjs !== 'undefined' ? emailjs : null);

            if (ej) {
                // Handle different export styles if necessary
                const initFn = ej.init || (ej.default && ej.default.init);
                if (typeof initFn === 'function') {
                    initFn(EMAILJS_PUBLIC_KEY);
                    // Ensure window.emailjs is set even if only global emailjs exists
                    if (!window.emailjs) window.emailjs = ej.default || ej;
                    console.log("EmailJS initialized");
                } else {
                    console.warn("EmailJS loaded but 'init' function not found.", ej);
                }
            } else {
                console.error("EmailJS script loaded but 'emailjs' object not found in global scope.");
            }
        };

        script.onerror = () => {
            console.error("Failed to load EmailJS SDK from:", script.src);
        };

        document.head.appendChild(script);
    }
}
initEmailJS();

// Inject Emoji CSS
if (!document.getElementById('emoji-picker-css')) {
    const link = document.createElement('link');
    link.id = 'emoji-picker-css';
    link.rel = 'stylesheet';
    link.href = 'css/emoji_picker.css';
    document.head.appendChild(link);
}

// Global Auth State
let currentUser = null;
let authInitialized = false;
let publicAdmins = []; // List of authorized admin emails

/**
 * Fetch authorized admins list
 */
async function fetchPublicAdmins() {
    try {
        const db = await dbPromise;
        const publicSnap = await getDoc(doc(db, "config", "public_admins"));
        if (publicSnap.exists()) {
            publicAdmins = publicSnap.data().emails || [];
        }
    } catch (e) {
        console.warn("Failed to fetch admin list:", e);
    }
}

// Initial fetch
fetchPublicAdmins();

/**
 * Toggle all comments visibility
 */
window.toggleAllComments = (containerId) => {
    const key = `showAll_${containerId}`;
    window[key] = !window[key];
    window.dispatchEvent(new CustomEvent('bitmundo-toggle-comments', { detail: containerId }));
};

/**
 * Initialize global auth listener once
 */
async function ensureAuthListener() {
    if (authInitialized) return;
    const auth = await authPromise;
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        // Notify all active comment sections about auth change
        window.dispatchEvent(new CustomEvent('bitmundo-auth-change', { detail: user }));
    });
    authInitialized = true;
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
 * Initialization function for a specific project/article
 */
export async function initComments(projectId, containerId = 'comments-container', formId = 'comment-form') {
    const commentsContainer = document.getElementById(containerId);
    const commentForm = document.getElementById(formId);

    if (!projectId || !commentsContainer) return;

    const db = await dbPromise;
    const auth = await authPromise;

    await ensureAuthListener();

    // Listener for auth changes specific to this instance
    const authHandler = (e) => {
        const user = e.detail;
        updateFormState(user, commentForm);
        loadComments(db, projectId, commentsContainer);
    };

    window.addEventListener('bitmundo-auth-change', authHandler);

    // Listener for toggle expansion
    window.addEventListener('bitmundo-toggle-comments', (e) => {
        if (e.detail === containerId) {
            loadComments(db, projectId, commentsContainer);
        }
    });

    // Initial load
    updateFormState(currentUser, commentForm);
    loadComments(db, projectId, commentsContainer);
    setupForm(db, auth, projectId, commentForm);

    // Return unsubscribe/cleanup if needed
    return () => {
        window.removeEventListener('bitmundo-auth-change', authHandler);
    };
}

// Auto-init if on context that has the default IDs (legacy support)
const params = new URLSearchParams(window.location.search);
const defaultProjectId = params.get('id');
if (defaultProjectId && document.getElementById('comments-container')) {
    initComments(defaultProjectId);
}

/**
 * Handle UI state based on Auth
 */
function updateFormState(user, commentForm) {
    if (!commentForm) return;

    const formBox = commentForm.closest('.comment-form-box');
    if (!formBox) return;

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
                <button type="button" class="logout-btn" style="pointer-events: all; cursor: pointer;">Sair</button>
            </div>
        `;

        formBox.insertBefore(authContainer, commentForm);

        const logoutBtn = authContainer.querySelector('.logout-btn');
        logoutBtn.onclick = async () => {
            const auth = await authPromise;
            await signOut(auth);
        };

        // Ensure form is visible
        commentForm.style.display = 'block';

    } else {
        // Logged Out Design
        authContainer.innerHTML = `
            <div class="login-wall-prompt">
                <p>Faça login para comentar ou reagir a essa postagem!</p>
                <button type="button" class="google-btn" style="margin: 0 auto;">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18">
                    Entrar com Google
                </button>
            </div>
        `;

        formBox.insertBefore(authContainer, commentForm);

        // Hide the actual form
        commentForm.style.display = 'none';

        authContainer.querySelector('.google-btn').onclick = async () => {
            const auth = await authPromise;
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (e) {
                console.error("Login failed", e);
                if (e.code === 'auth/unauthorized-domain') {
                    alert("ERRO DE DOMÍNIO: Este domínio não está autorizado no Firebase.");
                } else if (e.code !== 'auth/popup-closed-by-user') {
                    alert("Erro ao fazer login: " + e.message);
                }
            }
        };
    }

    // Add Emoji Button to main form if not present
    if (user) {
        const textArea = commentForm.querySelector('textarea');
        const submitBtn = commentForm.querySelector('.comment-submit-btn');
        if (textArea && submitBtn && !commentForm.querySelector('.emoji-trigger')) {
            const emojiBtn = document.createElement('button');
            emojiBtn.type = "button";
            emojiBtn.className = "emoji-trigger";
            emojiBtn.innerHTML = "😊";
            emojiBtn.title = "Inserir Emoji";
            emojiBtn.onclick = (e) => window.showEmojiPicker(emojiBtn, textArea);

            // Insert before submit button
            submitBtn.parentNode.insertBefore(emojiBtn, submitBtn);
        }
    }
}

/**
 * Real-time listener for comments
 */
const activeUnsubscribes = new Map();

function loadComments(db, projectId, container) {
    // Cleanup previous listener for this specific container if it exists
    if (activeUnsubscribes.has(container)) {
        activeUnsubscribes.get(container)();
    }

    const q = query(
        collection(db, "comments"),
        where("projectId", "==", projectId),
        orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.3); text-align: center;">Nenhum comentário ainda. Seja o primeiro!</p>';
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

        // State for "Ver todos" (simple toggle in window scope for this specific container)
        const containerKey = `showAll_${container.id}`;
        const showAll = window[containerKey] || false;

        const visibleParents = showAll ? parentComments : parentComments.slice(0, 2);
        const hiddenCount = parentComments.length - visibleParents.length;

        // Admin check: Hardcoded domain OR presence in the linked public_admins list
        const isAdmin = currentUser && (
            currentUser.email?.endsWith('@bitraiden.org') ||
            publicAdmins.includes(currentUser.email)
        );

        let html = visibleParents.map(comment => {
            const date = comment.timestamp ? new Date(comment.timestamp.seconds * 1000).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Agora mesmo';

            const isOwner = currentUser && (comment.uid === currentUser.uid);

            // Delete button for owners OR admins
            const deleteBtn = (isOwner || isAdmin) ?
                `<button class="delete-comment-btn" onclick="window.deleteMyComment('${comment.id}')" title="Excluir">✕</button>` : '';

            // Pin button ONLY for admins
            const pinBtn = isAdmin ?
                `<button class="pin-comment-btn ${comment.pinned ? 'active' : ''}" onclick="window.togglePinComment('${comment.id}', ${!comment.pinned})" title="${comment.pinned ? 'Desafixar' : 'Fixar'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    ${comment.pinned ? 'Desafixar' : 'Fixar'}
                </button>` : '';

            const authorName = (comment.user === "null" || !comment.user || comment.user === "Usuário") ? "Usuário" : comment.user;
            const avatar = comment.userPhoto ?
                `<img src="${comment.userPhoto}" class="comment-avatar-small" referrerPolicy="no-referrer" onerror="this.outerHTML=getInitialsString('${authorName}')">` :
                getInitialsString(authorName);

            const pinnedBadge = comment.pinned ? `<span class="pinned-badge">📌 Fixado</span>` : '';

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
                <button class="reply-btn" onclick="window.showReplyForm('${comment.id}', '${projectId}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                    Responder
                </button>
            ` : '';

            return `
                <div class="comment-card ${comment.pinned ? 'pinned' : ''}" id="comment-${comment.id}">
                    <div class="comment-header">
                        <div class="comment-header-main">
                            ${avatar}
                            <div class="comment-meta">
                                <div style="display: flex; align-items: center;">
                                    ${pinnedBadge}
                                    <span class="comment-author">${authorName}</span>
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
                        ${pinBtn}
                    </div>
                    <div id="reply-form-container-${comment.id}"></div>
                    ${replySection}
                </div>
            `;
        }).join('');

        if (hiddenCount > 0 && !showAll) {
            html += `
                <div style="text-align: center; margin-top: 1rem;">
                    <button class="view-all-comments-btn" onclick="window.toggleAllComments('${container.id}')">
                        Ver todos os comentários (${parentComments.length})
                    </button>
                </div>
            `;
        } else if (showAll && parentComments.length > 2) {
            html += `
                <div style="text-align: center; margin-top: 1rem;">
                    <button class="view-all-comments-btn" onclick="window.toggleAllComments('${container.id}')">
                        Ver menos
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }, (error) => {
        console.error("Comments listener error:", error);
    });

    activeUnsubscribes.set(container, unsubscribe);
}

/**
 * Global function for delete button
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
window.showReplyForm = (parentId, projectId) => {
    const container = document.getElementById(`reply-form-container-${parentId}`);
    if (!container) return;

    if (container.innerHTML !== "") {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="reply-form-container">
            <textarea id="reply-text-${parentId}" placeholder="Escreva sua resposta..."></textarea>
            <div class="reply-form-actions" style="display: flex; align-items: center; justify-content: flex-end;">
                <button type="button" class="emoji-trigger" onclick="window.showEmojiPicker(this, document.getElementById('reply-text-${parentId}'))">😊</button>
                <button class="reply-cancel-btn" onclick="document.getElementById('reply-form-container-${parentId}').innerHTML=''">Cancelar</button>
                <button class="reply-submit-btn" id="submit-reply-${parentId}" onclick="window.submitReply('${parentId}', '${projectId}')">Responder</button>
            </div>
        </div>
    `;

    document.getElementById(`reply-text-${parentId}`).focus();
};

window.submitReply = async (parentId, projectId) => {
    if (!currentUser) return alert("Você precisa estar logado!");
    const textInput = document.getElementById(`reply-text-${parentId}`);
    const submitBtn = document.getElementById(`submit-reply-${parentId}`);
    const text = textInput.value.trim();
    if (!text) return;

    try {
        submitBtn.disabled = true;
        submitBtn.innerText = "Enviando...";
        const db = await dbPromise;
        const replyData = {
            projectId: projectId,
            parentId: parentId,
            user: resolveUserName(currentUser),
            userPhoto: currentUser.photoURL,
            uid: currentUser.uid,
            email: currentUser.email, // Store email for notifications
            text: text,
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, "comments"), replyData);
        document.getElementById(`reply-form-container-${parentId}`).innerHTML = "";

        // Send Email Notification to Parent author
        try {
            const parentDoc = await getDoc(doc(db, "comments", parentId));
            if (parentDoc.exists()) {
                const parentData = parentDoc.data();
                const recipientEmail = parentData.email;

                console.log("Checking email notification for parent comment:", {
                    recipientEmail,
                    type: typeof recipientEmail,
                    hasAtSymbol: recipientEmail?.includes?.('@'),
                    currentUserEmail: currentUser.email
                });

                // Stricter validation: must be a string, must look like an email, and not be "null" string
                const isValidEmail = recipientEmail &&
                    typeof recipientEmail === 'string' &&
                    recipientEmail.includes('@') &&
                    recipientEmail !== "null" &&
                    recipientEmail.trim() !== "";

                if (isValidEmail && recipientEmail !== currentUser.email) {
                    console.log("✅ Sending email notification to:", recipientEmail);
                    console.log("📧 EmailJS Template Parameters:", {
                        reply_to: recipientEmail,
                        from_name: replyData.user,
                        message: text,
                        article_link: window.location.href,
                        project_name: document.title
                    });

                    window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                        reply_to: recipientEmail,  // This must match your EmailJS template's "To Email" field
                        from_name: replyData.user,
                        message: text,
                        article_link: window.location.href,
                        project_name: document.title
                    }).then(
                        res => console.log("✅ Email sent successfully:", res),
                        err => {
                            console.error("❌ EmailJS Error details:", err);
                            console.error("💡 Make sure your EmailJS template 'To Email' field is set to: {{reply_to}}");
                        }
                    );
                } else {
                    const reason = !recipientEmail ? "No email stored in parent comment" :
                        typeof recipientEmail !== 'string' ? `Email is not a string (type: ${typeof recipientEmail})` :
                            !recipientEmail.includes('@') ? "Email doesn't contain @" :
                                recipientEmail === "null" ? "Email is the string 'null'" :
                                    recipientEmail.trim() === "" ? "Email is empty string" :
                                        recipientEmail === currentUser.email ? "Recipient is the same as current user" :
                                            "Unknown reason";
                    console.log("⚠️ Email notification skipped. Reason:", reason);
                }
            }
        } catch (emailErr) {
            console.warn("Failed to send email notification (Firestore/Logic Error):", emailErr);
        }
    } catch (e) {
        alert("Erro ao responder: " + e.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Responder";
    }
};

/**
 * Handle new comment submission
 */
function setupForm(db, auth, projectId, commentForm) {
    if (!commentForm) return;

    commentForm.onsubmit = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert("Você precisa fazer login para comentar!");
            return;
        }

        const textInput = commentForm.querySelector('textarea');
        const submitBtn = commentForm.querySelector('.comment-submit-btn');

        if (!textInput.value.trim()) return;

        const commentData = {
            projectId: projectId,
            user: resolveUserName(currentUser),
            userPhoto: currentUser.photoURL,
            uid: currentUser.uid,
            email: currentUser.email, // Store email for notifications
            text: textInput.value,
            timestamp: serverTimestamp()
        };

        try {
            submitBtn.disabled = true;
            const originalText = submitBtn.innerText;
            submitBtn.innerText = 'ENVIANDO...';

            await addDoc(collection(db, "comments"), commentData);

            textInput.value = '';
            submitBtn.innerText = originalText;

            // Auto-hide form after success to save space
            const formBox = commentForm.closest('.comment-form-box');
            if (formBox) formBox.style.display = 'none';

        } catch (error) {
            console.error("Error adding comment: ", error);
            alert("Erro ao enviar: " + error.message);
        } finally {
            submitBtn.disabled = false;
        }
    };
}

/**
 * Admin Feature: Pin/Unpin Comment
 */
window.togglePinComment = async (commentId, shouldPin) => {
    try {
        const db = await dbPromise;
        const auth = await authPromise;

        console.log('togglePinComment called', { commentId, shouldPin, user: auth.currentUser ? auth.currentUser.email : null, uid: auth.currentUser ? auth.currentUser.uid : null });

        // Diagnostics: check admin_config for uid and config/public_admins
        try {
            if (auth.currentUser) {
                const adm = await getDoc(doc(db, 'admin_config', auth.currentUser.uid));
                console.log('admin_config.exists:', adm.exists());
            }
        } catch (err) {
            console.warn('Could not read admin_config:', err);
        }

        try {
            const pub = await getDoc(doc(db, 'config', 'public_admins'));
            console.log('public_admins exists:', pub.exists(), 'data:', pub.exists() ? pub.data() : null);
        } catch (err) {
            console.warn('Could not read config/public_admins:', err);
        }

        // Attempt update
        await updateDoc(doc(db, 'comments', commentId), { pinned: shouldPin });
        console.log('togglePinComment: update succeeded');
    } catch (e) {
        console.error('Toggle pin error', e);
        alert('Erro ao (des)fixar: ' + e.message + (e.code ? ' (code: ' + e.code + ')' : ''));
    }
};

/**
 * EMOJI PICKER SHARED LOGIC
 */
let emojiPickerInstance = null;
let picmoLoaded = false;

async function loadPicmo() {
    if (picmoLoaded) return;
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = "/scripts/lib/picmo.js";
        script.onload = () => {
            picmoLoaded = true;
            resolve();
        };
        document.head.appendChild(script);
    });
}

window.showEmojiPicker = async (triggerEl, textareaEl) => {
    if (!textareaEl) return console.error("Emoji Picker: Textarea not found");

    // Toggle logic: If clicking the same active button, just close and return
    const existing = document.querySelector('.emoji-picker-container');
    if (existing) {
        existing.remove();
        document.querySelectorAll('.emoji-trigger').forEach(btn => btn.dataset.active = "false");
        if (triggerEl.dataset.active === "true") {
            triggerEl.dataset.active = "false";
            return;
        }
    }

    await loadPicmo();

    const pickerContainer = document.createElement('div');
    pickerContainer.className = 'emoji-picker-container';

    // Explicit close button (✕)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'emoji-picker-close';
    closeBtn.innerHTML = '✕';
    closeBtn.type = "button";
    closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        pickerContainer.remove();
        triggerEl.dataset.active = "false";
    };
    pickerContainer.appendChild(closeBtn);

    // Create a sub-container for the actual picker
    const pickerRoot = document.createElement('div');
    pickerRoot.style.width = '100%';
    pickerRoot.style.height = '100%';
    pickerContainer.appendChild(pickerRoot);

    document.body.appendChild(pickerContainer);

    // Position
    const rect = triggerEl.getBoundingClientRect();
    const pickerHeight = 320;
    const pickerWidth = 280;

    let top = rect.top + window.scrollY - pickerHeight - 10;
    let left = rect.left + window.scrollX;

    if (top < window.scrollY + 60) {
        top = rect.bottom + window.scrollY + 10;
    }

    if (left + pickerWidth > window.innerWidth) {
        left = window.innerWidth - pickerWidth - 15;
    }
    if (left < 10) left = 10;

    pickerContainer.style.top = `${top}px`;
    pickerContainer.style.left = `${left}px`;
    pickerContainer.style.height = `${pickerHeight}px`;

    const picker = picmo.createPicker({
        rootElement: pickerRoot,
        autoFocusSearch: true,
        width: '100%',
        height: '100%'
    });

    // Handle Emoji Selection
    const onSelect = (selection) => {
        console.log("Emoji selected:", selection);
        let emoji = "";

        if (typeof selection === 'string') {
            emoji = selection;
        } else if (selection && typeof selection === 'object') {
            // Priority list of properties where the emoji string might hide
            emoji = selection.emoji || selection.native || selection.data || selection.url;

            // If still not found, search all properties for something that looks like an emoji
            if (!emoji || typeof emoji !== 'string') {
                emoji = Object.values(selection).find(v => typeof v === 'string' && v.length <= 8 && /\p{Emoji}/u.test(v));
            }
        }

        if (!emoji || typeof emoji !== 'string') {
            console.error("Could not extract emoji string from selection:", selection);
            return;
        }

        console.log("Emoji extracted:", emoji);

        const start = textareaEl.selectionStart;
        const end = textareaEl.selectionEnd;
        const text = textareaEl.value;

        // Try to use execCommand for better undo support and cursor handling
        textareaEl.focus();
        try {
            // Modern insertion
            if (!document.execCommand('insertText', false, emoji)) {
                throw new Error('execCommand rejected');
            }
        } catch (e) {
            // Fallback manual insertion
            textareaEl.value = text.substring(0, start) + emoji + text.substring(end);
            const newPos = start + emoji.length;
            textareaEl.setSelectionRange(newPos, newPos);
        }

        // Close and cleanup
        setTimeout(() => {
            pickerContainer.remove();
            triggerEl.dataset.active = "false";
            document.removeEventListener('click', clickOutside);
        }, 10);
    };

    picker.addEventListener('emoji', onSelect);
    picker.addEventListener('emoji:select', onSelect);
    picker.addEventListener('select', onSelect);

    const clickOutside = (e) => {
        if (!pickerContainer.contains(e.target) && e.target !== triggerEl) {
            pickerContainer.remove();
            triggerEl.dataset.active = "false";
            document.removeEventListener('click', clickOutside);
        }
    };

    setTimeout(() => {
        document.addEventListener('click', clickOutside);
    }, 100);

    triggerEl.dataset.active = "true";
};
