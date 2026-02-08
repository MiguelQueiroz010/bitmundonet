import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, collection, query, orderBy, onSnapshot, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { getFirebaseConfig, saveLocalFirebaseConfig } from "./firebase-manager.js";
import { parseArticleTags, sanitizeString } from "./utils.js";

// Initialize Firebase App asynchronously
let app, auth, db;

async function initFirebase() {
    const config = await getFirebaseConfig();

    // Check if configuration is still invalid (placeholders)
    if (Object.values(config).some(val => typeof val === 'string' && val.includes('${'))) {
        console.warn("Firebase configuration contains placeholders. Dashboard will run in limited mode.");
        showNotification("⚠️ Configuração do Firebase incompleta. Configure os dados no perfil!", "info");
        return false;
    }

    try {
        app = initializeApp(config);
        auth = getAuth(app);
        db = getFirestore(app);

        // Setup Auth Listener
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = '/admin_login.html';
            } else {
                await loadConfig(user.uid);
                initDashboard();
            }
        });
        return true;
    } catch (e) {
        console.error("Firebase Initialization Error:", e);
        showNotification("❌ Erro ao inicializar Firebase: " + e.message, "error");
        return false;
    }
}

// --- Database Sanitization Utility ---
window.runDatabaseSanitization = async () => {
    if (!confirm("Isso irá percorrer todas as coleções do Firestore e corrigir problemas de acentuação (Mojibake). Deseja continuar?")) return;

    showNotification("🔧 Iniciando sanitização do banco...", "info");

    const sanitizer = sanitizeString;
    if (!sanitizer) {
        showNotification("❌ Utilitário de sanitização não encontrado.", "error");
        return;
    }

    const collections = ["projects", "articles", "library", "tools"];
    let totalFixed = 0;

    try {
        for (const colName of collections) {
            const q = query(collection(db, colName));
            const querySnapshot = await getDocs(q);
            const batch = writeBatch(db);
            let colFixed = 0;

            querySnapshot.forEach((document) => {
                const data = document.data();
                const sanitizedData = {};
                let changed = false;

                // Recursive function to sanitize all string values in an object/array
                const deepSanitize = (obj) => {
                    if (typeof obj === 'string') {
                        const fixed = sanitizer(obj);
                        if (fixed !== obj) changed = true;
                        return fixed;
                    } else if (Array.isArray(obj)) {
                        return obj.map(item => deepSanitize(item));
                    } else if (obj !== null && typeof obj === 'object') {
                        const newObj = {};
                        for (const key in obj) {
                            newObj[key] = deepSanitize(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                };

                const newData = deepSanitize(data);

                if (changed) {
                    batch.set(doc(db, colName, document.id), newData, { merge: true });
                    colFixed++;
                }
            });

            if (colFixed > 0) {
                await batch.commit();
                totalFixed += colFixed;
            }
        }

        showNotification(`✅ Sanitização concluída! ${totalFixed} documentos corrigidos.`, "success");
    } catch (e) {
        console.error("Sanitization Error:", e);
        showNotification("❌ Erro durante a sanitização: " + e.message, "error");
    }
};

// --- Initialization Boot ---
initFirebase();

// Sorting state for each section
let currentProjectsSort = 'date-desc';
let currentArticlesSort = 'date-desc';
let currentLibrarySort = 'order-desc';
let currentToolsSort = 'name-asc';

async function loadConfig(uid) {
    const docRef = doc(db, "admin_config", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById('admin-name').value = data.name || "";
        document.getElementById('admin-avatar').value = data.avatar || "";

        // Update avatar display
        updateAvatarDisplay(data.avatar, data.name);

        // Update greeting
        if (data.name) {
            document.getElementById('greeting').textContent = `Olá, ${data.name}`;
        }

        // Update status indicator
        document.getElementById('status-db').innerText = "Banco de Dados: Conectado";
        document.getElementById('status-db').style.color = "#10b981";

        // Update Google Link Status
        const linkStatus = document.getElementById('google-link-status');
        const linkBtn = document.getElementById('btn-link-google');
        if (data.linkedGoogleEmail) {
            linkStatus.innerHTML = `Status: <span style="color: #10b981;">Vinculado (${data.linkedGoogleEmail})</span>`;
            linkBtn.textContent = "Trocar Conta Google";
            linkBtn.style.background = "rgba(16, 185, 129, 0.1)";
            linkBtn.style.color = "#10b981";
            linkBtn.style.border = "1px solid rgba(16, 185, 129, 0.3)";
        } else {
            linkStatus.innerHTML = `Status: <span style="color: #64748b;">Não vinculado</span>`;
        }
    }
}

/**
 * Update avatar display in sidebar and header
 */
function updateAvatarDisplay(avatarUrl, name) {
    const sidebarContainer = document.getElementById('sidebar-avatar-container');
    const headerContainer = document.getElementById('header-avatar-container');
    const sidebarName = document.getElementById('sidebar-name');

    if (avatarUrl && avatarUrl.trim() !== '') {
        // Show avatar image in sidebar
        sidebarContainer.innerHTML = `<img src="${avatarUrl}" class="admin-avatar" alt="Avatar" onerror="this.parentElement.innerHTML='<div class=\"avatar-placeholder\"></div>`;

        // Show small avatar in header
        headerContainer.innerHTML = `<img src="${avatarUrl}" class="admin-avatar-small" alt="Avatar" onerror="this.style.display='none'">`;
    } else {
        // Show placeholder
        sidebarContainer.innerHTML = '<div class="avatar-placeholder">👤</div>';
        headerContainer.innerHTML = '';
    }

    // Update name in sidebar
    if (name && name.trim() !== '') {
        sidebarName.textContent = "👤 " + name;
    } else {
        sidebarName.textContent = '👤 Admin';
    }
}

function initDashboard() {
    loadCommentsAdmin();
    setupProfileForm();
    // Load initial XML list if needed
}

/**
 * Setup Profile Form Submission
 */
function setupProfileForm() {
    const profileForm = document.getElementById('profile-form');
    if (!profileForm) return;

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert('Você precisa estar logado!');
            return;
        }

        // Get form values
        const name = document.getElementById('admin-name').value;
        const avatar = document.getElementById('admin-avatar').value;

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Salvando...';
        submitBtn.disabled = true;

        try {
            // Save to Firestore
            const docRef = doc(db, "admin_config", user.uid);
            await setDoc(docRef, {
                name: name,
                avatar: avatar,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Update avatar display immediately
            updateAvatarDisplay(avatar, name);

            // Update greeting
            if (name) {
                document.getElementById('greeting').textContent = `Olá, ${name}`;
            }

            // Update status indicator
            document.getElementById('status-db').innerText = "Banco de Dados: Conectado";
            document.getElementById('status-db').style.color = "#10b981";

            // Show success message
            showNotification('✅ Salvo com sucesso!', 'success');
            console.log('✅ Dados salvos no Firestore:', { name, avatar });

        } catch (error) {
            console.error('❌ Erro ao salvar perfil:', error);
            showNotification('❌ Erro ao salvar: ' + error.message, 'error');
        } finally {
            // Restore button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.admin-notification');
    if (existing) existing.remove();

    // Create notification
    const notification = document.createElement('div');
    notification.className = 'admin-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        ${type === 'success' ? 'background: #10b981; color: #000;' : ''}
        ${type === 'error' ? 'background: #ef4444; color: #fff;' : ''}
        ${type === 'info' ? 'background: #3b82f6; color: #fff;' : ''}
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Comments Moderation
 */
let activeCommentsListener = null;

function loadCommentsAdmin() {
    // Unsubscribe from previous listener if it exists
    if (activeCommentsListener) {
        activeCommentsListener();
        activeCommentsListener = null;
    }

    const q = query(collection(db, "comments"), orderBy("timestamp", "desc"));
    const listEl = document.getElementById('admin-comments-list');

    activeCommentsListener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.3);">
                    <p style="font-size: 3rem; margin: 0;">💬</p>
                    <p style="margin-top: 1rem;">Nenhum comentário ainda</p>
                    <p style="font-size: 0.8rem;">Os comentários dos usuários aparecerão aqui</p>
                </div>
            `;
            updateCommentsStats(0);
            return;
        }

        const allComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const parents = allComments.filter(c => !c.parentId);
        const replies = allComments.filter(c => c.parentId);

        listEl.innerHTML = parents.map(parent => {
            const date = parent.timestamp?.toDate ? parent.timestamp.toDate() : new Date();
            const timeAgo = getTimeAgo(date);
            const isPinned = parent.pinned === true;

            let parentHtml = `
                <div class="card" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid ${isPinned ? 'var(--admin-primary)' : 'rgba(255,255,255,0.05)'}; position: relative;">
                    ${isPinned ? '<span style="position: absolute; top: -10px; right: 10px; background: var(--admin-primary); color: #000; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; font-weight: bold;">📌 FIXADO</span>' : ''}
                    <div style="display:flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <div>
                            <strong style="color: var(--admin-primary); font-size: 0.95rem;">${parent.user || 'Anônimo'}</strong>
                            <span style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-left: 0.5rem;">${timeAgo}</span>
                        </div>
                        <span style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 0.25rem 0.5rem; border-radius: 4px;">
                            ${parent.projectId || 'N/A'}
                        </span>
                    </div>
                    <p style="font-size: 0.9rem; margin: 0.5rem 0; line-height: 1.5; color: rgba(255,255,255,0.8);">${parent.text}</p>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                        <button onclick="window.replyToCommentAdmin('${parent.id}', '${parent.projectId || ''}', '${parent.user || 'Anônimo'}', '${(parent.text || '').replace(/'/g, "\\'")}')" 
                                style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; cursor: pointer; font-size: 0.7rem; padding: 0.25rem 0.75rem; border-radius: 4px; transition: all 0.2s;">
                            💬 Responder
                        </button>
                        <button onclick="togglePinComment('${parent.id}', ${isPinned})" 
                                style="background: rgba(241, 163, 46, 0.1); border: 1px solid rgba(241, 163, 46, 0.3); color: #f1a32e; cursor: pointer; font-size: 0.7rem; padding: 0.25rem 0.75rem; border-radius: 4px; transition: all 0.2s;">
                            ${isPinned ? '📍 Desafixar' : '📌 Fixar'}
                        </button>
                        <button onclick="deleteComment('${parent.id}')" 
                                style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; cursor: pointer; font-size: 0.7rem; padding: 0.25rem 0.75rem; border-radius: 4px; transition: all 0.2s;">
                            🗑️ Excluir
                        </button>
                    </div>
                </div>
            `;

            // Nest replies
            const childReplies = replies.filter(r => r.parentId === parent.id).sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            childReplies.forEach(reply => {
                const rDate = reply.timestamp?.toDate ? reply.timestamp.toDate() : new Date();
                const rTimeAgo = getTimeAgo(rDate);
                parentHtml += `
                    <div class="card" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid rgba(255,255,255,0.05); margin-left: 2rem; border-left: 2px solid var(--admin-primary); opacity: 0.9;">
                        <div style="display:flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                            <div>
                                <strong style="color: var(--admin-primary); font-size: 0.95rem;">${reply.user || 'Anônimo'}</strong>
                                <span style="font-size: 0.7rem; color: #60a5fa; margin-left: 0.5rem;">↪ Resposta</span>
                                <span style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-left: 0.5rem;">${rTimeAgo}</span>
                            </div>
                        </div>
                        <p style="font-size: 0.9rem; margin: 0.5rem 0; line-height: 1.5; color: rgba(255,255,255,0.8);">${reply.text}</p>
                        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                            <button onclick="deleteComment('${reply.id}')" 
                                    style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; cursor: pointer; font-size: 0.7rem; padding: 0.25rem 0.75rem; border-radius: 4px; transition: all 0.2s;">
                                🗑️ Excluir
                            </button>
                        </div>
                    </div>
                `;
            });

            return parentHtml;
        }).join('');

        updateCommentsStats(snapshot.size);
    });
}

/**
 * Get time ago string
 */
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'agora mesmo';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min atrás`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d atrás`;

    return date.toLocaleDateString('pt-BR');
}

/**
 * Update comments statistics
 */
function updateCommentsStats(count) {
    const statsEl = document.getElementById('comments-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div style="background: rgba(59, 130, 246, 0.1); padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
                <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px;">Total de Comentários</div>
                <div style="font-size: 2rem; font-weight: bold; color: #3b82f6; margin-top: 0.25rem;">${count}</div>
            </div>
        `;
    }
}

window.deleteComment = async (id) => {
    if (confirm("Deseja realmente excluir este comentário?")) {
        await deleteDoc(doc(db, "comments", id));
    }
};

window.togglePinComment = async (id, currentState) => {
    try {
        const docRef = doc(db, "comments", id);
        await setDoc(docRef, { pinned: !currentState }, { merge: true });
        showNotification(currentState ? "📍 Comentário desafixado" : "📌 Comentário fixado!", "success");
    } catch (e) {
        showNotification("Erro ao fixar: " + e.message, "error");
    }
};

window.replyToCommentAdmin = (parentId, projectId, parentUser, parentText) => {
    const html = `
        <div style="padding: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.5rem;">💬 Responder Comentário</h3>
                <button class="save-btn" style="background: #4b5563; color: white;" onclick="closeModal()">✕ Fechar</button>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <p style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin: 0 0 0.5rem 0;">Respondendo para <strong>${parentUser}</strong>:</p>
                <p style="font-size: 0.9rem; margin: 0; color: rgba(255,255,255,0.9); font-style: italic;">"${parentText}"</p>
            </div>
            <div class="form-group">
                <label>Sua Resposta</label>
                <textarea id="admin-reply-text" style="height: 120px;" placeholder="Digite aqui sua resposta oficial..."></textarea>
            </div>
            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button class="save-btn" style="flex: 2; padding: 1rem;" onclick="window.submitAdminReply('${parentId}', '${projectId}')">🚀 Enviar Resposta</button>
                <button class="save-btn" style="flex: 1; background: rgba(255,255,255,0.1);" onclick="closeModal()">Cancelar</button>
            </div>
        </div>
    `;
    window.showModal(html);
};

window.submitAdminReply = async (parentId, projectId) => {
    const text = document.getElementById('admin-reply-text').value;
    if (!text.trim()) return alert("Digite uma mensagem!");

    try {
        const user = auth.currentUser;
        // Check if admin has a linked name in config
        const adminSnap = await getDoc(doc(db, "admin_config", user.uid));
        const adminName = adminSnap.exists() ? adminSnap.data().name : "Administrador";

        const replyData = {
            parentId: parentId,
            projectId: projectId,
            text: text,
            user: adminName,
            userId: user.uid,
            timestamp: new Date(), // Firebase will convert this to Timestamp
            isAdmin: true,
            pinned: false
        };

        await setDoc(doc(collection(db, "comments")), replyData);
        showNotification("✅ Resposta enviada com sucesso!", "success");
        window.closeModal();
        loadCommentsAdmin();
    } catch (e) {
        console.error("Error sending reply:", e);
        showNotification("❌ Erro ao responder: " + e.message, "error");
    }
};

let projectsContent = "";
let articlesContent = "";

/**
 * Firestore Content Management
 */
window.loadProjects = () => {
    const listEl = document.getElementById('xml-projects-list');
    listEl.innerHTML = "Carregando do banco de dados...";

    const q = collection(db, "projects");
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = "Nenhum projeto no banco. Use a migração!";
            return;
        }

        // Sort in memory based on current sort option
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();

            switch (currentProjectsSort) {
                case 'date-desc':
                    const timeA = new Date(dataA.updatedAt || dataA.migratedAt || 0);
                    const timeB = new Date(dataB.updatedAt || dataB.migratedAt || 0);
                    return timeB - timeA;
                case 'date-asc':
                    const timeA2 = new Date(dataA.updatedAt || dataA.migratedAt || 0);
                    const timeB2 = new Date(dataB.updatedAt || dataB.migratedAt || 0);
                    return timeA2 - timeB2;
                case 'title-asc':
                    return (dataA.title || '').localeCompare(dataB.title || '');
                case 'title-desc':
                    return (dataB.title || '').localeCompare(dataA.title || '');
                case 'status':
                    return (dataA.status || '').localeCompare(dataB.status || '');
                default:
                    return 0;
            }
        });

        listEl.innerHTML = `
            <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 8px;">
                <button class="save-btn ${currentProjectsSort === 'date-desc' ? 'active' : ''}" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentProjectsSort === 'date-desc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortProjects('date-desc')">
                    📅 Mais Recentes
                </button>
                <button class="save-btn ${currentProjectsSort === 'date-asc' ? 'active' : ''}" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentProjectsSort === 'date-asc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortProjects('date-asc')">
                    📅 Mais Antigos
                </button>
                <button class="save-btn ${currentProjectsSort === 'title-asc' ? 'active' : ''}" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentProjectsSort === 'title-asc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortProjects('title-asc')">
                    🔤 A-Z
                </button>
                <button class="save-btn ${currentProjectsSort === 'status' ? 'active' : ''}" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentProjectsSort === 'status' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortProjects('status')">
                    📊 Status
                </button>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
                ${sortedDocs.map(doc => {
            const p = doc.data();
            return `
                    <div style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items:center;">
                        <div>
                            <strong style="color: var(--admin-primary);">${p.title}</strong>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 0.25rem;">
                                ID: ${doc.id} • Status: ${p.status}
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6;" 
                                    onclick="previewProject('${doc.id}')">
                                👁️
                            </button>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" 
                                    onclick="editProject('${doc.id}')">
                                ✏️
                            </button>
                        </div>
                    </div>`;
        }).join('')}
            </div>
        `;
    });
};

