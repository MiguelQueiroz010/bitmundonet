import { messagingPromise, dbPromise, authPromise } from "./db-context.js";
import { getToken } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const VAPID_KEY = "BJENeOUoc4hul9JCb7PgKhDsTeTTXFCOpY2kR_MB5Mb1rxSs5QhPT2_Z2OlpqxHXZUmAqK9jOIUMshDi6ku41RE";

export async function registerFcmTokenSilently() {
    try {
        console.log("[Notifications] 🔄 Iniciando processo de geração/sincronização do token FCM...");
        const messaging = await messagingPromise;
        const db = await dbPromise;
        const auth = await authPromise;

        if (!db) {
            console.error("[Notifications] ❌ Conexão com o Firestore (db) está nula. Configure as credenciais do Firebase!");
            return;
        }

        if (!messaging) {
            console.error("[Notifications] ❌ Firebase Messaging não está disponível neste navegador ou ambiente.");
            return;
        }

        let swRegistration = null;
        if ('serviceWorker' in navigator) {
            try {
                const isLocalEnv = ['localhost', '127.0.0.1', '172.'].some(ip => location.hostname.includes(ip));
                const swScript = isLocalEnv ? '/firebase-messaging-sw.template.js' : '/firebase-messaging-sw.js';

                await navigator.serviceWorker.register(swScript)
                    .catch(() => navigator.serviceWorker.register('/firebase-messaging-sw.template.js'));

                // Aguarda obrigatoriamente o Service Worker ficar no estado ATIVO (active worker)
                swRegistration = await navigator.serviceWorker.ready;
                console.log("[Notifications] ✅ Service Worker ATIVO com sucesso:", swRegistration.scope);
            } catch (e) {
                console.warn("[Notifications] ⚠️ Alerta ao aguardar Service Worker:", e.message);
            }
        }

        const tokenOptions = { vapidKey: VAPID_KEY };
        if (swRegistration) {
            tokenOptions.serviceWorkerRegistration = swRegistration;
        }

        console.log("[Notifications] 🔑 Solicitando token FCM do Google Firebase...");
        const currentToken = await getToken(messaging, tokenOptions);
        if (currentToken) {
            console.log("[Notifications] 📲 Token FCM gerado:", currentToken);
            console.log("[Notifications] 💾 Salvando token no Firestore na coleção 'subscribers'...");

            const userEmail = auth && auth.currentUser ? auth.currentUser.email : null;

            const subscriberData = {
                token: currentToken,
                date: new Date().toISOString(),
                userAgent: navigator.userAgent
            };

            if (userEmail) {
                subscriberData.email = userEmail;
                console.log("[Notifications] 👤 E-mail do usuário vinculado ao token:", userEmail);
            }

            await setDoc(doc(db, "subscribers", currentToken), subscriberData, { merge: true });

            console.log("[Notifications] 🎉 SUCESSO! Token gravado no Firestore na coleção 'subscribers'!");
        } else {
            console.warn("[Notifications] ⚠️ O Firebase não retornou um token FCM. Verifique as chaves VAPID e Service Worker.");
        }
    } catch (e) {
        console.error("[Notifications] 💥 ERRO ao obter/salvar o token FCM no Firestore:", e);
    }
}

export async function requestNotificationPermission() {
    console.log("[Notifications] Solicitando permissão de notificação no navegador...");
    const permission = await Notification.requestPermission();
    console.log("[Notifications] Status da permissão do navegador:", permission);

    if (permission === 'granted') {
        await registerFcmTokenSilently();
        alert("🔔 Notificações ativadas! Você será avisado sobre novos artigos.");
    } else if (permission === 'denied') {
        console.warn("[Notifications] Permissão negada pelo usuário.");
    }
}

export function showNotificationPromptBanner() {
    if (document.getElementById('fcm-prompt-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'fcm-prompt-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-width: 360px;
        background: rgba(18, 18, 24, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 16px 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        backdrop-filter: blur(10px);
        z-index: 99999;
        font-family: inherit;
        color: #fff;
        display: flex;
        flex-direction: column;
        gap: 12px;
        animation: fcmSlideUp 0.4s ease-out;
    `;

    banner.innerHTML = `
        <style>
            @keyframes fcmSlideUp {
                from { transform: translateY(100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        </style>
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.5rem;">🔔</span>
            <div style="font-size: 0.95rem; font-weight: 600; line-height: 1.3;">
                Deseja receber notificações sobre novos artigos e novidades do BitMundo?
            </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
            <button id="fcm-banner-dismiss" style="
                background: transparent;
                border: 1px solid rgba(255,255,255,0.2);
                color: #ccc;
                padding: 6px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
            ">Agora não</button>
            <button id="fcm-banner-accept" style="
                background: var(--primary, #0070f3);
                border: none;
                color: #fff;
                padding: 6px 14px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                font-size: 0.85rem;
            ">Ativar Notificações</button>
        </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('fcm-banner-dismiss').addEventListener('click', () => {
        localStorage.setItem('fcm_banner_dismissed', Date.now().toString());
        banner.remove();
    });

    document.getElementById('fcm-banner-accept').addEventListener('click', async () => {
        banner.remove();
        await requestNotificationPermission();
    });
}

export async function initNotificationsOnSiteAccess() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        await registerFcmTokenSilently();
    } else if (Notification.permission === 'default') {
        const dismissedAt = localStorage.getItem('fcm_banner_dismissed');
        if (!dismissedAt || (Date.now() - parseInt(dismissedAt, 10)) > 24 * 60 * 60 * 1000) {
            setTimeout(showNotificationPromptBanner, 1500);
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationsOnSiteAccess);
} else {
    initNotificationsOnSiteAccess();
}
