class CreatorAudioDemucsResults {
    constructor(handler) {
        this.handler = handler;
    }

    async extractStemWaveform(manager, trackId, filePath, segment) {
        if (!manager?.tracks?.[trackId] || !filePath || !window.mediaflow?.video?.extractAudio) {
            return;
        }

        try {
            const result = await window.mediaflow.video.extractAudio({
                input: filePath,
                samplesPerSec: 240
            });

            if (result?.success && Array.isArray(result.peaks)) {
                manager.tracks[trackId].peaks = result.peaks;
                manager.tracks[trackId].waveformData = result;
                manager.tracks[trackId].sourceDuration = result.duration || ((segment.end - segment.start) * (segment.speed || 1.0));
            }
        } catch (error) {
            console.warn(`[DemucsResults] Waveform extraction failed for ${trackId}:`, error);
        }
    }

    getOrderedStemEntries(files) {
        const preferredOrder = ['vocals', 'no_vocals', 'drums', 'bass', 'other'];
        const entries = Object.entries(files || {});
        const ordered = [];
        const used = new Set();

        preferredOrder.forEach((name) => {
            const match = entries.find(([key]) => key === name);
            if (match) {
                ordered.push(match);
                used.add(name);
            }
        });

        entries.forEach((entry) => {
            if (!used.has(entry[0])) {
                ordered.push(entry);
            }
        });

        return ordered;
    }

    hasTrackConflict(track, start, end, ignoredSegments) {
        if (!track?.segments?.length) return false;
        return track.segments.some((segment) => {
            if (ignoredSegments.has(segment)) return false;
            return segment.start < end && segment.end > start;
        });
    }

    findPlacementStartTrack(manager, baseTrackNumber, trackCount, selectedContext) {
        const ignoredSegments = new Set((selectedContext.replaceSegments || []).map((item) => item.segment));
        const { start, end } = selectedContext.segment;

        for (let startTrackNumber = Math.max(1, baseTrackNumber); startTrackNumber < 200; startTrackNumber++) {
            let fits = true;

            for (let offset = 0; offset < trackCount; offset++) {
                const trackId = `a${startTrackNumber + offset}`;
                const track = manager.tracks[trackId];
                if (this.hasTrackConflict(track, start, end, ignoredSegments)) {
                    fits = false;
                    break;
                }
            }

            if (fits) {
                return startTrackNumber;
            }
        }

        return Math.max(1, baseTrackNumber);
    }

