/**
 * MediaFlow - CreatorTimelineManager
 * 涓撲笟鐨勮棰戝垱浣滄椂闂磋酱绠＄悊锟?
 * - 澶氳建閬撴覆鏌撲笌鍓垏
 * - 娉㈠舰鍥句笌鏍囧昂缁樺埗 (Canvas)
 * - 鎾斁澶村悓姝ヤ笌鎷栨嫿瀹氫綅
 */

class CreatorTimelineManager {
    constructor(creatorFlow) {
        this.app = creatorFlow;
        this.duration = 0;
        this.currentTime = 0;
        this.zoomLevel = 100; // 1 to 500
        this.pixelsPerSecond = 50; // base scale

        // DOM Elements
        this.container = document.getElementById('creator-timeline-workspace');
        if (!this.container) return; // Guard

        this.rulerCanvas = this.container.querySelector('#creator-timeline-ruler-canvas');
        this.waveformCanvasA1 = this.container.querySelector('#timeline-waveform-canvas-a1');
        this.playhead = this.container.querySelector('#creator-timeline-playhead');
        this.timeDisplay = this.container.querySelector('#creator-timeline-current-time');
        this.zoomSlider = this.container.querySelector('#creator-timeline-zoom');
        this.timelineBody = this.container.querySelector('.timeline-body');

        this.isDraggingPlayhead = false;
        this.selectedTrackId = 'v1';
        this.selectedSegmentIndex = 0;
        this.selectedTransitionIndex = -1;
        this.lastSegmentIndex = -1; // Track for transition triggers
        this.snapEnabled = true; // [NEW] 鍚搁檮寮€锟?

        // Clip Interaction State
        this.isDraggingClip = false;
        this.isTrimmingClip = false;
        this.trimEdge = null; // 'left' or 'right'
        this.dragTargetTrackId = null;
        this.dragTargetIndex = -1;
        this.dragStartX = 0;
        this.dragOriginalStart = 0;
        this.dragOriginalEnd = 0;

        // Snap Guide
        this.snapGuideLine = document.createElement('div');
        this.snapGuideLine.className = 'timeline-snap-guide';
        this.snapGuideLine.style.display = 'none';

        this.tracks = {
            v1: { id: 'v1', segments: [] },
            a1: { id: 'a1', segments: [], peaks: [], audioBuffer: null }
        };
        this.trackOrder = {
            video: ['v1'],
            audio: ['a1']
        };
        this.trackDragState = null;

        // Instant DOM references for performance
        this.activeDragEl = null;
        this.dragAutoCreatedTrackIds = [];
        this.dragAutoCreateLimit = null;
        this.dragOldState = null;
        this.dragLinkedSegments = []; // [NEW] 鎷栨嫿鏃堕攣瀹氱殑鑱斿姩缁勫揩锟?
        this.eventsBound = false;
    }

    init() {
        if (window.TimelineBootstrap) {
            window.TimelineBootstrap.init(this);
        }
    }

    /**
     * 閲嶇疆鏃堕棿杞寸姸鎬侊紝娓呯┖鎵€鏈夎建閬撳拰鏁版嵁
     */
    reset() {
        if (window.TimelineBootstrap) {
            window.TimelineBootstrap.reset(this);
        }
    }

    bindEvents() {
        if (window.TimelineBootstrap) {
            window.TimelineBootstrap.bindEvents(this);
        }
    }

    updateLabelContextMenus() {
        if (window.TimelineMediaSupport) {
            window.TimelineMediaSupport.updateLabelContextMenus(this);
        }
    }

    refreshI18n() {
        if (window.TimelineMediaSupport) {
            window.TimelineMediaSupport.refreshI18n(this);
        }
    }

    /**
     * 鏄剧ず鐗囨鍙抽敭鑿滃崟
     */
    showSegmentContextMenu(e, trackId, index) {
        if (window.TimelineContextMenu) {
            window.TimelineContextMenu.showSegment(this, e, trackId, index);
        }
    }

    /**
     * 瑙ｉ櫎鍏锋湁鐩稿悓 groupId 鐨勭墖娈甸摼锟?
     */
    unlinkSegment(groupId) {
        if (window.TimelineActions) {
            window.TimelineActions.unlinkSegment(this, groupId);
        }
    }

    /**
     * 涓哄绔嬬墖娈靛鎵惧榻愮殑鐗囨骞跺缓绔嬮摼锟?
     */
    autoLinkSegment(trackId, index) {
        if (window.TimelineActions) {
            window.TimelineActions.autoLinkSegment(this, trackId, index);
        }
    }

    /**
     * 鑾峰彇杞ㄩ亾鍦ㄥ悓绫昏建閬撲腑鐨勭储锟?
     */
    getTrackOrder(type) {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.getTrackOrder({
                tracks: this.tracks,
                timelineBody: this.timelineBody,
                type,
                trackOrder: this.trackOrder
            })
            : [];
    }

