import { messagingPromise, dbPromise } from "./db-context.js";
import { getToken } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-messaging.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

const VAPID_KEY = "BJENeOUoc4hul9JCb7PgKhDsTeTTXFCOpY2kR_MB5Mb1rxSs5QhPT2_Z2OlpqxHXZUmAqK9jOIUMshDi6ku41RE";

export async function requestNotificationPermission() {
    console.log("Solicitando permissão de notificação...");
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log("Permissão concedida.");

        try {
            const messaging = await messagingPromise;
            const db = await dbPromise;

            if (!messaging) {
                alert("Seu navegador não suporta notificações push.");
                return;
            }

            // Registra o token
            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (currentToken) {
                console.log("Token obtido com sucesso.");

                // Salva no Firestore na coleção 'subscribers'
                await setDoc(doc(db, "subscribers", currentToken), {
                    token: currentToken,
                    date: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }, { merge: true });

                alert("🔔 Notificações ativadas! Você será avisado sobre novos artigos.");
            } else {
                console.warn("Nenhum token de registro disponível.");
            }
        } catch (e) {
            console.error("Erro ao obter o token:", e);
        }
    } else {
        console.warn("Permissão de notificação negada pelo usuário.");
    }
}
