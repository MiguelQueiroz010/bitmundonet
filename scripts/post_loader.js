import { initReactions } from './reactions_manager.js';
import { initComments } from './comments_loader.js';

/**
 * Hydrates the pre-rendered /posts/<slug>.html pages: reactions + comments
 * live in Firestore and are keyed by the article id (same as on the homepage).
 */
function start() {
    const articleId = document.body && document.body.getAttribute('data-article-id');
    if (!articleId) return;
    initReactions(articleId, 'post-reactions');
    initComments(articleId, 'comments-container', 'comment-form');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
