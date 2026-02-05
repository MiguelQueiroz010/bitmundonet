import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";
import { fetchFileFromGithub, pushFileToGithub, parseProjectsXML } from "./admin_xml.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentGHToken = "";
let projectsSHA = "";
let articlesSHA = "";

// Auth Listener
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '/admin_login.html';
    } else {
        await loadConfig(user.uid);
        initDashboard();
    }
});

async function loadConfig(uid) {
    const docRef = doc(db, "admin_config", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        currentGHToken = data.ghToken || "";

        // Update form fields
        document.getElementById('admin-name').value = data.name || "";
        document.getElementById('admin-avatar').value = data.avatar || "";
        document.getElementById('gh-token').value = currentGHToken;

        // Update avatar display
        updateAvatarDisplay(data.avatar, data.name);

        // Update greeting
        if (data.name) {
            document.getElementById('greeting').textContent = `Olá, ${data.name}`;
        }

        // Update GitHub status
        if (currentGHToken) {
            document.getElementById('status-gh').innerText = "GitHub: Conectado (Token Ativo)";
            document.getElementById('status-gh').style.color = "#10b981";
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
        sidebarContainer.innerHTML = `<img src="${avatarUrl}" class="admin-avatar" alt="Avatar" onerror="this.parentElement.innerHTML='<div class=\\"avatar-placeholder\\">👤</div>'">`;

        // Show small avatar in header
        headerContainer.innerHTML = `<img src="${avatarUrl}" class="admin-avatar-small" alt="Avatar" onerror="this.style.display='none'">`;
    } else {
        // Show placeholder
        sidebarContainer.innerHTML = '<div class="avatar-placeholder">👤</div>';
        headerContainer.innerHTML = '';
    }

    // Update name in sidebar
    if (name && name.trim() !== '') {
        sidebarName.textContent = name;
    } else {
        sidebarName.textContent = 'Admin';
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
        const ghToken = document.getElementById('gh-token').value;

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
                ghToken: ghToken,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Update current token
            currentGHToken = ghToken;

            // Update avatar display immediately
            updateAvatarDisplay(avatar, name);

            // Update greeting
            if (name) {
                document.getElementById('greeting').textContent = `Olá, ${name}`;
            }

            // Update GitHub status
            if (ghToken) {
                document.getElementById('status-gh').innerText = "GitHub: Conectado (Token Ativo)";
                document.getElementById('status-gh').style.color = "#10b981";
            }

            // Show success message
            showNotification('✅ Perfil atualizado com sucesso!', 'success');
            console.log('✅ Dados salvos no Firestore:', { name, avatar, hasToken: !!ghToken });

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
function loadCommentsAdmin() {
    const q = query(collection(db, "comments"), orderBy("timestamp", "desc"));
    const listEl = document.getElementById('admin-comments-list');

    onSnapshot(q, (snapshot) => {
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

        listEl.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const date = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
            const timeAgo = getTimeAgo(date);

            return `
                <div class="card" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid rgba(255,255,255,0.05); position: relative;">
                    <div style="display:flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <div>
                            <strong style="color: var(--admin-primary); font-size: 0.95rem;">${data.user || 'Anônimo'}</strong>
                            <span style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-left: 0.5rem;">${timeAgo}</span>
                        </div>
                        <span style="font-size: 0.7rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 0.25rem 0.5rem; border-radius: 4px;">
                            ${data.projectId || 'N/A'}
                        </span>
                    </div>
                    <p style="font-size: 0.9rem; margin: 0.5rem 0; line-height: 1.5; color: rgba(255,255,255,0.8);">${data.text}</p>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                        <button onclick="deleteComment('${doc.id}')" 
                                style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; cursor: pointer; font-size: 0.7rem; padding: 0.25rem 0.75rem; border-radius: 4px; transition: all 0.2s;">
                            🗑️ Excluir
                        </button>
                    </div>
                </div>
            `;
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

/**
 * Project Editing logic placeholder
 * Real implementation would fetchFileFromGithub('projects.xml', currentGHToken)
 */
window.loadProjectsXML = async () => {
    if (!currentGHToken) {
        alert("Insira seu GitHub Token no perfil primeiro!");
        return;
    }
    const container = document.getElementById('xml-projects-list');
    container.innerHTML = "Carregando do GitHub...";

    try {
        const { content, sha } = await fetchFileFromGithub('projects.xml', currentGHToken);
        projectsSHA = sha;
        const projects = parseProjectsXML(content);

        container.innerHTML = `
            <div style="max-height: 500px; overflow-y: auto;">
                ${projects.map(p => `
                    <div style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items:center; transition: background 0.2s;" 
                         onmouseover="this.style.background='rgba(255,255,255,0.02)'" 
                         onmouseout="this.style.background='transparent'">
                        <div>
                            <strong style="color: var(--admin-primary);">${p.title}</strong>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 0.25rem;">
                                ID: ${p.id} • Status: ${p.status}
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: rgba(59, 130, 246, 0.2); color: #3b82f6;" 
                                    onclick="previewProject('${p.id}', '${p.title.replace(/'/g, "\\'")}', '${p.subtitle?.replace(/'/g, "\\'") || ""}', '${p.status}')">
                                👁️ Prévia
                            </button>
                            <button class="save-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" 
                                    onclick="editProject('${p.id}')">
                                ✏️ Editar
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<span style="color:#ef4444">Erro: ${e.message}</span>`;
    }
};

/**
 * Preview project in the preview panel
 */
window.previewProject = (id, title, subtitle, status) => {
    const previewEl = document.getElementById('projects-preview');

    const statusColors = {
        'Concluído': '#10b981',
        'WIP': '#f59e0b',
        'Pausado': '#ef4444',
        'Planejamento': '#3b82f6'
    };

    const statusColor = statusColors[status] || '#6b7280';

    previewEl.innerHTML = `
        <div style="animation: fade-in 0.3s ease;">
            <div style="background: linear-gradient(135deg, rgba(241, 163, 46, 0.1), rgba(59, 130, 246, 0.1)); padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem;">
                <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;">
                    ID: ${id}
                </div>
                <h3 style="color: var(--admin-primary); margin: 0.5rem 0; font-size: 1.5rem;">${title}</h3>
                ${subtitle ? `<p style="color: rgba(255,255,255,0.7); font-size: 0.9rem; margin: 0.5rem 0;">${subtitle}</p>` : ''}
                <div style="margin-top: 1rem;">
                    <span style="background: ${statusColor}; color: #000; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
                        ${status}
                    </span>
                </div>
            </div>
            
            <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; border-left: 3px solid var(--admin-primary);">
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-bottom: 0.5rem;">📍 Como aparecerá no site:</div>
                <div style="font-size: 0.85rem; line-height: 1.6;">
                    Este projeto será exibido na página de projetos com o título "<strong>${title}</strong>" e status "<strong>${status}</strong>".
                </div>
            </div>
        </div>
    `;
};

// Add to window to make it accessible to inline onclick
window.switchSection = (id, btn) => {
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');

    if (id === 'projects') loadProjectsXML();
};
