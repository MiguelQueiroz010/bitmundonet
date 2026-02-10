/**
 * Script de migração: converte documentos em `admin_config` com IDs gerados
 * para documentos com ID = UID do usuário Firebase, usando o email vinculado.
 *
 * Uso:
 * 1. Gere uma service account JSON no Firebase Console (Project Settings -> Service accounts).
 * 2. Salve o arquivo como `serviceAccountKey.json` neste diretório ou informe o caminho via env var `GOOGLE_APPLICATION_CREDENTIALS`.
 * 3. Instale dependências: `npm install firebase-admin` (no diretório deste script).
 * 4. Rode: `node migrate_admins.js`.
 *
 * O script fará:
 * - Ler todos os docs em `admin_config`.
 * - Para cada doc que contenha `linkedGoogleEmail`, tenta obter o UID via Admin SDK.
 * - Cria/atualiza um doc `admin_config/{uid}` com os dados originais (merge).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
    console.error('Service account JSON não encontrado em', keyPath);
    console.error('Defina GOOGLE_APPLICATION_CREDENTIALS ou coloque serviceAccountKey.json em tools/');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(keyPath))
});

const db = admin.firestore();

async function migrate() {
    console.log('Lendo documentos em admin_config...');
    const snap = await db.collection('admin_config').get();
    console.log(`Encontrados ${snap.size} documentos.`);

    for (const doc of snap.docs) {
        const data = doc.data();
        const email = data.linkedGoogleEmail || data.linkedGoogleEmailAddress || data.linkedGoogleAccount || null;
        if (!email) {
            console.warn(`Documento ${doc.id} não possui linkedGoogleEmail — pulando.`);
            continue;
        }

        try {
            const user = await admin.auth().getUserByEmail(email);
            const uid = user.uid;
            console.log(`Mapeando email ${email} -> uid ${uid} (orig doc ${doc.id})`);

            // Merge data into admin_config/{uid}
            const targetRef = db.collection('admin_config').doc(uid);
            await targetRef.set(data, { merge: true });
            console.log(`Documento admin_config/${uid} criado/atualizado.`);
        } catch (err) {
            console.error(`Falha ao resolver email ${email}:`, err.message);
        }
    }

    console.log('Migração concluída. Verifique se os documentos foram criados corretamente.');
}

migrate().catch(e => { console.error('Erro:', e); process.exit(1); });