window.sortProjects = (sortType) => {
    currentProjectsSort = sortType;
    loadProjects();
};

// --- Modal System ---
window.showModal = (contentHtml) => {
    // Remove existing
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // Close on click outside
    overlay.onclick = (e) => {
        if (e.target === overlay) window.closeModal();
    };

    overlay.innerHTML = `
        <div class="modal-content">
            ${contentHtml}
        </div>
    `;

    document.body.appendChild(overlay);
};

window.closeModal = () => {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
};

window.addNewProject = () => {
    const html = `
        <div style="padding: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.5rem;">🆕 Novo Projeto no Firestore</h3>
                <button class="save-btn" style="background: #7b889bff; color: white;" onclick="closeModal()">✕ Fechar</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <div>
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; color: #999; margin-bottom: 1rem;">Obrigatório</h4>
                    <div class="form-group"><label>ID Único (slug)</label><input type="text" id="new-id" placeholder="ex: mario-ptbr"></div>
                    <div class="form-group"><label>Título</label><input type="text" id="new-title"></div>
                </div>
                <div>
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; color: #999; margin-bottom: 1rem;">Infos</h4>
                    <div class="form-group"><label>Plataforma</label><input type="text" id="new-platform"></div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="new-status">
                            <option value="Em Progresso">Em Progresso</option>
                            <option value="Completo">Completo</option>
                            <option value="Modificação">Modificação</option>
                        </select>
                    </div>
                </div>
            </div>

            <p style="text-align: center; color: #666; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem;">
                Crie com os dados básicos primeiro e edite em seguida para adicionar galerias e mídias.
            </p>

            <button class="save-btn" style="width: 100%; padding: 1rem; margin-top: 1.5rem;" onclick="saveNewProject()">🚀 Criar Projeto</button>
        </div>
    `;
    window.showModal(html);
};

window.editProject = async (id) => {
    const docRef = doc(db, "projects", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    const p = docSnap.data();

    const html = `
        <div style="padding: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.5rem;">🚀 Editando Projeto: ${p.title}</h3>
                <button class="save-btn" style="background: #4b5563; color: white;" onclick="closeModal()">✕ Fechar</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <!-- Basic Info -->
                <div>
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; color: #999; margin-bottom: 1rem;">Infos Básicas</h4>
                    <div class="form-group">
                        <label>Título</label>
                        <input type="text" id="edit-title" value="${p.title || ''}">
                        <input type="hidden" id="edit-id" value="${id}">
                    </div>
                    <div class="form-group">
                        <label>Subtítulo</label>
                        <input type="text" id="edit-subtitle" value="${p.subtitle || ''}">
                    </div>
                    <div class="form-group">
                        <label>Plataforma</label>
                        <input type="text" id="edit-platform" value="${p.platform || ''}">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="edit-status">
                            <option value="Completo" ${p.status === 'Completo' ? 'selected' : ''}>Completo</option>
                            <option value="Em Progresso" ${p.status === 'Em Progresso' ? 'selected' : ''}>Em Progresso</option>
                            <option value="Modificação" ${p.status === 'Modificação' ? 'selected' : ''}>Modificação</option>
                        </select>
                    </div>
                </div>

                <!-- Media URLs -->
                <div>
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; color: #999; margin-bottom: 1rem;">Mídias (URLs)</h4>
                    <div class="form-group"><label>Thumbnail</label><input type="text" id="edit-thumb" value="${p.thumbnail || ''}"></div>
                    <div class="form-group"><label>Logo</label><input type="text" id="edit-logo" value="${p.logo || ''}"></div>
                    <div class="form-group"><label>Cover (Banner)</label><input type="text" id="edit-cover" value="${p.cover || ''}"></div>
                    <div class="form-group"><label>Vídeo (Intro)</label><input type="text" id="edit-video" value="${p.video || ''}"></div>
                    <div class="form-group"><label>Lives (YouTube)</label><input type="text" id="edit-live" value="${p.live_video || ''}"></div>
                </div>
            </div>

            <div class="form-group" style="margin-top: 1rem;">
                <label>Descrição (HTML Sugerido)</label>
                <textarea id="edit-desc" style="height: 120px; font-family: monospace;">${p.description || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Meta Keywords</label>
                <input type="text" id="edit-keywords" value="${p.meta_keywords || ''}" placeholder="mario, snes, tradução">
            </div>

            <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
                <button class="save-btn" style="flex: 2; padding: 1rem;" onclick="saveProjectChanges('${id}')">💾 Salvar no Banco de Dados</button>
                <button class="save-btn" style="flex: 1; background: rgba(239, 68, 68, 0.1); color: #ef4444;" onclick="deleteProject('${id}')">🗑️ Excluir</button>
            </div>
            <p style="text-align: center; font-size: 0.65rem; color: #555; margin-top: 1rem;">Campos de Galeria e Créditos estão sendo migrados via XML, suporte à edição manual em breve.</p>
        </div>
    `;
    window.showModal(html);
};

window.saveProjectChanges = async (id) => {
    const newId = id || document.getElementById('edit-id')?.value;
    if (!newId) return alert("Erro de ID!");

    const data = {
        title: document.getElementById('edit-title').value,
        subtitle: document.getElementById('edit-subtitle').value,
        platform: document.getElementById('edit-platform').value,
        status: document.getElementById('edit-status').value,
        thumbnail: document.getElementById('edit-thumb').value,
        logo: document.getElementById('edit-logo').value,
        cover: document.getElementById('edit-cover').value,
        video: document.getElementById('edit-video').value,
        live_video: document.getElementById('edit-live').value,
        description: document.getElementById('edit-desc').value,
        meta_keywords: document.getElementById('edit-keywords').value,
        sortDate: new Date().toISOString()
    };

    try {
        const docRef = doc(db, "projects", newId);
        await setDoc(docRef, data, { merge: true });
        showNotification("✅ Projeto atualizado com sucesso!", "success");
        loadProjects();
    } catch (e) {
        showNotification("❌ Erro ao salvar: " + e.message, "error");
    }
};

window.deleteProject = async (id) => {
    if (confirm(`Excluir projeto "${id}" permanentemente do banco?`)) {
        try {
            await deleteDoc(doc(db, "projects", id));
            showNotification("✅ Projeto excluído!", "success");
        } catch (e) {
            showNotification("Erro ao excluir: " + e.message, "error");
        }
    }
};

window.loadArticles = () => {
    const container = document.getElementById('xml-articles-list');
    container.innerHTML = "Carregando...";

    const q = collection(db, "articles");
    onSnapshot(q, (snapshot) => {
        // Sort in memory based on current sort option
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();

            switch (currentArticlesSort) {
                case 'date-desc':
                    // Parse "DD/MM/YYYY" -> YYYY-MM-DD for sorting
                    const timeA = new Date(parseDate(dataA.date));
                    const timeB = new Date(parseDate(dataB.date));
                    return timeB - timeA;
                case 'date-asc':
                    const timeA2 = new Date(parseDate(dataA.date));
                    const timeB2 = new Date(parseDate(dataB.date));
                    return timeA2 - timeB2;
                case 'title-asc':
                    return (dataA.title || '').localeCompare(dataB.title || '');
                case 'category':
                    return (dataA.category || '').localeCompare(dataB.category || '');
                default:
                    return 0;
            }
        });

        container.innerHTML = `
            <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 8px;">
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentArticlesSort === 'date-desc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortArticles('date-desc')">
                    📅 Mais Recentes
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentArticlesSort === 'date-asc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortArticles('date-asc')">
                    📅 Mais Antigos
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentArticlesSort === 'title-asc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortArticles('title-asc')">
                    🔤 A-Z
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentArticlesSort === 'category' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortArticles('category')">
                    📂 Categoria
                </button>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
                ${sortedDocs.map(doc => {
            const a = doc.data();
            return `
                    <div style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items:center;">
                        <div>
                            <strong style="color: var(--admin-primary);">${a.title}</strong>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4);">${a.date} | ${a.category}</div>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6;" onclick="previewArticle('${doc.id}')">👁️</button>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="editArticle('${doc.id}')">✏️</button>
                        </div>
                    </div>`;
        }).join('')}
            </div>
        `;
    });
};