    async applyResultsToTimeline(files, selectedContext) {
        const manager = selectedContext?.manager;
        if (!manager || !files) return false;

        const orderedEntries = this.getOrderedStemEntries(files);
        if (!orderedEntries.length) return false;

        const oldState = manager.captureState();
        const actionId = `demucs_${Date.now()}`;

        const apply = async () => {
            const startTrackNumber = this.findPlacementStartTrack(
                manager,
                selectedContext.baseTrackNumber,
                orderedEntries.length,
                selectedContext
            );
            const insertedStemTracks = [];

            for (let i = 0; i < orderedEntries.length; i++) {
                manager.ensureTrackNumber('audio', startTrackNumber + i);
            }

            const removalsByTrack = new Map();
            (selectedContext.replaceSegments || []).forEach((item) => {
                if (!removalsByTrack.has(item.trackId)) {
                    removalsByTrack.set(item.trackId, []);
                }
                removalsByTrack.get(item.trackId).push(item.index);
            });

            removalsByTrack.forEach((indexes, trackId) => {
                const track = manager.tracks[trackId];
                if (!track?.segments) return;
                indexes.sort((a, b) => b - a).forEach((index) => {
                    track.segments.splice(index, 1);
                });
            });

            orderedEntries.forEach(([stemName, filePath], offset) => {
                const trackId = `a${startTrackNumber + offset}`;
                const track = manager.tracks[trackId];
                if (!track) return;

                const stemFile = this.handler.app.createMediaFileRef(filePath, selectedContext.segment.file || this.handler.app.audioFile || this.handler.app.videoFile);
                const insertedSegment = {
                    start: selectedContext.segment.start,
                    end: selectedContext.segment.end,
                    sourceStart: 0,
                    speed: selectedContext.segment.speed || 1.0,
                    volume: selectedContext.segment.volume !== undefined ? selectedContext.segment.volume : 1.0,
                    groupId: selectedContext.groupId,
                    file: stemFile,
                    demucsStem: stemName,
                    demucsImportId: actionId
                };

                track.segments.push(insertedSegment);
                insertedStemTracks.push({ trackId, filePath, segment: insertedSegment });
            });

            manager.normalizeTrackSegments(true);

            await Promise.all(
                insertedStemTracks.map(({ trackId, filePath, segment }) =>
                    this.extractStemWaveform(manager, trackId, filePath, segment)
                )
            );

            const firstTrackId = `a${startTrackNumber}`;
            const firstTrack = manager.tracks[firstTrackId];
            const firstIndex = firstTrack?.segments?.findIndex((segment) => segment.demucsImportId === actionId) ?? -1;

            manager.selectedTrackId = firstTrackId;
            manager.selectedSegmentIndex = firstIndex;

            if (this.handler.app.audioMixer?.audioTrackPlayers) {
                Object.keys(this.handler.app.audioMixer.audioTrackPlayers).forEach((trackId) => {
                    this.handler.app.audioMixer.unregisterTrack(trackId);
                });
            }

            manager.renderAll();
            manager.updatePlayhead(manager.currentTime);
            manager.renderVideoTracks();
        };

        try {
            await apply();
            const newState = manager.captureState();
            this.handler.app.history.push({
                execute: () => manager.applyState(newState),
                undo: () => manager.applyState(oldState)
            });
            window.app?.showToast(
                window.i18n?.t('creator.demucs.appliedToTimeline') || 'Demucs tracks applied to timeline',
                'success'
            );
            return true;
        } catch (error) {
            manager.applyState(oldState);
            console.error('[DemucsResults] Apply to timeline failed:', error);
            window.app?.showToast(
                (window.i18n?.t('creator.demucs.applyTimelineFailed') || 'Failed to apply Demucs tracks to timeline') + ': ' + error.message,
                'error'
            );
            return false;
        }
    }

