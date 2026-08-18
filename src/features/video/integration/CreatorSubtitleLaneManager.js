class CreatorSubtitleLaneManager {
    constructor(flow) {
        this.flow = flow;
        this.elements = {};
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.syncProject(this.flow.localizedEditProject, { silent: true });
    }

    cacheElements() {
        this.elements = {
            cutButton: document.getElementById('btn-timeline-subtitle-cuts')
        };
    }

    bindEvents() {
        document.addEventListener('creator:workflow-imported', (event) => {
            this.syncProject(event.detail?.project || null);
        });
    }

    syncProject(project, { silent = false } = {}) {
        this.project = project || null;
        this.render();
        this.updateButtonState();

        if (!silent && project && this.elements.cutButton) {
            this.elements.cutButton.classList.remove('hidden');
        }
    }

    clear() {
        this.project = null;
        this.removeLane();
        this.updateButtonState();
    }

    ensureLane() {
        const body = this.flow.timelineManager?.timelineBody || document.querySelector('#creator-timeline-workspace .timeline-body');
        if (!body) return null;

        let lane = document.getElementById('track-subtitle-guide');
        if (lane) return lane;

        lane = document.createElement('div');
        lane.id = 'track-subtitle-guide';
        lane.className = 'timeline-track subtitle-guide-track';
        lane.innerHTML = `
            <div class="timeline-sidebar-label subtitle-guide-label">
                <i class="fa-solid fa-closed-captioning"></i>
                <span>${window.i18n?.t('subtitle.title') || 'Subtitle'}</span>
            </div>
            <div class="track-content-area subtitle-guide-content" id="track-content-subtitle-guide"></div>
        `;

        const rulerTrack = body.querySelector('.ruler-track');
        if (rulerTrack?.nextSibling) {
            body.insertBefore(lane, rulerTrack.nextSibling);
        } else {
            body.appendChild(lane);
        }

        return lane;
    }

    removeLane() {
        const lane = document.getElementById('track-subtitle-guide');
        if (lane) lane.remove();
    }

    updateButtonState() {
        const button = this.elements.cutButton;
        if (!button) return;

        const segmentCount = window.CreatorSubtitleProject?.getPrimarySegments(this.project)?.length || 0;
        button.classList.toggle('hidden', segmentCount === 0);
        button.disabled = segmentCount === 0;

        const countLabel = button.querySelector('.subtitle-cut-count');
        if (countLabel) {
            countLabel.textContent = segmentCount > 0 ? `${segmentCount}` : '';
        }
    }

    resolveSegmentTiming(segment) {
        const manager = this.flow.timelineManager;
        if (!manager) {
            return {
                start: segment.start,
                end: segment.end
            };
        }

        const start = manager.getMappedTimelineTime(segment.start);
        const end = manager.getMappedTimelineTime(Math.max(segment.start, segment.end - 0.001));

        return {
            start: start ?? segment.start,
            end: end ?? segment.end
        };
    }

    render() {
        const segments = window.CreatorSubtitleProject?.getPrimarySegments(this.project) || [];
        if (segments.length === 0 || !this.flow.timelineManager?.duration) {
            this.removeLane();
            this.updateButtonState();
            return;
        }

        const lane = this.ensureLane();
        const content = lane?.querySelector('#track-content-subtitle-guide');
        if (!content) return;

        content.innerHTML = '';

        const currentPixelsPerSecond = this.flow.timelineManager.pixelsPerSecond * (this.flow.timelineManager.zoomLevel / 100);
        segments.forEach((segment) => {
            const timing = this.resolveSegmentTiming(segment);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'subtitle-guide-segment';
            chip.dataset.segmentId = segment.id || '';
            chip.dataset.start = `${segment.start}`;
            chip.dataset.end = `${segment.end}`;
            chip.style.left = `${timing.start * currentPixelsPerSecond}px`;
            chip.style.width = `${Math.max(18, (timing.end - timing.start) * currentPixelsPerSecond)}px`;
            chip.title = segment.displayText || segment.originalText || segment.text || '';
            chip.textContent = (segment.displayText || segment.originalText || segment.text || '').split('\n')[0] || 'Subtitle';

            chip.addEventListener('click', () => {
                const sourceTime = Number(segment.start ?? 0);
                const timelineTime = this.flow.timelineManager?.getMappedTimelineTime?.(sourceTime) ?? timing.start;
                this.flow.timelineManager.currentTime = timelineTime;
                this.flow.timelineManager.updatePlayheadPosition?.();
                this.flow.timelineManager.onSeek?.(timelineTime, sourceTime);
                this.updateActiveState();
            });

            content.appendChild(chip);
        });

        this.updateActiveState();
    }

    updateActiveState() {
        const content = document.getElementById('track-content-subtitle-guide');
        if (!content) return;

        const manager = this.flow.timelineManager;
        const currentSourceTime = manager?.getMappedSourceTime?.(manager.currentTime ?? 0) ?? manager?.currentTime ?? 0;

        content.querySelectorAll('.subtitle-guide-segment').forEach((chip) => {
            const start = Number(chip.dataset.start || 0);
            const end = Number(chip.dataset.end || start);
            const isActive = currentSourceTime >= start && currentSourceTime <= end;
            chip.classList.toggle('active', isActive);
        });
    }
}

window.CreatorSubtitleLaneManager = CreatorSubtitleLaneManager;