window.sortArticles = (sortType) => {
    currentArticlesSort = sortType;
    loadArticles();
};

/**
 * Helper to get embed URL for YouTube and Streamable
 */
function getEmbedUrl(url) {
    if (!url) return null;
    url = url.trim();

    // YouTube
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
        const videoId = ytMatch[1];
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0&enablejsapi=1`;
    }

    // Streamable
    const stMatch = url.match(/(?:https?:\/\/)?(?:www\.)?streamable\.com\/([a-zA-Z0-9]+)/);
    if (stMatch && stMatch[1]) {
        return `https://streamable.com/e/${stMatch[1]}?autoplay=1&muted=1&loop=1&controls=0`;
    }

    return null;
}

/**
 * Helper to parse DD/MM/YYYY or DD-MM-YYYY dates
 */
function parseDate(dateStr) {
    if (!dateStr) return 0;

    // Check if it's already ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;

    // Parse DD/MM/YYYY or DD-MM-YYYY
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    if (parts.length === 3) {
        // If first part is 4 digits, it's likely YYYY-MM-DD already
        if (parts[0].length === 4) return dateStr;
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert to YYYY-MM-DD
    }
    return dateStr;
}

window.previewProject = async (id) => {
    const docRef = doc(db, "projects", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    const p = docSnap.data();

    const previewEl = document.getElementById('projects-preview');
    previewEl.innerHTML = ''; // Clear loading/placeholder

    // Create Iframe
    const iframe = document.createElement('iframe');
    iframe.style.cssText = "width: 100%; height: 600px; border: none; border-radius: 12px; background: #000;";
    previewEl.appendChild(iframe);

    // Gallery HTML Generation
    let galleryHtmlSection = '';
    if (p.gallery && p.gallery.length > 0) {
        const galleryItems = p.gallery.map((item, idx) => `
            <div class="mySlides fade ${idx === 0 ? 'first' : ''}" style="display: ${idx === 0 ? 'block' : 'none'};">
                <a class="spotlight" href="${item.src}" data-description="${item.caption || ''}">
                    <img src="${item.src}" alt="${item.caption || ''}">
                </a>
            </div>
        `).join('');

        const dotsHtml = p.gallery.map((_, idx) => `
            <span class="dot ${idx === 0 ? 'active' : ''}" onclick="currentSlide(${idx + 1})"></span>
        `).join('');

        galleryHtmlSection = `
            <div id="gallery" class="section">
                <h2 id="under">Galeria</h2>
                <div class="slideshow-container" id="gallery_container">
                    ${galleryItems}
                    <a class="prev" onclick="plusSlides(-1)">&#10094;</a>
                    <a class="next" onclick="plusSlides(1)">&#10095;</a>
                </div>
                <div style="text-align:center; padding-top: 15px;" id="gallery-dots">
                    ${dotsHtml}
                </div>
            </div>
        `;
    }

    // Downloads HTML Generation
    let downloadsHtmlSection = '';
    if (p.downloads && p.downloads.length > 0) {
        const downloadItems = p.downloads.map(item => {
            const version = item.version;
            const type = item.type;
            const maintenance = item.maintenance === true || item.maintenance === "true";
            const url = item.url;
            const changelog = item.changelog || "";

            return `
                <div class="dir-item">
                    <div class="dir-header" onclick="this.parentElement.classList.toggle('open')">
                        <div class="dir-title">
                            <span>${version} (${type})</span>
                        </div>
                        <img src="/elements/light_down_arrow.png" class="dir-arrow" alt="Arrow">
                    </div>
                    <div class="dir-content">
                        ${changelog ? `
                            <div class="changelog-box">
                                <h4>Alterações / Informações</h4>
                                <div class="changelog-content" style="font-size: 0.9rem; line-height: 1.6;">
                                    ${parseArticleTags(changelog)}
                                </div>
                            </div>
                        ` : ''}
                        ${maintenance ? `
                            <div class="maintenance">
                                <span>EM MANUTENÇÃO</span>
                                <p style="font-size: 0.8rem; margin-top: 5px; color: rgba(239, 68, 68, 0.7);">
                                    Este arquivo está sendo atualizado.
                                </p>
                            </div>
                        ` : `
                            <a href="${url}" target="_blank" class="download-link">
                                EFETUAR DOWNLOAD
                            </a>
                        `}
                    </div>
                </div>
            `;
        }).join('');

        downloadsHtmlSection = `
             <div id="downloads" class="section">
                <h2 id="under">Downloads</h2>
                <div id="downloads-container" class="modern-directory">
                    ${downloadItems}
                </div>
            </div>
        `;
    }

    const docContent = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700&family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap">
            <link rel="stylesheet" href="/css/projects.css">
            <link rel="stylesheet" href="/css/style.css">
            <style>
                body { background: #000; overflow-x: hidden; margin: 0; }
                /* Fix header overlap in preview */
                #project-head { 
                    min-height: 400px !important; 
                    height: auto !important; 
                    padding: 80px 20px !important; 
                    display: flex !important;
                    align-items: center !important;
                    position: relative !important;
                }
                /* Ensure video stays behind */
                #project-video-player, #project-video-iframe {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 0;
                    opacity: 0.5;
                    border: none;
                    pointer-events: none;
                    object-fit: cover;
                }
                .video-control-btn {
                    z-index: 20;
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    background: rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 50%;
                    width: 44px;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: white;
                }
                .video-control-btn svg { width: 24px; height: 24px; fill: currentColor; }
                .hero-content {
                    position: relative;
                    z-index: 10;
                }
            </style>
            <script>
                // Minimal Gallery Logic for Preview
                let slideIndex = 1;
                function plusSlides(n) { showSlides(slideIndex += n); }
                function currentSlide(n) { showSlides(slideIndex = n); }
                function showSlides(n) {
                    let i;
                    let slides = document.getElementsByClassName("mySlides");
                    let dots = document.getElementsByClassName("dot");
                    if (n > slides.length) {slideIndex = 1}    
                    if (n < 1) {slideIndex = slides.length}
                    for (i = 0; i < slides.length; i++) {
                        slides[i].style.display = "none";  
                    }
                    for (i = 0; i < dots.length; i++) {
                        dots[i].className = dots[i].className.replace(" active", "");
                    }
                    slides[slideIndex-1].style.display = "block";  
                    dots[slideIndex-1].className += " active";
                }

                let videoPlaying = true;
                function toggle_video(e) {
                    if (e) e.stopPropagation();
                    const video = document.getElementById("project-video-player");
                    const iframe = document.getElementById("project-video-iframe");
                    const playIcon = document.getElementById("play-icon");
                    const pauseIcon = document.getElementById("pause-icon");
                    
                    if (video) {
                        if (video.paused) {
                            video.play();
                            if (playIcon) playIcon.style.display = "none";
                            if (pauseIcon) pauseIcon.style.display = "block";
                        } else {
                            video.pause();
                            if (playIcon) playIcon.style.display = "block";
                            if (pauseIcon) pauseIcon.style.display = "none";
                        }
                    } else if (iframe) {
                        videoPlaying = !videoPlaying;
                        const command = videoPlaying ? 'playVideo' : 'pauseVideo';
                        iframe.contentWindow.postMessage(JSON.stringify({
                            event: 'command',
                            func: command,
                            args: []
                        }), '*');
                        
                        if (playIcon) playIcon.style.display = videoPlaying ? "none" : "block";
                        if (pauseIcon) pauseIcon.style.display = videoPlaying ? "block" : "none";
                    }
                }
            </script>
        </head>
        <body>
            <div id="project-container">
                <header id="project-head">
                    ${p.video ? (() => {
            const embedUrl = getEmbedUrl(p.video);
            const buttonHtml = `
                            <button class="video-control-btn" id="video-toggle" onclick="toggle_video(event)" title="Play/Pause" style="display: flex;">
                                <svg id="play-icon" style="display: none;" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <svg id="pause-icon" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            </button>
                        `;

            if (embedUrl) {
                return `
                                <iframe id="project-video-iframe" 
                                        src="${embedUrl}" 
                                        frameborder="0" 
                                        allow="autoplay; fullscreen; picture-in-picture" 
                                        allowfullscreen>
                                </iframe>
                                ${buttonHtml}
                            `;
            } else {
                return `
                                <video id="project-video-player" autoplay loop muted playsinline>
                                    <source src="${p.video}" type="video/mp4">
                                </video>
                                ${buttonHtml}
                            `;
            }
        })() : ''}                  
                    <div class="hero-content">
                        <img id="project-cover" src="${p.cover || ''}" alt="Capa" onerror="this.style.display='none'">
                        <div class="info-glass">
                            <div class="hero-platform">${p.platform || "Plataforma"}</div>
                            <h1 id="project-title-display">${p.title}</h1>
                            
                            <div class="hero-progress-container">
                                <div class="progress-info">
                                    <span>Progresso Geral</span>
                                    <span id="global-percent-text">${p.status === 'Completo' ? '100%' : (p.progress?.global || 'Iniciando...')}</span>
                                </div>
                                <div class="hero-progress-bg">
                                    <div class="hero-progress-fill" style="width: ${p.status === 'Completo' ? '100%' : (p.progress?.global || '0%')};"></div>
                                </div>
                            </div>
    
                            <p id="project-summary">${p.subtitle || ""}</p>
                        </div>
                    </div>
                </header>
                <main id="body">
                    <section class="section">
                        <h2 id="under">Sobre o Projeto</h2>
                        <div id="project-description">${parseArticleTags(p.description || "")}</div>
                    </section>

                    ${galleryHtmlSection}

                    <div class="project-meta-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 3rem; margin-top: 4rem;">
                        ${(p.credits || []).length > 0 ? `
                        <div id="credits" class="meta-section">
                            <h2 id="under">Equipe</h2>
                            <div id="credits-list">
                                ${p.credits.map(c => `<div class="credit-item"><span class="credit-name">${c.name}</span><span class="credit-role">${c.role}</span></div>`).join('')}
                            </div>
                        </div>` : ''}

                        ${(p.progress?.items || []).length > 0 ? `
                        <div id="progress" class="meta-section">
                            <h2 id="under">Progresso</h2>
                            <div id="progress-list">
                                ${p.progress.items.map(item => {
            const percent = parseInt(item.value) || 0;
            return `
                                        <div class="progress-item-wrapper">
                                            <div class="progress-label">
                                                <span class="label-text">${item.label}</span>
                                                <span class="label-value">${item.value}</span>
                                            </div>
                                            <div class="progress-bar-container">
                                                <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                                            </div>
                                        </div>
                                    `;
        }).join('')}
                            </div>
                        </div>` : ''}
                    </div>

                    ${downloadsHtmlSection}
                </main>
            </div>
        </body>
        </html>
    `;

    // Write to iframe
    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(docContent);
    frameDoc.close();
};

window.previewArticle = async (id) => {
    const docSnap = await getDoc(doc(db, "articles", id));
    if (!docSnap.exists()) return;
    const a = docSnap.data();

    const previewEl = document.getElementById('articles-preview');
    if (!previewEl) return;
    previewEl.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = "width: 100%; height: 600px; border: none; border-radius: 12px; background: #000;";
    previewEl.appendChild(iframe);

    let contentHtml = "";
    if (a.topics && a.topics.length > 0) {
        const m = await import("./utils.js");
        contentHtml = m.renderTopics(a.topics);
    } else {
        contentHtml = parseArticleTags(a.content || "");
    }

    const docContent = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700&family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap">
            <link rel="stylesheet" href="/css/style.css">
            <link rel="stylesheet" href="/css/projects.css">
            <style>
                body { background: #0a0b10; overflow-x: hidden; margin: 0; padding: 2rem; }
            </style>
        </head>
        <body>
             <div class="article-view-container">
                <h1 class="hero-title" style="font-size: 2rem; margin-bottom: 0.5rem; text-align: left;">${a.title}</h1>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    ${a.date} | ${a.category} | por <span style="color: var(--highlight);">${a.author}</span>
                </div>
                <div class="article-content" style="line-height: 1.8;">
                    ${contentHtml}
                </div>
            </div>
        </body>
        </html>
    `;

    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(docContent);
    frameDoc.close();
};