    parseTrackNumber(trackId) {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.parseTrackNumber(trackId)
            : (parseInt((trackId || '').slice(1), 10) || 1);
    }

    getTrackInsertPosition(trackId, type) {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.getTrackInsertPosition({
                trackId,
                type,
                tracks: this.tracks,
                timelineBody: this.timelineBody,
                trackOrder: this.trackOrder
            })
            : { relativeId: null, position: null };
    }

    ensureTrackNumber(type, number) {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.ensureTrackNumber({
                type,
                number,
                ensureTrackExists: (trackId, trackType) => this.ensureLinkedTrackExists(trackId, trackType)
            })
            : `${type === 'video' ? 'v' : 'a'}${Math.max(1, number)}`;
    }

    getPlaybackTrackIds() {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.getPlaybackTrackIds({
                tracks: this.tracks,
                timelineBody: this.timelineBody,
                trackOrder: this.trackOrder
            })
            : [];
    }

    getTrackIndex(trackId) {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.getTrackIndex({
                trackId,
                tracks: this.tracks,
                timelineBody: this.timelineBody,
                trackOrder: this.trackOrder
            })
            : -1;
    }

    /**
     * 鏍规嵁绱㈠紩鍜岀被鍨嬭幏鍙栬建锟?ID
     */
    getTrackIdByIndex(index, type) {
        return window.TimelineTrackLayout
            ? window.TimelineTrackLayout.getTrackIdByIndex({
                index,
                type,
                tracks: this.tracks,
                timelineBody: this.timelineBody,
                trackOrder: this.trackOrder
            })
            : null;
    }

    normalizeTrackSegments(preserveSelection = false) {
        if (window.TimelineInteractionUtils) {
            window.TimelineInteractionUtils.normalizeTrackSegments(this, preserveSelection);
        }
    }

    calculateSnap(projectTime, ignoredTrackId = null, ignoredIndex = -1) {
        return window.TimelineInteractionUtils
            ? window.TimelineInteractionUtils.calculateSnap(this, projectTime, ignoredTrackId, ignoredIndex)
            : projectTime;
    }


    handleClipMouseUp() {
        if (window.TimelineInteractionUtils) {
            window.TimelineInteractionUtils.finalizeDrag(this);
        }
    }

    async loadMedia(duration, file = null) {
        if (window.TimelineMediaSupport) {
            await window.TimelineMediaSupport.loadMedia(this, duration, file);
        }
    }

    /**
     * 寮傛鎻愬彇闊抽娉㈠舰
     * 鍙湁鍦ㄨ繘鍏ョ簿淇ā寮忔椂锛屾垨鑰呯敤鎴蜂富鍔ㄨЕ鍙戞椂鎵嶈皟锟?
     */
    async extractAudioWaveform(file = null) {
        if (window.TimelineMediaSupport) {
            await window.TimelineMediaSupport.extractAudioWaveform(this, file);
        }
    }

    // --- Action Methods --- //

    showTrackContextMenu(e, trackId, type) {
        if (window.TimelineContextMenu) {
            window.TimelineContextMenu.showTrack(this, e, trackId, type);
        }
    }

    removeTrack(trackId) {
        if (window.TimelineActions) {
            window.TimelineActions.removeTrack(this, trackId);
        }
    }

    /**
     * 鍦ㄥ綋鍓嶆挱鏀惧ご浣嶇疆鍒嗗壊鐗囨
     * 鏀寔澶氳建閬撹仈鍔ㄥ垎鍓诧紙濡傛灉鐗囨灞炰簬鍚屼竴缁勶級
     */
    splitAtPlayhead() {
        if (window.TimelineEditOperations) {
            window.TimelineEditOperations.splitAtPlayhead(this);
        }
    }

    deleteSelectedSegment() {
        if (window.TimelineEditOperations) {
            window.TimelineEditOperations.deleteSelectedSegment(this);
        }
    }

    addTrack(type = 'video', relativeId = null, position = null) {
        if (window.TimelineActions) {
            window.TimelineActions.addTrack(this, type, relativeId, position);
        }
    }

    /**
     * 鏅鸿兘绉昏嚦璧风偣 (Smart Move to Front)
     * 濡傛灉鍓嶉潰鏈夌墖娈碉紝鍒欏榻愬埌鐜版湁鐗囨鏈熬锛涘惁鍒欏锟?00:00
     */
    moveSegmentToStart(trackId, index) {
        if (window.TimelineActions) {
            window.TimelineActions.moveSegmentToStart(this, trackId, index);
        }
    }

    createTrackDOM(id, type, relativeId = null, position = null) {
        if (window.TimelineActions) {
            window.TimelineActions.createTrackDOM(this, id, type, relativeId, position);
        }
    }

