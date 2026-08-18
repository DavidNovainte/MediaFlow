class TimelineTrackAudioControls {
    static decorateLabel(manager, label, trackId, type, name, iconClass) {
        if (!label || !trackId) return;

        const safeName = name || '';
        const safeIcon = iconClass || (type === 'video' ? 'fa-video' : 'fa-microphone-lines');
        label.dataset.trackId = trackId;
        label.dataset.trackType = type;

        let title = label.querySelector('.timeline-track-title');
        if (!title) {
            label.innerHTML = '';

            title = document.createElement('div');
            title.className = 'timeline-track-title';
            title.innerHTML = `
                <i class="fa-solid ${safeIcon}" data-role="track-icon"></i>
                <span data-role="track-name"></span>
            `;
            label.appendChild(title);
        }

        const icon = label.querySelector('[data-role="track-icon"]');
        const nameEl = label.querySelector('[data-role="track-name"]');
        if (icon) {
            icon.className = `fa-solid ${safeIcon}`;
        }
        if (nameEl) {
            nameEl.textContent = safeName;
        }

        let controls = label.querySelector('.timeline-track-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'timeline-track-controls';
            label.appendChild(controls);
        }

        if (type === 'audio') {
            let muteBtn = controls.querySelector('.timeline-track-mute-btn');
            if (!muteBtn) {
                muteBtn = document.createElement('button');
                muteBtn.type = 'button';
                muteBtn.className = 'timeline-track-mute-btn';
                muteBtn.setAttribute('data-role', 'track-mute');
                muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                muteBtn.addEventListener('mousedown', (event) => {
                    event.stopPropagation();
                });
                muteBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleTrackMute(manager, trackId);
                });
                controls.appendChild(muteBtn);
            }
        } else {
            controls.innerHTML = '';
        }

        this.refreshTrackState(manager, trackId);
    }

    static toggleTrackMute(manager, trackId) {
        if (!manager?.tracks?.[trackId]) return;

        const oldState = manager.captureState?.();
        const execute = () => {
            const currentTrack = manager?.tracks?.[trackId];
            if (!currentTrack) return;
            currentTrack.muted = !currentTrack.muted;
            this.refreshTrackState(manager, trackId);
            this.syncPlayback(manager);
        };
        const undo = () => {
            if (oldState && manager.applyState) {
                manager.applyState(oldState);
                this.syncPlayback(manager);
            }
        };

        if (manager.app?.history?.execute && oldState) {
            manager.app.history.execute({ execute, undo });
        } else {
            execute();
        }
    }

    static syncPlayback(manager) {
        const timelineTime = Number(manager?.currentTime || 0);
        const preview = manager?.app?.previewHandler;
        const snapshot = preview?.getPlaybackSnapshot?.(timelineTime) || null;
        const isPlaying = window.TimelineNavigation?.isTimelinePlaybackActive?.(manager) || false;

        manager?.app?.audioMixer?.sync?.(timelineTime, isPlaying, snapshot);
        manager?.syncAudioLevels?.(timelineTime, snapshot);
    }

    static refreshTrackState(manager, trackId) {
        const track = manager?.tracks?.[trackId];
        const row = document.getElementById(`track-${trackId}`);
        const label = row?.querySelector('.timeline-sidebar-label');
        const muteBtn = label?.querySelector('[data-role="track-mute"]');
        const isMuted = !!track?.muted;

        row?.classList.toggle('track-muted', isMuted);
        label?.classList.toggle('track-muted', isMuted);

        if (muteBtn) {
            muteBtn.classList.toggle('active', isMuted);
            muteBtn.innerHTML = isMuted
                ? '<i class="fa-solid fa-volume-xmark"></i>'
                : '<i class="fa-solid fa-volume-high"></i>';
            muteBtn.title = isMuted
                ? (window.i18n?.t('creator.timeline.unmuteTrack') || 'Unmute track')
                : (window.i18n?.t('creator.timeline.muteTrack') || 'Mute track');
            muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
        }
    }

    static refreshAll(manager) {
        const trackIds = Object.keys(manager?.tracks || {});
        trackIds.forEach((trackId) => this.refreshTrackState(manager, trackId));
    }
}

window.TimelineTrackAudioControls = TimelineTrackAudioControls;
