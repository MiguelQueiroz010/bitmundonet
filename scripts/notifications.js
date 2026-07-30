import { messagingPromise, dbPromise } from "./db-context.js";
import { getToken } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const VAPID_KEY = "BJENeOUoc4hul9JCb7PgKhDsTeTTXFCOpY2kR_MB5Mb1rxSs5QhPT2_Z2OlpqxHXZUmAqK9jOIUMshDi6ku41RE";

export async function requestNotificationPermission() {
    console.log("[Notifications] Solicitando permissão de notificação no navegador...");
    const permission = await Notification.requestPermission();
    console.log("[Notifications] Status da permissão do navegador:", permission);

    if (permission === 'granted') {
        try {
            console.log("[Notifications] Aguardando inicialização do Firebase Messaging e Firestore...");
            const messaging = await messagingPromise;
            const db = await dbPromise;

            if (!messaging) {
                console.error("[Notifications] Firebase Messaging não suportado ou desativado neste navegador.");
                alert("Seu navegador não suporta notificações push.");
                return;
            }

            console.log("[Notifications] Registrando/Verificando Service Worker (/firebase-messaging-sw.js)...");
            let swRegistration = null;
            if ('serviceWorker' in navigator) {
                try {
                    swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                    console.log("[Notifications] Service Worker registrado com sucesso:", swRegistration);
                } catch (swErr) {
                    console.warn("[Notifications] Alerta ao registrar Service Worker:", swErr.message);
                }
            }

            console.log("[Notifications] Solicitando token FCM...");
            const tokenOptions = { vapidKey: VAPID_KEY };
            if (swRegistration) {
                tokenOptions.serviceWorkerRegistration = swRegistration;
            }

            const currentToken = await getToken(messaging, tokenOptions);
            if (currentToken) {
                console.log("[Notifications] Token FCM obtido com sucesso:", currentToken);

                // Salva no Firestore na coleção 'subscribers'
                try {
                    await setDoc(doc(db, "subscribers", currentToken), {
                        token: currentToken,
                        date: new Date().toISOString(),
                        userAgent: navigator.userAgent
                    }, { merge: true });

                    console.log("[Notifications] ✅ Token registrado com sucesso no Firestore na coleção 'subscribers'!");
                    alert("🔔 Notificações ativadas! Você será avisado sobre novos artigos.");
                } catch (fsErr) {
                    console.error("[Notifications] ❌ Erro de Firestore ao salvar token (verifique as Regras de Segurança do Firestore):", fsErr);
                    alert("⚠️ Permissão concedida, mas houve erro ao salvar no banco (Firestore): " + fsErr.message);
                }
            } else {
                console.warn("[Notifications] ⚠️ Nenhum token FCM retornado pelo Firebase.");
                alert("⚠️ Não foi possível obter o token de notificação.");
            }
        } catch (e) {
            console.error("[Notifications] 💥 Erro ao obter/salvar o token FCM:", e);
            alert("❌ Erro ao ativar notificações: " + e.message);
        }
    } else {
        console.warn("[Notifications] ⚠️ Permissão de notificação negada ou desativada no navegador.");
        alert("⚠️ Notificações foram bloqueadas nas configurações do seu navegador.");
    }
}