    syncSegmentsWithApp() {
        if (window.TimelineMediaSupport) {
            window.TimelineMediaSupport.syncSegmentsWithApp(this);
        }
    }

    // --- Time/Playhead --- //

    updatePlayhead(absTime) {
        if (window.TimelineNavigation) {
            window.TimelineNavigation.updatePlayhead(this, absTime);
        }
    }

    async extractAudio(videoPath, trackId = 'a1') {
        if (window.TimelineMediaSupport) {
            await window.TimelineMediaSupport.extractAudio(this, videoPath, trackId);
        }
    }

    drawWaveform(trackId = 'a1') {
        if (window.TimelineMediaSupport) {
            window.TimelineMediaSupport.drawWaveform(this, trackId);
        }
    }


    seekFromMouseEvent(e) {
        if (window.TimelineNavigation) {
            window.TimelineNavigation.seekFromMouseEvent(this, e);
        }
    }

    updatePlayheadPosition() {
        if (window.TimelineNavigation) {
            window.TimelineNavigation.updatePlayheadPosition(this);
        }
    }

    formatTime(seconds) {
        return window.TimelineNavigation
            ? window.TimelineNavigation.formatTime(seconds)
            : '00:00.000';
    }

    zoomToFit() {
        if (window.TimelineNavigation) {
            window.TimelineNavigation.zoomToFit(this);
        }
    }

    renderAll(forceWidthUpdate = false) {
        if (window.TimelineViewportRenderer) {
            window.TimelineViewportRenderer.renderAll(this, forceWidthUpdate);
        }
    }

    renderRuler() {
        if (window.TimelineViewportRenderer) {
            window.TimelineViewportRenderer.renderRuler(this, (seconds) => this.formatRulerTime(seconds));
        }
    }

    formatRulerTime(seconds) {
        return window.TimelineNavigation
            ? window.TimelineNavigation.formatRulerTime(seconds)
            : `${seconds}s`;
    }

    renderVideoTracks() {
        if (window.TimelineVideoTrackRenderer) {
            window.TimelineVideoTrackRenderer.render(this);
        }
    }

    selectTransition(trackId, index) {
        if (window.TimelineActions) {
            window.TimelineActions.selectTransition(this, trackId, index);
        }
    }
    renderAudioTracks() {
        if (window.TimelineAudioTrackRenderer) {
            window.TimelineAudioTrackRenderer.render(this);
        }
    }

    renderWaveformWindowed(ctx, peaks, seg, scrollLeft, viewportWidth, pps, sourceDuration, isVideoTrack = false) {
        if (window.TimelineWaveformRenderer) {
            window.TimelineWaveformRenderer.renderWindowed(ctx, peaks, seg, {
                scrollLeft,
                viewportWidth,
                pps,
                sourceDuration: sourceDuration || this.duration || 1,
                isVideoTrack
            });
        }
    }
    /**
     * 鏇存柊褰撳墠閫変腑鐗囨鐨勯煶锟?(0.0 - 2.0)
     */
    updateSelectedSegmentVolume(volume) {
        if (window.TimelineClipControls) {
            window.TimelineClipControls.updateSelectedSegmentVolume(this, volume);
        }
    }

    /**
     * 鏇存柊褰撳墠閫変腑鐗囨鐨勬挱鏀惧€嶏拷?(0.25 - 4.0)
     */
    updateSelectedSegmentSpeed(speed) {
        if (window.TimelineClipControls) {
            window.TimelineClipControls.updateSelectedSegmentSpeed(this, speed);
        }
    }

    /**
     * 鍒囨崲鍚搁檮鐘舵€佸苟鏇存柊 UI 鍙嶉
     */
    toggleSnap() {
        if (window.TimelineClipControls) {
            window.TimelineClipControls.toggleSnap(this);
        }
    }

    /**
     * 鍚屾宸ュ叿鏍忛煶閲忔粦鍧楃殑 UI 鐘讹拷?
     */
    syncVolumeUI(volume) {
        if (window.TimelineClipControls) {
            window.TimelineClipControls.syncVolumeUI(volume);
        }
    }

    /**
     * 娣卞厠闅嗙姸鎬佸璞★紝鍚屾椂淇濈暀 File/Blob 绛変笉鍙簭鍒楀寲瀵硅薄鐨勫紩锟?
     */
    _cloneState(source) {
        return window.TimelineStateSnapshot
            ? window.TimelineStateSnapshot.clone(source)
            : source;
    }