    renderDemucsResults() {
        const handler = this.handler;
        if (!handler.currentDemucsFiles) return;

        const resultList = document.getElementById('demucs-result-list');
        const tracksArea = document.getElementById('demucs-tracks');
        const btnOpenFolder = document.getElementById('btn-open-demucs-folder');
        if (!resultList || !tracksArea) return;

        resultList.classList.remove('hidden');
        tracksArea.innerHTML = '';

        if (btnOpenFolder) {
            const rawSaveText = window.i18n?.t('creator.demucs.saveAll') || 'Save All';
            const cleanSaveText = rawSaveText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/gu, '').trim();
            btnOpenFolder.innerHTML = `<i class="fa-solid fa-cloud-arrow-down" style="font-size:11px;"></i><span>${cleanSaveText}</span>`;
            btnOpenFolder.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                background: linear-gradient(135deg, #3d6eb8 0%, #1a4b96 100%);
                border: none;
                cursor: pointer;
                padding: 3px 8px;
                border-radius: 4px;
                width: auto;
                max-width: fit-content;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 2px 6px rgba(61, 110, 184, 0.2);
            `;
            btnOpenFolder.onmouseenter = () => {
                btnOpenFolder.style.transform = 'translateY(-2px)';
                btnOpenFolder.style.boxShadow = '0 6px 16px rgba(61, 110, 184, 0.4)';
                btnOpenFolder.style.filter = 'brightness(1.1)';
            };
            btnOpenFolder.onmouseleave = () => {
                btnOpenFolder.style.transform = 'translateY(0)';
                btnOpenFolder.style.boxShadow = '0 4px 12px rgba(61, 110, 184, 0.3)';
                btnOpenFolder.style.filter = 'brightness(1)';
            };
            btnOpenFolder.onclick = () => this.downloadAllDemucs();
        }

        const trackThemes = {
            vocals: { color: '#6b9ad4', icon: 'fa-microphone-lines' },
            no_vocals: { color: '#6b9ad4', icon: 'fa-compact-disc' },
            drums: { color: '#fb923c', icon: 'fa-drum' },
            bass: { color: '#34d399', icon: 'fa-guitar' },
            other: { color: '#94a3b8', icon: 'fa-sliders' }
        };

        Object.entries(handler.currentDemucsFiles).forEach(([name, filePath]) => {
            const trackEl = document.createElement('div');
            trackEl.className = 'demucs-track-item';

            const fileName = filePath.split(/[/\\]/).pop();
            const audioSrc = window.urlUtils ? window.urlUtils.pathToMediaUrl(filePath) : filePath;

            let themeKey = 'other';
            if (name.includes('no_vocals') || fileName.includes('no_vocals')) themeKey = 'no_vocals';
            else if (name.includes('vocals') || fileName.includes('vocals')) themeKey = 'vocals';
            else if (name.includes('drums')) themeKey = 'drums';
            else if (name.includes('bass')) themeKey = 'bass';
            const theme = trackThemes[themeKey];

            const nameMap = {
                no_vocals: window.i18n?.t('creator.demucs.tracks.instrumental') || 'Instrumental',
                vocals: window.i18n?.t('creator.demucs.tracks.vocals') || 'Vocals',
                drums: window.i18n?.t('creator.demucs.tracks.drums') || 'Drums',
                bass: window.i18n?.t('creator.demucs.tracks.bass') || 'Bass',
                other: window.i18n?.t('creator.demucs.tracks.other') || 'Other'
            };
            const friendlyName = nameMap[themeKey];

            trackEl.style.cssText = `
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-left: 4px solid ${theme.color};
                border-radius: 12px;
                padding: 12px 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: all 0.2s ease;
                margin-bottom: 8px;
                backdrop-filter: blur(8px);
            `;
            trackEl.onmouseenter = () => {
                trackEl.style.background = 'rgba(255, 255, 255, 0.06)';
                trackEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                trackEl.style.transform = 'translateX(4px)';
            };
            trackEl.onmouseleave = () => {
                trackEl.style.background = 'rgba(255, 255, 255, 0.03)';
                trackEl.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                trackEl.style.transform = 'translateX(0)';
            };

            trackEl.innerHTML = `
                <div style="width:36px;height:36px;border-radius:10px;flex-shrink:0;background:${theme.color}22;display:flex;align-items:center;justify-content:center;box-shadow: inset 0 0 10px ${theme.color}11;">
                    <i class="fa-solid ${theme.icon}" style="font-size:14px;color:${theme.color};"></i>
                </div>
                <div style="flex:1;min-width:0;line-height:1.4;">
                    <div style="font-weight:600;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${friendlyName}</div>
                    <div style="font-size:10px;margin-top:2px;color:var(--text-secondary);opacity:0.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace;">${fileName}</div>
                </div>
                <audio id="audio-preview-${name}" src="${audioSrc}" style="display:none;"></audio>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button class="btn-play-track" data-track="${name}" title="${window.i18n?.t('common.actions.play') || 'Play'}" style="width:34px;height:34px;border-radius:50%;border:none;background:${theme.color}22;color:${theme.color};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all 0.2s;font-size:12px;">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="btn-dl-track" data-track="${name}" title="${window.i18n?.t('creator.demucs.saveTrack') || 'Save'}" style="width:34px;height:34px;border-radius:50%;border:none;background:var(--fill-muted);color:rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all 0.2s;font-size:12px;">
                        <i class="fa-solid fa-download"></i>
                    </button>
                </div>
            `;

            const playBtn = trackEl.querySelector('.btn-play-track');
            if (playBtn) {
                playBtn.onmouseenter = () => {
                    playBtn.style.background = `${theme.color}44`;
                    playBtn.style.transform = 'scale(1.1)';
                };
                playBtn.onmouseleave = () => {
                    playBtn.style.background = `${theme.color}22`;
                    playBtn.style.transform = 'scale(1)';
                };
                playBtn.onclick = () => this.toggleTrackPlay(name, theme.color);
            }

            const dlBtn = trackEl.querySelector('.btn-dl-track');
            if (dlBtn) {
                dlBtn.onmouseenter = () => {
                    dlBtn.style.background = 'var(--border-color)';
                    dlBtn.style.color = 'var(--text-primary)';
                };
                dlBtn.onmouseleave = () => {
                    dlBtn.style.background = 'rgba(255,255,255,0.06)';
                    dlBtn.style.color = 'var(--text-secondary)';
                };
                dlBtn.onclick = () => this.downloadSingleDemucs(name);
            }

            tracksArea.appendChild(trackEl);
        });
    }

    toggleTrackPlay(name, themeColor = '#6b9ad4') {
        const audio = document.getElementById(`audio-preview-${name}`);
        const btn = document.querySelector(`.btn-play-track[data-track="${name}"]`);
        if (!audio || !btn) return;

        document.querySelectorAll('audio').forEach((el) => {
            if (el.id !== `audio-preview-${name}` && !el.paused) {
                el.pause();
                const otherTrackName = el.id.replace('audio-preview-', '');
                const otherBtn = document.querySelector(`.btn-play-track[data-track="${otherTrackName}"]`);
                if (otherBtn) {
                    otherBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                    otherBtn.style.background = `${otherBtn.dataset.color || themeColor}22`;
                }
            }
        });

        if (audio.paused) {
            btn.dataset.color = themeColor;
            audio.play().then(() => {
                btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                btn.style.background = `${themeColor}44`;
            }).catch((error) => {
                console.error('[AudioHandler] Play track failed:', error);
                window.app?.showToast(window.i18n?.t('creator.toasts.playFail') || 'Failed to play track, file may be unavailable', 'error');
            });
        } else {
            audio.pause();
            btn.innerHTML = '<i class="fa-solid fa-play"></i>';
            btn.style.background = `${themeColor}22`;
        }

        audio.onended = () => {
            btn.innerHTML = '<i class="fa-solid fa-play"></i>';
            btn.style.background = `${themeColor}22`;
        };
    }

    async downloadAllDemucs() {
        const handler = this.handler;
        if (!handler.currentDemucsFiles) return;

        const targetDir = await window.mediaflow?.dialog.selectFolder?.();
        if (!targetDir) return;

        const result = await window.mediaflow?.audio?.demucsSave?.({
            files: handler.currentDemucsFiles,
            targetDir
        });

        if (result?.success) {
            window.app?.showToast(window.i18n?.t('creator.demucs.saveAllSuccess') || 'All tracks saved successfully', 'success', {
                buttons: [{
                    text: window.i18n?.t('creator.demucs.openFolder') || 'Open Folder',
                    onClick: () => window.mediaflow?.shell.openPath(targetDir)
                }]
            });
        } else if (result?.error) {
            window.app?.showToast((window.i18n?.t('creator.demucs.saveFail') || 'Save failed') + ': ' + result.error, 'error');
        }
    }

    async downloadSingleDemucs(name) {
        const handler = this.handler;
        if (!handler.currentDemucsFiles || !handler.currentDemucsFiles[name]) return;

        const targetDir = await window.mediaflow?.dialog.selectFolder?.();
        if (!targetDir) return;

        const result = await window.mediaflow?.audio?.demucsSave?.({
            files: { [name]: handler.currentDemucsFiles[name] },
            targetDir
        });

        if (result?.success) {
            window.app?.showToast(window.i18n?.t('creator.demucs.saveTrackSuccess') || 'Track saved successfully', 'success', {
                buttons: [{
                    text: window.i18n?.t('creator.demucs.openFolder') || 'Open Folder',
                    onClick: () => window.mediaflow?.shell.openPath(targetDir)
                }]
            });
        } else if (result?.error) {
            window.app?.showToast((window.i18n?.t('creator.demucs.saveFail') || 'Save failed') + ': ' + result.error, 'error');
        }
    }
}

window.CreatorAudioDemucsResults = CreatorAudioDemucsResults;
