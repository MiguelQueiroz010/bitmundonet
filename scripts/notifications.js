import { messagingPromise, dbPromise } from "./db-context.js";
import { getToken } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const VAPID_KEY = "BJENeOUoc4hul9JCb7PgKhDsTeTTXFCOpY2kR_MB5Mb1rxSs5QhPT2_Z2OlpqxHXZUmAqK9jOIUMshDi6ku41RE";

export async function requestNotificationPermission() {
    console.log("[Notifications] Solicitando permissão de notificação no navegador...");
    const permission = await Notification.requestPermission();
    console.log("[Notifications] Status da permissão:", permission);

    if (permission === 'granted') {
        try {
            console.log("[Notifications] Aguardando inicialização do Firebase Messaging e Firestore...");
            const messaging = await messagingPromise;
            const db = await dbPromise;

            if (!messaging) {
                console.error("[Notifications] Messaging não suportado neste navegador.");
                alert("Seu navegador não suporta notificações push.");
                return;
            }

            console.log("[Notifications] Solicitando token FCM...");
            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (currentToken) {
                console.log("[Notifications] Token FCM obtido com sucesso:", currentToken);

                // Salva no Firestore na coleção 'subscribers'
                await setDoc(doc(db, "subscribers", currentToken), {
                    token: currentToken,
                    date: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }, { merge: true });

                console.log("[Notifications] ✅ Token registrado com sucesso no Firestore na coleção 'subscribers'!");
                alert("🔔 Notificações ativadas! Você será avisado sobre novos artigos.");
            } else {
                console.warn("[Notifications] ⚠️ Nenhum token FCM retornado. Verifique as configurações de VAPID key ou permissões.");
            }
        } catch (e) {
            console.error("[Notifications] 💥 Erro ao obter/salvar o token FCM:", e);
        }
    } else {
        console.warn("[Notifications] ⚠️ Permissão de notificação negada ou ignorada pelo usuário.");
    }
}
