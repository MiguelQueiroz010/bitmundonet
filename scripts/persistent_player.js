/**
 * Persistent SoundCloud Player
 * Manages a fixed player that persists across page navigation
 * and controls other media playback on the page
 */

class PersistentPlayer {
    constructor() {
        this.widget = null;
        this.isPlaying = false;
        this.isVisible = true;
        this.currentPosition = 0;
        this.currentTrack = null;
        
        // SoundCloud playlist URL
        this.playlistUrl = 'https://api.soundcloud.com/playlists/soundcloud%3Aplaylists%3A2097610755';
        
        this.init();
    }

    init() {
        // Load SoundCloud Widget API
        if (!window.SC) {
            const script = document.createElement('script');
            script.src = 'https://w.soundcloud.com/player/api.js';
            script.onload = () => this.setupWidget();
            document.head.appendChild(script);
        } else {
            this.setupWidget();
        }

        // Setup event listeners
        this.setupEventListeners();
        
        // Restore previous state
        this.restoreState();
    }

    setupWidget() {
        const iframe = document.getElementById('sc-widget');
        if (!iframe) return;

        this.widget = window.SC.Widget(iframe);
        
        // Widget event listeners
        this.widget.bind(window.SC.Widget.Events.READY, () => {
            console.log('SoundCloud Widget Ready');
            this.onWidgetReady();
        });

        this.widget.bind(window.SC.Widget.Events.PLAY, () => {
            this.isPlaying = true;
            this.saveState();
            this.pauseOtherMedia();
            this.updatePlayButton();
        });

        this.widget.bind(window.SC.Widget.Events.PAUSE, () => {
            this.isPlaying = false;
            this.saveState();
            this.updatePlayButton();
        });

        this.widget.bind(window.SC.Widget.Events.FINISH, () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });

        // Save position periodically
        setInterval(() => {
            if (this.isPlaying && this.widget) {
                this.widget.getPosition((position) => {
                    this.currentPosition = position;
                    this.saveState();
                });
            }
        }, 5000); // Save every 5 seconds
    }

    onWidgetReady() {
        // Restore playback state if exists
        const savedState = this.getSavedState();
        if (savedState && savedState.wasPlaying) {
            // Seek to saved position
            if (savedState.position > 0) {
                this.widget.seekTo(savedState.position);
            }
            // Auto-play if was playing before
            if (savedState.autoResume) {
                setTimeout(() => this.widget.play(), 500);
            }
        }
    }

    setupEventListeners() {
        // Toggle button
        const toggleBtn = document.getElementById('player-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleVisibility());
        }

        // Custom play/pause button (optional)
        const playBtn = document.getElementById('player-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePlayPause());
        }

        // Detect other media playing
        this.setupMediaDetection();
    }

    setupMediaDetection() {
        // Listen for play events on all video and audio elements
        document.addEventListener('play', (e) => {
            const target = e.target;
            if (target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
                // If SoundCloud is playing, pause the other media
                if (this.isPlaying) {
                    target.pause();
                    this.showNotification('Player do SoundCloud está ativo');
                }
            }
        }, true);

        // Monitor for new media elements added to DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                        this.monitorMediaElement(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    monitorMediaElement(element) {
        element.addEventListener('play', () => {
            if (this.isPlaying) {
                element.pause();
                this.showNotification('Player do SoundCloud está ativo');
            }
        });
    }

    pauseOtherMedia() {
        // Pause all video and audio elements
        const mediaElements = document.querySelectorAll('video, audio');
        mediaElements.forEach(media => {
            if (!media.paused) {
                media.pause();
            }
        });

        // Pause YouTube iframes if any
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            if (iframe.src.includes('youtube.com') || iframe.src.includes('youtu.be')) {
                try {
                    iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                } catch (e) {
                    console.log('Could not pause YouTube video:', e);
                }
            }
        });
    }

    toggleVisibility() {
        const container = document.getElementById('persistent-player-container');
        const toggleBtn = document.getElementById('player-toggle-btn');
        
        if (!container || !toggleBtn) return;

        this.isVisible = !this.isVisible;
        
        if (this.isVisible) {
            container.classList.remove('hidden');
            toggleBtn.innerHTML = '▼';
            toggleBtn.setAttribute('title', 'Ocultar Player');
        } else {
            container.classList.add('hidden');
            toggleBtn.innerHTML = '▲';
            toggleBtn.setAttribute('title', 'Mostrar Player');
        }

        // Save visibility state
        localStorage.setItem('sc_player_visible', this.isVisible);
    }

    togglePlayPause() {
        if (!this.widget) return;

        this.widget.isPaused((isPaused) => {
            if (isPaused) {
                this.widget.play();
            } else {
                this.widget.pause();
            }
        });
    }

    updatePlayButton() {
        const playBtn = document.getElementById('player-play-btn');
        if (!playBtn) return;

        if (this.isPlaying) {
            playBtn.innerHTML = '⏸';
            playBtn.setAttribute('title', 'Pausar');
        } else {
            playBtn.innerHTML = '▶';
            playBtn.setAttribute('title', 'Reproduzir');
        }
    }

    saveState() {
        if (!this.widget) return;

        this.widget.getCurrentSound((sound) => {
            if (sound) {
                this.currentTrack = sound;
            }
        });

        const state = {
            wasPlaying: this.isPlaying,
            position: this.currentPosition,
            track: this.currentTrack,
            timestamp: Date.now(),
            autoResume: false // Don't auto-resume by default
        };

        localStorage.setItem('sc_player_state', JSON.stringify(state));
    }

    getSavedState() {
        const saved = localStorage.getItem('sc_player_state');
        if (!saved) return null;

        try {
            const state = JSON.parse(saved);
            // Only restore if less than 1 hour old
            if (Date.now() - state.timestamp < 3600000) {
                return state;
            }
        } catch (e) {
            console.error('Error parsing saved state:', e);
        }
        return null;
    }

    restoreState() {
        // Restore visibility
        const savedVisibility = localStorage.getItem('sc_player_visible');
        if (savedVisibility !== null) {
            this.isVisible = savedVisibility === 'true';
            const container = document.getElementById('persistent-player-container');
            const toggleBtn = document.getElementById('player-toggle-btn');
            
            if (container && toggleBtn) {
                if (!this.isVisible) {
                    container.classList.add('hidden');
                    toggleBtn.innerHTML = '▲';
                    toggleBtn.setAttribute('title', 'Mostrar Player');
                }
            }
        }
    }

    showNotification(message) {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = 'player-toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.persistentPlayer = new PersistentPlayer();
    });
} else {
    window.persistentPlayer = new PersistentPlayer();
}