    /**
     * 鎹曡幏褰撳墠鎵€鏈夎建閬撶殑娣卞害鍏嬮殕蹇収
     */
    captureState() {
        return window.TimelineStateSnapshot
            ? window.TimelineStateSnapshot.capture(this)
            : {
                tracks: this._cloneState(this.tracks),
                selectedTrackId: this.selectedTrackId,
                selectedSegmentIndex: this.selectedSegmentIndex,
                currentTime: this.currentTime
            };
    }

    /**
     * 搴旂敤涓€涓揩鐓х姸鎬侊紝骞跺悓姝ユ竻锟?DOM
     */
    handleClipMouseMove(e) {
        if (!this.isDraggingClip && !this.isTrimmingClip) return;

        const currentPixelsPerSecond = this.pixelsPerSecond * (this.zoomLevel / 100);
        const deltaX = e.clientX - this.dragStartX;
        const deltaTime = deltaX / currentPixelsPerSecond;

        const mainTrack = this.tracks[this.dragTargetTrackId];
        if (!mainTrack) return;
        const mainSeg = mainTrack.segments[this.dragTargetIndex];
        if (!mainSeg) return;

        const originalDuration = this.dragOriginalEnd - this.dragOriginalStart;

        if (this.isDraggingClip) {
            const dragPreview = window.TimelineDragPreview
                ? window.TimelineDragPreview.previewDrag(this, e, mainSeg, originalDuration, deltaTime)
                : {
                    hoveredTrackId: this.dragTargetTrackId,
                    deltaTrackIndex: 0
                };
            const { hoveredTrackId, deltaTrackIndex } = dragPreview;

            if (hoveredTrackId !== this.dragTargetTrackId || deltaTrackIndex !== 0) {
                const hasMoved = this.syncTracksWithDelta(deltaTrackIndex, hoveredTrackId);
                if (hasMoved) {
                    const newMainTrack = this.tracks[this.dragTargetTrackId];
                    this.dragTargetIndex = newMainTrack.segments.indexOf(mainSeg);
                    this.selectedSegmentIndex = this.dragTargetIndex;
                    this.selectedTrackId = this.dragTargetTrackId;
                }
            }

            this.renderAll();
            return;
        }

        if (window.TimelineDragPreview) {
            window.TimelineDragPreview.previewTrim(this, mainSeg, deltaTime);
        }

        this.renderAll();
    }

    ensureLinkedTrackExists(trackId, type) {
        if (window.TimelineTrackRegistry) {
            window.TimelineTrackRegistry.ensureTrackExists({
                trackId,
                type,
                tracks: this.tracks,
                isDragging: this.isDraggingClip || this.isTrimmingClip,
                dragAutoCreatedTrackIds: this.dragAutoCreatedTrackIds,
                onCreateDOM: (id, trackType) => this.createLinkedTrackDOM(id, trackType)
            });
            return;
        }

        const existingRow = document.getElementById(`track-${trackId}`);
        if (!this.tracks[trackId]) {
            this.tracks[trackId] = { id: trackId, segments: [] };
        }
        if (!existingRow) {
            this.createLinkedTrackDOM(trackId, type);
        }
    }

    createLinkedTrackDOM(trackId, type) {
        if (window.TimelineTrackRegistry) {
            window.TimelineTrackRegistry.ensureTrackDOM({
                trackId,
                type,
                getTrackInsertPosition: (id, trackType) => this.getTrackInsertPosition(id, trackType),
                createTrackDOM: (id, trackType, relativeId, position) => this.createTrackDOM(id, trackType, relativeId, position),
                updateLabelContextMenus: () => this.updateLabelContextMenus()
            });
            return;
        }

        if (document.getElementById(`track-${trackId}`)) return;
        const { relativeId, position } = this.getTrackInsertPosition(trackId, type);
        this.createTrackDOM(trackId, type, relativeId, position);
        this.updateLabelContextMenus();
    }

    syncTracksWithDelta(deltaTracks, primaryNewTrackId) {
        return window.TimelineTrackSync
            ? window.TimelineTrackSync.sync(this, deltaTracks, primaryNewTrackId)
            : true;
    }


    syncAudioLevels(timelineTime, playbackSnapshot = null) {
        if (window.TimelinePlaybackMapping) {
            window.TimelinePlaybackMapping.syncAudioLevels(this, timelineTime, playbackSnapshot);
        }
    }

    getMappedSourceTime(timelineTime) {
        return window.TimelinePlaybackMapping
            ? window.TimelinePlaybackMapping.getMappedSourceTime(this, timelineTime)
            : timelineTime;
    }

    getMappedTimelineTime(sourceTime) {
        return window.TimelinePlaybackMapping
            ? window.TimelinePlaybackMapping.getMappedTimelineTime(this, sourceTime)
            : null;
    }

    applyState(state) {
        if (window.TimelineStateSnapshot) {
            window.TimelineStateSnapshot.apply(this, state);
        }
    }
}

window.CreatorTimelineManager = CreatorTimelineManager;


