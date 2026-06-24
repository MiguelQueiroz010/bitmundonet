/* Naruto Ultimate Ninja SWF Theme Scripts */

document.addEventListener("DOMContentLoaded", () => {
    
    // --- SOUND EFFECTS LOGIC ---
    const hoverAudio = new Audio();
    // hoverAudio.src = "/media/sounds/shuriken_swish.mp3"; 
    hoverAudio.volume = 0.4;

    const clickAudio = new Audio();
    // clickAudio.src = "/media/sounds/kunai_hit.mp3"; 
    clickAudio.volume = 0.6;

    const playSound = (audioObj) => {
        if(audioObj.src && audioObj.src.trim() !== "" && audioObj.readyState >= 2) {
            audioObj.currentTime = 0;
            audioObj.play().catch(e => console.log("Som bloqueado pelo navegador.", e));
        }
    };

    const interactiveElements = document.querySelectorAll('.swf-btn, .roster-slot, .un-cover, .jutsu-card');
    
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => playSound(hoverAudio));
        el.addEventListener('click', () => playSound(clickAudio));
    });

    // --- SPA SCENE SWITCHING ---
    const navBtns = document.querySelectorAll('.swf-btn[data-target]');
    const scenes = document.querySelectorAll('.swf-scene');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetId = btn.getAttribute('data-target');
            scenes.forEach(scene => scene.classList.remove('active'));

            const targetScene = document.getElementById(targetId);
            if (targetScene) targetScene.classList.add('active');
        });
    });

    // --- ROSTER (SPRITE) LOGIC ---
    const rosterSlots = document.querySelectorAll('.roster-slot');
    const rosterName = document.querySelector('.roster-char-name');
    const rosterDesc = document.querySelector('.roster-char-desc');
    const rosterSprite = document.querySelector('.roster-char-sprite');

    rosterSlots.forEach(slot => {
        slot.addEventListener('click', () => {
            rosterSlots.forEach(s => s.classList.remove('selected'));
            slot.classList.add('selected');

            const name = slot.getAttribute('data-name') || "???";
            const desc = slot.getAttribute('data-desc') || "Sem informações do pergaminho.";
            const spriteUrl = slot.getAttribute('data-sprite');

            if(rosterName) rosterName.textContent = name;
            if(rosterDesc) rosterDesc.textContent = desc;
            
            if(rosterSprite && spriteUrl) {
                rosterSprite.style.backgroundImage = `url('${spriteUrl}')`;
            } else if (rosterSprite) {
                rosterSprite.style.backgroundImage = 'none';
            }
        });
    });

    // --- JUTSU MODAL VIDEO SYSTEM ---
    const jutsuCards = document.querySelectorAll('.jutsu-card');
    const modal = document.getElementById('swf-video-modal');
    const modalVideo = document.getElementById('modal-video-player');
    const btnCloseModal = document.getElementById('close-modal');

    if (modal && modalVideo && btnCloseModal) {
        // Open Modal
        jutsuCards.forEach(card => {
            card.addEventListener('click', () => {
                const videoSrc = card.getAttribute('data-video');
                if (videoSrc) {
                    modalVideo.src = videoSrc;
                    modal.classList.add('active');
                    modalVideo.play().catch(e => console.log("Erro auto-play:", e));
                }
            });
        });

        // Close Modal
        const closeModal = () => {
            modal.classList.remove('active');
            modalVideo.pause();
            modalVideo.currentTime = 0;
            modalVideo.src = "";
        };

        btnCloseModal.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(); // form of overlay click
        });
    }
});
