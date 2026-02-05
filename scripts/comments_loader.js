import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Get Project ID from URL
const params = new URLSearchParams(window.location.search);
const projectId = params.get('id');

const commentsContainer = document.getElementById('comments-container');
const commentForm = document.getElementById('comment-form');

if (projectId && commentsContainer) {
    loadComments();
}

/**
 * Real-time listener for comments
 */
function loadComments() {
    const q = query(
        collection(db, "comments"),
        where("projectId", "==", projectId),
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            commentsContainer.innerHTML = '<p style="color: rgba(255,255,255,0.3); text-align: center;">Nenhum comentário ainda. Seja o primeiro!</p>';
            return;
        }

        commentsContainer.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'Agora mesmo';

            return `
                <div class="comment-card">
                    <div class="comment-header">
                        <span class="comment-author">${data.user}</span>
                        <span class="comment-date">${date}</span>
                    </div>
                    <div class="comment-body">
                        ${data.text}
                    </div>
                </div>
            `;
        }).join('');
    });
}

/**
 * Handle new comment submission
 */
if (commentForm) {
    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userInput = document.getElementById('comment-user');
        const textInput = document.getElementById('comment-text');
        const submitBtn = commentForm.querySelector('.comment-submit-btn');

        const commentData = {
            projectId: projectId,
            user: userInput.value,
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
            alert("Erro ao enviar comentário. Verifique sua conexão ou se o Firebase está configurado.");
        } finally {
            submitBtn.disabled = false;
        }
    });
}
