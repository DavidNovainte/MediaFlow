/**
 * TimelineMediaSupport
 *
 * Owns timeline-adjacent support concerns: label context menus, i18n refresh,
 * initial media bootstrap, and legacy waveform extraction helpers.
 */
class TimelineMediaSupport {
    static updateLabelContextMenus(manager) {
        if (window.TimelineTrackReorder) {
            window.TimelineTrackReorder.ensureState(manager);
        }

        const labels = manager.container.querySelectorAll('.timeline-sidebar-label');
        labels.forEach((label) => {
            label.oncontextmenu = (e) => {
                e.preventDefault();
                const trackId = label.closest('.timeline-track').id.replace('track-', '');
                const type = label.closest('.timeline-track').classList.contains('video-track') ? 'video' : 'audio';
                manager.showTrackContextMenu(e, trackId, type);
            };

            if (window.TimelineTrackReorder) {
                window.TimelineTrackReorder.bindLabel(manager, label);
            }

            const trackId = label.closest('.timeline-track')?.id?.replace('track-', '');
            if (!trackId) return;

            const type = label.closest('.timeline-track')?.classList?.contains('video-track') ? 'video' : 'audio';
            const trackNum = trackId.replace(/[av]/gi, '');
            const name = type === 'video'
                ? (window.i18n?.t('creator.timeline.trackVideo', { num: trackNum }) || `Video Track ${trackNum}`)
                : (window.i18n?.t('creator.timeline.trackAudio', { num: trackNum }) || `Audio Track ${trackNum}`);
            const icon = type === 'video' ? 'fa-video' : 'fa-microphone-lines';
            window.TimelineTrackAudioControls?.decorateLabel?.(manager, label, trackId, type, name, icon);
        });
    }

    static refreshI18n(manager) {
        if (!manager.container) return;

        const rulerLabel = manager.container.querySelector('.ruler-label span');
        if (rulerLabel) {
            rulerLabel.textContent = window.i18n?.t('creator.timeline.title') || 'Timeline';
        }

        manager.container.querySelectorAll('.timeline-track').forEach((trackRow) => {
            const label = trackRow.querySelector('.timeline-sidebar-label [data-role="track-name"], .timeline-sidebar-label span');
            if (!label) return;

            const trackId = trackRow.id.replace('track-', '');
            const trackNum = trackId.replace(/[av]/gi, '');
            const isVideoTrack = trackRow.classList.contains('video-track');
            label.textContent = isVideoTrack
                ? (window.i18n?.t('creator.timeline.trackVideo', { num: trackNum }) || `Video Track ${trackNum}`)
                : (window.i18n?.t('creator.timeline.trackAudio', { num: trackNum }) || `Audio Track ${trackNum}`);
        });

        window.TimelineTrackAudioControls?.refreshAll?.(manager);

        if (manager.duration) {
            manager.renderAll();
        }
    }

    static async loadMedia(manager, duration, file = null) {
        if (!duration || isNaN(duration) || duration === Infinity || duration <= 0) {
            console.warn('[CreatorTimelineManager] Invalid duration received:', duration);
            duration = 60;
        }

        manager.duration = duration;
        const initialGroupId = `group_${Date.now()}`;
        const isAudioOnly = manager.app.isAudioOnly || (file && file.type && file.type.startsWith('audio/'));

        if (isAudioOnly) {
            manager.tracks.v1.segments = [];
            manager.tracks.a1.segments = [{
                start: 0,
                end: duration,
                sourceStart: 0,
                groupId: initialGroupId,
                file
            }];
        } else {
            manager.tracks.v1.segments = [{
                start: 0,
                end: duration,
                sourceStart: 0,
                groupId: initialGroupId,
                file
            }];
            manager.tracks.a1.segments = [{
                start: 0,
                end: duration,
                sourceStart: 0,
                groupId: initialGroupId,
                file
            }];
        }

        manager.tracks.a1.sourceDuration = duration;
        manager.selectedSegmentIndex = 0;

        const fakePeaks = [];
        for (let i = 0; i < 3000; i++) {
            fakePeaks.push(Math.sin(i * 0.1) * Math.cos(i * 0.03) * 0.8 + Math.random() * 0.2);
        }
        manager.tracks.a1.peaks = fakePeaks;

        manager.renderAll();
    }

    static async extractAudioWaveform(manager, file = null) {
        const targetFile = file || manager.currentFile;
        const targetPath = typeof targetFile === 'string' ? targetFile : targetFile?.path;
        if (manager.hasWaveform || !targetPath || manager.isExtracting) return;

        try {
            manager.isExtracting = true;
            manager.app.showProgress(window.i18n?.t('creator.toasts.processingAudio') || 'Processing waveform...');

            const result = await window.mediaflow?.video?.extractAudio({
                input: targetPath,
                samplesPerSec: 240
            });

            if (result && result.success && result.peaks) {
                if (manager.tracks.a1) {
                    manager.tracks.a1.peaks = result.peaks;
                    manager.tracks.a1.waveformData = result;
                    manager.tracks.a1.sourceDuration = result.duration || manager.duration;
                }
                if (manager.tracks.v1) {
                    manager.tracks.v1.peaks = result.peaks;
                    manager.tracks.v1.waveformData = result;
                    manager.tracks.v1.sourceDuration = result.duration || manager.duration;
                }

                manager.hasWaveform = true;
                manager.renderAll();
            }
        } catch (e) {
            console.warn('[CreatorTimelineManager] Failed to fetch waveform peaks:', e);
        } finally {
            manager.isExtracting = false;
            manager.app.hideProgress();
        }
    }

    static syncSegmentsWithApp(manager) {
        if (manager.app.videoProcessor) {
            // Placeholder for future batch/clip-range sync.
        }
    }

    static async extractAudio(manager, videoPath, trackId = 'a1') {
        const statusEl = document.getElementById(`waveform-status-${trackId}`);
        if (statusEl) statusEl.classList.remove('hidden');

        try {
            const targetPath = typeof videoPath === 'string' ? videoPath : videoPath?.path;
            if (!targetPath) {
                throw new Error('Missing media path');
            }

            const result = await window.mediaflow?.video?.extractAudio({
                input: targetPath,
                samplesPerSec: 240
            });

            if (result?.success && Array.isArray(result.peaks)) {
                manager.tracks[trackId].peaks = result.peaks;
                manager.tracks[trackId].waveformData = result;
                manager.tracks[trackId].sourceDuration = result.duration || manager.duration;
                manager.renderAll();
            }
        } catch (error) {
            console.error('[Timeline] Extract audio failed:', error);
            manager.app.showToast(window.i18n?.t('creator.timeline.waveformFail') || 'Audio waveform extraction failed', 'warning');
        } finally {
            if (statusEl) statusEl.classList.add('hidden');
        }
    }

    static drawWaveform(manager, trackId = 'a1') {
        const canvas = manager.canvases[`waveform-${trackId}`];
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const data = manager.tracks[trackId].waveform;
        if (!data || data.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        const barWidth = 2;
        const barGap = 1;
        const totalBarWidth = barWidth + barGap;
        const numBars = Math.floor(width / totalBarWidth);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';

        const step = Math.ceil(data.length / numBars);
        let currentBar = 0;

        for (let i = 0; i < data.length; i += step) {
            const min = data[i];
            const max = data[i + 1];
            const x = currentBar * totalBarWidth;
            const barHeight = (max - min) * height;
            const y = (height - barHeight) / 2;

            ctx.fillRect(x, y, barWidth, barHeight);
            currentBar++;
        }
    }
}

window.TimelineMediaSupport = TimelineMediaSupport;
