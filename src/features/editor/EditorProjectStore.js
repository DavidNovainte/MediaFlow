class EditorProjectStore {
    // Professional default: video + audio only. Image/graphics tracks are created on demand.
    static DEFAULT_TRACKS = [
        { id: 'v1', type: 'video', name: 'V1', height: 64, isUserCreated: false },
        { id: 'a1', type: 'audio', name: 'A1', height: 64, isUserCreated: false }
    ];

    static HISTORY_LIMIT = 100;
    static ID_COUNTER = 0;

    constructor() {
        this.listeners = new Set();
        this.undoStack = [];
        this.redoStack = [];
        this.historyTransactionDepth = 0;
        this.historyTransactionSnapshot = null;
        this.historyTransactionSignature = '';
        this.lastCommittedSnapshot = null;
        this.lastCommittedSignature = '';
        this.reset();
    }

    reset() {
        const defaults = EditorProjectStore.DEFAULT_TRACKS;
        this.clipboard = null;
        this.undoStack = [];
        this.redoStack = [];
        this.historyTransactionDepth = 0;
        this.historyTransactionSnapshot = null;
        this.historyTransactionSignature = '';
        this.lastCommittedSnapshot = null;
        this.lastCommittedSignature = '';
        this.state = {
            projectId: `editor-${Date.now()}`,
            name: '未命名剪辑',
            assets: [],
            selectedAssetId: null,
            selectedTrackName: defaults[0].id,
            selectedClipId: null,
            selectedClipIds: [],
            playheadTime: 0,
            timelineZoom: 100,
            timelineZoomMode: 'manual',
            timelineSnapEnabled: true,
            trackOrder: defaults.map(track => track.id),
            trackMeta: defaults.reduce((acc, track) => {
                acc[track.id] = { ...track };
                return acc;
            }, {}),
            trackControls: defaults.reduce((acc, track) => {
                acc[track.id] = { muted: false, locked: false, hidden: false, solo: false };
                return acc;
            }, {}),
            timeline: defaults.reduce((acc, track) => {
                acc[track.id] = [];
                return acc;
            }, {})
        };
        this._syncHistoryBaseline();
        this.emit({ recordHistory: false });
    }

    getState() {
        const primaryTrackIds = {
            video: this.getTrackIdsByType('video')[0] || null,
            audio: this.getTrackIdsByType('audio')[0] || null,
            image: this.getTrackIdsByType('image')[0] || null
        };
        const timeline = Object.fromEntries(
            Object.entries(this.state.timeline).map(([trackId, clips]) => [trackId, clips.map(clip => ({ ...clip }))])
        );
        const trackControls = Object.fromEntries(
            Object.entries(this.state.trackControls).map(([trackId, control]) => [trackId, { ...control }])
        );

        if (primaryTrackIds.video) timeline.video = timeline[primaryTrackIds.video] || [];
        if (primaryTrackIds.audio) timeline.audio = timeline[primaryTrackIds.audio] || [];
        if (primaryTrackIds.image) timeline.image = timeline[primaryTrackIds.image] || [];

        if (primaryTrackIds.video) trackControls.video = trackControls[primaryTrackIds.video] || { muted: false, locked: false, hidden: false, solo: false };
        if (primaryTrackIds.audio) trackControls.audio = trackControls[primaryTrackIds.audio] || { muted: false, locked: false, hidden: false, solo: false };
        if (primaryTrackIds.image) trackControls.image = trackControls[primaryTrackIds.image] || { muted: false, locked: false, hidden: false, solo: false };

        return {
            ...this.state,
            assets: this.state.assets.map(asset => ({ ...asset })),
            selectedTrackName: this.state.selectedTrackName,
            selectedClipIds: [...this.state.selectedClipIds],
            trackOrder: [...this.state.trackOrder],
            trackMeta: Object.fromEntries(
                Object.entries(this.state.trackMeta).map(([trackId, meta]) => [trackId, { ...meta }])
            ),
            trackControls,
            timeline,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }

    _cloneValue(value) {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }

        return JSON.parse(JSON.stringify(value));
    }

    _createHistorySnapshot(state = this.state) {
        return this._cloneValue(state);
    }

    _createHistoryComparableState(state = this.state) {
        return {
            projectId: state.projectId,
            name: state.name,
            assets: (state.assets || []).map((asset) => ({
                id: asset.id || null,
                name: asset.name || '',
                path: asset.path || '',
                type: asset.type || '',
                kind: asset.kind || 'video',
                duration: Number(asset.duration) || 0,
                src: asset.src || '',
                width: Number(asset.width) || 0,
                height: Number(asset.height) || 0
            })),
            trackOrder: [...(state.trackOrder || [])],
            trackMeta: this._cloneValue(state.trackMeta || {}),
            trackControls: this._cloneValue(state.trackControls || {}),
            timeline: this._cloneValue(state.timeline || {})
        };
    }

    _createHistorySignature(state = this.state) {
        return JSON.stringify(this._createHistoryComparableState(state));
    }

    _pushHistoryEntry(stack, snapshot) {
        if (!snapshot) return;
        stack.push(this._cloneValue(snapshot));
        if (stack.length > EditorProjectStore.HISTORY_LIMIT) {
            stack.splice(0, stack.length - EditorProjectStore.HISTORY_LIMIT);
        }
    }

    _syncHistoryBaseline() {
        this.lastCommittedSnapshot = this._createHistorySnapshot(this.state);
        this.lastCommittedSignature = this._createHistorySignature(this.state);
    }

    _recordHistoryIfNeeded() {
        const currentSnapshot = this._createHistorySnapshot(this.state);
        const currentSignature = this._createHistorySignature(this.state);

        if (this.historyTransactionDepth > 0) {
            return;
        }

        if (!this.lastCommittedSnapshot) {
            this.lastCommittedSnapshot = currentSnapshot;
            this.lastCommittedSignature = currentSignature;
            return;
        }

        if (currentSignature === this.lastCommittedSignature) {
            this.lastCommittedSnapshot = currentSnapshot;
            return;
        }

        this._pushHistoryEntry(this.undoStack, this.lastCommittedSnapshot);
        this.redoStack = [];
        this.lastCommittedSnapshot = currentSnapshot;
        this.lastCommittedSignature = currentSignature;
    }

    _restoreHistorySnapshot(snapshot) {
        if (!snapshot) return false;

        this.state = this._createHistorySnapshot(snapshot);

        const validTrackIds = this.getTrackIds();
        const validAssetIds = new Set((this.state.assets || []).map((asset) => asset.id));
        const validSelectedClipIds = (this.state.selectedClipIds || []).filter((clipId) => !!this.findClipById(clipId));

        this.state.selectedClipIds = validSelectedClipIds;
        this.state.selectedClipId = validSelectedClipIds.includes(this.state.selectedClipId)
            ? this.state.selectedClipId
            : (validSelectedClipIds[validSelectedClipIds.length - 1] || null);
        this.state.selectedAssetId = validAssetIds.has(this.state.selectedAssetId)
            ? this.state.selectedAssetId
            : (this.state.assets[0]?.id || null);

        if (!validTrackIds.includes(this.state.selectedTrackName)) {
            const selectedClipTrackId = this.state.selectedClipId ? this.findClipById(this.state.selectedClipId)?.trackName : null;
            this.state.selectedTrackName = selectedClipTrackId || validTrackIds[0] || null;
        }

        const timelineDuration = this.getTimelineDuration();
        const playheadTime = Math.max(Number(this.state.playheadTime) || 0, 0);
        this.state.playheadTime = timelineDuration > 0 ? Math.min(playheadTime, timelineDuration) : playheadTime;
        return true;
    }

    beginHistoryTransaction() {
        if (this.historyTransactionDepth === 0) {
            this.historyTransactionSnapshot = this._createHistorySnapshot(this.state);
            this.historyTransactionSignature = this._createHistorySignature(this.state);
        }

        this.historyTransactionDepth += 1;
        return this.historyTransactionDepth;
    }

    endHistoryTransaction(options = {}) {
        if (this.historyTransactionDepth <= 0) return false;

        this.historyTransactionDepth -= 1;
        if (this.historyTransactionDepth > 0) return false;

        const baselineSnapshot = this.historyTransactionSnapshot;
        const baselineSignature = this.historyTransactionSignature;
        this.historyTransactionSnapshot = null;
        this.historyTransactionSignature = '';

        const currentSnapshot = this._createHistorySnapshot(this.state);
        const currentSignature = this._createHistorySignature(this.state);
        if (options.discard === true || currentSignature === baselineSignature) {
            this.lastCommittedSnapshot = currentSnapshot;
            this.lastCommittedSignature = currentSignature;
            return false;
        }

        this._pushHistoryEntry(this.undoStack, baselineSnapshot);
        this.redoStack = [];
        this.lastCommittedSnapshot = currentSnapshot;
        this.lastCommittedSignature = currentSignature;
        return true;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    undo() {
        if (!this.canUndo() || this.historyTransactionDepth > 0) return false;

        const targetSnapshot = this.undoStack.pop();
        this._pushHistoryEntry(this.redoStack, this._createHistorySnapshot(this.state));
        this._restoreHistorySnapshot(targetSnapshot);
        this._syncHistoryBaseline();
        this.emit({ recordHistory: false });
        return true;
    }

    redo() {
        if (!this.canRedo() || this.historyTransactionDepth > 0) return false;

        const targetSnapshot = this.redoStack.pop();
        this._pushHistoryEntry(this.undoStack, this._createHistorySnapshot(this.state));
        this._restoreHistorySnapshot(targetSnapshot);
        this._syncHistoryBaseline();
        this.emit({ recordHistory: false });
        return true;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        listener(this.getState(), { changeType: 'init' });
        return () => this.listeners.delete(listener);
    }

    emit(options = {}) {
        if (options.recordHistory !== false) {
            this._recordHistoryIfNeeded();
        }
        const snapshot = this.getState();
        const metadata = {
            changeType: options.changeType || 'update'
        };
        this.listeners.forEach(listener => {
            try {
                listener(snapshot, metadata);
            } catch (error) {
                console.error('[EditorProjectStore] Listener failed:', error);
            }
        });
    }

    setProjectName(name) {
        if (!name) return;
        this.state.name = name;
        this.emit();
    }

    upsertAssets(assets) {
        if (!Array.isArray(assets) || assets.length === 0) return [];

        const nextAssets = [];
        assets.forEach(asset => {
            if (!asset?.id) return;
            const existingIndex = this.state.assets.findIndex(item => item.id === asset.id);
            if (existingIndex >= 0) {
                this.state.assets[existingIndex] = {
                    ...this.state.assets[existingIndex],
                    ...asset
                };
                nextAssets.push(this.state.assets[existingIndex]);
            } else {
                this.state.assets.push({ ...asset });
                nextAssets.push(asset);
            }
        });

        if (!this.state.selectedAssetId && nextAssets[0]?.id) {
            this.state.selectedAssetId = nextAssets[0].id;
        }

        this.emit({ recordHistory: false });
        return nextAssets;
    }

    updateAsset(assetId, patch = {}) {
        if (!assetId) return;
        const asset = this.state.assets.find(item => item.id === assetId);
        if (!asset) return;
        const previousDuration = Number(asset.duration) || 0;
        Object.assign(asset, patch);

        const nextDuration = Number(asset.duration) || 0;
        if (Number.isFinite(nextDuration) && nextDuration > 0 && Math.abs(nextDuration - previousDuration) > 0.01) {
            this.syncClipsToAssetDuration(assetId, previousDuration, nextDuration);
        }

        this.emit();
    }

    deleteAsset(assetId) {
        if (!assetId) return false;

        const assetIndex = this.state.assets.findIndex(item => item.id === assetId);
        if (assetIndex === -1) return false;

        const removedClipIds = new Set();
        this.getTrackIds().forEach((trackId) => {
            const existing = this.state.timeline[trackId] || [];
            const remaining = existing.filter((clip) => {
                if (clip.assetId !== assetId) return true;
                removedClipIds.add(clip.id);
                return false;
            });

            if (remaining.length !== existing.length) {
                this.state.timeline[trackId] = remaining;
                this.normalizeTrack(trackId);
            }
        });

        this.state.assets.splice(assetIndex, 1);
        this.state.selectedClipIds = this.state.selectedClipIds.filter((clipId) => !removedClipIds.has(clipId));
        this.state.selectedClipId = this.state.selectedClipIds.includes(this.state.selectedClipId)
            ? this.state.selectedClipId
            : (this.state.selectedClipIds[this.state.selectedClipIds.length - 1] || null);

        if (this.state.selectedAssetId === assetId) {
            this.state.selectedAssetId = this.state.assets[0]?.id || null;
        }

        if (!this.state.selectedClipId && this.state.selectedAssetId) {
            const selectedAsset = this.getAssetById(this.state.selectedAssetId);
            if (selectedAsset) {
                this.state.selectedTrackName = this.getTrackNameForKind(selectedAsset.kind);
            }
        }

        this.emit();
        return true;
    }

    syncClipsToAssetDuration(assetId, previousDuration = 0, nextDuration = 0) {
        const prior = Math.max(Number(previousDuration) || 0, 0);
        const next = Math.max(Number(nextDuration) || 0, 0);
        if (!next) return;

        this.getTrackIds().forEach((trackId) => {
            let trackChanged = false;
            const track = this.state.timeline[trackId] || [];
            track.sort((left, right) => (Number(left.timelineStart) || 0) - (Number(right.timelineStart) || 0));
            track.forEach((clip) => {
                if (clip.assetId !== assetId) return;

                const clipDuration = Number(clip.duration) || 0;
                const sourceDuration = Number(clip.sourceDuration) || 0;
                const sourceEnd = Number(clip.sourceEnd) || 0;
                const sourceStart = Number(clip.sourceStart) || 0;
                const timelineStart = Math.max(Number(clip.timelineStart) || 0, 0);
                const timelineEnd = Math.max(Number(clip.timelineEnd) || (timelineStart + clipDuration), timelineStart);
                const usedPlaceholderDuration = prior <= 0.01 && Math.abs(clipDuration - 5) < 0.01;
                const matchedPriorDuration = prior > 0.01
                    && Math.abs(clipDuration - prior) < 0.01
                    && Math.abs(sourceDuration - prior) < 0.01
                    && Math.abs(sourceEnd - prior) < 0.01
                    && Math.abs(sourceStart) < 0.01;

                if (!usedPlaceholderDuration && !matchedPriorDuration) return;

                clip.duration = next;
                clip.sourceDuration = next;
                clip.sourceStart = 0;
                clip.sourceEnd = next;
                clip.timelineStart = Number(timelineStart.toFixed(3));
                clip.timelineEnd = Number((clip.timelineStart + next).toFixed(3));
                this.shiftFollowingClipsAfterDurationSync(track, clip.id, timelineEnd, next - clipDuration);
                trackChanged = true;
            });

            if (trackChanged) {
                this.normalizeTrack(trackId);
            }
        });
    }

    shiftFollowingClipsAfterDurationSync(track = [], changedClipId = null, previousEnd = 0, durationDelta = 0) {
        const delta = Number(durationDelta) || 0;
        if (!Array.isArray(track) || Math.abs(delta) < 0.001) return;

        const oldEnd = Math.max(Number(previousEnd) || 0, 0);
        track.forEach((clip) => {
            if (!clip || clip.id === changedClipId) return;

            const clipStart = Math.max(Number(clip.timelineStart) || 0, 0);
            if (clipStart < oldEnd - 0.001) return;

            clip.timelineStart = Number(Math.max(0, clipStart + delta).toFixed(3));
            clip.timelineEnd = Number((clip.timelineStart + (Number(clip.duration) || 0)).toFixed(3));
        });
    }

    selectAsset(assetId) {
        if (!assetId) return;
        this.state.selectedAssetId = assetId;
        const asset = this.getAssetById(assetId);
        if (asset) {
            this.state.selectedTrackName = this.getTrackNameForKind(asset.kind);
        }
        this.emit();
    }

    selectTrack(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        if (!normalizedTrackId || !this.state.timeline[normalizedTrackId]) return null;
        this.state.selectedTrackName = normalizedTrackId;
        this.emit();
        return normalizedTrackId;
    }

    normalizeTrackId(trackName) {
        if (!trackName) return null;
        if (this.state.timeline[trackName]) return trackName;
        if (trackName === 'video' || trackName === 'audio' || trackName === 'image') {
            return this.getTrackIdsByType(trackName)[0] || null;
        }
        return null;
    }

    getTrackPrefix(type) {
        if (type === 'audio') return 'a';
        if (type === 'image') return 'g';
        return 'v';
    }

    getTrackType(trackId) {
        const normalizedTrackId = this.normalizeTrackId(trackId) || trackId;
        return this.state.trackMeta[normalizedTrackId]?.type || null;
    }

    getTrackMeta(trackId) {
        const meta = this.state.trackMeta[this.normalizeTrackId(trackId) || trackId];
        return meta ? { ...meta } : null;
    }

    getTrackIds() {
        return this.state.trackOrder.filter((trackId) => !!this.state.timeline[trackId]);
    }

    getTrackIdsByType(type) {
        return this.getTrackIds().filter((trackId) => this.getTrackType(trackId) === type);
    }

    getTrackNumber(trackId) {
        const normalizedTrackId = this.normalizeTrackId(trackId) || trackId;
        const match = String(normalizedTrackId || '').match(/^(?:[a-z]+)(\d+)$/i);
        const trackNumber = match ? Number.parseInt(match[1], 10) : Number.NaN;
        return Number.isFinite(trackNumber) ? trackNumber : null;
    }

    getTrackIdsByTypeInNumericOrder(type) {
        return this.getTrackIdsByType(type)
            .slice()
            .sort((leftTrackId, rightTrackId) => {
                const leftNumber = this.getTrackNumber(leftTrackId);
                const rightNumber = this.getTrackNumber(rightTrackId);
                if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
                    return leftNumber - rightNumber;
                }
                return String(leftTrackId).localeCompare(String(rightTrackId));
            });
    }

    getTrackGroup(type) {
        return type === 'audio' ? 'audio' : 'visual';
    }

    getTrackInsertIndexForType(type, trackOrder = this.state.trackOrder) {
        const orderedTrackIds = (Array.isArray(trackOrder) ? trackOrder : []).filter((trackId) => !!this.state.timeline[trackId]);
        const firstIndexOfType = (candidateType) => orderedTrackIds.findIndex((trackId) => this.getTrackType(trackId) === candidateType);
        const lastIndexOfType = (candidateType) => {
            for (let index = orderedTrackIds.length - 1; index >= 0; index -= 1) {
                if (this.getTrackType(orderedTrackIds[index]) === candidateType) {
                    return index;
                }
            }
            return -1;
        };

        if (type === 'audio') {
            const lastAudioIndex = lastIndexOfType('audio');
            return lastAudioIndex >= 0 ? lastAudioIndex + 1 : orderedTrackIds.length;
        }

        if (type === 'video') {
            const firstVideoIndex = firstIndexOfType('video');
            if (firstVideoIndex >= 0) return firstVideoIndex;
            const firstImageIndex = firstIndexOfType('image');
            if (firstImageIndex >= 0) return firstImageIndex;
            const firstAudioIndex = firstIndexOfType('audio');
            return firstAudioIndex >= 0 ? firstAudioIndex : 0;
        }

        if (type === 'image') {
            const lastImageIndex = lastIndexOfType('image');
            if (lastImageIndex >= 0) return lastImageIndex + 1;
            const firstAudioIndex = firstIndexOfType('audio');
            return firstAudioIndex >= 0 ? firstAudioIndex : orderedTrackIds.length;
        }

        return orderedTrackIds.length;
    }

    _createTrackAtIndex(kind, insertIndex, name = '', options = {}) {
        const type = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
        const prefix = this.getTrackPrefix(type);
        const existingIds = this.getTrackIdsByType(type)
            .map((trackId) => Number.parseInt(trackId.slice(1), 10))
            .filter(Number.isFinite);
        const nextNumber = existingIds.length ? Math.max(...existingIds) + 1 : 1;
        const trackId = `${prefix}${nextNumber}`;
        const trackName = String(name || `${prefix.toUpperCase()}${nextNumber}`).trim();
        const resolvedIndex = Math.max(0, Math.min(Number(insertIndex) || 0, this.state.trackOrder.length));
        const referenceHeight = Number(options.referenceHeight) || 64;

        this.state.trackOrder.splice(resolvedIndex, 0, trackId);
        this.state.trackMeta[trackId] = {
            id: trackId,
            type,
            name: trackName,
            height: Math.min(Math.max(referenceHeight, 52), 180),
            isUserCreated: true
        };
        this.state.trackControls[trackId] = { muted: false, locked: false, hidden: false, solo: false };
        this.state.timeline[trackId] = [];

        if (options.select !== false) {
            this.state.selectedTrackName = trackId;
        }
        if (options.emit !== false) {
            this.emit({ recordHistory: options.recordHistory !== false });
        }
        return trackId;
    }

    getCompanionTrackInsertPosition(referenceTrackId, companionType) {
        const referenceType = this.getTrackType(referenceTrackId);
        if (companionType === 'video' && referenceType === 'audio') {
            return 'above';
        }
        return 'below';
    }

    getAdjacentTrackByType(referenceTrackId, type, position = 'below', options = {}) {
        const normalizedReferenceTrackId = this.normalizeTrackId(referenceTrackId);
        if (!normalizedReferenceTrackId) return null;

        const referenceIndex = this.state.trackOrder.indexOf(normalizedReferenceTrackId);
        if (referenceIndex < 0) return null;

        const candidateIndex = position === 'above' ? referenceIndex - 1 : referenceIndex + 1;
        const candidateTrackId = this.state.trackOrder[candidateIndex] || null;
        if (!candidateTrackId || this.getTrackType(candidateTrackId) !== type) {
            return null;
        }
        if (options.userCreatedOnly && !this.state.trackMeta[candidateTrackId]?.isUserCreated) {
            return null;
        }
        return this.isTrackLocked(candidateTrackId) ? null : candidateTrackId;
    }

    _resolveRelativeTrackId(sourceAnchorTrackId, targetAnchorTrackId, currentTrackId, options = {}) {
        const normalizedSourceAnchorTrackId = this.normalizeTrackId(sourceAnchorTrackId);
        const normalizedTargetAnchorTrackId = this.normalizeTrackId(targetAnchorTrackId);
        const normalizedCurrentTrackId = this.normalizeTrackId(currentTrackId);
        const shouldCreateMissing = options?.createMissing === true;

        if (!normalizedSourceAnchorTrackId || !normalizedTargetAnchorTrackId || !normalizedCurrentTrackId) {
            return normalizedCurrentTrackId || currentTrackId || null;
        }

        const anchorType = this.getTrackType(normalizedSourceAnchorTrackId);
        if (!anchorType || this.getTrackType(normalizedTargetAnchorTrackId) !== anchorType) {
            return normalizedCurrentTrackId;
        }

        const anchorTracks = this.getTrackIdsByTypeInNumericOrder(anchorType);
        const sourceIndex = anchorTracks.indexOf(normalizedSourceAnchorTrackId);
        const targetIndex = anchorTracks.indexOf(normalizedTargetAnchorTrackId);
        if (sourceIndex < 0 || targetIndex < 0) {
            return normalizedCurrentTrackId;
        }

        const currentType = this.getTrackType(normalizedCurrentTrackId);
        let typeTracks = this.getTrackIdsByTypeInNumericOrder(currentType);
        const currentIndex = typeTracks.indexOf(normalizedCurrentTrackId);
        if (currentIndex < 0) {
            return normalizedCurrentTrackId;
        }

        const relativeIndex = currentIndex + (targetIndex - sourceIndex);
        let candidateTrackId = typeTracks[relativeIndex] || null;
        const companionInsertPosition = this.getCompanionTrackInsertPosition(normalizedTargetAnchorTrackId, currentType);

        if (!candidateTrackId) {
            candidateTrackId = this.getAdjacentTrackByType(normalizedTargetAnchorTrackId, currentType, companionInsertPosition, { userCreatedOnly: true });
        }

        if ((!candidateTrackId || this.isTrackLocked(candidateTrackId)) && shouldCreateMissing) {
            let createAttemptCount = 0;
            while (relativeIndex >= typeTracks.length && createAttemptCount < 8) {
                const createdTrackId = this.createTrackRelative(
                    currentType,
                    normalizedTargetAnchorTrackId,
                    companionInsertPosition,
                    '',
                    { select: false, emit: false }
                );
                if (!createdTrackId) break;
                typeTracks = this.getTrackIdsByTypeInNumericOrder(currentType);
                createAttemptCount += 1;
            }

            candidateTrackId = typeTracks[relativeIndex] || candidateTrackId;
            if (candidateTrackId && !this.isTrackLocked(candidateTrackId)) {
                return candidateTrackId;
            }
        }

        if (!candidateTrackId) {
            const clampedIndex = Math.max(0, Math.min(relativeIndex, typeTracks.length - 1));
            candidateTrackId = typeTracks[clampedIndex] || normalizedCurrentTrackId;
        }

        return this.isTrackLocked(candidateTrackId) ? normalizedCurrentTrackId : candidateTrackId;
    }

    getTracks() {
        return this.getTrackIds().map((trackId) => ({
            ...(this.getTrackMeta(trackId) || { id: trackId, type: 'video', name: trackId.toUpperCase() }),
            controls: { ...(this.state.trackControls[trackId] || {}) },
            clips: this.getTrack(trackId).map((clip) => ({ ...clip }))
        }));
    }

    resolveTrackIds(trackNames = null) {
        if (!Array.isArray(trackNames) || !trackNames.length) {
            return this.getTrackIds();
        }

        const resolved = [];
        trackNames.forEach((entry) => {
            if (this.state.timeline[entry]) {
                resolved.push(entry);
                return;
            }

            this.getTrackIdsByType(entry).forEach((trackId) => resolved.push(trackId));
        });

        return [...new Set(resolved)];
    }

    createTrack(kind, name = '', options = {}) {
        const type = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
        return this._createTrackAtIndex(
            type,
            this.getTrackInsertIndexForType(type),
            name,
            options
        );
    }

    createTrackAdjacent(referenceTrackId, position = 'below', name = '', options = {}) {
        const normalizedReferenceTrackId = this.normalizeTrackId(referenceTrackId);
        if (!normalizedReferenceTrackId || !this.state.timeline[normalizedReferenceTrackId]) {
            return null;
        }

        const type = this.getTrackType(normalizedReferenceTrackId);
        const referenceIndex = this.state.trackOrder.indexOf(normalizedReferenceTrackId);
        const insertIndex = position === 'above' ? referenceIndex : referenceIndex + 1;

        return this._createTrackAtIndex(type, Math.max(insertIndex, 0), name, {
            referenceHeight: this.state.trackMeta[normalizedReferenceTrackId]?.height || 64,
            ...options
        });
    }

    createTrackRelative(kind, referenceTrackId, position = 'below', name = '', options = {}) {
        const normalizedReferenceTrackId = this.normalizeTrackId(referenceTrackId);
        if (!normalizedReferenceTrackId || !this.state.timeline[normalizedReferenceTrackId]) {
            return null;
        }

        const type = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
        const referenceType = this.getTrackType(normalizedReferenceTrackId);
        if (this.getTrackGroup(type) !== this.getTrackGroup(referenceType)) {
            return this._createTrackAtIndex(type, this.getTrackInsertIndexForType(type), name, {
                referenceHeight: this.state.trackMeta[normalizedReferenceTrackId]?.height || 64,
                ...options
            });
        }

        const referenceIndex = this.state.trackOrder.indexOf(normalizedReferenceTrackId);
        const insertIndex = position === 'above' ? referenceIndex : referenceIndex + 1;
        return this._createTrackAtIndex(kind, Math.max(insertIndex, 0), name, {
            referenceHeight: this.state.trackMeta[normalizedReferenceTrackId]?.height || 64,
            ...options
        });
    }

    moveTrack(trackId, referenceTrackId, position = 'below') {
        const normalizedTrackId = this.normalizeTrackId(trackId);
        const normalizedReferenceTrackId = this.normalizeTrackId(referenceTrackId);
        if (!normalizedTrackId || !normalizedReferenceTrackId || normalizedTrackId === normalizedReferenceTrackId) {
            return false;
        }

        const trackType = this.getTrackType(normalizedTrackId);
        const referenceType = this.getTrackType(normalizedReferenceTrackId);

        const currentIndex = this.state.trackOrder.indexOf(normalizedTrackId);
        let referenceIndex = this.state.trackOrder.indexOf(normalizedReferenceTrackId);
        if (currentIndex < 0 || referenceIndex < 0) {
            return false;
        }

        const nextTrackOrder = this.state.trackOrder.filter((trackEntryId) => trackEntryId !== normalizedTrackId);
        let insertIndex = 0;

        if (this.getTrackGroup(trackType) === this.getTrackGroup(referenceType)) {
            referenceIndex = nextTrackOrder.indexOf(normalizedReferenceTrackId);
            insertIndex = position === 'above' ? referenceIndex : referenceIndex + 1;
        } else {
            insertIndex = this.getTrackInsertIndexForType(trackType, nextTrackOrder);
        }

        nextTrackOrder.splice(Math.max(0, Math.min(insertIndex, nextTrackOrder.length)), 0, normalizedTrackId);
        this.state.trackOrder = nextTrackOrder;
        this.state.selectedTrackName = normalizedTrackId;
        this.emit();
        return true;
    }

    getTrackHeight(trackId) {
        const normalizedTrackId = this.normalizeTrackId(trackId) || trackId;
        const height = Number(this.state.trackMeta[normalizedTrackId]?.height);
        return Math.min(Math.max(height || 64, 52), 180);
    }

    setTrackHeight(trackId, height) {
        const normalizedTrackId = this.normalizeTrackId(trackId);
        if (!normalizedTrackId || !this.state.trackMeta[normalizedTrackId]) return null;
        const nextHeight = Math.min(Math.max(Number(height) || 64, 52), 180);
        if (Math.abs((this.state.trackMeta[normalizedTrackId].height || 64) - nextHeight) < 1) {
            return nextHeight;
        }
        this.state.trackMeta[normalizedTrackId].height = nextHeight;
        this.emit();
        return nextHeight;
    }

    renameTrack(trackId, name) {
        const meta = this.state.trackMeta[trackId];
        const normalized = String(name || '').trim();
        if (!meta || !normalized) return false;
        meta.name = normalized;
        this.emit();
        return true;
    }

    clearTrack(trackId) {
        const normalizedTrackId = this.normalizeTrackId(trackId);
        if (!normalizedTrackId || !this.state.timeline[normalizedTrackId]) return false;
        if (this.isTrackLocked(normalizedTrackId)) return false;
        const hadSelectedClipOnTrack = this.state.selectedClipIds.some((clipId) => {
            return this.findClipById(clipId)?.trackName === normalizedTrackId;
        });
        this.state.timeline[normalizedTrackId] = [];

        if (hadSelectedClipOnTrack) {
            this.state.selectedClipIds = [];
            this.state.selectedClipId = null;
        }

        this.emit();
        return true;
    }

    deleteTrack(trackId, options = {}) {
        const normalizedTrackId = this.normalizeTrackId(trackId);
        if (!normalizedTrackId || !this.state.timeline[normalizedTrackId]) return false;
        const { force = false } = options;
        const type = this.getTrackType(normalizedTrackId);
        if (this.getTrackIdsByType(type).length <= 1) return false;
        if (this.getTrack(normalizedTrackId).length && !force) return false;

        delete this.state.timeline[normalizedTrackId];
        delete this.state.trackControls[normalizedTrackId];
        delete this.state.trackMeta[normalizedTrackId];
        this.state.trackOrder = this.state.trackOrder.filter((id) => id !== normalizedTrackId);

        const remainingSelected = this.state.selectedClipIds.filter((clipId) => {
            const match = this.findClipById(clipId);
            return !!match;
        });
        this.state.selectedClipIds = remainingSelected;
        this.state.selectedClipId = remainingSelected[remainingSelected.length - 1] || null;

        if (this.state.selectedTrackName === normalizedTrackId) {
            this.state.selectedTrackName = this.getTrackIdsByType(type)[0] || this.getTrackIds()[0] || null;
        }

        // Timeline emptied: reset playhead so program monitor doesn't stay mid-clip with no content.
        if (this.getAllClips().length === 0) {
            this.state.playheadTime = 0;
            this.state.selectedClipId = null;
            this.state.selectedClipIds = [];
        }

        this.emit({ recordHistory: options.recordHistory !== false });
        return true;
    }

    selectClip(clipId) {
        this.setClipSelection(clipId);
    }

    clearClipSelection() {
        this.state.selectedClipId = null;
        this.state.selectedClipIds = [];
        this.emit();
    }

    setSelectedClips(clipIds = [], primaryClipId = null, options = {}) {
        const uniqueClipIds = [...new Set((Array.isArray(clipIds) ? clipIds : []).filter(Boolean))];
        const validClipIds = uniqueClipIds.filter((clipId) => !!this.findClipById(clipId));
        const preservePlayhead = options?.preservePlayhead === true;
        const previousPlayheadTime = this.state.playheadTime;

        if (!validClipIds.length) {
            this.state.selectedClipId = null;
            this.state.selectedClipIds = [];
            this.emit();
            return [];
        }

        const resolvedPrimaryId = validClipIds.includes(primaryClipId)
            ? primaryClipId
            : validClipIds[validClipIds.length - 1];
        const primaryMatch = this.findClipById(resolvedPrimaryId);

        this.state.selectedClipId = resolvedPrimaryId;
        this.state.selectedClipIds = validClipIds;
        this.state.selectedAssetId = primaryMatch?.clip?.assetId || this.state.selectedAssetId;
        this.state.selectedTrackName = primaryMatch?.trackName || this.state.selectedTrackName;
        this.state.playheadTime = preservePlayhead
            ? Number((previousPlayheadTime || 0).toFixed(3))
            : Number(((primaryMatch?.clip?.timelineStart) || 0).toFixed(3));
        this.emit();
        return [...validClipIds];
    }

    setClipSelection(clipId, options = {}) {
        const {
            additive = false,
            toggle = additive,
            preservePlayhead = false
        } = options;

        if (!clipId) {
            this.clearClipSelection();
            return [];
        }

        const match = this.findClipById(clipId);
        if (!match) return [];

        if (!additive) {
            return this.setSelectedClips([clipId], clipId, { preservePlayhead });
        }

        const nextSelection = [...this.state.selectedClipIds];
        const existingIndex = nextSelection.indexOf(clipId);

        if (existingIndex >= 0 && toggle) {
            nextSelection.splice(existingIndex, 1);
            const nextPrimaryId = clipId === this.state.selectedClipId
                ? nextSelection[nextSelection.length - 1] || null
                : this.state.selectedClipId;
            return this.setSelectedClips(nextSelection, nextPrimaryId, { preservePlayhead });
        }

        if (existingIndex === -1) {
            nextSelection.push(clipId);
        }

        return this.setSelectedClips(nextSelection, clipId, { preservePlayhead });
    }

    getAssetById(assetId) {
        return this.state.assets.find(asset => asset.id === assetId) || null;
    }

    getPreferredPreviewAsset() {
        return this.getAssetById(this.state.selectedAssetId) || this.state.assets[0] || null;
    }

    getTrackNameForKind(kind) {
        const type = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';
        if (this.state.selectedTrackName && this.getTrackType(this.state.selectedTrackName) === type) {
            return this.state.selectedTrackName;
        }
        return this.getTrackIdsByType(type)[0] || this.createTrack(type);
    }

    getTrack(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        return this.state.timeline[normalizedTrackId] || [];
    }

    getTimelineDuration() {
        return this.getAllClips().reduce((maxValue, clip) => {
            return Math.max(maxValue, clip.timelineEnd || 0);
        }, 0);
    }

    setPlayheadTime(time) {
        const requested = Math.max(Number(time) || 0, 0);
        const timelineDuration = this.getTimelineDuration();
        const clamped = timelineDuration > 0 ? Math.min(requested, timelineDuration) : requested;
        const normalized = Number(clamped.toFixed(3));
        if (this.state.playheadTime === normalized) {
            return this.state.playheadTime;
        }

        this.state.playheadTime = normalized;
        this.emit({ recordHistory: false, changeType: 'playhead' });
        return this.state.playheadTime;
    }

    setTimelineZoom(value, options = {}) {
        const parsedValue = Number(value);
        const normalized = Math.min(
            Math.max(Number.isFinite(parsedValue) ? parsedValue : 100, 25),
            400
        );
        this.state.timelineZoomMode = options.mode === 'fit' ? 'fit' : 'manual';
        this.state.timelineZoom = normalized;
        this.emit();
        return normalized;
    }

    setTimelineSnapEnabled(enabled) {
        const nextEnabled = enabled !== false;
        if (this.state.timelineSnapEnabled === nextEnabled) return nextEnabled;
        this.state.timelineSnapEnabled = nextEnabled;
        this.emit();
        return nextEnabled;
    }

    toggleTimelineSnapEnabled() {
        return this.setTimelineSnapEnabled(!this.state.timelineSnapEnabled);
    }

    isClipReferenceActive(clip, trackName = null) {
        if (!clip) return false;

        const resolvedTrackName = trackName
            || this.findClipById(clip.id)?.trackName
            || null;
        if (!resolvedTrackName || !this.isTrackActive(resolvedTrackName)) {
            return false;
        }

        return true;
    }

    getActiveClipAtTime(time, trackNames = ['video', 'audio', 'image']) {
        const targetTime = Math.max(Number(time) || 0, 0);
        for (const trackName of this.resolveTrackIds(trackNames)) {
            if (!this.isTrackActive(trackName)) continue;
            const clip = this.getTrack(trackName).find((item) => {
                return targetTime >= item.timelineStart
                    && targetTime <= item.timelineEnd
                    && this.isClipReferenceActive(item, trackName);
            });
            if (clip) return clip;
        }
        return null;
    }

    getNextClipAfterTime(time, trackNames = ['video', 'audio', 'image']) {
        const targetTime = Math.max(Number(time) || 0, 0);
        const clips = this.resolveTrackIds(trackNames)
            .filter((trackName) => this.isTrackActive(trackName))
            .flatMap((trackName) => this.getTrack(trackName)
                .filter((clip) => this.isClipReferenceActive(clip, trackName)));
        return clips
            .filter((clip) => (clip.timelineStart || 0) >= targetTime - 0.001)
            .sort((left, right) => {
                if (left.timelineStart !== right.timelineStart) {
                    return left.timelineStart - right.timelineStart;
                }
                return (left.timelineEnd || 0) - (right.timelineEnd || 0);
            })[0] || null;
    }

    getTrackControl(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        return this.state.trackControls[normalizedTrackId] || { muted: false, locked: false, hidden: false, solo: false };
    }

    isTrackMuted(trackName) {
        return !!this.getTrackControl(trackName)?.muted;
    }

    isTrackLocked(trackName) {
        return !!this.getTrackControl(trackName)?.locked;
    }

    isTrackHidden(trackName) {
        return !!this.getTrackControl(trackName)?.hidden;
    }

    isTrackSolo(trackName) {
        return !!this.getTrackControl(trackName)?.solo;
    }

    hasSoloTracks() {
        return Object.values(this.state.trackControls).some((control) => !!control?.solo);
    }

    isTrackActive(trackName) {
        if (this.isTrackHidden(trackName)) return false;
        if (!this.hasSoloTracks()) return true;
        return this.isTrackSolo(trackName);
    }

    toggleTrackMuted(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        if (!this.state.trackControls[normalizedTrackId]) return false;
        this.state.trackControls[normalizedTrackId].muted = !this.state.trackControls[normalizedTrackId].muted;
        this.emit();
        return this.state.trackControls[normalizedTrackId].muted;
    }

    toggleTrackLocked(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        if (!this.state.trackControls[normalizedTrackId]) return false;
        this.state.trackControls[normalizedTrackId].locked = !this.state.trackControls[normalizedTrackId].locked;
        this.emit();
        return this.state.trackControls[normalizedTrackId].locked;
    }

    toggleTrackHidden(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        if (!this.state.trackControls[normalizedTrackId]) return false;
        this.state.trackControls[normalizedTrackId].hidden = !this.state.trackControls[normalizedTrackId].hidden;
        this.emit();
        return this.state.trackControls[normalizedTrackId].hidden;
    }

    toggleTrackSolo(trackName) {
        const normalizedTrackId = this.normalizeTrackId(trackName);
        if (!this.state.trackControls[normalizedTrackId]) return false;
        this.state.trackControls[normalizedTrackId].solo = !this.state.trackControls[normalizedTrackId].solo;
        this.emit();
        return this.state.trackControls[normalizedTrackId].solo;
    }

    getAllClips() {
        return this.getTrackIds().flatMap((trackId) => this.state.timeline[trackId] || []);
    }

    findClipById(clipId) {
        const trackNames = this.getTrackIds();
        for (const trackName of trackNames) {
            const clipIndex = this.state.timeline[trackName].findIndex(clip => clip.id === clipId);
            if (clipIndex >= 0) {
                return {
                    trackName,
                    clipIndex,
                    clip: this.state.timeline[trackName][clipIndex]
                };
            }
        }
        return null;
    }

    getSelectedClip() {
        if (!this.state.selectedClipId) return null;
        return this.findClipById(this.state.selectedClipId)?.clip || null;
    }

    getSelectedClips() {
        return this.state.selectedClipIds
            .map((clipId) => this.findClipById(clipId)?.clip || null)
            .filter(Boolean);
    }

    isClipSelected(clipId) {
        return this.state.selectedClipIds.includes(clipId);
    }

    getTimelineClipCount() {
        return this.getAllClips().length;
    }

    normalizeClipSpeed(speed) {
        const normalized = Number(speed);
        if (!Number.isFinite(normalized) || normalized <= 0) return 1;
        return Math.min(Math.max(normalized, 0.25), 4);
    }

    getClipSourceStart(clip) {
        return Math.max(Number(clip?.sourceStart) || 0, 0);
    }

    getClipSourceEnd(clip) {
        const sourceStart = this.getClipSourceStart(clip);
        const sourceEnd = Number(clip?.sourceEnd);
        if (Number.isFinite(sourceEnd) && sourceEnd > sourceStart) {
            return sourceEnd;
        }

        const duration = Math.max(Number(clip?.duration) || 0.1, 0.1);
        const speed = this.normalizeClipSpeed(clip?.speed);
        return sourceStart + (duration * speed);
    }

    getClipSourceSpan(clip) {
        return Math.max(this.getClipSourceEnd(clip) - this.getClipSourceStart(clip), 0.01);
    }

    getMinimumSourceSpanForSpeed(speed) {
        return Math.max(0.01, 0.1 * this.normalizeClipSpeed(speed));
    }

    syncClipTimelineDurationFromSource(clip, speed = clip?.speed) {
        if (!clip) return null;
        const normalizedSpeed = this.normalizeClipSpeed(speed);
        const sourceSpan = this.getClipSourceSpan(clip);
        const timelineStart = Math.max(Number(clip.timelineStart) || 0, 0);

        clip.speed = normalizedSpeed;
        clip.duration = Number(Math.max(sourceSpan / normalizedSpeed, 0.1).toFixed(3));
        clip.timelineStart = Number(timelineStart.toFixed(3));
        clip.timelineEnd = Number((clip.timelineStart + clip.duration).toFixed(3));
        return clip;
    }

    normalizeTrack(trackName) {
        const track = this.getTrack(trackName);
        track.sort((a, b) => a.timelineStart - b.timelineStart);
        track.forEach(clip => {
            clip.timelineEnd = clip.timelineStart + clip.duration;
        });
    }

    _createUniqueId(prefix = 'id') {
        const cleanPrefix = String(prefix || 'id')
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'id';
        EditorProjectStore.ID_COUNTER += 1;
        return `${cleanPrefix}-${Date.now()}-${EditorProjectStore.ID_COUNTER}`;
    }

    _createUniqueClipId(prefix = 'clip') {
        let clipId = null;
        do {
            clipId = this._createUniqueId(prefix);
        } while (this.findClipById(clipId));
        return clipId;
    }

    _createUniqueLinkGroupId(prefix = 'link') {
        let linkGroupId = null;
        do {
            linkGroupId = this._createUniqueId(prefix);
        } while (this.getAllClips().some((clip) => clip.linkGroupId === linkGroupId));
        return linkGroupId;
    }

    _createClipFromAsset(asset, timelineStart = 0, overrides = {}) {
        const duration = Math.max(asset.duration || 5, 1);
        const start = Math.max(Number(timelineStart) || 0, 0);

        return {
            id: this._createUniqueClipId(`${asset.id}-clip`),
            assetId: asset.id,
            name: overrides.name ?? asset.name,
            duration,
            timelineStart: start,
            timelineEnd: start + duration,
            sourceStart: 0,
            sourceEnd: duration,
            sourceDuration: duration,
            kind: overrides.kind ?? asset.kind,
            linkGroupId: overrides.linkGroupId ?? null,
            x: 0,
            y: 0,
            scale: 100,
            flipX: false,
            flipY: false,
            rotation: 0,
            opacity: 100,
            volume: 100,
            speed: 1,
            muted: false
        };
    }

    _createClipCopy(sourceClip, timelineStart = 0, overrides = {}) {
        if (!sourceClip?.assetId) return null;

        const asset = this.getAssetById(sourceClip.assetId);
        if (!asset) return null;

        const start = Math.max(Number(timelineStart) || 0, 0);
        const clip = this._createClipFromAsset(asset, start, {
            kind: overrides.kind ?? sourceClip.kind,
            name: overrides.name ?? sourceClip.name,
            linkGroupId: overrides.linkGroupId ?? null
        });

        clip.duration = Math.max(Number(sourceClip.duration) || clip.duration, 0.1);
        clip.timelineStart = Number(start.toFixed(3));
        clip.timelineEnd = Number((clip.timelineStart + clip.duration).toFixed(3));
        clip.sourceStart = Number((Number(sourceClip.sourceStart) || 0).toFixed(3));
        clip.sourceEnd = Number((Number(sourceClip.sourceEnd) || clip.duration).toFixed(3));
        clip.sourceDuration = Math.max(Number(sourceClip.sourceDuration) || clip.duration, clip.duration);
        clip.x = Number(sourceClip.x) || 0;
        clip.y = Number(sourceClip.y) || 0;
        clip.scale = Number(sourceClip.scale) || 100;
        clip.flipX = !!sourceClip.flipX;
        clip.flipY = !!sourceClip.flipY;
        clip.rotation = Number(sourceClip.rotation) || 0;
        clip.opacity = Number(sourceClip.opacity) || 100;
        clip.volume = Number(sourceClip.volume) || 100;
        clip.speed = Number(sourceClip.speed) || 1;
        clip.muted = !!sourceClip.muted;
        return clip;
    }

    _resolvePasteTrackId(preferredTrackId, kind) {
        const trackType = kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : 'video';

        if (
            preferredTrackId
            && this.state.timeline[preferredTrackId]
            && this.getTrackType(preferredTrackId) === trackType
            && !this.isTrackLocked(preferredTrackId)
        ) {
            return preferredTrackId;
        }

        return this.getTrackIdsByType(trackType).find((trackId) => !this.isTrackLocked(trackId)) || null;
    }

    hasCopiedClips() {
        return !!(this.clipboard?.type === 'clips' && Array.isArray(this.clipboard.entries) && this.clipboard.entries.length);
    }

    _cloneClipboardData(clipboard = this.clipboard) {
        if (!clipboard) return null;
        return JSON.parse(JSON.stringify(clipboard));
    }

    copyClipSelection(clipIds = [], primaryClipId = this.state.selectedClipId) {
        const normalizedClipIds = [...new Set((Array.isArray(clipIds) ? clipIds : []).filter(Boolean))];
        if (!normalizedClipIds.length) return null;

        const matches = normalizedClipIds
            .map((copiedId) => this.findClipById(copiedId))
            .filter(Boolean);
        if (!matches.length) return null;
        if (matches.some((match) => this.isTrackLocked(match.trackName))) return null;

        const earliestStart = Math.min(...matches.map((match) => Number(match.clip.timelineStart) || 0));
        const sortedMatches = matches.slice().sort((left, right) => {
            const startDelta = (Number(left.clip.timelineStart) || 0) - (Number(right.clip.timelineStart) || 0);
            if (Math.abs(startDelta) > 0.001) return startDelta;
            return left.trackName.localeCompare(right.trackName);
        });
        const clipSpan = Math.max(...matches.map((match) => {
            const relativeStart = (Number(match.clip.timelineStart) || 0) - earliestStart;
            return relativeStart + Math.max(Number(match.clip.duration) || 0, 0.1);
        }));

        this.clipboard = {
            type: 'clips',
            primarySourceClipId: normalizedClipIds.includes(primaryClipId)
                ? primaryClipId
                : normalizedClipIds[0],
            sourceStart: Number(earliestStart.toFixed(3)),
            span: Number(clipSpan.toFixed(3)),
            lastPasteStart: null,
            entries: sortedMatches.map((match) => ({
                sourceClipId: match.clip.id,
                trackId: match.trackName,
                relativeStart: Number((((Number(match.clip.timelineStart) || 0) - earliestStart).toFixed(3))),
                clip: {
                    assetId: match.clip.assetId,
                    name: match.clip.name,
                    duration: match.clip.duration,
                    sourceStart: match.clip.sourceStart,
                    sourceEnd: match.clip.sourceEnd,
                    sourceDuration: match.clip.sourceDuration,
                    kind: match.clip.kind,
                    linkGroupId: match.clip.linkGroupId || null,
                    x: match.clip.x,
                    y: match.clip.y,
                    scale: match.clip.scale,
                    flipX: match.clip.flipX,
                    flipY: match.clip.flipY,
                    rotation: match.clip.rotation,
                    opacity: match.clip.opacity,
                    volume: match.clip.volume,
                    speed: match.clip.speed,
                    muted: match.clip.muted
                }
            }))
        };

        return this.clipboard;
    }

    copyClipOnly(clipId = this.state.selectedClipId) {
        if (!clipId) return null;
        return this.copyClipSelection([clipId], clipId);
    }

    copySelectedClipGroup(clipId = this.state.selectedClipId) {
        if (!clipId) return null;

        const copiedClipIds = this.getDraggedClipIds(clipId, [clipId]);
        return this.copyClipSelection(copiedClipIds, clipId);
    }

    pasteCopiedClips(targetStart = this.state.playheadTime) {
        if (!this.hasCopiedClips()) return null;

        const requestedStart = Math.max(Number(targetStart) || 0, 0);
        const targetEntries = this.clipboard.entries.map((entry) => ({
            ...entry,
            targetTrackId: this._resolvePasteTrackId(entry.trackId, entry.clip.kind)
        }));
        if (targetEntries.some((entry) => !entry.targetTrackId)) return null;

        const targetTrackIds = [...new Set(targetEntries.map((entry) => entry.targetTrackId))];
        const groupSpan = Math.max(...targetEntries.map((entry) => (Number(entry.relativeStart) || 0) + Math.max(Number(entry.clip.duration) || 0, 0.1)));
        const sharedStart = this._resolveSharedInsertionStart(targetTrackIds, requestedStart, groupSpan);
        const sourceLinkGroupIds = [...new Set(targetEntries.map((entry) => entry.clip.linkGroupId).filter(Boolean))];
        const shouldLinkGroup = sourceLinkGroupIds.length === 1 && targetEntries.length > 1;
        const nextLinkGroupId = shouldLinkGroup ? this._createUniqueLinkGroupId('link-copy') : null;

        const pastedEntries = targetEntries.map((entry) => {
            const nextStart = sharedStart + (Number(entry.relativeStart) || 0);
            const pastedClip = this._createClipCopy(entry.clip, nextStart, {
                linkGroupId: nextLinkGroupId,
                kind: entry.clip.kind,
                name: entry.clip.name
            });
            if (!pastedClip) return null;

            return {
                clip: pastedClip,
                trackId: entry.targetTrackId,
                sourceClipId: entry.sourceClipId
            };
        });

        if (pastedEntries.some((entry) => !entry)) return null;

        if (!pastedEntries.length) return null;

        pastedEntries.forEach((entry) => {
            this.state.timeline[entry.trackId].push(entry.clip);
            this.normalizeTrack(entry.trackId);
        });

        const primaryPastedEntry = pastedEntries.find((entry) => entry.sourceClipId === this.clipboard.primarySourceClipId) || pastedEntries[0];
        this.clipboard.lastPasteStart = Number(sharedStart.toFixed(3));
        this.clipboard.span = Number(groupSpan.toFixed(3));
        this.state.selectedClipId = primaryPastedEntry.clip.id;
        this.state.selectedClipIds = pastedEntries.map((entry) => entry.clip.id);
        this.state.selectedAssetId = primaryPastedEntry.clip.assetId;
        this.state.selectedTrackName = primaryPastedEntry.trackId;
        this.state.playheadTime = Number((primaryPastedEntry.clip.timelineStart || sharedStart || 0).toFixed(3));
        this.emit();
        return pastedEntries.map((entry) => entry.clip);
    }

    pasteCopiedClipsForward() {
        if (!this.hasCopiedClips()) return null;

        const nextStart = Number.isFinite(this.clipboard?.lastPasteStart)
            ? (Number(this.clipboard.lastPasteStart) + Math.max(Number(this.clipboard.span) || 0, 0.1))
            : (Number.isFinite(this.clipboard?.sourceStart)
                ? (Number(this.clipboard.sourceStart) + Math.max(Number(this.clipboard.span) || 0, 0.1))
                : Math.max(Number(this.state.playheadTime) || 0, 0));

        return this.pasteCopiedClips(nextStart);
    }

    duplicateClipSelection(clipIds = [], primaryClipId = this.state.selectedClipId) {
        const previousClipboard = this._cloneClipboardData();
        const copied = this.copyClipSelection(clipIds, primaryClipId);
        if (!copied) {
            this.clipboard = previousClipboard;
            return null;
        }

        const duplicated = this.pasteCopiedClipsForward();
        this.clipboard = previousClipboard;
        return duplicated;
    }

    duplicateClipOnly(clipId = this.state.selectedClipId) {
        if (!clipId) return null;
        return this.duplicateClipSelection([clipId], clipId);
    }

    duplicateSelectedClipGroup(clipId = this.state.selectedClipId) {
        if (!clipId) return null;
        const duplicatedClipIds = this.getDraggedClipIds(clipId, [clipId]);
        return this.duplicateClipSelection(duplicatedClipIds, clipId);
    }

    _resolveSharedInsertionStart(trackNames = [], requestedStart = 0, clipDuration = 0) {
        const duration = Math.max(Number(clipDuration) || 0, 0.1);
        const lanes = trackNames.filter((trackName) => !!trackName && !!this.state.timeline[trackName]);
        let start = Math.max(Number(requestedStart) || 0, 0);

        for (let attempt = 0; attempt < 4; attempt += 1) {
            const nextStart = lanes.reduce((maxStart, trackName) => {
                return Math.max(maxStart, this._resolveTrackInsertionStart(trackName, maxStart, duration));
            }, start);

            if (Math.abs(nextStart - start) < 0.001) {
                return Number(nextStart.toFixed(3));
            }

            start = nextStart;
        }

        return Number(start.toFixed(3));
    }

    _createInsertionPlan(asset, preferredTrackId = null, requestedStart = 0) {
        if (!asset) return null;

        const primaryTrackId = preferredTrackId && this.getTrackType(preferredTrackId) === (asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video')
            ? preferredTrackId
            : this.getTrackNameForKind(asset.kind);
        if (!primaryTrackId || this.isTrackLocked(primaryTrackId)) return null;

        const previewClip = this._createClipFromAsset(asset, 0);
        const targetTracks = [primaryTrackId];
        const linkGroupId = asset.kind === 'video' ? this._createUniqueLinkGroupId(`link-${asset.id}`) : null;

        if (asset.kind === 'video') {
            const sourceVideoTrackId = this.getTrackIdsByTypeInNumericOrder('video')[0] || primaryTrackId;
            const baseAudioTrackId = this.getTrackIdsByTypeInNumericOrder('audio')[0] || this.createTrack('audio');
            const audioTrackId = this._resolveRelativeTrackId(sourceVideoTrackId, primaryTrackId, baseAudioTrackId, { createMissing: true });
            if (audioTrackId && !this.isTrackLocked(audioTrackId)) {
                targetTracks.push(audioTrackId);
            }
        }

        const sharedStart = this._resolveSharedInsertionStart(targetTracks, requestedStart, previewClip.duration);
        const clips = targetTracks.map((trackId, index) => ({
            trackId,
            clip: this._createClipFromAsset(asset, sharedStart, {
                kind: index > 0 && this.getTrackType(trackId) === 'audio' ? 'audio' : asset.kind,
                linkGroupId
            })
        }));

        return {
            primaryTrackId,
            primaryClip: clips[0]?.clip || null,
            clips
        };
    }

    _resolveTrackInsertionStart(trackName, requestedStart = 0, clipDuration = 0, movingClipId = null) {
        let insertionStart = Math.max(Number(requestedStart) || 0, 0);
        const duration = Math.max(Number(clipDuration) || 0, 0.1);
        const track = this.getTrack(trackName)
            .filter((clip) => clip.id !== movingClipId)
            .slice()
            .sort((left, right) => left.timelineStart - right.timelineStart);

        for (const clip of track) {
            const clipStart = Math.max(Number(clip.timelineStart) || 0, 0);
            const clipEnd = Math.max(Number(clip.timelineEnd) || (clipStart + (Number(clip.duration) || 0)), clipStart);
            if (insertionStart + duration <= clipStart + 0.001) {
                return Number(insertionStart.toFixed(3));
            }

            if (insertionStart < clipEnd - 0.001) {
                insertionStart = clipEnd;
            }
        }

        return Number(insertionStart.toFixed(3));
    }

    addAssetToTimeline(assetId) {
        const asset = this.getAssetById(assetId);
        if (!asset) return null;

        const lane = this.getTrackNameForKind(asset.kind);
        if (this.isTrackLocked(lane)) return null;
        const track = this.state.timeline[lane];
        const previousEnd = track.length > 0
            ? Math.max(...track.map(clip => clip.timelineStart + clip.duration))
            : 0;
        const plan = this._createInsertionPlan(asset, lane, previousEnd);
        if (!plan?.primaryClip) return null;

        plan.clips.forEach(({ trackId, clip }) => {
            this.state.timeline[trackId].push(clip);
            this.normalizeTrack(trackId);
        });

        this.state.selectedClipId = plan.primaryClip.id;
        this.state.selectedClipIds = [plan.primaryClip.id];
        this.state.selectedAssetId = asset.id;
        this.state.selectedTrackName = plan.primaryTrackId;
        this.emit();
        return plan.primaryClip;
    }

    addAssetsToTimeline(assetIds = []) {
        return assetIds
            .map(assetId => this.addAssetToTimeline(assetId))
            .filter(Boolean);
    }

    insertAssetAtTime(assetId, targetStart = 0, requestedTrackId = null) {
        const asset = this.getAssetById(assetId);
        if (!asset) return null;

        const preferredTrackId = requestedTrackId && this.getTrackType(requestedTrackId) === (asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video')
            ? requestedTrackId
            : this.getTrackNameForKind(asset.kind);
        const plan = this._createInsertionPlan(asset, preferredTrackId, targetStart);
        if (!plan?.primaryClip) return null;

        plan.clips.forEach(({ trackId, clip }) => {
            this.state.timeline[trackId].push(clip);
            this.normalizeTrack(trackId);
        });

        this.state.selectedClipId = plan.primaryClip.id;
        this.state.selectedClipIds = [plan.primaryClip.id];
        this.state.selectedAssetId = asset.id;
        this.state.selectedTrackName = plan.primaryTrackId;
        this.emit();
        return plan.primaryClip;
    }

    updateClip(clipId, patch = {}) {
        const match = this.findClipById(clipId);
        if (!match) return null;
        if (this.isTrackLocked(match.trackName)) return null;

        const hasSpeedPatch = Object.prototype.hasOwnProperty.call(patch, 'speed');
        const linkedPlaybackPatch = ['volume', 'muted'].reduce((values, field) => {
            if (Object.prototype.hasOwnProperty.call(patch, field)) {
                values[field] = patch[field];
            }
            return values;
        }, {});
        const shouldSyncLinkedPlayback = Object.keys(linkedPlaybackPatch).length > 0 && !!match.clip?.linkGroupId;
        const nextPatch = { ...patch };
        delete nextPatch.speed;
        const linkedPlaybackMatches = shouldSyncLinkedPlayback
            ? this.getMutableLinkedMatches(clipId).filter((candidate) => {
                const kind = candidate.clip?.kind
                    || this.getTrackType(candidate.trackName)
                    || this.getAssetById(candidate.clip?.assetId)?.kind;
                return kind === 'video' || kind === 'audio';
            })
            : [];
        if (shouldSyncLinkedPlayback && !linkedPlaybackMatches.length) return null;

        if (hasSpeedPatch) {
            const matches = match.clip?.linkGroupId ? this.getMutableLinkedMatches(clipId) : [match];
            if (!matches.length) return null;

            const nextSpeed = this.normalizeClipSpeed(patch.speed);
            const previews = matches.map((candidate) => {
                const preview = { ...candidate.clip };
                this.syncClipTimelineDurationFromSource(preview, nextSpeed);
                return { match: candidate, clip: preview };
            });

            const referenceDuration = Number(previews[0]?.clip?.duration) || 0;
            const durationsMatch = previews.every((preview) => {
                return Math.abs((Number(preview.clip.duration) || 0) - referenceDuration) <= 0.001;
            });
            if (previews.length > 1 && !durationsMatch) return null;

            previews.forEach(({ match: candidateMatch, clip }) => {
                candidateMatch.clip.speed = clip.speed;
                candidateMatch.clip.duration = clip.duration;
                candidateMatch.clip.timelineEnd = clip.timelineEnd;
            });
        }

        Object.assign(match.clip, nextPatch);
        linkedPlaybackMatches.forEach((candidate) => {
            Object.assign(candidate.clip, linkedPlaybackPatch);
        });
        if (typeof patch.duration === 'number' && Number.isFinite(patch.duration)) {
            match.clip.duration = Math.max(patch.duration, 0.1);
        }
        const affectedTracks = new Set([match.trackName]);
        if (hasSpeedPatch && match.clip?.linkGroupId) {
            this.getMutableLinkedMatches(clipId).forEach((candidate) => affectedTracks.add(candidate.trackName));
        }
        linkedPlaybackMatches.forEach((candidate) => affectedTracks.add(candidate.trackName));
        [...affectedTracks].forEach((trackName) => this.normalizeTrack(trackName));
        this.emit();
        return match.clip;
    }

    getMutableLinkedMatches(clipId) {
        const match = this.findClipById(clipId);
        if (!match) return [];

        const clipIds = match.clip?.linkGroupId
            ? this.getLinkedClipIds(clipId)
            : [clipId];
        const matches = [...new Set(clipIds)]
            .map((linkedClipId) => this.findClipById(linkedClipId))
            .filter(Boolean);
        if (!matches.length) return [];
        if (matches.some((candidate) => this.isTrackLocked(candidate.trackName))) return [];

        return matches;
    }

    applyClipTrimValues(clip, nextTrim = {}) {
        if (!clip) return null;

        const speed = this.normalizeClipSpeed(clip.speed);
        const minSourceSpan = this.getMinimumSourceSpanForSpeed(speed);
        const maxSourceDuration = Math.max(clip.sourceDuration || this.getClipSourceEnd(clip) || 0.1, minSourceSpan);
        const sourceStart = Number.isFinite(nextTrim.sourceStart)
            ? nextTrim.sourceStart
            : this.getClipSourceStart(clip);
        const sourceEnd = Number.isFinite(nextTrim.sourceEnd)
            ? nextTrim.sourceEnd
            : this.getClipSourceEnd(clip);

        const clampedStart = Math.min(Math.max(sourceStart, 0), Math.max(maxSourceDuration - minSourceSpan, 0));
        const clampedEnd = Math.max(
            Math.min(sourceEnd, maxSourceDuration),
            clampedStart + minSourceSpan
        );

        clip.sourceStart = Number(clampedStart.toFixed(3));
        clip.sourceEnd = Number(clampedEnd.toFixed(3));
        return this.syncClipTimelineDurationFromSource(clip, speed);
    }

    createTrimValuePreviews(matches = [], nextTrim = {}) {
        const previews = matches.map((match) => {
            const clip = this.applyClipTrimValues({ ...match.clip }, nextTrim);
            return clip ? { match, clip } : null;
        });
        if (previews.some((preview) => !preview)) return [];
        if (previews.length <= 1) return previews;

        const referenceDuration = Number(previews[0].clip.duration) || 0;
        const durationsMatch = previews.every((preview) => {
            return Math.abs((Number(preview.clip.duration) || 0) - referenceDuration) <= 0.001;
        });
        return durationsMatch ? previews : [];
    }

    applyTrimPreviewToClip(targetClip, previewClip) {
        if (!targetClip || !previewClip) return;
        targetClip.sourceStart = previewClip.sourceStart;
        targetClip.sourceEnd = previewClip.sourceEnd;
        targetClip.duration = previewClip.duration;
        targetClip.timelineStart = previewClip.timelineStart;
        targetClip.timelineEnd = previewClip.timelineEnd;
    }

    updateClipTrim(clipId, nextTrim = {}) {
        const matches = this.getMutableLinkedMatches(clipId);
        if (!matches.length) return null;

        const previews = this.createTrimValuePreviews(matches, nextTrim);
        if (!previews.length) return null;

        previews.forEach(({ match, clip }) => this.applyTrimPreviewToClip(match.clip, clip));
        [...new Set(matches.map((match) => match.trackName))]
            .forEach((trackName) => this.normalizeTrack(trackName));
        this.emit();
        return this.findClipById(clipId)?.clip || null;
    }

    applyClipEdgeTrim(clip, edge, targetValue) {
        if (!clip) return null;

        const minDuration = 0.1;
        const speed = this.normalizeClipSpeed(clip.speed);
        const minSourceSpan = this.getMinimumSourceSpanForSpeed(speed);
        const sourceDuration = Math.max(clip.sourceDuration || this.getClipSourceEnd(clip) || minSourceSpan, minSourceSpan);
        const currentStart = clip.timelineStart || 0;
        const currentEnd = clip.timelineEnd || (currentStart + clip.duration);
        const desiredValue = Number(targetValue);
        if (!Number.isFinite(desiredValue)) return null;

        if (edge === 'start') {
            const desiredStart = Math.min(Math.max(desiredValue, 0), currentEnd - minDuration);
            const sourceDelta = (desiredStart - currentStart) * speed;
            const currentSourceStart = this.getClipSourceStart(clip);
            const currentSourceEnd = this.getClipSourceEnd(clip);
            const nextSourceStart = Math.min(
                Math.max(currentSourceStart + sourceDelta, 0),
                currentSourceEnd - minSourceSpan
            );
            const appliedDelta = (nextSourceStart - currentSourceStart) / speed;

            clip.sourceStart = Number(nextSourceStart.toFixed(3));
            clip.timelineStart = Number((currentStart + appliedDelta).toFixed(3));
            this.syncClipTimelineDurationFromSource(clip, speed);
        } else if (edge === 'end') {
            const desiredEnd = Math.max(desiredValue, currentStart + minDuration);
            const sourceDelta = (desiredEnd - currentEnd) * speed;
            const currentSourceStart = this.getClipSourceStart(clip);
            const currentSourceEnd = this.getClipSourceEnd(clip);
            const nextSourceEnd = Math.max(
                Math.min(currentSourceEnd + sourceDelta, sourceDuration),
                currentSourceStart + minSourceSpan
            );
            const appliedDelta = (nextSourceEnd - currentSourceEnd) / speed;

            clip.sourceEnd = Number(nextSourceEnd.toFixed(3));
            clip.timelineEnd = Number((currentEnd + appliedDelta).toFixed(3));
            this.syncClipTimelineDurationFromSource(clip, speed);
        } else {
            return null;
        }

        return clip;
    }

    getClipEdgeValue(clip, edge) {
        if (edge === 'start') return Number(clip?.timelineStart) || 0;
        if (edge === 'end') {
            return Number(clip?.timelineEnd) || ((Number(clip?.timelineStart) || 0) + (Number(clip?.duration) || 0));
        }
        return Number.NaN;
    }

    createEdgeTrimPreviews(matches = [], edge, targetValue) {
        const previews = matches.map((match) => {
            const clip = this.applyClipEdgeTrim({ ...match.clip }, edge, targetValue);
            return clip ? { match, clip } : null;
        });
        if (previews.some((preview) => !preview)) return [];
        if (previews.length <= 1) return previews;

        const referenceEdgeValue = this.getClipEdgeValue(previews[0].clip, edge);
        if (!Number.isFinite(referenceEdgeValue)) return [];
        const edgeValuesMatch = previews.every((preview) => {
            const edgeValue = this.getClipEdgeValue(preview.clip, edge);
            return Number.isFinite(edgeValue) && Math.abs(edgeValue - referenceEdgeValue) <= 0.001;
        });
        return edgeValuesMatch ? previews : [];
    }

    trimClipEdge(clipId, edge, targetValue) {
        const matches = this.getMutableLinkedMatches(clipId);
        if (!matches.length) return null;

        const previews = this.createEdgeTrimPreviews(matches, edge, targetValue);
        if (!previews.length) return null;

        previews.forEach(({ match, clip }) => this.applyTrimPreviewToClip(match.clip, clip));
        [...new Set(previews.map(({ match }) => match.trackName))]
            .forEach((trackName) => this.normalizeTrack(trackName));
        this.emit();
        return this.findClipById(clipId)?.clip || null;
    }

    splitClip(clipId, ratio = 0.5) {
        const match = this.findClipById(clipId);
        if (!match) return null;
        if (this.isTrackLocked(match.trackName)) return null;

        const clip = match.clip;
        const splitRatio = Math.min(Math.max(ratio, 0.1), 0.9);
        const absoluteSplitTime = (clip.timelineStart || 0) + (clip.duration * splitRatio);
        return clip.linkGroupId
            ? this._splitClipGroupAtTime(clipId, absoluteSplitTime)
            : this._splitClipAtTime(clipId, absoluteSplitTime);
    }

    splitClipAtTime(clipId, timelineTime) {
        const match = this.findClipById(clipId);
        if (!match) return null;

        const clip = match.clip;
        const absoluteTime = Number(timelineTime);
        if (!Number.isFinite(absoluteTime)) return null;
        if (absoluteTime <= clip.timelineStart + 0.05 || absoluteTime >= clip.timelineEnd - 0.05) {
            return null;
        }

        const ratio = (absoluteTime - clip.timelineStart) / Math.max(clip.duration, 0.1);
        return this.splitClip(clipId, ratio);
    }

    areClipsMergeCompatible(leftClip, rightClip, options = {}) {
        if (!leftClip || !rightClip) return false;
        const comparableFields = [
            'assetId',
            'kind',
            'x',
            'y',
            'scale',
            'flipX',
            'flipY',
            'rotation',
            'opacity',
            'volume',
            'speed',
            'muted'
        ];
        if (options.ignoreLinkGroupId !== true) {
            comparableFields.push('linkGroupId');
        }

        const valuesMatch = comparableFields.every((field) => (leftClip[field] ?? null) === (rightClip[field] ?? null));
        if (!valuesMatch) return false;

        const timelineContiguous = Math.abs((Number(leftClip.timelineEnd) || 0) - (Number(rightClip.timelineStart) || 0)) <= 0.05;
        const sourceContiguous = Math.abs((Number(leftClip.sourceEnd) || 0) - (Number(rightClip.sourceStart) || 0)) <= 0.05;
        return timelineContiguous && sourceContiguous;
    }

    getSingleTrackMergePlan(matches = [], options = {}) {
        if (!Array.isArray(matches) || matches.length !== 2) return null;

        const orderedMatches = matches
            .filter(Boolean)
            .sort((left, right) => (Number(left.clip.timelineStart) || 0) - (Number(right.clip.timelineStart) || 0));

        if (orderedMatches.length !== 2) return null;
        if (orderedMatches[0].trackName !== orderedMatches[1].trackName) return null;
        if (this.isTrackLocked(orderedMatches[0].trackName)) return null;

        const [leftMatch, rightMatch] = orderedMatches;
        if (!this.areClipsMergeCompatible(leftMatch.clip, rightMatch.clip, options)) return null;

        return {
            type: 'single',
            leftMatch,
            rightMatch,
            pairs: [{ leftMatch, rightMatch }]
        };
    }

    getLinkGroupMatches(linkGroupId) {
        if (!linkGroupId) return [];
        return this.getAllClips()
            .filter((clip) => clip.linkGroupId === linkGroupId)
            .map((clip) => this.findClipById(clip.id))
            .filter(Boolean)
            .sort((left, right) => {
                const trackDelta = left.trackName.localeCompare(right.trackName);
                if (trackDelta !== 0) return trackDelta;
                return (Number(left.clip.timelineStart) || 0) - (Number(right.clip.timelineStart) || 0);
            });
    }

    getLinkedGroupMergePlanFromPair(leftMatch, rightMatch) {
        const orderedPair = this.getSingleTrackMergePlan([leftMatch, rightMatch], { ignoreLinkGroupId: true });
        if (!orderedPair) return null;

        const leftLinkGroupId = orderedPair.leftMatch.clip.linkGroupId || null;
        const rightLinkGroupId = orderedPair.rightMatch.clip.linkGroupId || null;
        if (!leftLinkGroupId || !rightLinkGroupId || leftLinkGroupId === rightLinkGroupId) return null;

        const leftGroupMatches = this.getLinkGroupMatches(leftLinkGroupId);
        const rightGroupMatches = this.getLinkGroupMatches(rightLinkGroupId);
        if (!leftGroupMatches.length || leftGroupMatches.length !== rightGroupMatches.length) return null;
        if (leftGroupMatches.some((match) => this.isTrackLocked(match.trackName))) return null;
        if (rightGroupMatches.some((match) => this.isTrackLocked(match.trackName))) return null;

        const rightByTrack = new Map(rightGroupMatches.map((match) => [match.trackName, match]));
        const pairs = [];
        for (const leftGroupMatch of leftGroupMatches) {
            const rightGroupMatch = rightByTrack.get(leftGroupMatch.trackName);
            if (!rightGroupMatch) return null;

            const pairPlan = this.getSingleTrackMergePlan(
                [leftGroupMatch, rightGroupMatch],
                { ignoreLinkGroupId: true }
            );
            if (!pairPlan) return null;
            pairs.push(pairPlan.pairs[0]);
        }

        return {
            type: 'linked-group',
            leftMatch: orderedPair.leftMatch,
            rightMatch: orderedPair.rightMatch,
            pairs,
            linkGroupId: leftLinkGroupId
        };
    }

    getAdjacentLinkedGroupMergePlan(groupMatches = [], direction = -1) {
        const normalizedMatches = Array.isArray(groupMatches) ? groupMatches.filter(Boolean) : [];
        if (!normalizedMatches.length) return null;

        const groupLinkGroupId = normalizedMatches[0].clip?.linkGroupId || null;
        if (!groupLinkGroupId || normalizedMatches.some((match) => match.clip?.linkGroupId !== groupLinkGroupId)) {
            return null;
        }

        const selectedTrackNames = new Set(normalizedMatches.map((match) => match.trackName));
        let adjacentLinkGroupId = null;
        const pairs = [];

        for (const match of normalizedMatches) {
            const track = this.state.timeline[match.trackName] || [];
            const clipIndex = track.findIndex((clip) => clip.id === match.clip.id);
            if (clipIndex < 0) return null;

            const adjacentClip = track[clipIndex + (direction < 0 ? -1 : 1)] || null;
            if (!adjacentClip?.linkGroupId || adjacentClip.linkGroupId === groupLinkGroupId) return null;
            if (adjacentLinkGroupId && adjacentClip.linkGroupId !== adjacentLinkGroupId) return null;
            adjacentLinkGroupId = adjacentClip.linkGroupId;

            const adjacentMatch = this.findClipById(adjacentClip.id);
            const pairPlan = direction < 0
                ? this.getSingleTrackMergePlan([adjacentMatch, match], { ignoreLinkGroupId: true })
                : this.getSingleTrackMergePlan([match, adjacentMatch], { ignoreLinkGroupId: true });
            if (!pairPlan) return null;
            pairs.push(pairPlan.pairs[0]);
        }

        const adjacentGroupMatches = this.getLinkGroupMatches(adjacentLinkGroupId);
        if (adjacentGroupMatches.length !== normalizedMatches.length) return null;
        if (adjacentGroupMatches.some((match) => !selectedTrackNames.has(match.trackName))) return null;

        return {
            type: 'linked-group',
            leftMatch: pairs[0].leftMatch,
            rightMatch: pairs[0].rightMatch,
            pairs,
            linkGroupId: direction < 0 ? adjacentLinkGroupId : groupLinkGroupId
        };
    }

    getMergePlanFromPairMatches(matches = []) {
        const singlePlan = this.getSingleTrackMergePlan(matches);
        if (singlePlan) return singlePlan;

        const orderedPair = this.getSingleTrackMergePlan(matches, { ignoreLinkGroupId: true });
        if (!orderedPair) return null;
        return this.getLinkedGroupMergePlanFromPair(orderedPair.leftMatch, orderedPair.rightMatch);
    }

    getMergePlanFromSelectedLinkedGroup(matches = []) {
        const normalizedMatches = Array.isArray(matches) ? matches.filter(Boolean) : [];
        if (normalizedMatches.length < 2) return null;

        const linkGroupId = normalizedMatches[0].clip?.linkGroupId || null;
        if (!linkGroupId || normalizedMatches.some((match) => match.clip?.linkGroupId !== linkGroupId)) {
            return null;
        }

        const fullGroupMatches = this.getLinkGroupMatches(linkGroupId);
        const selectedIds = new Set(normalizedMatches.map((match) => match.clip.id));
        if (fullGroupMatches.length !== selectedIds.size) return null;
        if (fullGroupMatches.some((match) => !selectedIds.has(match.clip.id))) return null;

        return this.getAdjacentLinkedGroupMergePlan(fullGroupMatches, -1)
            || this.getAdjacentLinkedGroupMergePlan(fullGroupMatches, 1);
    }

    getMergeableSelection(clipIds = this.state.selectedClipIds) {
        const normalizedClipIds = [...new Set((Array.isArray(clipIds) ? clipIds : []).filter(Boolean))];
        if (normalizedClipIds.length < 2) return null;

        const matches = normalizedClipIds
            .map((clipId) => this.findClipById(clipId))
            .filter(Boolean);

        if (matches.length !== normalizedClipIds.length) return null;
        if (matches.some((match) => this.isTrackLocked(match.trackName))) return null;

        if (matches.length === 2) {
            const pairPlan = this.getMergePlanFromPairMatches(matches);
            if (pairPlan) return pairPlan;
        }

        return this.getMergePlanFromSelectedLinkedGroup(matches);
    }

    getAdjacentMergeableClipIds(clipId) {
        const match = this.findClipById(clipId);
        if (!match) return [];

        const track = this.state.timeline[match.trackName] || [];
        const clipIndex = track.findIndex((clip) => clip.id === clipId);
        if (clipIndex < 0) return [];

        const candidates = [
            track[clipIndex - 1] ? [track[clipIndex - 1].id, clipId] : null,
            track[clipIndex + 1] ? [clipId, track[clipIndex + 1].id] : null
        ].filter(Boolean);

        const mergeablePair = candidates.find((candidateIds) => this.canMergeSelectedClips(candidateIds));
        return mergeablePair || [];
    }

    canMergeSelectedClips(clipIds = this.state.selectedClipIds) {
        return !!this.getMergeableSelection(clipIds);
    }

    mergeSelectedClips(clipIds = this.state.selectedClipIds) {
        const mergeable = this.getMergeableSelection(clipIds);
        if (!mergeable) return null;

        const previousPrimaryClipId = this.state.selectedClipId;
        const pairs = Array.isArray(mergeable.pairs) && mergeable.pairs.length
            ? mergeable.pairs
            : [{ leftMatch: mergeable.leftMatch, rightMatch: mergeable.rightMatch }];
        if (pairs.some(({ leftMatch, rightMatch }) => {
            const track = this.state.timeline[leftMatch?.trackName] || [];
            return !leftMatch?.clip || !rightMatch?.clip || track.findIndex((clip) => clip.id === rightMatch.clip.id) < 0;
        })) {
            return null;
        }

        const mergedEntries = [];
        const affectedTracks = new Set();

        pairs.forEach(({ leftMatch, rightMatch }) => {
            const track = this.state.timeline[leftMatch.trackName];
            const leftClip = leftMatch.clip;
            const rightClip = rightMatch.clip;
            const leftClipId = leftClip.id;
            const rightClipId = rightClip.id;
            const rightIndex = track.findIndex((clip) => clip.id === rightClip.id);

            leftClip.duration = Number(((Number(leftClip.duration) || 0) + (Number(rightClip.duration) || 0)).toFixed(3));
            leftClip.timelineEnd = Number((Number(rightClip.timelineEnd) || ((Number(leftClip.timelineStart) || 0) + leftClip.duration)).toFixed(3));
            leftClip.sourceEnd = Number((Number(rightClip.sourceEnd) || ((Number(leftClip.sourceStart) || 0) + leftClip.duration)).toFixed(3));
            leftClip.sourceDuration = Math.max(Number(leftClip.sourceDuration) || 0, Number(rightClip.sourceDuration) || 0, leftClip.duration);
            if (mergeable.type === 'linked-group' && mergeable.linkGroupId) {
                leftClip.linkGroupId = mergeable.linkGroupId;
                delete leftClip.suppressLegacyLink;
            }

            track.splice(rightIndex, 1);
            affectedTracks.add(leftMatch.trackName);
            mergedEntries.push({
                clip: leftClip,
                trackName: leftMatch.trackName,
                sourceClipIds: [leftClipId, rightClipId]
            });
        });

        if (!mergedEntries.length) return null;

        affectedTracks.forEach((trackName) => this.normalizeTrack(trackName));

        const primaryEntry = mergedEntries.find((entry) => entry.sourceClipIds.includes(previousPrimaryClipId))
            || mergedEntries.find((entry) => entry.clip.id === mergeable.leftMatch?.clip?.id)
            || mergedEntries[0];
        this.state.selectedClipId = primaryEntry.clip.id;
        this.state.selectedClipIds = mergeable.type === 'linked-group'
            ? [
                primaryEntry.clip.id,
                ...mergedEntries
                    .map((entry) => entry.clip.id)
                    .filter((clipId) => clipId !== primaryEntry.clip.id)
            ]
            : [primaryEntry.clip.id];
        this.state.selectedAssetId = primaryEntry.clip.assetId || this.state.selectedAssetId;
        this.state.selectedTrackName = primaryEntry.trackName;
        this.emit();
        return primaryEntry.clip;
    }

    _splitSingleClipMatch(match, absoluteTime, linkGroupIds = {}) {
        if (!match?.clip) return null;

        const clip = match.clip;
        const splitOffset = Number((absoluteTime - (clip.timelineStart || 0)).toFixed(3));
        const firstDuration = Math.max(splitOffset, 0.1);
        const secondDuration = Math.max(Number((clip.duration - firstDuration).toFixed(3)), 0.1);
        if (firstDuration <= 0 || secondDuration <= 0) return null;
        const speed = this.normalizeClipSpeed(clip.speed);
        const sourceStart = this.getClipSourceStart(clip);
        const sourceEnd = this.getClipSourceEnd(clip);
        const sourceSplitTime = Math.min(
            Math.max(sourceStart + (firstDuration * speed), sourceStart),
            sourceEnd
        );

        const secondClip = {
            ...clip,
            id: this._createUniqueClipId(`${clip.id}-split`),
            timelineStart: Number(((clip.timelineStart || 0) + firstDuration).toFixed(3)),
            timelineEnd: Number(((clip.timelineStart || 0) + firstDuration + secondDuration).toFixed(3)),
            duration: secondDuration,
            sourceStart: Number(sourceSplitTime.toFixed(3)),
            sourceEnd: Number(sourceEnd.toFixed(3)),
            linkGroupId: linkGroupIds.second ?? clip.linkGroupId ?? null
        };

        clip.duration = firstDuration;
        clip.timelineEnd = Number(((clip.timelineStart || 0) + firstDuration).toFixed(3));
        clip.sourceEnd = Number(sourceSplitTime.toFixed(3));
        clip.linkGroupId = linkGroupIds.first ?? clip.linkGroupId ?? null;

        this.state.timeline[match.trackName].splice(match.clipIndex + 1, 0, secondClip);
        return secondClip;
    }

    _splitClipAtTime(anchorClipId, absoluteTime) {
        const anchorMatch = this.findClipById(anchorClipId);
        if (!anchorMatch) return null;
        if (this.isTrackLocked(anchorMatch.trackName)) return null;

        const anchorClip = anchorMatch.clip;
        const requestedTime = Number(absoluteTime);
        if (!Number.isFinite(requestedTime)) return null;
        if (requestedTime <= (anchorClip.timelineStart || 0) + 0.05 || requestedTime >= (anchorClip.timelineEnd || 0) - 0.05) {
            return null;
        }

        const linkGroupIds = anchorClip.linkGroupId ? { first: null, second: null } : {};
        const secondClip = this._splitSingleClipMatch(anchorMatch, requestedTime, linkGroupIds);
        if (!secondClip) return null;

        this.normalizeTrack(anchorMatch.trackName);
        this.state.selectedClipId = secondClip.id;
        this.state.selectedClipIds = [secondClip.id];
        this.state.selectedAssetId = secondClip.assetId || this.state.selectedAssetId;
        this.state.selectedTrackName = anchorMatch.trackName;
        this.emit();
        return secondClip;
    }

    _splitClipGroupAtTime(anchorClipId, absoluteTime) {
        const anchorMatch = this.findClipById(anchorClipId);
        if (!anchorMatch) return null;
        if (this.isTrackLocked(anchorMatch.trackName)) return null;

        const anchorClip = anchorMatch.clip;
        const requestedTime = Number(absoluteTime);
        if (!Number.isFinite(requestedTime)) return null;
        if (requestedTime <= (anchorClip.timelineStart || 0) + 0.05 || requestedTime >= (anchorClip.timelineEnd || 0) - 0.05) {
            return null;
        }

        const linkGroupId = anchorClip.linkGroupId || null;
        const groupMatches = linkGroupId
            ? this.getAllClips()
                .filter((clip) => clip.linkGroupId === linkGroupId)
                .map((clip) => this.findClipById(clip.id))
                .filter(Boolean)
            : [anchorMatch];

        if (!groupMatches.length) return null;
        if (groupMatches.some((match) => this.isTrackLocked(match.trackName))) return null;

        // 区分相交需要分割的片段，以及不需要分割但在左/右侧的片段
        const intersectingMatches = [];
        const leftMatches = [];
        const rightMatches = [];

        groupMatches.forEach((match) => {
            const clip = match.clip;
            const start = clip.timelineStart || 0;
            const end = clip.timelineEnd || 0;

            if (requestedTime > start + 0.05 && requestedTime < end - 0.05) {
                intersectingMatches.push(match);
            } else if (end - 0.05 <= requestedTime) {
                leftMatches.push(match);
            } else if (start + 0.05 >= requestedTime) {
                rightMatches.push(match);
            }
        });

        // 至少要有一个片段与分割线相交（通常就是 anchorMatch 本身）
        if (!intersectingMatches.length) return null;

        // 检查需要分割的轨道中是否有被锁定的轨道
        if (intersectingMatches.some((match) => this.isTrackLocked(match.trackName))) return null;

        const nextLinkGroupIds = linkGroupId
            ? {
                first: this._createUniqueLinkGroupId(`${linkGroupId}-a`),
                second: this._createUniqueLinkGroupId(`${linkGroupId}-b`)
            }
            : {};

        const secondClipsById = new Map();
        
        // 仅对相交的片段执行实际分割操作
        intersectingMatches
            .slice()
            .sort((left, right) => right.clipIndex - left.clipIndex)
            .sort((left, right) => left.trackName.localeCompare(right.trackName))
            .forEach((match) => {
                const secondClip = this._splitSingleClipMatch(match, requestedTime, nextLinkGroupIds);
                if (secondClip) {
                    secondClipsById.set(match.clip.id, secondClip);
                }
            });

        // 更新未相交片段的 linkGroupId
        if (linkGroupId) {
            leftMatches.forEach((match) => {
                if (!this.isTrackLocked(match.trackName)) {
                    match.clip.linkGroupId = nextLinkGroupIds.first;
                }
            });
            rightMatches.forEach((match) => {
                if (!this.isTrackLocked(match.trackName)) {
                    match.clip.linkGroupId = nextLinkGroupIds.second;
                }
            });
        }

        [...new Set(groupMatches.map((match) => match.trackName))].forEach((trackName) => {
            this.normalizeTrack(trackName);
        });

        const anchorSecondClip = secondClipsById.get(anchorClipId);
        if (!anchorSecondClip) return null;

        const selectedSecondClipIds = groupMatches
            .map((match) => secondClipsById.get(match.clip.id)?.id || null)
            .filter(Boolean);

        this.state.selectedClipId = anchorSecondClip.id;
        this.state.selectedClipIds = selectedSecondClipIds.length ? selectedSecondClipIds : [anchorSecondClip.id];
        this.state.selectedAssetId = anchorSecondClip.assetId || this.state.selectedAssetId;
        this.state.selectedTrackName = anchorMatch.trackName;
        this.emit();
        return anchorSecondClip;
    }

    deleteClip(clipId, options = {}) {
        const match = this.findClipById(clipId);
        if (!match) return false;
        if (this.isTrackLocked(match.trackName)) return false;

        const { ripple = false } = options;
        const [removed] = this.state.timeline[match.trackName].splice(match.clipIndex, 1);

        if (ripple && removed) {
            this.state.timeline[match.trackName].forEach(clip => {
                if (clip.timelineStart >= removed.timelineEnd) {
                    clip.timelineStart = Math.max(0, clip.timelineStart - removed.duration);
                }
            });
        }

        this.normalizeTrack(match.trackName);
        this.state.selectedClipIds = this.state.selectedClipIds.filter((selectedId) => selectedId !== clipId);
        this.state.selectedClipId = this.state.selectedClipIds[this.state.selectedClipIds.length - 1] || null;
        if (this.getAllClips().length === 0) {
            this.state.playheadTime = 0;
            this.state.selectedClipId = null;
            this.state.selectedClipIds = [];
        }
        this.emit();
        return true;
    }

    deleteSelectedClips(options = {}) {
        return this.deleteClips(this.state.selectedClipIds, options);
    }

    deleteClips(clipIds = [], options = {}) {
        const targetClipIds = [...new Set((Array.isArray(clipIds) ? clipIds : [clipIds]).filter(Boolean))];
        if (!targetClipIds.length) return false;

        const matches = targetClipIds
            .map((clipId) => this.findClipById(clipId))
            .filter(Boolean);
        if (!matches.length) return false;
        if (matches.some((match) => this.isTrackLocked(match.trackName))) {
            return false;
        }

        const { ripple = false } = options;
        const groupedMatches = matches.reduce((groups, match) => {
            const key = match.trackName;
            if (!groups[key]) groups[key] = [];
            groups[key].push(match);
            return groups;
        }, {});

        Object.entries(groupedMatches).forEach(([trackName, trackMatches]) => {
            const track = this.state.timeline[trackName];
            const sortedMatches = trackMatches
                .slice()
                .sort((left, right) => right.clip.timelineStart - left.clip.timelineStart);

            sortedMatches.forEach((match) => {
                const index = track.findIndex((clip) => clip.id === match.clip.id);
                if (index < 0) return;
                const [removed] = track.splice(index, 1);
                if (ripple && removed) {
                    track.forEach((clip) => {
                        if (clip.timelineStart >= removed.timelineEnd) {
                            clip.timelineStart = Math.max(0, clip.timelineStart - removed.duration);
                        }
                    });
                }
            });

            this.normalizeTrack(trackName);
        });

        this.state.selectedClipId = null;
        this.state.selectedClipIds = [];
        if (this.getAllClips().length === 0) {
            this.state.playheadTime = 0;
        }
        this.emit();
        return true;
    }

    getLinkedClipIds(clipId) {
        const match = this.findClipById(clipId);
        const linkGroupId = match?.clip?.linkGroupId;
        if (!linkGroupId) {
            if (!match?.clip) return clipId ? [clipId] : [];

            if (match.clip.suppressLegacyLink) {
                return clipId ? [clipId] : [];
            }

            const anchorClip = match.clip;
            const anchorTrackType = this.getTrackType(match.trackName) || anchorClip.kind || 'video';
            const anchorTrackGroup = this.getTrackGroup(anchorTrackType);
            const anchorStart = Number(anchorClip.timelineStart) || 0;
            const anchorEnd = Number(anchorClip.timelineEnd) || (anchorStart + (Number(anchorClip.duration) || 0));
            const tolerance = 0.05;

            const legacyLinkedIds = this.getAllClips()
                .map((candidate) => this.findClipById(candidate.id))
                .filter(Boolean)
                .filter((candidateMatch) => candidateMatch.clip.id !== anchorClip.id)
                .filter((candidateMatch) => candidateMatch.clip.assetId === anchorClip.assetId)
                .filter((candidateMatch) => {
                    const candidateTrackType = this.getTrackType(candidateMatch.trackName) || candidateMatch.clip.kind || 'video';
                    return this.getTrackGroup(candidateTrackType) !== anchorTrackGroup;
                })
                .filter((candidateMatch) => !candidateMatch.clip.suppressLegacyLink)
                .filter((candidateMatch) => {
                    const candidateStart = Number(candidateMatch.clip.timelineStart) || 0;
                    const candidateEnd = Number(candidateMatch.clip.timelineEnd) || (candidateStart + (Number(candidateMatch.clip.duration) || 0));
                    return Math.abs(candidateStart - anchorStart) <= tolerance
                        && Math.abs(candidateEnd - anchorEnd) <= tolerance;
                })
                .map((candidateMatch) => candidateMatch.clip.id);

            return clipId ? [clipId, ...legacyLinkedIds] : legacyLinkedIds;
        }

        return this.getAllClips()
            .filter((clip) => clip.linkGroupId === linkGroupId)
            .map((clip) => clip.id);
    }

    getAudioPlaybackReference(clipOrId, trackName = null) {
        const match = typeof clipOrId === 'string'
            ? this.findClipById(clipOrId)
            : (clipOrId?.id
                ? (this.findClipById(clipOrId.id) || { clip: clipOrId, trackName: trackName || null })
                : null);
        if (!match?.clip) {
            return {
                clip: null,
                trackName: null,
                active: false
            };
        }

        const clip = match.clip;
        const resolvedTrackName = match.trackName || trackName || null;
        const clipKind = clip.kind
            || (resolvedTrackName ? this.getTrackType(resolvedTrackName) : null)
            || this.getAssetById(clip.assetId)?.kind
            || 'video';

        if (clipKind !== 'video') {
            return {
                clip,
                trackName: resolvedTrackName,
                active: this.isClipReferenceActive(clip, resolvedTrackName)
            };
        }

        const linkedAudioMatch = this.getLinkedClipIds(clip.id)
            .filter((candidateId) => candidateId !== clip.id)
            .map((candidateId) => this.findClipById(candidateId))
            .filter(Boolean)
            .find((candidateMatch) => {
                const candidateTrackType = this.getTrackType(candidateMatch.trackName) || candidateMatch.clip.kind || null;
                return candidateTrackType === 'audio' || candidateMatch.clip.kind === 'audio';
            }) || null;

        if (!linkedAudioMatch) {
            if (!clip.linkGroupId && !clip.suppressLegacyLink) {
                return {
                    clip,
                    trackName: resolvedTrackName,
                    active: this.isClipReferenceActive(clip, resolvedTrackName)
                };
            }

            return {
                clip: null,
                trackName: null,
                active: false
            };
        }

        return {
            clip: linkedAudioMatch.clip,
            trackName: linkedAudioMatch.trackName,
            active: this.isClipReferenceActive(linkedAudioMatch.clip, linkedAudioMatch.trackName)
        };
    }

    detachLinkedClipGroup(clipId) {
        const linkedClipIds = this.getLinkedClipIds(clipId);
        if (linkedClipIds.length <= 1) return false;

        const matches = linkedClipIds
            .map((linkedClipId) => this.findClipById(linkedClipId))
            .filter(Boolean);
        if (!matches.length) return false;
        if (matches.some((match) => this.isTrackLocked(match.trackName))) return false;

        matches.forEach((match) => {
            match.clip.linkGroupId = null;
            match.clip.suppressLegacyLink = true;
        });

        const anchorMatch = this.findClipById(clipId);
        this.state.selectedClipId = clipId;
        this.state.selectedClipIds = [clipId];
        this.state.selectedAssetId = anchorMatch?.clip?.assetId || this.state.selectedAssetId;
        this.state.selectedTrackName = anchorMatch?.trackName || this.state.selectedTrackName;

        this.emit();
        return true;
    }

    getRelinkableClipIds(clipIds = this.state.selectedClipIds) {
        const normalizedClipIds = [...new Set((Array.isArray(clipIds) ? clipIds : []).filter(Boolean))];
        if (normalizedClipIds.length !== 2) return [];

        const matches = normalizedClipIds
            .map((clipId) => this.findClipById(clipId))
            .filter(Boolean);
        if (matches.length !== 2) return [];
        if (matches.some((match) => this.isTrackLocked(match.trackName))) return [];
        if (matches.some((match) => this.getLinkedClipIds(match.clip.id).length > 1)) return [];

        const kinds = matches.map((match) => match.clip.kind);
        const hasVideo = kinds.includes('video');
        const hasAudio = kinds.includes('audio');
        if (!hasVideo || !hasAudio) return [];

        return matches.map((match) => match.clip.id);
    }

    relinkSelectedClips(clipIds = this.state.selectedClipIds) {
        const relinkableClipIds = this.getRelinkableClipIds(clipIds);
        if (relinkableClipIds.length !== 2) return null;

        const linkGroupId = this._createUniqueLinkGroupId('link-manual');
        const relinked = relinkableClipIds
            .map((clipId) => this.findClipById(clipId))
            .filter(Boolean);

        relinked.forEach((match) => {
            match.clip.linkGroupId = linkGroupId;
            delete match.clip.suppressLegacyLink;
        });

        this.state.selectedClipId = this.state.selectedClipId && relinkableClipIds.includes(this.state.selectedClipId)
            ? this.state.selectedClipId
            : relinkableClipIds[0];
        this.state.selectedClipIds = relinkableClipIds;
        this.emit();
        return relinked.map((match) => match.clip);
    }

    getDraggedClipIds(anchorClipId, clipIds = []) {
        const baseIds = Array.isArray(clipIds) && clipIds.length ? clipIds : [anchorClipId];
        const expanded = new Set();

        baseIds.filter(Boolean).forEach((clipId) => {
            this.getLinkedClipIds(clipId).forEach((linkedClipId) => expanded.add(linkedClipId));
        });

        if (anchorClipId) {
            this.getLinkedClipIds(anchorClipId).forEach((linkedClipId) => expanded.add(linkedClipId));
        }

        return [...expanded].filter((clipId) => !!this.findClipById(clipId));
    }

    _getTrackMoveWindows(trackName, excludedClipIds = []) {
        const excluded = new Set(Array.isArray(excludedClipIds) ? excludedClipIds : [excludedClipIds]);
        const track = this.getTrack(trackName)
            .filter((clip) => !excluded.has(clip.id))
            .slice()
            .sort((left, right) => left.timelineStart - right.timelineStart);

        const windows = [];
        let cursor = 0;
        track.forEach((clip) => {
            windows.push({ start: cursor, end: clip.timelineStart || 0 });
            cursor = Math.max(cursor, clip.timelineEnd || ((clip.timelineStart || 0) + (clip.duration || 0)));
        });
        windows.push({ start: cursor, end: Number.POSITIVE_INFINITY });
        return windows;
    }

    _resolveTrackMoveStart(trackName, requestedStart = 0, span = 0, excludedClipIds = [], direction = 0) {
        const desiredStart = Math.max(Number(requestedStart) || 0, 0);
        const duration = Math.max(Number(span) || 0, 0.1);
        const windows = this._getTrackMoveWindows(trackName, excludedClipIds);
        const normalizedDirection = direction === 0 ? 1 : (direction > 0 ? 1 : -1);

        const legalRanges = windows
            .map((windowRange) => {
                const latestStart = Number.isFinite(windowRange.end)
                    ? windowRange.end - duration
                    : Number.POSITIVE_INFINITY;
                return {
                    start: windowRange.start,
                    latestStart
                };
            })
            .filter((range) => range.latestStart >= range.start);

        if (!legalRanges.length) return desiredStart;

        const containingRange = legalRanges.find((range) => desiredStart >= range.start && desiredStart <= range.latestStart);
        if (containingRange) return Number(desiredStart.toFixed(3));

        if (normalizedDirection > 0) {
            const forwardRange = legalRanges.find((range) => desiredStart < range.start || desiredStart <= range.latestStart);
            if (forwardRange) {
                const resolved = desiredStart < forwardRange.start ? forwardRange.start : desiredStart;
                return Number(resolved.toFixed(3));
            }
            const tail = legalRanges[legalRanges.length - 1];
            return Number(Math.max(tail.start, desiredStart).toFixed(3));
        }

        for (let index = legalRanges.length - 1; index >= 0; index -= 1) {
            const range = legalRanges[index];
            if (desiredStart >= range.start) {
                const resolved = Math.min(desiredStart, range.latestStart);
                return Number(Math.max(resolved, range.start).toFixed(3));
            }
        }

        return Number(legalRanges[0].start.toFixed(3));
    }

    _realignAnchorLinkedGroup(matches, anchorMatch) {
        const anchorLinkGroupId = anchorMatch?.clip?.linkGroupId || null;
        if (!anchorLinkGroupId) return;

        const anchorTrackGroup = this.getTrackGroup(this.getTrackType(anchorMatch.trackName) || anchorMatch.clip.kind || 'video');
        const anchorStart = Number(anchorMatch.clip.timelineStart) || 0;

        matches.forEach((match) => {
            if (!match?.clip || match.clip.id === anchorMatch.clip.id) return;
            if (match.clip.linkGroupId !== anchorLinkGroupId) return;

            const matchTrackGroup = this.getTrackGroup(this.getTrackType(match.trackName) || match.clip.kind || 'video');
            if (matchTrackGroup === anchorTrackGroup) return;

            match.clip.timelineStart = Number(anchorStart.toFixed(3));
            match.clip.timelineEnd = Number((match.clip.timelineStart + (Number(match.clip.duration) || 0)).toFixed(3));
        });
    }

    moveClipGroup(anchorClipId, clipIds = [], targetStart = 0, options = {}) {
        const draggedClipIds = this.getDraggedClipIds(anchorClipId, clipIds);
        const anchorMatch = this.findClipById(anchorClipId);
        if (!anchorMatch || !draggedClipIds.includes(anchorClipId)) return null;

        const matches = draggedClipIds
            .map((clipId) => this.findClipById(clipId))
            .filter(Boolean);
        if (!matches.length) return null;
        if (matches.some((match) => this.isTrackLocked(match.trackName))) return null;

        this._realignAnchorLinkedGroup(matches, anchorMatch);

        const requestedTargetTrackId = this.normalizeTrackId(options?.targetTrackId);
        const anchorTrackType = this.getTrackType(anchorMatch.trackName);
        const canMoveAnchorTrack = !!(
            requestedTargetTrackId
            && requestedTargetTrackId !== anchorMatch.trackName
            && this.getTrackType(requestedTargetTrackId) === anchorTrackType
            && !this.isTrackLocked(requestedTargetTrackId)
        );
        const anchorSourceTrackId = anchorMatch.trackName;
        const anchorLinkGroupId = anchorMatch.clip.linkGroupId || null;
        const resolvedTrackNameCache = new Map();

        const resolveTargetTrackName = (match) => {
            if (resolvedTrackNameCache.has(match.trackName)) {
                return resolvedTrackNameCache.get(match.trackName);
            }

            let targetTrackName = match.trackName;
            if (!canMoveAnchorTrack) return match.trackName;
            if (match.trackName === anchorSourceTrackId) {
                targetTrackName = requestedTargetTrackId;
            } else if (anchorLinkGroupId && match.clip.linkGroupId === anchorLinkGroupId) {
                targetTrackName = this._resolveRelativeTrackId(anchorSourceTrackId, requestedTargetTrackId, match.trackName, { createMissing: true });
            }

            resolvedTrackNameCache.set(match.trackName, targetTrackName);
            return targetTrackName;
        };

        const desiredAnchorStart = Math.max(Number(targetStart) || 0, 0);
        const minTimelineStart = Math.min(...matches.map((match) => Number(match.clip.timelineStart) || 0));
        const desiredDelta = Math.max(desiredAnchorStart - (Number(anchorMatch.clip.timelineStart) || 0), -minTimelineStart);
        const direction = desiredDelta === 0 ? 1 : Math.sign(desiredDelta);

        const groupedByTrack = matches.reduce((groups, match) => {
            const targetTrackName = resolveTargetTrackName(match);
            if (!groups[targetTrackName]) {
                groups[targetTrackName] = {
                    trackName: targetTrackName,
                    clipIds: [],
                    start: Number(match.clip.timelineStart) || 0,
                    end: Number(match.clip.timelineEnd) || ((Number(match.clip.timelineStart) || 0) + (Number(match.clip.duration) || 0))
                };
            }

            groups[targetTrackName].clipIds.push(match.clip.id);
            groups[targetTrackName].start = Math.min(groups[targetTrackName].start, Number(match.clip.timelineStart) || 0);
            groups[targetTrackName].end = Math.max(groups[targetTrackName].end, Number(match.clip.timelineEnd) || ((Number(match.clip.timelineStart) || 0) + (Number(match.clip.duration) || 0)));
            return groups;
        }, {});

        let resolvedDelta = desiredDelta;
        for (let attempt = 0; attempt < 6; attempt += 1) {
            let nextDelta = resolvedDelta;
            Object.values(groupedByTrack).forEach((group) => {
                const desiredStart = group.start + nextDelta;
                const resolvedStart = this._resolveTrackMoveStart(
                    group.trackName,
                    desiredStart,
                    group.end - group.start,
                    group.clipIds,
                    direction
                );
                const trackDelta = resolvedStart - group.start;
                if (trackDelta > nextDelta) {
                    nextDelta = trackDelta;
                }
            });

            if (Math.abs(nextDelta - resolvedDelta) < 0.001) break;
            resolvedDelta = nextDelta;
        }

        const trackMoves = [];
        matches.forEach((match) => {
            const nextTrackName = resolveTargetTrackName(match);
            match.clip.timelineStart = Number(((Number(match.clip.timelineStart) || 0) + resolvedDelta).toFixed(3));
            match.clip.timelineEnd = Number((match.clip.timelineStart + match.clip.duration).toFixed(3));
            if (nextTrackName !== match.trackName) {
                trackMoves.push({ clip: match.clip, fromTrack: match.trackName, toTrack: nextTrackName });
            }
        });

        trackMoves.forEach(({ clip, fromTrack, toTrack }) => {
            const sourceTrack = this.state.timeline[fromTrack] || [];
            const clipIndex = sourceTrack.findIndex((entry) => entry.id === clip.id);
            if (clipIndex >= 0) {
                sourceTrack.splice(clipIndex, 1);
            }
            this.state.timeline[toTrack].push(clip);
        });

        [...new Set([
            ...matches.map((match) => match.trackName),
            ...trackMoves.map((move) => move.toTrack)
        ])].forEach((trackName) => {
            this.normalizeTrack(trackName);
        });

        this.state.selectedClipId = anchorClipId;
        this.state.selectedClipIds = draggedClipIds;
        this.state.selectedTrackName = canMoveAnchorTrack ? requestedTargetTrackId : anchorMatch.trackName;
        this.emit();
        return matches.map((match) => match.clip);
    }

    moveSelectedClips(anchorClipId, targetStart = 0) {
        const selectedClipIds = this.state.selectedClipIds.includes(anchorClipId)
            ? [...this.state.selectedClipIds]
            : [anchorClipId];
        return this.moveClipGroup(anchorClipId, selectedClipIds, targetStart);
    }

    reorderClip(clipId, targetStart = 0) {
        const movedClips = this.moveClipGroup(clipId, [clipId], targetStart);
        if (!Array.isArray(movedClips) || !movedClips.length) return null;
        return movedClips.find((clip) => clip.id === clipId) || null;
    }
}

window.EditorProjectStore = EditorProjectStore;

if (typeof module !== 'undefined') {
    module.exports = EditorProjectStore;
}
