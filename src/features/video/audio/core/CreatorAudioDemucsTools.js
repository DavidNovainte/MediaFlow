class CreatorAudioDemucsTools {
    constructor(handler) {
        this.handler = handler;
        this.resultsTools = new window.CreatorAudioDemucsResults(handler);
    }

    setupDemucsListeners() {
        document.getElementById('btn-install-demucs')?.addEventListener('click', async () => {
            try {
                await this.installDemucs();
            } catch (error) {
                console.error('[AudioProcessor] Install error:', error);
            }
        });
        document.getElementById('btn-demucs-separate')?.addEventListener('click', async () => {
            try {
                await this.separateAudio();
            } catch (error) {
                console.error('[AudioProcessor] Separate click error:', error);
            }
        });
    }

    async setupDemucs() {
        await this.checkDemucsStatus();
        this.setupDemucsListeners();
    }

    async checkDemucsStatus() {
        const handler = this.handler;
        const statusEl = document.getElementById('demucs-status');
        const installArea = document.getElementById('demucs-install-area');
        const readyArea = document.getElementById('demucs-ready-area');
        const separateBtn = document.getElementById('btn-demucs-separate');

        try {
            const result = await window.mediaflow?.audio?.demucsCheck?.();
            if (result?.available) {
                handler.demucsAvailable = true;
                if (statusEl) {
                    statusEl.innerHTML = `<span class="status-text" style="color: #10b981;">${window.i18n?.t('creator.demucs.installedMsg') || 'Installed'}</span>`;
                }
                installArea?.classList.add('hidden');
                readyArea?.classList.remove('hidden');
                if (separateBtn) separateBtn.disabled = false;
            } else {
                handler.demucsAvailable = false;
                if (statusEl) {
                    statusEl.innerHTML = `<span class="status-text" style="color: #f59e0b;">${window.i18n?.t('creator.demucs.notReadyMsg') || 'Not ready'}</span>`;
                }
                readyArea?.classList.add('hidden');
                installArea?.classList.remove('hidden');
                if (separateBtn) separateBtn.disabled = true;
            }
            return result;
        } catch (error) {
            console.error(error);
            handler.demucsAvailable = false;
            if (statusEl) {
                statusEl.innerHTML = `<span class="status-text" style="color: #f59e0b;">${window.i18n?.t('creator.demucs.notReadyMsg') || 'Not ready'}</span>`;
            }
            readyArea?.classList.add('hidden');
            installArea?.classList.remove('hidden');
            if (separateBtn) separateBtn.disabled = true;
            return { available: false, error: error.message };
        }
    }

    async installDemucs() {
        const installBtn = document.getElementById('btn-install-demucs');
        if (!installBtn) return;

        installBtn.disabled = true;
        installBtn.textContent = window.i18n?.t('creator.demucs.installing') || 'Installing...';

        try {
            const result = await window.mediaflow?.audio?.demucsInstall?.();
            if (result?.success) {
                const status = await this.checkDemucsStatus();
                if (status?.available) {
                    window.app?.showToast(window.i18n?.t('creator.toasts.toastInstalled') || 'Installed!', 'success');
                } else {
                    throw new Error(
                        status?.error
                        || status?.details
                        || window.i18n?.t('creator.demucs.notReadyMsg')
                        || 'Demucs not ready'
                    );
                }
            } else {
                throw new Error(result?.error);
            }
        } catch (error) {
            window.app?.showToast(error.message, 'error');
        } finally {
            installBtn.disabled = false;
            installBtn.textContent = window.i18n?.t('creator.demucs.installBtn') || 'Install Demucs';
        }
    }

    normalizeDemucsError(error) {
        const rawMessage = error?.message || String(error || '');
        if (/libtorchcodec|torchcodec|Could not load this library/i.test(rawMessage)) {
            return window.i18n?.t('creator.demucs.runtimeDependencyError')
                || 'Demucs runtime dependency failed to load. Please reinstall the Demucs runtime.';
        }
        return rawMessage;
    }

    getTrackNumber(trackId) {
        return this.handler.app.timelineManager?.parseTrackNumber
            ? this.handler.app.timelineManager.parseTrackNumber(trackId)
            : (parseInt(String(trackId || '').slice(1), 10) || 1);
    }

    buildSegmentContext(manager, trackId, index, segment) {
        if (!manager || !trackId?.startsWith('a') || index < 0 || !segment) {
            return null;
        }

        const sourcePath = this.handler.app.getMediaPath(segment.file || this.handler.app.audioFile || this.handler.app.videoFile);
        if (!sourcePath) return null;

        const replaceSegments = [];
        Object.entries(manager.tracks || {}).forEach(([candidateTrackId, candidateTrack]) => {
            if (!candidateTrackId.startsWith('a')) return;
            candidateTrack.segments?.forEach((candidateSegment, candidateIndex) => {
                const isReplacementTarget = segment.groupId
                    ? candidateSegment.groupId === segment.groupId
                    : (candidateTrackId === trackId && candidateIndex === index);
                if (isReplacementTarget) {
                    replaceSegments.push({ trackId: candidateTrackId, index: candidateIndex, segment: candidateSegment });
                }
            });
        });

        return {
            manager,
            trackId,
            baseTrackNumber: this.getTrackNumber(trackId),
            index,
            segment,
            replaceSegments,
            groupId: segment.groupId || `group_demucs_${Date.now()}`,
            sourcePath,
            sourceStart: segment.sourceStart || 0,
            sourceEnd: (segment.sourceStart || 0) + ((segment.end - segment.start) * (segment.speed || 1.0))
        };
    }

    getDirectSelectionContext(manager, trackId, index) {
        if (!manager || index < 0 || !trackId) return null;

        const track = manager.tracks?.[trackId];
        const segment = track?.segments?.[index];
        if (!segment) return null;

        if (trackId.startsWith('a')) {
            return this.buildSegmentContext(manager, trackId, index, segment);
        }

        if (!trackId.startsWith('v')) {
            return null;
        }

        const audioTrackIds = Object.keys(manager.tracks || {})
            .filter((candidateTrackId) => candidateTrackId.startsWith('a'))
            .sort((a, b) => this.getTrackNumber(a) - this.getTrackNumber(b));

        for (const audioTrackId of audioTrackIds) {
            const audioTrack = manager.tracks[audioTrackId];
            if (!audioTrack?.segments?.length) continue;

            const linkedIndex = audioTrack.segments.findIndex((candidateSegment) => {
                if (segment.groupId && candidateSegment.groupId === segment.groupId) {
                    return true;
                }
                return candidateSegment.start === segment.start
                    && candidateSegment.end === segment.end;
            });

            if (linkedIndex >= 0) {
                return this.buildSegmentContext(
                    manager,
                    audioTrackId,
                    linkedIndex,
                    audioTrack.segments[linkedIndex]
                );
            }
        }

        return null;
    }

    getPlayheadSelectionContext(manager) {
        if (!manager || !window.TimelineSelectionResolver) {
            return null;
        }

        const currentTime = manager.currentTime ?? 0;
        const selectedTrackId = manager.selectedTrackId;
        const activeAudioSegments = window.TimelineSelectionResolver.getActiveAudioSegments(manager.tracks, currentTime) || [];

        if (selectedTrackId?.startsWith('a')) {
            const selectedActive = activeAudioSegments.find((entry) => entry.trackId === selectedTrackId && entry.activeSeg);
            if (selectedActive) {
                const activeIndex = manager.tracks[selectedTrackId]?.segments?.findIndex((segment) => segment === selectedActive.activeSeg) ?? -1;
                if (activeIndex >= 0) {
                    return this.buildSegmentContext(manager, selectedTrackId, activeIndex, selectedActive.activeSeg);
                }
            }
        }

        const activeVideo = window.TimelineSelectionResolver.getActiveVideoSegment(manager.tracks, currentTime);
        if (activeVideo?.activeSeg) {
            const linkedFromVideo = this.getDirectSelectionContext(
                manager,
                activeVideo.activeTrackId,
                manager.tracks[activeVideo.activeTrackId]?.segments?.findIndex((segment) => segment === activeVideo.activeSeg) ?? -1
            );
            if (linkedFromVideo) {
                return linkedFromVideo;
            }
        }

        const firstActiveAudio = activeAudioSegments.find((entry) => entry.activeSeg);
        if (!firstActiveAudio) {
            return null;
        }

        const activeIndex = manager.tracks[firstActiveAudio.trackId]?.segments?.findIndex((segment) => segment === firstActiveAudio.activeSeg) ?? -1;
        if (activeIndex < 0) {
            return null;
        }

        return this.buildSegmentContext(
            manager,
            firstActiveAudio.trackId,
            activeIndex,
            firstActiveAudio.activeSeg
        );
    }

    getSelectedAudioSegmentContext() {
        const manager = this.handler.app.timelineManager;
        if (!manager) return null;

        const selectedTrackId = manager.selectedTrackId;
        const selectedIndex = manager.selectedSegmentIndex ?? -1;

        return this.getDirectSelectionContext(manager, selectedTrackId, selectedIndex)
            || this.getPlayheadSelectionContext(manager);
    }

    async separateAudio(options = {}) {
        const handler = this.handler;
        if (handler.app.isProcessing) return;
        if (!handler.demucsAvailable) {
            window.app?.showToast(window.i18n?.t('creator.demucs.notInstalledErr') || 'Demucs is not installed', 'error');
            return;
        }

        const twoStems = (options.twoStems !== undefined)
            ? options.twoStems
            : (document.getElementById('demucs-mode')?.value !== 'full');
        const explicitTimelineContext = (!options.isBatch && options.trackId)
            ? this.getDirectSelectionContext(
                handler.app.timelineManager,
                options.trackId,
                options.index ?? -1
            )
            : null;
        const selectedTimelineContext = (!options.isBatch && options.startTime === undefined && options.endTime === undefined)
            ? (explicitTimelineContext || this.getSelectedAudioSegmentContext())
            : null;

        if (!selectedTimelineContext && !handler.app.videoFile?.path) return;

        if (!selectedTimelineContext && options.trackId) {
            window.app?.showToast(
                window.i18n?.t('creator.demucs.noTargetSegment') || 'No valid audio clip found for separation',
                'warning'
            );
            return;
        }

        let cleanupProgress = null;
        let tempClipPath = null;

        try {
            if (!options.isBatch) {
                handler.app.isProcessing = true;
                handler.app.showProgress(
                    window.i18n?.t('creator.demucs.statusSeparating') || 'Separating audio (Demucs)...',
                    0,
                    true,
                    () => window.mediaflow?.audio?.demucsCancel?.()
                );
            }

            const updateProgress = (pct, text) => {
                if (options.onProgress) options.onProgress(pct, text);
                if (!options.isBatch) handler.app.updateProgress(pct, text);
            };

            cleanupProgress = window.mediaflow?.audio?.onDemucsProgress?.((data) => {
                const statusKeyMap = {
                    separating: window.i18n?.t('creator.demucs.statusSeparating') || 'Separating audio...',
                    Cancelled: window.i18n?.t('creator.demucs.statusCancelled') || 'Cancelled',
                    'Done!': window.i18n?.t('creator.demucs.separateSuccess') || 'Separation completed!'
                };
                let localizedStatus = statusKeyMap[data.status] || data.status;
                if (localizedStatus.includes('creator.demucs') && data.status === 'separating') {
                    localizedStatus = 'Separating audio (AI)...';
                }
                updateProgress(data.progress, localizedStatus);
            });

            let result;
            if (selectedTimelineContext) {
                const sourcePath = selectedTimelineContext.sourcePath;
                const lastSlash = Math.max(sourcePath.lastIndexOf('\\'), sourcePath.lastIndexOf('/'));
                const dir = lastSlash >= 0 ? sourcePath.slice(0, lastSlash) : '';
                const extMatch = sourcePath.match(/\.[^.\\/]+$/);
                const ext = extMatch ? extMatch[0] : '.mp4';
                tempClipPath = `${dir || '.'}\\temp_demucs_input_${Date.now()}${ext}`;

                updateProgress(5, window.i18n?.t('creator.video.statusClipping') || 'Clipping segment...');
                await window.mediaflow?.video.clip({
                    input: sourcePath,
                    output: tempClipPath,
                    startTime: selectedTimelineContext.sourceStart,
                    endTime: selectedTimelineContext.sourceEnd,
                    accurate: true
                });

                updateProgress(10, window.i18n?.t('creator.demucs.statusSeparating') || 'AI separation in progress...');
                result = await window.mediaflow?.audio?.demucsSeparate?.({
                    input: tempClipPath,
                    twoStems
                });
            } else if (options.startTime !== undefined && options.endTime !== undefined) {
                const dir = handler.app.videoFile.path.substring(0, handler.app.videoFile.path.lastIndexOf('\\'));
                tempClipPath = `${dir}\\temp_demucs_input_${Date.now()}.mp4`;

                updateProgress(5, window.i18n?.t('creator.video.statusClipping') || 'Clipping segment...');
                await window.mediaflow?.video.clip({
                    input: handler.app.videoFile.path,
                    output: tempClipPath,
                    startTime: options.startTime,
                    endTime: options.endTime
                });

                updateProgress(10, window.i18n?.t('creator.demucs.statusSeparating') || 'AI separation in progress...');
                result = await window.mediaflow?.audio?.demucsSeparate?.({
                    input: tempClipPath,
                    twoStems
                });
            } else {
                updateProgress(0, window.i18n?.t('creator.demucs.statusSeparating') || 'Separating...');
                result = await window.mediaflow?.audio?.demucsSeparate?.({
                    input: handler.app.videoFile.path,
                    twoStems,
                    startTime: options.startTime,
                    endTime: options.endTime
                });
            }

            if (result?.success) {
                if (!options.isBatch) {
                    window.app?.showToast(window.i18n?.t('creator.demucs.separateSuccess') || 'Separation completed!', 'success');
                    handler.currentDemucsFiles = result.files;
                    if (selectedTimelineContext) {
                        await this.resultsTools.applyResultsToTimeline(result.files, selectedTimelineContext);
                    }
                    this.renderDemucsResults();
                }
            } else if (!result?.cancelled) {
                throw new Error(result?.error || (window.i18n?.t('creator.demucs.error') || 'Separation failed'));
            }
        } catch (error) {
            console.error('[AudioProcessor] Separate error:', error);
            const friendlyMessage = this.normalizeDemucsError(error);
            if (!options.isBatch) {
                window.app?.showToast((window.i18n?.t('creator.demucs.error') || 'Separation failed') + ': ' + friendlyMessage, 'error');
                return null;
            }
            throw new Error(friendlyMessage);
        } finally {
            if (tempClipPath) {
                window.mediaflow?.file?.deleteFile?.(tempClipPath);
            }
            if (cleanupProgress) cleanupProgress();
            if (!options.isBatch) {
                handler.app.isProcessing = false;
                handler.app.hideProgress();
            }
        }
    }

    renderDemucsResults() {
        return this.resultsTools.renderDemucsResults();
    }

    toggleTrackPlay(name, themeColor = '#6b9ad4') {
        return this.resultsTools.toggleTrackPlay(name, themeColor);
    }

    async downloadAllDemucs() {
        return this.resultsTools.downloadAllDemucs();
    }

    async downloadSingleDemucs(name) {
        return this.resultsTools.downloadSingleDemucs(name);
    }
}

window.CreatorAudioDemucsTools = CreatorAudioDemucsTools;