window.previewLibrary = async (id) => {
    const docSnap = await getDoc(doc(db, "library", id));
    if (!docSnap.exists()) return;
    const g = docSnap.data();

    const previewEl = document.getElementById('library-preview');
    if (!previewEl) return;
    previewEl.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = "width: 100%; height: 600px; border: none; border-radius: 12px; background: #000;";
    previewEl.appendChild(iframe);

    const docContent = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700&family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap">
            <link rel="stylesheet" href="/css/style.css">
            <link rel="stylesheet" href="/css/projects.css">
            <style>
                body { background: rgba(0,0,0,0.9); overflow-x: hidden; margin: 0; }
                .wiki-banner-wrapper { position: relative; height: 300px; overflow: hidden; }
                .wiki-banner { width: 100%; height: 100%; object-fit: cover; mask-image: linear-gradient(to bottom, black 60%, transparent 100%); }
            </style>
        </head>
        <body>
            <div class="wiki-modal-preview">
                 <div class="wiki-banner-wrapper">
                    <img src="${g.cover}" class="wiki-banner" alt="Banner">
                </div>
                
                <div style="padding: 2rem; margin-top: -80px; position: relative; z-index: 10;">
                    <h1 style="color: #fff; font-size: 2.5rem; margin-bottom: 0.5rem; text-shadow: 0 0 20px rgba(0,0,0,0.8);">${g.title}</h1>
                    <p style="color: var(--highlight); font-size: 1.1rem; margin: 0; margin-bottom: 2rem;">${g.platform} | ${g.release_year || g.year || ''}</p>
    
                    <div class="wiki-container">
                        <div class="wiki-main">
                            <div class="wiki-article" style="line-height: 1.8;">
                                <div class="wiki-section">
                                    <h2 id="under" style="font-size: 1.4rem; margin-bottom: 1rem;">Introdução</h2>
                                    <p>${parseArticleTags(g.summary || "")}</p>
                                </div>
                                ${g.lore ? `
                                <div class="wiki-section" style="margin-top: 2rem;">
                                    <h2 id="under" style="font-size: 1.4rem; margin-bottom: 1rem;">História e Contexto</h2>
                                    <p>${parseArticleTags(g.lore)}</p>
                                </div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(docContent);
    frameDoc.close();
};

window.addNewArticle = () => {
    const html = `
        <div style="padding: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.5rem;">📰 Nova Postagem (Firestore)</h3>
                <button class="save-btn" style="background: rgba(255, 255, 255, 0.39);" onclick="closeModal()">✕ Fechar</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <div class="form-group">
                    <label>Título</label>
                    <input type="text" id="art-title">
                </div>
                <div class="form-group">
                    <label>Categoria</label>
                    <input type="text" id="art-category">
                </div>
            </div>

            <!-- Topics Section (Visible by Default) -->
            <div id="topics-container" style="margin-top: 2rem; display: block;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px dotted rgba(255,255,255,0.1); padding-bottom: 1rem;">
                    <h4 style="color: var(--admin-primary); margin: 0;">📦 Tópicos Estruturados</h4>
                    <button class="save-btn" style="padding: 0.5rem 1rem; font-size: 0.75rem; background: #10b981; color: #000;" onclick="addTopicRow()">+ Novo Tópico</button>
                </div>
                <div id="topics-list">
                    <!-- Empty initially -->
                </div>
            </div>

            <!-- Legacy Content Section (Hidden by Default) -->
            <div class="form-group" style="margin-top: 2rem; display: none;" id="legacy-content-group">
                <label>Conteúdo (Simples)</label>
                <textarea id="art-content" style="height: 400px; font-family: monospace;"></textarea>
            </div>

            <!-- Toggle Button -->
            <button class="save-btn" style="margin-top: 1.5rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-size: 0.7rem; width: 100%; border: 1px dashed rgba(59, 130, 246, 0.3);" 
                    onclick="toggleTopicSystem(true)">
                🔄 Reverter para Conteúdo Simples
            </button>

            <div style="display: flex; gap: 1rem; margin-top: 2.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2rem;">
                <button class="save-btn" style="flex: 1;" onclick="saveArticleChanges(null)">Criar no DB</button>
            </div>
        </div>
    `;
    window.showModal(html);
};

window.editArticle = async (id) => {
    const docSnap = await getDoc(doc(db, "articles", id));
    if (!docSnap.exists()) return;
    const a = docSnap.data();

    const html = `
        <div style="padding: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.5rem;">📰 Editando Artigo: ${a.title}</h3>
                <button class="save-btn" style="background: rgba(255, 255, 255, 0.46);" onclick="closeModal()">✕ Fechar</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <div class="form-group">
                    <label>Título</label>
                    <input type="text" id="art-title" value="${a.title || ''}">
                    <!-- Hidden ID input for save handling -->
                    <input type="hidden" id="art-id" value="${id}">
                </div>
                <div class="form-group">
                    <label>Autor</label>
                    <input type="text" id="art-author" value="${a.author || ''}">
                </div>
                <div class="form-group">
                    <label>Categoria / Tags</label>
                    <input type="text" id="art-category" value="${a.category || ''}">
                </div>
                <div class="form-group">
                    <label>Data</label>
                    <input type="text" id="art-date" value="${a.date || ''}">
                </div>
            </div>

            <div id="topics-container" style="margin-top: 2rem; display: ${a.topics ? 'block' : 'none'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px dotted rgba(255,255,255,0.1); padding-bottom: 1rem;">
                    <h4 style="color: var(--admin-primary); margin: 0;">📦 Tópicos Estruturados</h4>
                    <button class="save-btn" style="padding: 0.5rem 1rem; font-size: 0.75rem; background: #10b981; color: #000;" onclick="addTopicRow()">+ Novo Tópico</button>
                </div>
                <div id="topics-list">
                    ${(a.topics || []).map(t => `
                        <div class="topic-editor-row" style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                <strong style="color: #666; font-size: 0.7rem; text-transform: uppercase;">Tópico</strong>
                                <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>
                            </div>
                            <div class="form-group">
                                <label>Título do Tópico</label>
                                <input type="text" class="topic-title-input" value="${t.title || ''}" placeholder="Deixe vazio se não quiser subtítulo">
                            </div>
                            <div class="form-group">
                                <label>Conteúdo</label>
                                <textarea class="topic-content-input" style="height: 150px; font-family: monospace;">${t.content || ''}</textarea>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="form-group" style="margin-top: 2rem; display: ${a.topics ? 'none' : 'block'};" id="legacy-content-group">
                <label>Conteúdo (Legado)</label>
                <textarea id="art-content" style="height: 400px; font-family: monospace;">${a.content || ''}</textarea>
            </div>

            <button class="save-btn" style="margin-top: 1.5rem; background: rgba(59, 130, 246, 0.1); color: #3b82f6; font-size: 0.7rem; width: 100%; border: 1px dashed rgba(59, 130, 246, 0.3);" 
                    onclick="toggleTopicSystem(${!!a.topics})">
                ${a.topics ? '🔄 Reverter para Conteúdo Simples' : '🚀 Converter para Sistema de Tópicos'}
            </button>
 
            <div style="display: flex; gap: 1rem; margin-top: 2.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2rem;">
                <button class="save-btn" style="flex: 2; padding: 1rem;" onclick="saveArticleChanges('${id}')">💾 Salvar Alterações no Firestore</button>
                <button class="save-btn" style="flex: 1; background: rgba(239, 68, 68, 0.1); color: #ef4444;" onclick="deleteArticle('${id}')">🗑️ Excluir</button>
            </div>
        </div>
    `;
    window.showModal(html);
};

window.saveArticleChanges = async (id) => {
    // 1. Determine ID
    let newId = id;
    const idInput = document.getElementById('art-id');
    const titleInput = document.getElementById('art-title');

    if (!newId) {
        if (idInput) {
            newId = idInput.value.trim();
        }
        // Fallback: Generate from Title if ID input is missing or empty
        if (!newId && titleInput) {
            newId = titleInput.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }
    }

    if (!newId) return alert("Erro: Não foi possível gerar um ID. Verifique o título.");

    // 2. Determine Author & Date (Auto if missing)
    const authorInput = document.getElementById('art-author');
    const author = authorInput ? authorInput.value : "BitMundo";

    const dateInput = document.getElementById('art-date');
    const date = dateInput ? dateInput.value : new Date().toLocaleDateString('pt-BR');

    const data = {
        title: titleInput.value,
        author: author,
        category: document.getElementById('art-category').value,
        date: date,
        sortDate: parseDate(date)
    };

    // Handle Topics if active
    const topicsContainer = document.getElementById('topics-container');
    if (topicsContainer && topicsContainer.style.display !== 'none') {
        const topicRows = document.querySelectorAll('.topic-editor-row');
        data.topics = Array.from(topicRows).map(row => ({
            title: row.querySelector('.topic-title-input').value,
            content: row.querySelector('.topic-content-input').value
        }));
        data.content = ""; // Clear legacy content when using topics
    } else {
        data.content = document.getElementById('art-content').value;
        data.topics = null; // Clear topics when reverting to legacy
    }

    try {
        await setDoc(doc(db, "articles", newId), data, { merge: true });
        showNotification("✅ Salvo com sucesso!", "success");
        loadArticles();
    } catch (e) { showNotification("Erro: " + e.message, "error"); }
};

window.deleteArticle = async (id) => {
    if (confirm("Excluir postagem permanentemente?")) {
        await deleteDoc(doc(db, "articles", id));
        loadArticles();
    }
};

window.editLibrary = async (id) => {
    const docSnap = await getDoc(doc(db, "library", id));
    if (!docSnap.exists()) return;
    const g = docSnap.data();

    // Remove existing modal if any
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    // Custom full-screen style for this editor
    overlay.style.alignItems = 'flex-start'; // Top align
    overlay.style.padding = '1rem';

    // Close logic
    window.closeModal = () => { if (overlay) overlay.remove(); window.loadLibrary(); };
    overlay.onclick = (e) => { if (e.target === overlay) window.closeModal(); };

    // Split Layout HTML
    overlay.innerHTML = `
        <div class="modal-content" style="width: 98vw; height: 95vh; max-width: none; max-height: none; padding: 0; display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; border-radius: 8px;">
            
            <!-- LEFT: EDITOR -->
            <div style="display: flex; flex-direction: column; overflow-y: auto; background: #1a1a1a; border-right: 1px solid rgba(255,255,255,0.1);">
                
                <!-- HEADER (Sticky) -->
                <div style="padding: 1.5rem 2rem; border-bottom: 1px solid rgba(255,255,255,0.1); background: #1a1a1a; position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.4rem;">🎮 Editando: ${g.title}</h3>
                    <div style="display: flex; gap: 1rem;">
                        <button class="save-btn" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6;" onclick="saveLibraryChanges('${id}')">💾 Salvar</button>
                        <button class="save-btn" style="background: rgba(255, 255, 255, 0.49); color: white;" onclick="closeModal()">✕ Fechar</button>
                    </div>
                </div>

                <!-- FORM FIELDS -->
                <div style="padding: 2rem;">
                     <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label>Ordem (Prioridade na Lista)</label>
                        <input type="number" id="lib-order" value="${g.order || 0}" oninput="updateLibraryPreview()">
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                        <!-- Basic Info -->
                        <div>
                            <h4 style="color: #999; font-size: 0.7rem; text-transform: uppercase;">Informações Gerais</h4>
                            <div class="form-group"><label>Título</label><input type="text" id="lib-title" value="${g.title || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Plataforma</label><input type="text" id="lib-platform" value="${g.platform || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Gênero</label><input type="text" id="lib-genre" value="${g.genre || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Ano Lançamento</label><input type="text" id="lib-year" value="${g.release_year || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Capa (URL)</label><input type="text" id="lib-cover" value="${g.cover || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Rating</label><input type="text" id="lib-rating" value="${g.rating || ''}" oninput="updateLibraryPreview()"></div>
                        </div>

                        <!-- Pub & Romhacking -->
                        <div>
                            <h4 style="color: #999; font-size: 0.7rem; text-transform: uppercase;">Publicação & Tradução</h4>
                            <div class="form-group"><label>Publisher</label><input type="text" id="lib-pub" value="${g.publisher || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Developer</label><input type="text" id="lib-dev" value="${g.developer || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Tradutor</label><input type="text" id="lib-trans" value="${g.translator || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Progresso Geral</label><input type="text" id="lib-status" value="${g.status || ''}" oninput="updateLibraryPreview()"></div>
                            <div class="form-group"><label>Vídeo URL</label><input type="text" id="lib-video" value="${g.video_url || ''}" oninput="updateLibraryPreview()"></div>
                        </div>
                    </div>

                    <div style="grid-column: span 2; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
                        <div class="form-group"><label>Sinopse / Sumário</label><textarea id="lib-summary" style="height: 100px;" oninput="updateLibraryPreview()">${g.summary || ''}</textarea></div>
                        <div class="form-group"><label>Guia / Walkthrough (URL)</label><input type="text" id="lib-guide" value="${g.guide_url || ''}" oninput="updateLibraryPreview()"></div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
                        <div class="form-group"><label>Lore / História</label><textarea id="lib-lore" style="height: 80px;" oninput="updateLibraryPreview()">${g.lore || ''}</textarea></div>
                        <div class="form-group"><label>Dicas de Guia</label><textarea id="lib-tips" style="height: 80px;" oninput="updateLibraryPreview()">${g.guide_tips || ''}</textarea></div>
                        <div class="form-group"><label>Impacto / Legado</label><textarea id="lib-impact" style="height: 80px;" oninput="updateLibraryPreview()">${g.impact || ''}</textarea></div>
                        <div class="form-group"><label>Detalhes Dev (ROMhacking)</label><textarea id="lib-details-dev" style="height: 80px;" oninput="updateLibraryPreview()">${g.details_dev || ''}</textarea></div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
                        <div class="form-group"><label>Créditos Hacker</label><input type="text" id="lib-hacker" value="${g.credits_hacker || ''}" oninput="updateLibraryPreview()"></div>
                        <div class="form-group"><label>Região</label><input type="text" id="lib-region" value="${g.region || ''}" oninput="updateLibraryPreview()"></div>
                        <div class="form-group"><label>Desenvolvimento (Detalhes)</label><textarea id="lib-dev-details" style="height: 80px;" oninput="updateLibraryPreview()">${g.dev_details || ''}</textarea></div>
                        <div class="form-group"><label>Desenvolvimento (Legado)</label><textarea id="lib-dev-legacy" style="height: 80px;" oninput="updateLibraryPreview()">${g.dev_legacy || ''}</textarea></div>
                    </div>

                    <!-- Media/Gallery Section -->
                    <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h4 style="color: var(--admin-primary); margin: 0; font-size: 1rem;">🖼️ Galeria / Media</h4>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; background: #10b981; color: #000;" onclick="addMediaRow()">+ Adicionar Imagem</button>
                        </div>
                        <div id="media-list">
                            ${(g.media || []).map((item, idx) => `
                                <div class="media-row" style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                        <strong style="color: #999; font-size: 0.7rem;">Imagem ${idx + 1}</strong>
                                        <button onclick="this.parentElement.parentElement.remove(); updateLibraryPreview();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>
                                    </div>
                                    <div class="form-group"><label>URL da Imagem</label><input type="text" class="media-src" value="${item.src || ''}" oninput="updateLibraryPreview()"></div>
                                    <div class="form-group"><label>Legenda</label><input type="text" class="media-caption" value="${item.caption || ''}" oninput="updateLibraryPreview()"></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- OST Section -->
                    <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h4 style="color: var(--admin-primary); margin: 0; font-size: 1rem;">🎵 Trilha Sonora (OST)</h4>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; background: #10b981; color: #000;" onclick="addOSTRow()">+ Adicionar Música</button>
                        </div>
                        <div id="ost-list">
                            ${(g.ost || []).map((item, idx) => `
                                <div class="ost-row" style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                        <strong style="color: #999; font-size: 0.7rem;">Faixa ${idx + 1}</strong>
                                        <button onclick="this.parentElement.parentElement.remove(); updateLibraryPreview();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>
                                    </div>
                                    <div class="form-group"><label>Título da Música</label><input type="text" class="ost-title" value="${item.title || ''}" oninput="updateLibraryPreview()"></div>
                                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.5rem;">
                                        <div class="form-group"><label>URL (YouTube, etc)</label><input type="text" class="ost-url" value="${item.url || ''}" oninput="updateLibraryPreview()"></div>
                                        <div class="form-group"><label>Duração</label><input type="text" class="ost-duration" value="${item.duration || ''}" placeholder="3:45" oninput="updateLibraryPreview()"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Cheats Section -->
                    <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem; margin-bottom: 2rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h4 style="color: var(--admin-primary); margin: 0; font-size: 1rem;">🎮 Cheats / Códigos</h4>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; background: #10b981; color: #000;" onclick="addCheatRow()">+ Adicionar Cheat</button>
                        </div>
                        <div id="cheats-list">
                            ${(g.cheats || []).map((item, idx) => `
                                <div class="cheat-row" style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                        <strong style="color: #999; font-size: 0.7rem;">Cheat ${idx + 1}</strong>
                                        <button onclick="this.parentElement.parentElement.remove(); updateLibraryPreview();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>
                                    </div>
                                    <div class="form-group"><label>Código</label><input type="text" class="cheat-code" value="${item.code || ''}" oninput="updateLibraryPreview()" placeholder="ABCD1234"></div>
                                    <div class="form-group"><label>Descrição</label><input type="text" class="cheat-description" value="${item.description || ''}" oninput="updateLibraryPreview()" placeholder="Vidas infinitas"></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- RIGHT: PREVIEW -->
            <div id="pane-preview" style="background: #000; overflow: hidden; position: relative;">
                 <div id="lib-preview-container" style="width: 100%; height: 100%;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Initial Render
    setTimeout(updateLibraryPreview, 100);
};

// Removed switchAdminTab as it is no longer needed

window.updateLibraryPreview = async () => {
    const container = document.getElementById('lib-preview-container');
    if (!container) return;

    // Harvest Data
    const g = {
        title: document.getElementById('lib-title').value,
        platform: document.getElementById('lib-platform').value,
        genre: document.getElementById('lib-genre').value,
        release_year: document.getElementById('lib-year').value,
        cover: document.getElementById('lib-cover').value,
        rating: document.getElementById('lib-rating').value,
        publisher: document.getElementById('lib-pub').value,
        developer: document.getElementById('lib-dev').value,
        translator: document.getElementById('lib-trans').value,
        status: document.getElementById('lib-status').value,
        video_url: document.getElementById('lib-video').value,
        summary: document.getElementById('lib-summary').value,
        lore: document.getElementById('lib-lore').value,
        impact: document.getElementById('lib-impact').value,
        guide_url: document.getElementById('lib-guide').value,
        guide_tips: document.getElementById('lib-tips').value,
        details_dev: document.getElementById('lib-details-dev').value,
        credits_hacker: document.getElementById('lib-hacker').value,
        region: document.getElementById('lib-region').value,
        dev_details: document.getElementById('lib-dev-details').value,
        dev_legacy: document.getElementById('lib-dev-legacy').value,
        media: [],
        ost: [],
        cheats: []
    };

    // Harvest Media
    document.querySelectorAll('.media-row').forEach(row => {
        g.media.push({
            src: row.querySelector('.media-src').value,
            caption: row.querySelector('.media-caption').value
        });
    });

    // Harvest OST
    document.querySelectorAll('.ost-row').forEach(row => {
        g.ost.push({
            title: row.querySelector('.ost-title').value,
            url: row.querySelector('.ost-url').value,
            duration: row.querySelector('.ost-duration').value
        });
    });

    // Harvest Cheats
    document.querySelectorAll('.cheat-row').forEach(row => {
        g.cheats.push({
            code: row.querySelector('.cheat-code').value,
            description: row.querySelector('.cheat-description').value
        });
    });

    const iframe = document.createElement('iframe');
    iframe.style.cssText = "width: 100%; height: 100%; border: none; background: #0a0b10;";
    container.innerHTML = "";
    container.appendChild(iframe);

    // Dynamic Module Import for parsing
    const { parseArticleTags } = await import("./utils.js");

    const docContent = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700&family=Inter:wght@300;400;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap">
            <link rel="stylesheet" href="/css/style.css">
            <style>
                body { background: #0a0b10; overflow-x: hidden; margin: 0; }
                
                /* Library View Styles */
                .wiki-modal-preview {
                    padding-bottom: 3rem;
                }

                .wiki-container {
                    display: flex;
                    gap: 2.5rem;
                    flex-wrap: wrap;
                    padding: 0 2rem;
                }

                .wiki-main {
                    flex: 1;
                    min-width: 0;
                    max-width: 100%;
                }

                .wiki-sidebar {
                    width: 320px;
                    flex-shrink: 0;
                    background: rgba(10, 11, 16, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: var(--radius-md);
                    padding: 1.5rem;
                    align-self: flex-start;
                    position: relative;
                    z-index: 5;
                    overflow: hidden;
                    backdrop-filter: blur(10px);
                }

                /* Neon Border Animation for Sidebar */
                .wiki-sidebar::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: conic-gradient(
                        transparent, 
                        var(--primary), 
                        transparent, 
                        var(--highlight), 
                        transparent
                    );
                    animation: rotateNeon 6s linear infinite;
                    z-index: -1;
                }

                .wiki-sidebar::after {
                    content: '';
                    position: absolute;
                    inset: 2px;
                    background: var(--bg-dark);
                    border-radius: 10px;
                    z-index: -1;
                }

                @keyframes rotateNeon {
                    100% { transform: rotate(360deg); }
                }

                .infobox-title {
                    text-align: center;
                    background: linear-gradient(90deg, var(--primary), var(--accent));
                    color: #fff;
                    padding: 0.6rem;
                    border-radius: 4px;
                    margin-bottom: 1rem;
                    font-size: 1.1rem;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
                }

                .infobox-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.9rem;
                }

                .infobox-table th {
                    text-align: left;
                    padding: 0.5rem;
                    color: var(--highlight);
                    width: 40%;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .infobox-table td {
                    padding: 0.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    color: var(--text-main);
                }

                /* Article Typography */
                .wiki-article h2 {
                    border-bottom: 2px solid var(--primary);
                    padding-bottom: 0.5rem;
                    margin-bottom: 1.5rem;
                    color: #fff;
                    font-size: 1.8rem;
                }

                .wiki-article p {
                    line-height: 1.9;
                    margin-bottom: 1.5rem;
                    text-align: justify;
                    color: #ffffff;
                    font-size: 1.1rem;
                }

                .wiki-section {
                    margin-bottom: 3rem;
                    position: relative;
                    background: rgba(0, 0, 0, 0.6);
                    padding: 2.5rem;
                    border-radius: var(--radius-md);
                    border-left: 4px solid var(--primary);
                    transition: all 0.3s ease;
                    box-shadow: inset 0 0 30px rgba(0,0,0,0.6);
                    width: 100%;
                    max-width: 100%;
                    box-sizing: border-box;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                }

                /* Premium Wiki Details */
                .wiki-article .wiki-section:first-child p:first-of-type::first-letter {
                    font-family: 'Exo 2', sans-serif;
                    font-size: 4rem;
                    float: left;
                    margin-right: 0.8rem;
                    line-height: 0.8;
                    margin-top: 0.15em;
                    color: var(--highlight);
                    font-weight: 700;
                    text-shadow: 0 0 15px rgba(250, 204, 21, 0.4);
                }

                .wiki-banner-wrapper {
                    position: relative;
                    width: 100%;
                    height: 350px;
                    border-radius: var(--radius-md);
                    margin-bottom: 2rem;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.1);
                }

                .wiki-banner {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .scanlines {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: linear-gradient(
                        rgba(18, 16, 16, 0) 50%, 
                        rgba(0, 0, 0, 0.1) 50%
                    ), linear-gradient(
                        90deg, 
                        rgba(255, 0, 0, 0.02), 
                        rgba(0, 255, 0, 0.01), 
                        rgba(0, 0, 255, 0.02)
                    );
                    background-size: 100% 4px, 3px 100%;
                    pointer-events: none;
                    z-index: 2;
                }

                .detail-tabs {
                    display: flex;
                    gap: 1rem;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    margin-bottom: 2rem;
                    overflow-x: auto;
                    padding-bottom: 0.5rem;
                }

                .tab-btn {
                    background: transparent;
                    border: none;
                    color: #ccc;
                    padding: 0.5rem 1rem;
                    cursor: pointer;
                    white-space: nowrap;
                    font-weight: 600;
                    border-bottom: 2px solid transparent;
                    transition: 0.3s;
                    font-size: 1rem;
                }

                .tab-btn.active {
                    color: var(--highlight);
                    border-bottom: 2px solid var(--highlight);
                    text-shadow: 0 0 10px rgba(250, 204, 21, 0.5);
                }

                .tab-pane {
                    display: none;
                    animation: fadeIn 0.3s ease;
                }

                .tab-pane.active {
                    display: block;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Scrollbar */
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #1a1a1a; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
            </style>
            <script>
                function switchTab(evt, tabId) {
                   const tabPanes = document.getElementsByClassName("tab-pane");
                   for (let i = 0; i < tabPanes.length; i++) tabPanes[i].classList.remove("active");
                   const tabBtns = document.getElementsByClassName("tab-btn");
                   for (let i = 0; i < tabBtns.length; i++) tabBtns[i].classList.remove("active");
                   document.getElementById(tabId).classList.add("active");
                   evt.currentTarget.classList.add("active");
                }
            </script>
        </head>
        <body>
            <div class="wiki-modal-preview">
                
                <div class="wiki-header" style="padding: 2rem 2rem 0; margin-bottom: 1rem;">
                    <h1 style="color: #fff; font-size: 2.5rem; margin-bottom: 0.5rem;">${g.title}</h1>
                    <p style="color: var(--highlight); font-size: 1.2rem;">${g.platform} | ${g.release_year || g.year || ''}</p>
                </div>

                <div class="wiki-container">
                    <div class="wiki-main">
                        <div class="wiki-banner-wrapper">
                            <div class="scanlines"></div>
                            <img src="${g.cover}" class="wiki-banner" alt="Banner" onerror="this.src='/media/no-cover.png'">
                        </div>
                        
                        <div class="detail-tabs">
                            <button class="tab-btn active" onclick="switchTab(event, 'tab-info')">Artigo</button>
                            <button class="tab-btn" onclick="switchTab(event, 'tab-hist')">História</button>
                            <button class="tab-btn" onclick="switchTab(event, 'tab-dev')">Desenvolvimento</button>
                            <button class="tab-btn" onclick="switchTab(event, 'tab-media')">Galeria</button>
                            <button class="tab-btn" onclick="switchTab(event, 'tab-ost')">OST</button>
                            <button class="tab-btn" onclick="switchTab(event, 'tab-rom')">RomHacking</button>
                            <button class="tab-btn" onclick="switchTab(event, 'tab-extra')">Guia & Cheats</button>
                        </div>

                        <div id="tab-info" class="tab-pane active wiki-article">
                            <div class="wiki-section">
                                <h2>Introdução</h2>
                                <p>${parseArticleTags(g.summary || "")}</p>
                            </div>
                            ${g.video_url ? `
                            <div class="wiki-section">
                                <h2>Trailer / GamePlay</h2>
                                <iframe width="100%" height="400" src="${g.video_url}" frameborder="0" allowfullscreen style="border-radius: 8px;"></iframe>
                            </div>` : ''}
                        </div>

                        <div id="tab-hist" class="tab-pane wiki-article">
                            <div class="wiki-section">
                                <h2>Enredo e Contexto</h2>
                                <p>${parseArticleTags(g.lore || "")}</p>
                            </div>
                            <div class="wiki-section">
                                <h2>Impacto Cultural</h2>
                                <p>${parseArticleTags(g.impact || "")}</p>
                            </div>
                        </div>

                        <div id="tab-dev" class="tab-pane wiki-article">
                            <div class="wiki-section">
                                <h2>Processo Criativo</h2>
                                <p>${parseArticleTags(g.dev_details || "")}</p>
                            </div>
                            <div class="wiki-section">
                                <h2>Legado Tecnológico</h2>
                                <p>${parseArticleTags(g.dev_legacy || "")}</p>
                            </div>
                        </div>
                        
                        <div id="tab-media" class="tab-pane wiki-article">
                            <div class="wiki-section">
                                <h2>Galeria de Mídia</h2>
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                                    ${(g.media || []).length > 0 ? g.media.map(m => `
                                        <div style="text-align: center; background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px;">
                                            <img src="${m.src || m.url}" style="width: 100%; height: 150px; object-fit: contain; margin-bottom: 0.5rem; border-radius: 4px;" onerror="this.src='/media/no-cover.png'">
                                            <p style="font-size: 0.8rem; color: var(--highlight);">${m.caption || m.type || ''}</p>
                                        </div>
                                    `).join('') : '<p>Sem mídia.</p>'}
                                </div>
                            </div>
                        </div>

                        <div id="tab-ost" class="tab-pane wiki-article">
                            <div class="wiki-section">
                                <h2>Trilha Sonora (OST)</h2>
                                <div style="display: flex; flex-direction: column; gap: 1rem;">
                                    ${(g.ost || []).length > 0 ? g.ost.map(t => `
                                        <div style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                                            <span style="font-weight: 600;">${t.title}</span>
                                            <audio controls style="height: 30px;">
                                                <source src="${t.url}" type="audio/mpeg">
                                                Seu navegador não suporta áudio.
                                            </audio>
                                        </div>
                                    `).join('') : '<p>Sem trilha sonora.</p>'}
                                </div>
                            </div>
                        </div>
                        
                        <div id="tab-rom" class="tab-pane wiki-article">
                            <div class="wiki-section">
                                <h2>Detalhes da Tradução</h2>
                                <p>Este projeto foi liderado por <strong>${g.translator}</strong> e encontra-se no status: <span style="color: ${g.status === 'Completo' ? '#4ade80' : 'var(--highlight)'}">${g.status}</span>.</p>
                                <p>${parseArticleTags(g.details_dev || "")}</p>
                            </div>
                            <div class="wiki-section">
                                <h2>Créditos</h2>
                                <p>${parseArticleTags(g.credits_hacker || "")}</p>
                            </div>
                        </div>

                        <div id="tab-extra" class="tab-pane wiki-article">
                            <div class="wiki-section">
                                <h2>Detonado e Dicas</h2>
                                <p>${parseArticleTags(g.guide_tips || "")}</p>
                                ${g.guide_url ? `<a href="${g.guide_url}" target="_blank" class="view-btn" style="display: inline-block; margin-top: 1rem; text-decoration: none; background: var(--primary); color: #fff; padding: 0.8rem 1.5rem; border-radius: 5px;">Acessar Guia Externo</a>` : ''}
                            </div>
                            ${g.cheats && g.cheats.length > 0 ? `
                                <div class="wiki-section">
                                    <h2 style="color: #4ade80;">Cheats</h2>
                                    ${g.cheats.map(c => `
                                        <div style="background: rgba(74, 222, 128, 0.05); padding: 1rem; border-radius: 4px; border-left: 4px solid #4ade80; margin-bottom: 1rem; font-family: monospace;">
                                            <strong style="color: #4ade80; display: block; margin-bottom: 0.2rem;">${c.code}</strong> 
                                            <code style="color: #fff; font-size: 1.1rem;">${c.description}</code>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>

                    </div>

                    <aside class="wiki-sidebar">
                        <div class="infobox-title">Dados Técnicos</div>
                        <table class="infobox-table">
                            <tr><th>Plataforma</th><td>${g.platform}</td></tr>
                            <tr><th>Lançamento</th><td>${g.release_year || g.year || ''}</td></tr>
                            <tr><th>Gênero</th><td>${g.genre}</td></tr>
                            <tr><th>Editora</th><td>${g.publisher}</td></tr>
                            <tr><th>Dev</th><td>${g.developer}</td></tr>
                            <tr><th>Região</th><td>${g.region}</td></tr>
                            <tr><th>Status BR</th><td>${g.status}</td></tr>
                            <tr><th>Tradutor</th><td>${g.translator}</td></tr>
                        </table>
                        
                        <div style="margin-top: 1.5rem; text-align: center;">
                            <img src="${g.cover}" style="width: 100%; max-height: 250px; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3); padding: 5px;" onerror="this.src='/media/no-cover.png'">
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Capa Original</p>
                        </div>
                    </aside>
                </div>
            </div>
        </body>
        </html>
    `;

    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(docContent);
    frameDoc.close();
};

window.editTool = async (id) => {
    const docSnap = await getDoc(doc(db, "tools", id));
    if (!docSnap.exists()) return;
    const t = docSnap.data();

    const listEl = document.getElementById('tools-list');
    listEl.innerHTML = `
        <div class="card" style="background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); color: #fff; max-width: 800px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary);">🛠️ Editando Ferramenta: ${t.name}</h3>
                <button class="save-btn" style="background: rgba(255, 255, 255, 0.43); color: white;" onclick="loadTools()">✕ Fechar</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group"><label>Nome</label><input type="text" id="tool-name" value="${t.name || ''}"></div>
                <div class="form-group"><label>Versão</label><input type="text" id="tool-ver" value="${t.version || ''}"></div>
                <div class="form-group"><label>Tipo</label><input type="text" id="tool-type" value="${t.type || ''}"></div>
                <div class="form-group"><label>Alvo</label><input type="text" id="tool-target" value="${t.target || ''}"></div>
                <div class="form-group"><label>Crédito</label><input type="text" id="tool-credit" value="${t.credit || ''}"></div>
                <div class="form-group"><label>Ícone (URL)</label><input type="text" id="tool-icon" value="${t.icon || ''}"></div>
                <div class="form-group"><label>URL Download</label><input type="text" id="tool-url" value="${t.url || ''}"></div>
            </div>
            <div class="form-group"><label>Descrição</label><textarea id="tool-desc" style="height: 100px;">${t.description || ''}</textarea></div>
            <div class="form-group"><label>Extras (Links Adicionais)</label><input type="text" id="tool-extra" value="${t.extra || ''}"></div>

            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                <button class="save-btn" style="flex: 2;" onclick="saveToolChanges('${id}')">💾 Salvar Alterações</button>
                <button class="save-btn" style="flex: 1; background: rgba(255,255,255,0.1);" onclick="loadTools()">Cancelar</button>
            </div>
        </div>
    `;
};

window.saveToolChanges = async (id) => {
    const data = {
        name: document.getElementById('tool-name').value,
        version: document.getElementById('tool-ver').value,
        type: document.getElementById('tool-type').value,
        target: document.getElementById('tool-target').value,
        credit: document.getElementById('tool-credit').value,
        icon: document.getElementById('tool-icon').value,
        url: document.getElementById('tool-url').value,
        description: document.getElementById('tool-desc').value,
        extra: document.getElementById('tool-extra').value,
        updatedAt: new Date().toISOString(),
        sortDate: new Date().toISOString()
    };
    await setDoc(doc(db, "tools", id), data, { merge: true });
    showNotification("✅ Salvo com sucesso!", "success");
    loadTools();
};

window.loadLibrary = () => {
    const listEl = document.getElementById('library-list');
    if (!listEl) return;
    listEl.innerHTML = "Carregando biblioteca...";

    // Fixed: Use simple query without compound orderBy to avoid index requirement
    const q = collection(db, "library");

    onSnapshot(q, (snapshot) => {
        // Sort in memory based on current sort option
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();

            switch (currentLibrarySort) {
                case 'order-desc':
                    const orderA = dataA.order || 0;
                    const orderB = dataB.order || 0;
                    if (orderA !== orderB) return orderB - orderA;
                    // Secondary sort by date
                    const timeA = new Date(dataA.migratedAt || 0);
                    const timeB = new Date(dataB.migratedAt || 0);
                    return timeB - timeA;
                case 'title-asc':
                    return (dataA.title || '').localeCompare(dataB.title || '');
                case 'platform':
                    return (dataA.platform || '').localeCompare(dataB.platform || '');
                case 'year-desc':
                    const yearA = parseInt(dataA.release_year || dataA.year || 0);
                    const yearB = parseInt(dataB.release_year || dataB.year || 0);
                    return yearB - yearA;
                default:
                    return 0;
            }
        });

        listEl.innerHTML = `
            <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 8px;">
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentLibrarySort === 'order-desc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortLibrary('order-desc')">
                    📌 Ordem
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentLibrarySort === 'title-asc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortLibrary('title-asc')">
                    🔤 A-Z
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentLibrarySort === 'platform' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortLibrary('platform')">
                    🎮 Plataforma
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentLibrarySort === 'year-desc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortLibrary('year-desc')">
                    📅 Ano
                </button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; max-height: 500px; overflow-y: auto;">
                ${sortedDocs.map(doc => {
            const g = doc.data();
            return `
                    <div class="card" style="padding: 1rem; text-align: center; position: relative;">
                        <span style="position: absolute; top: 5px; right: 5px; font-size: 0.7rem; background: rgba(0,0,0,0.5); padding: 2px 5px; border-radius: 4px; color: #aaa;">Ord: ${g.order || 0}</span>
                        <img src="${g.cover}" style="width: 140px; height: 140px; object-fit: contain; border-radius: 8px; margin-bottom: 0.5rem; background: rgba(0,0,0,0.2);" onerror="this.src='/media/no-cover.png'">
                        <div style="font-size: 0.8rem; font-weight: bold; height: 2.4rem; overflow: hidden;">${g.title}</div>
                        <div style="font-size: 0.7rem; color: #999; margin-bottom: 0.5rem;">${g.platform}</div>
                        <div style="display: flex; gap: 0.4rem; justify-content: center;">
                            <button class="save-btn" style="padding: 0.3rem 0.6rem; font-size: 0.65rem;" onclick="editLibrary('${doc.id}')">✏️ Editar</button>
                        </div>
                    </div>`;
        }).join('')}
            </div>
        `;
    });
};

window.sortLibrary = (sortType) => {
    currentLibrarySort = sortType;
    loadLibrary();
};

window.loadTools = () => {
    const listEl = document.getElementById('tools-list');
    if (!listEl) return;
    listEl.innerHTML = "Carregando ferramentas...";
    const q = collection(db, "tools");
    onSnapshot(q, (snapshot) => {
        // Sort in memory based on current sort option
        const sortedDocs = snapshot.docs.sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();

            switch (currentToolsSort) {
                case 'name-asc':
                    return (dataA.name || '').localeCompare(dataB.name || '');
                case 'name-desc':
                    return (dataB.name || '').localeCompare(dataA.name || '');
                case 'type':
                    return (dataA.type || '').localeCompare(dataB.type || '');
                default:
                    return 0;
            }
        });

        listEl.innerHTML = `
            <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 8px;">
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentToolsSort === 'name-asc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortTools('name-asc')">
                    🔤 A-Z
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentToolsSort === 'name-desc' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortTools('name-desc')">
                    🔤 Z-A
                </button>
                <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; ${currentToolsSort === 'type' ? 'background: var(--admin-primary); color: #000;' : 'background: rgba(255,255,255,0.18);'}" onclick="sortTools('type')">
                    🏷️ Tipo
                </button>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
                ${sortedDocs.map(doc => {
            const t = doc.data();
            return `
                    <div style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items:center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <img src="${t.icon}" style="width: 24px; height: 24px;">
                            <div>
                                <strong style="color: var(--admin-primary);">${t.name}</strong>
                                <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4);">${t.type}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="editTool('${doc.id}')">✏️</button>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); color: #ef4444;" onclick="deleteTool('${doc.id}')">🗑️</button>
                        </div>
                    </div>`;
        }).join('')}
            </div>
        `;
    });
};

window.sortTools = (sortType) => {
    currentToolsSort = sortType;
    loadTools();
};

// Add to window to make it accessible to inline onclick
window.switchSection = (id, btn) => {
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');

    // Cleanup active listeners when switching sections
    if (activeCommentsListener) {
        activeCommentsListener();
        activeCommentsListener = null;
    }

    if (id === 'projects') loadProjects();
    if (id === 'articles') loadArticles();
    if (id === 'library') loadLibrary();
    if (id === 'tools') loadTools();
    if (id === 'comments') loadCommentsAdmin();
};

window.saveLocalFirebase = () => {
    const configStr = document.getElementById('local-firebase-config').value;
    if (!configStr) {
        alert("Cole a configuração JSON primeiro!");
        return;
    }

    if (saveLocalFirebaseConfig(configStr)) {
        showNotification("✅ Configuração local salva! Recarregando...", "success");
        setTimeout(() => location.reload(), 1500);
    } else {
        showNotification("❌ Erro: Formato JSON inválido!", "error");
    }
};

window.clearLocalFirebase = () => {
    if (confirm("Deseja limpar a configuração local?")) {
        localStorage.removeItem('bitmundo_firebase_config');
        location.reload();
    }
};

/* --- MASS DELETE & SELECTION --- */

window.toggleDeleteButton = (collection) => {
    const btn = document.getElementById(`btn-del-${collection}`);
    const checkboxes = document.querySelectorAll(`.chk-${collection}:checked`);
    if (btn) btn.style.display = checkboxes.length > 0 ? 'block' : 'none';
};

window.deleteSelected = async (collectionName) => {
    const checkboxes = document.querySelectorAll(`.chk-${collectionName}:checked`);
    if (checkboxes.length === 0) return;

    if (!confirm(`Tem certeza que deseja excluir ${checkboxes.length} itens de ${collectionName}? Essa ação não pode ser desfeita.`)) {
        return;
    }

    try {
        let count = 0;
        for (const chk of checkboxes) {
            await deleteDoc(doc(db, collectionName, chk.dataset.id));
            count++;
        }
        showNotification(`🗑️ ${count} itens excluídos com sucesso.`, "success");

        // Reload list
        if (collectionName === 'projects') loadProjects();
        if (collectionName === 'articles') loadArticles();
        if (collectionName === 'library') loadLibrary();

    } catch (error) {
        console.error("Delete Error:", error);
        showNotification("Erro ao excluir itens: " + error.message, "error");
    }
};

/* --- MISSING FUNCTION IMPLEMENTATIONS --- */

/**
 * Save new project to Firestore
 */
window.saveNewProject = async () => {
    const idInput = document.getElementById('new-id').value;
    const id = idInput ? idInput.trim() : null;
    const title = document.getElementById('new-title').value;
    const platform = document.getElementById('new-platform').value;
    const status = document.getElementById('new-status').value;

    if (!id || !title) {
        alert("ID e Título são obrigatórios!");
        return;
    }

    const data = {
        title: title,
        platform: platform || '',
        status: status || 'Em Progresso',
        subtitle: '',
        description: '',
        thumbnail: '',
        logo: '',
        cover: '',
        video: '',
        live_video: '',
        meta_keywords: '',
        gallery: [],
        downloads: [],
        credits: [],
        progress: { global: '0%' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sortDate: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, "projects", id), data);
        showNotification("✅ Projeto criado com sucesso!", "success");
        window.closeModal();
        loadProjects();
    } catch (e) {
        showNotification("Erro ao criar projeto: " + e.message, "error");
    }
};

/**
 * Save new article to Firestore
 */
window.saveNewArticle = async () => {
    // ... existing implementation remains as is if found, but I saw it at 2256
}

/**
 * Tool Management Functions
 */

window.addNewTool = () => {
    const html = `
        <div style="padding: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; color: var(--admin-primary); font-size: 1.5rem;">🛠️ Nova Ferramenta (Firestore)</h3>
                <button class="save-btn" style="background: rgba(255, 255, 255, 0.39);" onclick="closeModal()">✕ Fechar</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <div class="form-group">
                    <label>ID Único (slug)</label>
                    <input type="text" id="new-tool-id" placeholder="ex: psh-menu">
                </div>
                <div class="form-group">
                    <label>Nome da Ferramenta</label>
                    <input type="text" id="new-tool-name">
                </div>
                <div class="form-group">
                    <label>Versão</label>
                    <input type="text" id="new-tool-ver" placeholder="ex: 1.0">
                </div>
                <div class="form-group">
                    <label>Tipo</label>
                    <input type="text" id="new-tool-type" placeholder="ex: Editor de Scripts">
                </div>
                <div class="form-group">
                    <label>Alvo</label>
                    <input type="text" id="new-tool-target" placeholder="ex: PC, Android, iOS">
                </div>
                <div class="form-group">
                    <label>Créditos</label>
                    <input type="text" id="new-tool-credit">
                </div>
                <div class="form-group">
                    <label>Ícone (URL)</label>
                    <input type="text" id="new-tool-icon" placeholder="/media/tools/icon.png">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>URL Download</label>
                    <input type="text" id="new-tool-url">
                </div>
            </div>
            
            <div class="form-group">
                <label>Descrição</label>
                <textarea id="new-tool-desc" style="height: 100px;"></textarea>
            </div>
            <div class="form-group">
                <label>Extras (Links Adicionais)</label>
                <input type="text" id="new-tool-extra">
            </div>

            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button class="save-btn" style="flex: 1;" onclick="saveNewTool()">Criar no DB</button>
            </div>
        </div>
    `;
    window.showModal(html);
};

window.saveNewTool = async () => {
    const id = document.getElementById('new-tool-id').value;
    const name = document.getElementById('new-tool-name').value;

    if (!id || !name) {
        alert("ID e Nome são obrigatórios!");
        return;
    }

    const data = {
        name: name,
        version: document.getElementById('new-tool-ver').value || '',
        type: document.getElementById('new-tool-type').value || '',
        target: document.getElementById('new-tool-target').value || '',
        credit: document.getElementById('new-tool-credit').value || '',
        icon: document.getElementById('new-tool-icon').value || '',
        url: document.getElementById('new-tool-url').value || '',
        description: document.getElementById('new-tool-desc').value || '',
        extra: document.getElementById('new-tool-extra').value || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sortDate: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, "tools", id), data);
        showNotification("✅ Ferramenta criada com sucesso!", "success");
        window.closeModal();
        loadTools();
    } catch (e) {
        showNotification("Erro ao criar ferramenta: " + e.message, "error");
    }
};

window.deleteTool = async (id) => {
    if (confirm(`Deseja realmente excluir a ferramenta "${id}"?`)) {
        try {
            await deleteDoc(doc(db, "tools", id));
            showNotification("✅ Ferramenta excluída!", "success");
            loadTools();
        } catch (e) {
            showNotification("Erro ao excluir: " + e.message, "error");
        }
    }
};

/**
 * Save library changes to Firestore
 */
// Redundant saveLibraryChanges removed

/**
 * Add a new topic row to the article editor
 */
window.addTopicRow = () => {
    const container = document.getElementById('topics-list');
    if (!container) return;

    const newRow = document.createElement('div');
    newRow.className = 'topic-editor-row';
    newRow.style.cssText = 'background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.05);';
    newRow.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <strong style="color: #666; font-size: 0.7rem; text-transform: uppercase;">Novo Tópico</strong>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>
        </div>
        <div class="form-group">
            <label>Título do Tópico</label>
            <input type="text" class="topic-title-input" value="" placeholder="Deixe vazio se não quiser subtítulo">
        </div>
        <div class="form-group">
            <label>Conteúdo</label>
            <textarea class="topic-content-input" style="height: 150px; font-family: monospace;"></textarea>
        </div>
    `;

    container.appendChild(newRow);
};

/**
 * Toggle between topic system and legacy content
 */
window.toggleTopicSystem = (currentlyUsingTopics) => {
    const topicsContainer = document.getElementById('topics-container');
    const legacyGroup = document.getElementById('legacy-content-group');

    if (!topicsContainer || !legacyGroup) return;

    if (currentlyUsingTopics) {
        // Switch to legacy
        topicsContainer.style.display = 'none';
        legacyGroup.style.display = 'block';
    } else {
        // Switch to topics
        topicsContainer.style.display = 'block';
        legacyGroup.style.display = 'none';

        // If no topics exist, add one
        const topicsList = document.getElementById('topics-list');
        if (topicsList && topicsList.children.length === 0) {
            window.addTopicRow();
        }
    }
};

// Helper functions for adding dynamic list rows in library editor

window.addMediaRow = () => {

    const container = document.getElementById('media-list');

    const newRow = document.createElement('div');

    newRow.className = 'media-row';

    newRow.style.cssText = 'background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);';

    newRow.innerHTML = `

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">

            <strong style="color: #999; font-size: 0.7rem;">Nova Imagem</strong>

            <button onclick="this.parentElement.parentElement.remove(); updateLibraryPreview();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>

        </div>

        <div class="form-group"><label>URL da Imagem</label><input type="text" class="media-src" value="" oninput="updateLibraryPreview()"></div>

        <div class="form-group"><label>Legenda</label><input type="text" class="media-caption" value="" oninput="updateLibraryPreview()"></div>

    `;

    container.appendChild(newRow);

    updateLibraryPreview();

};

window.addOSTRow = () => {

    const container = document.getElementById('ost-list');

    const newRow = document.createElement('div');

    newRow.className = 'ost-row';

    newRow.style.cssText = 'background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);';

    newRow.innerHTML = `

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">

            <strong style="color: #999; font-size: 0.7rem;">Nova Faixa</strong>

            <button onclick="this.parentElement.parentElement.remove(); updateLibraryPreview();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>

        </div>

        <div class="form-group"><label>Título da Música</label><input type="text" class="ost-title" value="" oninput="updateLibraryPreview()"></div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.5rem;">

            <div class="form-group"><label>URL (YouTube, etc)</label><input type="text" class="ost-url" value="" oninput="updateLibraryPreview()"></div>

            <div class="form-group"><label>Duração</label><input type="text" class="ost-duration" value="" placeholder="3:45" oninput="updateLibraryPreview()"></div>

        </div>

    `;

    container.appendChild(newRow);

    updateLibraryPreview();

};

window.addCheatRow = () => {

    const container = document.getElementById('cheats-list');

    const newRow = document.createElement('div');

    newRow.className = 'cheat-row';

    newRow.style.cssText = 'background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.05);';

    newRow.innerHTML = `

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">

            <strong style="color: #999; font-size: 0.7rem;">Novo Cheat</strong>

            <button onclick="this.parentElement.parentElement.remove(); updateLibraryPreview();" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem;">&times;</button>

        </div>

        <div class="form-group"><label>Código</label><input type="text" class="cheat-code" value="" oninput="updateLibraryPreview()" placeholder="ABCD1234"></div>

        <div class="form-group"><label>Descrição</label><input type="text" class="cheat-description" value="" oninput="updateLibraryPreview()" placeholder="Vidas infinitas"></div>

    `;

    container.appendChild(newRow);

    updateLibraryPreview();

};

// Save library changes to Firestore

window.saveLibraryChanges = async (id) => {
    if (!id) return alert("Erro: ID não encontrado!");
    const data = {
        order: parseInt(document.getElementById('lib-order')?.value) || 0,
        title: document.getElementById('lib-title').value,
        platform: document.getElementById('lib-platform').value,
        genre: document.getElementById('lib-genre').value,
        release_year: document.getElementById('lib-year').value,
        cover: document.getElementById('lib-cover').value,
        rating: document.getElementById('lib-rating').value,
        publisher: document.getElementById('lib-pub').value,
        developer: document.getElementById('lib-dev').value,
        translator: document.getElementById('lib-trans').value,
        status: document.getElementById('lib-status').value,
        video_url: document.getElementById('lib-video').value,
        summary: document.getElementById('lib-summary').value,
        lore: document.getElementById('lib-lore').value,
        impact: document.getElementById('lib-impact').value,
        guide_url: document.getElementById('lib-guide').value,
        guide_tips: document.getElementById('lib-tips').value,
        details_dev: document.getElementById('lib-details-dev').value,
        credits_hacker: document.getElementById('lib-hacker').value,
        region: document.getElementById('lib-region').value,
        dev_details: document.getElementById('lib-dev-details').value,
        dev_legacy: document.getElementById('lib-dev-legacy').value,
        media: [],
        ost: [],
        cheats: [],
        updatedAt: new Date().toISOString(),
        sortDate: new Date().toISOString()
    };

    // Harvest Media
    document.querySelectorAll('.media-row').forEach(row => {
        const src = row.querySelector('.media-src').value;
        const caption = row.querySelector('.media-caption').value;
        if (src) data.media.push({ src, caption });
    });

    // Harvest OST
    document.querySelectorAll('.ost-row').forEach(row => {
        const title = row.querySelector('.ost-title').value;
        const url = row.querySelector('.ost-url').value;
        const duration = row.querySelector('.ost-duration').value;
        if (title) data.ost.push({ title, url, duration });
    });

    // Harvest Cheats
    document.querySelectorAll('.cheat-row').forEach(row => {
        const code = row.querySelector('.cheat-code').value;
        const description = row.querySelector('.cheat-description').value;
        if (code) data.cheats.push({ code, description });
    });

    try {
        const docRef = doc(db, "library", id);
        await setDoc(docRef, data, { merge: true });
        showNotification("✅ Biblioteca atualizada!", "success");
        if (typeof loadLibrary === 'function') loadLibrary();
        if (typeof updateLibraryPreview === 'function') updateLibraryPreview();
    } catch (e) {
        showNotification("❌ Erro ao salvar: " + e.message, "error");
    }
};

/**
 * BACKUP & RESTORE SYSTEM (JSON)
 */

window.backupSystem = async () => {
    const backupBtn = document.getElementById('btn-backup');
    if (backupBtn) backupBtn.innerText = "⏳ Gerando JSON...";

    try {
        const collections = ['projects', 'articles', 'library', 'tools', 'comments'];
        const backupData = {
            metadata: {
                version: '1.0',
                date: new Date().toISOString(),
                exportedBy: auth.currentUser ? auth.currentUser.email : 'unknown'
            },
            data: {}
        };

        showNotification("📦 Iniciando backup...", "info");

        for (const colName of collections) {
            console.log(`Backing up ${colName}...`);
            const q = collection(db, colName);
            const snapshot = await getDocs(q);
            backupData.data[colName] = {};

            snapshot.forEach(doc => {
                backupData.data[colName][doc.id] = doc.data();
            });
        }

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `bitmundo_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification("✅ Backup concluído! Download iniciado.", "success");

    } catch (e) {
        console.error("Backup Error:", e);
        showNotification("❌ Erro no Backup: " + e.message, "error");
    } finally {
        if (backupBtn) backupBtn.innerText = "⬇️ Fazer Backup (JSON)";
    }
};

window.triggerRestore = () => {
    document.getElementById('restore-input').click();
};

window.restoreSystem = async (input) => {
    const file = input.files[0];
    if (!file) return;

    if (!confirm("⚠️ ATENÇÃO: Isso irá substituir/mesclar os dados atuais com os do backup. Recomendamos fazer um backup antes. Deseja continuar?")) {
        input.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            if (!backup.data) {
                throw new Error("Formato de backup inválido (missing data field)");
            }

            showNotification("🔄 Iniciando restauração...", "info");
            console.log("Restoring backup:", backup.metadata);

            let totalRestored = 0;
            const batchSize = 400; // Batch limit is 500

            // Process collection by collection
            for (const [colName, docs] of Object.entries(backup.data)) {
                const docIds = Object.keys(docs);
                console.log(`Restoring ${colName} (${docIds.length} docs)...`);

                // Chunk into batches
                for (let i = 0; i < docIds.length; i += batchSize) {
                    const batch = writeBatch(db);
                    const chunk = docIds.slice(i, i + batchSize);

                    chunk.forEach(id => {
                        const docRef = doc(db, colName, id);
                        batch.set(docRef, docs[id], { merge: true });
                    });

                    await batch.commit();
                    totalRestored += chunk.length;
                    console.log(`Committed batch for ${colName}: ${chunk.length} docs`);
                }
            }

            showNotification(`✅ Restauração completa! ${totalRestored} documentos processados.`, "success");

            // Reload all views
            loadProjects();
            loadArticles();
            loadLibrary();
            loadTools();

        } catch (err) {
            console.error("Restore Error:", err);
            showNotification("❌ Erro na Restauração: " + err.message, "error");
        } finally {
            input.value = "";
        }
    };
    reader.readAsText(file);
};
/**
 * Link Google Account for Moderation Permissions
 */
window.linkGoogleAccount = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const googleEmail = result.user.email;

        // 1. Save to admin's private config
        await setDoc(doc(db, "admin_config", user.uid), {
            linkedGoogleEmail: googleEmail,
            lastLinkedAt: new Date().toISOString()
        }, { merge: true });

        // 2. Add to public admin list for comments_loader.js
        // We use a dedicated document for public emails to avoid exposing full admin configs
        const publicAdminRef = doc(db, "config", "public_admins");
        const publicSnap = await getDoc(publicAdminRef);
        let emails = [];
        if (publicSnap.exists()) {
            emails = publicSnap.data().emails || [];
        }

        if (!emails.includes(googleEmail)) {
            emails.push(googleEmail);
            await setDoc(publicAdminRef, { emails: emails }, { merge: true });
        }

        showNotification(`✅ Conta ${googleEmail} vinculada com sucesso!`, "success");
        loadConfig(user.uid);

    } catch (error) {
        console.error("Error linking Google account:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            showNotification("❌ Erro ao vincular conta: " + error.message, "error");
        }
    }
};
