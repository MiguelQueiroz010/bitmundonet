const admin = require('firebase-admin');

// Authenticate using the Service Account Secret
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountKey) {
    console.error("ERRO: FIREBASE_SERVICE_ACCOUNT_KEY não está definido nos secrets.");
    process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountKey);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function sendPush() {
    const title = process.env.TITLE || "Novo Artigo!";
    const body = process.env.BODY || "Venha conferir a novidade na BitMundo.";

    console.log(`Buscando assinantes para enviar: "${title}"...`);
    
    try {
        const snapshot = await db.collection('subscribers').get();
        if (snapshot.empty) {
            console.log("Nenhum assinante encontrado.");
            return;
        }

        const tokens = [];
        snapshot.forEach(doc => {
            if (doc.data().token) {
                tokens.push(doc.data().token);
            }
        });

        console.log(`Encontrados ${tokens.length} assinantes. Enviando notificações...`);

        const message = {
            notification: {
                title: title,
                body: body,
            },
            tokens: tokens,
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log(`${response.successCount} mensagens enviadas com sucesso e ${response.failureCount} falharam.`);
        
        // Limpa tokens falhos (ex: permissão revogada pelo usuário)
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                }
            });
            console.log('Tokens que falharam e serão removidos:', failedTokens);
            
            const batch = db.batch();
            failedTokens.forEach(token => {
                const ref = db.collection('subscribers').doc(token);
                batch.delete(ref);
            });
            await batch.commit();
            console.log("Tokens inválidos limpos do banco de dados.");
        }
    } catch (e) {
        console.error("Erro ao enviar push:", e);
        process.exit(1);
    }
}

sendPush();
