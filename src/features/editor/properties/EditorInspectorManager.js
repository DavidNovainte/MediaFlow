class EditorInspectorManager {
    static ALLOWED_TABS = ['clip'];

    constructor(flow) {
        this.flow = flow;
        this.elements = {};
        this.activeTab = 'clip';
        this.lastSelectionSignature = null;
        this.clipSettingsClipboard = null;
        this.sectionState = {
            transform: true,
            playback: false,
            timing: false
        };
        this.trackDraftName = '';
        this.trackStatusMessage = '';
        this.armedDeleteTrackId = null;
    }

    init() {
        this.elements = {
            body: document.getElementById('editor-inspector-body'),
            tabs: Array.from(document.querySelectorAll('.editor-inspector-tab'))
        };
        this.lastSelectionSignature = this.buildSelectionSignature(this.flow.store.getState());
        this.bindTabEvents();
    }

    buildSelectionSignature(state) {
        const selectedClipIds = Array.isArray(state?.selectedClipIds) ? [...state.selectedClipIds].sort() : [];
        return {
            clipId: state?.selectedClipId || null,
            clipIdsKey: selectedClipIds.join('|'),
            trackName: state?.selectedTrackName || null,
            assetId: state?.selectedAssetId || null,
            assetCount: Array.isArray(state?.assets) ? state.assets.length : 0
        };
    }

    getAllowedTab() {
        return EditorInspectorManager.ALLOWED_TABS.includes(this.activeTab) ? this.activeTab : 'clip';
    }

    syncActiveTabForSelection(state) {
        const nextSignature = this.buildSelectionSignature(state);
        this.activeTab = this.getAllowedTab();

        if (nextSignature.trackName !== this.lastSelectionSignature?.trackName) {
            const trackMeta = nextSignature.trackName ? this.flow.store.getTrackMeta(nextSignature.trackName) : null;
            this.trackDraftName = trackMeta?.name || '';
            this.trackStatusMessage = '';
            this.armedDeleteTrackId = null;
        }

        this.lastSelectionSignature = nextSignature;
    }

    bindTabEvents() {
        this.elements.tabs?.forEach((button) => {
            button.addEventListener('click', () => {
                this.activeTab = EditorInspectorManager.ALLOWED_TABS.includes(button.dataset.tab) ? button.dataset.tab : 'clip';
                this.syncTabs();
                this.render(this.flow.store.getState());
            });
        });
        this.syncTabs();
    }

    syncTabs() {
        this.elements.tabs?.forEach((button) => {
            const isActive = button.dataset.tab === this.activeTab;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    renderField(label, field, value, options = {}) {
        const {
            min = '',
            max = '',
            step = '1',
            type = 'number'
        } = options;

        return `
            <label class="editor-inspector-field">
                <span class="editor-inspector-field-label">${label}</span>
                <span class="editor-inspector-field-input">
                    <input type="${type}" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}">
                </span>
            </label>
        `;
    }

    renderStat(label, value) {
        return `
            <div class="editor-inspector-stat">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `;
    }

    renderActionButton(label, action, options = {}) {
        const disabled = options.disabled ? ' disabled' : '';
        const variantClass = options.variant ? ` ${options.variant}` : '';
        const safeLabel = this.escapeHtml(label);
        return `<button type="button" class="editor-inspector-action-btn${variantClass}" data-inspector-action="${action}" data-action-label="${safeLabel}"${disabled}>${safeLabel}</button>`;
    }

    renderCompactActionButton(label, action, options = {}) {
        const disabled = options.disabled ? ' disabled' : '';
        const variantClass = options.variant ? ` ${options.variant}` : '';
        const safeLabel = this.escapeHtml(label);
        return `<button type="button" class="editor-inspector-action-btn editor-inspector-action-btn-compact${variantClass}" data-inspector-action="${action}" data-action-label="${safeLabel}"${disabled}>${safeLabel}</button>`;
    }

    renderIconActionButton(label, action, iconClass, options = {}) {
        const disabled = options.disabled ? ' disabled' : '';
        const variantClass = options.variant ? ` ${options.variant}` : '';
        const safeLabel = this.escapeHtml(label);
        return `<button type="button" class="editor-inspector-icon-btn${variantClass}" data-inspector-action="${action}" data-action-label="${safeLabel}" title="${safeLabel}" aria-label="${safeLabel}"${disabled}><i class="${iconClass}"></i></button>`;
    }

    renderMetaPill(label, value) {
        return `
            <span class="editor-inspector-token">
                <strong>${label}</strong>
                <span>${value}</span>
            </span>
        `;
    }

    renderSummaryEyebrow(label) {
        return `<span class="editor-inspector-summary-eyebrow">${this.escapeHtml(label)}</span>`;
    }

    renderSectionHead(title, description = '') {
        return `
            <div class="editor-inspector-section-head">
                <div class="editor-inspector-section-copy">
                    <h5>${this.escapeHtml(title)}</h5>
                    ${description ? `<p>${this.escapeHtml(description)}</p>` : ''}
                </div>
            </div>
        `;
    }

    renderPanelLead(title, description = '') {
        return `
            <div class="editor-inspector-pane-lead">
                <h4 title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</h4>
                ${description ? `<p>${this.escapeHtml(description)}</p>` : ''}
            </div>
        `;
    }

    renderPanelMeta(items = []) {
        const tokens = (Array.isArray(items) ? items : [])
            .map((item) => String(item || '').trim())
            .filter(Boolean);

        if (!tokens.length) return '';

        return `
            <div class="editor-inspector-pane-meta">
                ${this.escapeHtml(tokens.join(' · '))}
            </div>
        `;
    }

    renderClipHeader({ title, fullTitle, kindLabel, metaItems = [], toolsMarkup = '' }) {
        const safeTitle = this.escapeHtml(title);
        const safeFull = this.escapeHtml(fullTitle || title);
        const meta = (Array.isArray(metaItems) ? metaItems : [])
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join(' · ');

        return `
            <div class="editor-inspector-clip-head">
                <div class="editor-inspector-clip-title-row">
                    <span class="editor-inspector-kind-badge">${this.escapeHtml(kindLabel)}</span>
                    <h4 class="editor-inspector-clip-title" title="${safeFull}">${safeTitle}</h4>
                </div>
                ${meta ? `<div class="editor-inspector-clip-meta">${this.escapeHtml(meta)}</div>` : ''}
                ${toolsMarkup ? `<div class="editor-inspector-tool-row" role="toolbar" aria-label="片段工具">${toolsMarkup}</div>` : ''}
            </div>
        `;
    }

    renderFactRow(items = []) {
        const validItems = (Array.isArray(items) ? items : []).filter((item) => item && item.label);
        if (!validItems.length) return '';
        return `
            <div class="editor-inspector-fact-grid">
                ${validItems.map((item) => `
                    <div class="editor-inspector-fact">
                        <span>${this.escapeHtml(item.label)}</span>
                        <strong>${this.escapeHtml(item.value ?? '')}</strong>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderClipSection(title, sectionKey, content, options = {}) {
        const isExpanded = options.collapsible === false ? true : this.sectionState[sectionKey] !== false;
        const resetMarkup = options.resetAction
            ? `<button type="button" class="editor-inspector-section-reset" data-inspector-action="${options.resetAction}" title="${this.escapeHtml(options.resetLabel || '重置')}">${this.escapeHtml(options.resetLabel || '重置')}</button>`
            : '';
        const toggleMarkup = options.collapsible === false
            ? ''
            : `<button type="button" class="editor-inspector-section-chevron" data-inspector-action="toggle-section-${sectionKey}" title="${isExpanded ? '收起' : '展开'}" aria-label="${isExpanded ? '收起' : '展开'}" aria-expanded="${isExpanded ? 'true' : 'false'}"><i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}"></i></button>`;

        return `
            <section class="editor-inspector-flat-section ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-section-key="${sectionKey}">
                <header class="editor-inspector-flat-head">
                    <div class="editor-inspector-flat-head-main">
                        ${toggleMarkup}
                        <h5>${title}</h5>
                    </div>
                    ${resetMarkup ? `<div class="editor-inspector-flat-head-actions">${resetMarkup}</div>` : ''}
                </header>
                <div class="editor-inspector-flat-body${isExpanded ? '' : ' hidden'}">
                    ${content}
                </div>
            </section>
        `;
    }

    getSelectedTrackMeta(state) {
        const trackId = this.getDefaultTrackName(state);
        return {
            trackId,
            meta: trackId ? this.flow.store.getTrackMeta(trackId) : null,
            controls: trackId ? this.flow.store.getTrackControl(trackId) : null
        };
    }

    getTrackClipCount(trackId) {
        return Array.isArray(this.flow.store.getTrack(trackId)) ? this.flow.store.getTrack(trackId).length : 0;
    }

    renderTrackPanel(state) {
        const { trackId, meta, controls } = this.getSelectedTrackMeta(state);
        if (!trackId || !meta) {
            this.renderIdleState(state);
            return;
        }

        const clipCount = this.getTrackClipCount(trackId);
        const canDelete = this.flow.store.getTrackIdsByType(meta.type).length > 1;
        const deleteActionMarkup = this.armedDeleteTrackId === trackId
            ? `
                ${this.renderActionButton('确认删除', 'confirm-delete-track', { variant: 'is-danger', disabled: !canDelete })}
                ${this.renderActionButton('取消', 'cancel-delete-track', { variant: 'is-quiet' })}
            `
            : this.renderActionButton('删除轨道', 'arm-delete-track', { variant: 'is-danger', disabled: !canDelete });

        const draftName = this.trackDraftName || meta.name || '';

        this.elements.body.innerHTML = `
            ${this.renderPanelLead(meta.name || trackId.toUpperCase(), `${meta.type} · ${trackId}`)}
            ${this.renderPanelMeta([
        `${clipCount} 个片段`,
        controls?.locked ? '已锁定' : '可编辑',
        controls?.hidden ? '已隐藏' : '可见'
    ])}
            ${this.renderFactRow([
        { label: '类型', value: meta.type },
        { label: '高度', value: `${meta.height || 64}px` },
        { label: '片段', value: String(clipCount) }
    ])}
            <div class="editor-inspector-stack">
                <section class="editor-inspector-flat-section is-expanded" data-section-key="track-name">
                    <header class="editor-inspector-flat-head">
                        <h5>轨道名称</h5>
                    </header>
                    <div class="editor-inspector-flat-body">
                        <label class="editor-inspector-field">
                            <span class="editor-inspector-field-label">当前名称</span>
                            <span class="editor-inspector-field-input">
                                <input type="text" data-track-name-input value="${this.escapeHtml(draftName)}" maxlength="40">
                            </span>
                        </label>
                        <div class="editor-inspector-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                            ${this.renderActionButton('保存名称', 'save-track-name')}
                        </div>
                        ${this.trackStatusMessage ? `<p class="editor-inspector-flat-note">${this.escapeHtml(this.trackStatusMessage)}</p>` : ''}
                    </div>
                </section>
                <section class="editor-inspector-flat-section is-expanded" data-section-key="track-create">
                    <header class="editor-inspector-flat-head">
                        <h5>新建轨道</h5>
                    </header>
                    <div class="editor-inspector-flat-body">
                        <div class="editor-inspector-actions" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
                            ${this.renderActionButton('视频轨', 'create-track-video')}
                            ${this.renderActionButton('音频轨', 'create-track-audio')}
                            ${this.renderActionButton('图像轨', 'create-track-image')}
                        </div>
                    </div>
                </section>
                <section class="editor-inspector-flat-section is-expanded" data-section-key="track-delete">
                    <header class="editor-inspector-flat-head">
                        <h5>危险操作</h5>
                    </header>
                    <div class="editor-inspector-flat-body">
                        <div class="editor-inspector-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${deleteActionMarkup}
                        </div>
                    </div>
                </section>
            </div>
        `;

        this.bindTrackEvents(trackId);
    }

    renderProjectPanel(state) {
        const tracks = this.flow.store.getTracks?.() || [];
        const assetCount = Array.isArray(state?.assets) ? state.assets.length : 0;
        const clipCount = this.flow.store.getTimelineClipCount?.() || 0;

        this.elements.body.innerHTML = `
            ${this.renderPanelLead('项目概览', state?.name || '未命名剪辑')}
            ${this.renderPanelMeta([
        `${assetCount} 个素材`,
        `${tracks.length} 条轨道`,
        `${clipCount} 个片段`
    ])}
            ${this.renderFactRow([
        { label: '素材', value: String(assetCount) },
        { label: '轨道', value: String(tracks.length) },
        { label: '片段', value: String(clipCount) }
    ])}
            <div class="editor-inspector-stack">
                <section class="editor-inspector-flat-section is-expanded" data-section-key="project-tracks">
                    <header class="editor-inspector-flat-head">
                        <h5>轨道列表</h5>
                    </header>
                    <div class="editor-inspector-flat-body">
                        ${tracks.map((track) => `
                            <div class="editor-inspector-stat">
                                <span>${this.escapeHtml(track.name || track.id)}</span>
                                <strong>${this.escapeHtml(track.type)} · ${track.clips.length}</strong>
                            </div>
                        `).join('') || '<p class="editor-inspector-flat-note">还没有轨道。</p>'}
                    </div>
                </section>
            </div>
        `;
    }

    bindTrackEvents(trackId) {
        const nameInput = this.elements.body?.querySelector('[data-track-name-input]');
        nameInput?.addEventListener('input', (event) => {
            this.trackDraftName = event.target.value;
            this.trackStatusMessage = '';
        });

        this.elements.body?.querySelectorAll('[data-inspector-action]').forEach((button) => {
            button.addEventListener('click', () => this.handleAction(button.dataset.inspectorAction, trackId));
        });
    }

    formatDuration(value) {
        const duration = Math.max(Number(value) || 0, 0);
        return `${duration.toFixed(2)}s`;
    }

    truncateLabel(value, maxLength = 40) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(1, maxLength - 3))}...`;
    }

    getMediaKindLabel(kind, options = {}) {
        if (kind === 'audio') return options.clip ? this.t('editor.clipAudio', '音频片段') : this.t('editor.kindAudio', '音频');
        if (kind === 'image') return options.clip ? this.t('editor.kindImage', '图片') : this.t('editor.kindImage', '图像');
        return options.clip ? this.t('editor.clipVideo', '视频片段') : this.t('editor.kindVideo', '视频');
    }

    getCleanAssetLabel(asset, fallback = '已选片段') {
        let text = String(asset?.name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\s+/g, ' ').trim();
        // Guard broken i18n keys that sometimes leak into asset names
        if (!text || /^[a-z0-9_.-]+\.[a-zA-Z][a-zA-Z0-9_.-]+$/.test(text) || text.includes('pauseUnsupported')) {
            if (asset?.kind === 'audio') return '音频片段';
            if (asset?.kind === 'image') return '图片';
            return fallback;
        }
        if (/(views?|reactions?|likes?|comments?)/i.test(text) && text.length > 20) {
            if (asset?.kind === 'audio') return '音频片段';
            if (asset?.kind === 'image') return '图片';
            return '视频片段';
        }
        return text;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getPreviewStageMetrics() {
        const stage = this.flow.previewManager?.elements?.stage || document.querySelector('#page-editor .editor-preview-stage');
        const rect = stage?.getBoundingClientRect?.();
        const width = Number(rect?.width) || Number(stage?.clientWidth) || 0;
        const height = Number(rect?.height) || Number(stage?.clientHeight) || 0;
        if (!width || !height) return null;
        return { width, height };
    }

    calculateFillScalePercent(asset, fallback = 100) {
        const stage = this.getPreviewStageMetrics();
        const width = Math.max(Number(asset?.width) || 0, 1);
        const height = Math.max(Number(asset?.height) || 0, 1);
        if (!stage || !width || !height) return fallback;

        const stageAspect = stage.width / stage.height;
        const assetAspect = width / height;
        if (!Number.isFinite(stageAspect) || !Number.isFinite(assetAspect) || stageAspect <= 0 || assetAspect <= 0) {
            return fallback;
        }

        const fillScale = assetAspect >= stageAspect
            ? (assetAspect / stageAspect)
            : (stageAspect / assetAspect);

        return Number(Math.min(Math.max(fillScale * 100, 100), 400).toFixed(1));
    }

    hasTrimmedSource(clip) {
        const sourceDuration = Math.max(Number(clip?.sourceDuration) || Number(clip?.duration) || 0, 0);
        const sourceStart = Math.max(Number(clip?.sourceStart) || 0, 0);
        const sourceEnd = Math.max(Number(clip?.sourceEnd) || Number(clip?.duration) || 0, 0);
        if (!sourceDuration || !sourceEnd) return false;
        return sourceStart > 0.01
            || Math.abs(sourceEnd - sourceDuration) > 0.01;
    }

    buildClipSettingsClipboard(clip) {
        if (!clip) return null;
        const match = clip?.id ? this.flow.store.findClipById(clip.id) : null;
        const clipKind = clip.kind
            || (match?.trackName ? this.flow.store.getTrackType(match.trackName) : null)
            || this.flow.store.getAssetById(clip.assetId)?.kind;
        const audioReference = clipKind === 'video'
            ? this.flow.store.getAudioPlaybackReference?.(clip, match?.trackName || null)
            : null;
        const playbackClip = audioReference?.clip || clip;
        return {
            transform: {
                x: Number(clip.x) || 0,
                y: Number(clip.y) || 0,
                scale: Number(clip.scale) || 100,
                rotation: Number(clip.rotation) || 0,
                opacity: Number(clip.opacity) || 100,
                flipX: !!clip.flipX,
                flipY: !!clip.flipY
            },
            playback: {
                volume: Number(playbackClip?.volume) || 100,
                speed: Number(clip.speed) || 1,
                muted: !!clip.muted || !!playbackClip?.muted
            }
        };
    }

    buildClipSettingsPastePatch(clip) {
        const clipboard = this.clipSettingsClipboard;
        if (!clip || !clipboard) return null;

        const patch = {};
        if (clip.kind !== 'audio') {
            Object.assign(patch, clipboard.transform);
        }
        if (clip.kind === 'audio' || clip.kind === 'video') {
            Object.assign(patch, clipboard.playback);
        }
        return Object.keys(patch).length ? patch : null;
    }

    bindFieldEvents(clipId) {
        this.elements.body?.querySelectorAll('input[data-field]').forEach((input) => {
            input.addEventListener('input', () => {
                const field = input.dataset.field;
                const isCheckbox = input.type === 'checkbox';
                const value = isCheckbox ? input.checked : Number(input.value);

                if (field === 'sourceStart' || field === 'sourceEnd') {
                    this.flow.store.updateClipTrim(clipId, { [field]: value });
                    return;
                }

                this.flow.store.updateClip(clipId, { [field]: value });
            });
        });

        this.elements.body?.querySelectorAll('[data-inspector-action]').forEach((button) => {
            button.addEventListener('click', () => this.handleAction(button.dataset.inspectorAction, clipId));
        });
    }

    handleAction(action, clipId = null) {
        const state = this.flow.store.getState();
        const selectedClip = clipId ? this.flow.store.findClipById(clipId)?.clip || null : null;
        const selectedAsset = selectedClip ? this.flow.store.getAssetById(selectedClip.assetId) : null;

        if (action?.startsWith('toggle-section-')) {
            const sectionKey = action.replace('toggle-section-', '');
            this.sectionState[sectionKey] = !(this.sectionState[sectionKey] !== false);
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'save-track-name') {
            const trackId = this.getDefaultTrackName(state);
            const nextName = String(this.trackDraftName || '').trim();
            if (!trackId || !nextName) {
                this.trackStatusMessage = '轨道名称不能为空。';
                this.render(this.flow.store.getState());
                return;
            }

            this.flow.store.renameTrack(trackId, nextName);
            this.trackDraftName = nextName;
            this.trackStatusMessage = '轨道名称已更新。';
            this.armedDeleteTrackId = null;
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'create-track-video' || action === 'create-track-audio' || action === 'create-track-image') {
            const kind = action.replace('create-track-', '');
            const trackId = this.flow.store.createTrack(kind);
            const meta = this.flow.store.getTrackMeta(trackId);
            this.trackDraftName = meta?.name || '';
            this.trackStatusMessage = '';
            this.armedDeleteTrackId = null;
            this.activeTab = 'clip';
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'arm-delete-track') {
            this.armedDeleteTrackId = this.getDefaultTrackName(state);
            this.trackStatusMessage = '';
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'cancel-delete-track') {
            this.armedDeleteTrackId = null;
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'confirm-delete-track') {
            const trackId = this.armedDeleteTrackId || this.getDefaultTrackName(state);
            if (!trackId) return;

            const deleted = this.flow.store.deleteTrack(trackId, {
                force: this.getTrackClipCount(trackId) === 0
            });

            this.armedDeleteTrackId = null;
            this.trackStatusMessage = deleted ? '轨道已删除。' : '轨道内还有片段，不能直接删除。';
            const nextTrackMeta = this.flow.store.getTrackMeta(this.getDefaultTrackName(this.flow.store.getState()));
            this.trackDraftName = nextTrackMeta?.name || '';
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'reset-transform' && clipId) {
            this.flow.store.updateClip(clipId, {
                x: 0,
                y: 0,
                scale: 100,
                rotation: 0,
                opacity: 100,
                flipX: false,
                flipY: false
            });
            return;
        }

        if (action === 'fit-transform' && clipId) {
            this.flow.store.updateClip(clipId, {
                x: 0,
                y: 0,
                scale: 100
            });
            return;
        }

        if (action === 'fill-transform' && clipId) {
            const fillScale = this.calculateFillScalePercent(selectedAsset, selectedClip?.scale || 100);
            this.flow.store.updateClip(clipId, {
                x: 0,
                y: 0,
                scale: fillScale
            });
            return;
        }

        if (action === 'center-transform' && clipId) {
            this.flow.store.updateClip(clipId, {
                x: 0,
                y: 0
            });
            return;
        }

        if (action === 'flip-horizontal' && clipId) {
            this.flow.store.updateClip(clipId, {
                flipX: !selectedClip?.flipX
            });
            return;
        }

        if (action === 'flip-vertical' && clipId) {
            this.flow.store.updateClip(clipId, {
                flipY: !selectedClip?.flipY
            });
            return;
        }

        if (action === 'copy-clip-settings' && clipId && selectedClip) {
            this.clipSettingsClipboard = this.buildClipSettingsClipboard(selectedClip);
            window.app?.showToast?.('片段参数已复制', 'success');
            this.render(this.flow.store.getState());
            return;
        }

        if (action === 'paste-clip-settings' && clipId && selectedClip) {
            if (!this.clipSettingsClipboard) {
                window.app?.showToast?.('还没有可粘贴的参数', 'warning');
                return;
            }

            const patch = this.buildClipSettingsPastePatch(selectedClip);
            if (!patch) {
                window.app?.showToast?.('当前片段没有可粘贴的参数', 'warning');
                return;
            }

            this.flow.store.updateClip(clipId, patch);
            window.app?.showToast?.('片段参数已粘贴', 'success');
            return;
        }

        if (action === 'normalize-playback' && clipId) {
            this.flow.store.updateClip(clipId, {
                volume: 100,
                speed: 1,
                muted: false
            });
        }
    }

    getDefaultTrackName(state) {
        return state?.selectedTrackName || this.flow.store.getTrackIds?.()[0] || null;
    }

    renderMultiSelection(selectedClips = []) {
        const clipKinds = [...new Set(selectedClips.map((clip) => this.getMediaKindLabel(clip.kind)).filter(Boolean))];
        const totalDuration = selectedClips.reduce((sum, clip) => sum + (Number(clip.duration) || 0), 0);

        this.elements.body.innerHTML = `
            ${this.renderPanelLead('多选', `${clipKinds.join(' / ') || '混合轨道'} · ${this.formatDuration(totalDuration)}`)}
            ${this.renderPanelMeta([
        `已选 ${selectedClips.length} 个`,
        `${clipKinds.length || 1} 种类型`
    ])}
            <div class="editor-inspector-section editor-inspector-section-card">
                ${this.renderSectionHead('操作')}
                <p>使用时间线工具栏中的“删除”或“波纹删”处理整组选中片段。</p>
            </div>
        `;
    }

    t(key, fallback = '') {
        const text = window.i18n?.t?.(key);
        if (text && text !== key) return text;
        return fallback || key;
    }

    renderIdleState() {
        const msg = this.t('editor.paramsEmpty', '选中时间线片段后，这里会显示参数设置。');
        this.elements.body.innerHTML = `
            <div class="editor-inspector-placeholder">
                <p>${msg}</p>
            </div>
        `;
    }

    renderEmptyState() {
        const msg = this.t('editor.paramsEmpty', '选中时间线片段后，这里会显示参数设置。');
        this.elements.body.innerHTML = `
            <div class="editor-inspector-placeholder">
                <p>${msg}</p>
            </div>
        `;
    }

    renderSingleClip(clip, asset) {
        const clipKind = clip?.kind || asset?.kind || 'video';
        const isPlayable = clipKind === 'video' || clipKind === 'audio';
        const hasVisualTransform = clipKind !== 'audio';
        const sourceDuration = clip.sourceDuration || clip.duration;
        const sourceResolution = asset.width && asset.height ? `${asset.width}×${asset.height}` : '';
        const showSourceDuration = this.hasTrimmedSource(clip);
        const clipMatch = clip?.id ? this.flow.store.findClipById(clip.id) : null;
        const audioReference = clipKind === 'video'
            ? this.flow.store.getAudioPlaybackReference?.(clip, clipMatch?.trackName || null)
            : null;
        const playbackClip = audioReference?.clip || clip;
        const playbackMuted = !!clip.muted || !!playbackClip?.muted;
        const fullTitle = this.getCleanAssetLabel(asset);
        const title = this.truncateLabel(fullTitle, 18);
        const sections = [];

        const toolsMarkup = hasVisualTransform
            ? [
                this.renderIconActionButton(this.t('editor.flipHorizontal', '水平翻转'), 'flip-horizontal', 'fa-solid fa-left-right', { variant: clip.flipX ? 'is-active' : '' }),
                this.renderIconActionButton(this.t('editor.flipVertical', '垂直翻转'), 'flip-vertical', 'fa-solid fa-up-down', { variant: clip.flipY ? 'is-active' : '' }),
                this.renderIconActionButton(this.t('editor.copySettings', '复制参数'), 'copy-clip-settings', 'fa-regular fa-copy'),
                this.renderIconActionButton(this.t('editor.pasteSettings', '粘贴参数'), 'paste-clip-settings', 'fa-regular fa-paste', { disabled: !this.clipSettingsClipboard })
            ].join('')
            : [
                this.renderIconActionButton(this.t('editor.copySettings', '复制参数'), 'copy-clip-settings', 'fa-regular fa-copy'),
                this.renderIconActionButton(this.t('editor.pasteSettings', '粘贴参数'), 'paste-clip-settings', 'fa-regular fa-paste', { disabled: !this.clipSettingsClipboard })
            ].join('');

        if (hasVisualTransform) {
            sections.push(this.renderClipSection(
                this.t('editor.transform', '变换'),
                'transform',
                `
                    <div class="editor-inspector-field-grid editor-inspector-field-grid-transform">
                        ${this.renderField(this.t('editor.scale', '缩放 %'), 'scale', clip.scale || 100, { min: 10, max: 400 })}
                        ${this.renderField(this.t('editor.rotation', '旋转'), 'rotation', clip.rotation || 0, { min: -360, max: 360, step: '0.1' })}
                        ${this.renderField(this.t('editor.opacity', '不透明度 %'), 'opacity', clip.opacity || 100, { min: 0, max: 100 })}
                        ${this.renderField('X', 'x', clip.x || 0, { min: -2000, max: 2000 })}
                        ${this.renderField('Y', 'y', clip.y || 0, { min: -2000, max: 2000 })}
                    </div>
                `,
                { resetAction: 'reset-transform', resetLabel: this.t('editor.reset', '重置'), collapsible: false }
            ));
        }

        if (isPlayable) {
            sections.push(this.renderClipSection(
                this.t('editor.playback', '播放'),
                'playback',
                `
                    <div class="editor-inspector-field-grid">
                        ${this.renderField(this.t('editor.volume', '音量 %'), 'volume', playbackClip?.volume ?? clip.volume ?? 100, { min: 0, max: 200 })}
                        ${this.renderField(this.t('editor.speed', '速度'), 'speed', clip.speed || 1, { min: 0.25, max: 4, step: '0.05' })}
                    </div>
                    <label class="editor-inspector-check">
                        <input type="checkbox" data-field="muted" ${playbackMuted ? 'checked' : ''}>
                        <span>${this.t('editor.mute', '静音')}</span>
                    </label>
                `,
                { resetAction: 'normalize-playback', resetLabel: this.t('editor.reset', '重置') }
            ));
        }

        sections.push(this.renderClipSection(
            this.t('editor.timing', '时间'),
            'timing',
            `
                <div class="editor-inspector-field-grid">
                    ${this.renderField(this.t('editor.inPoint', '入点'), 'sourceStart', clip.sourceStart || 0, { min: 0, max: clip.sourceDuration || clip.duration, step: '0.01' })}
                    ${this.renderField(this.t('editor.outPoint', '出点'), 'sourceEnd', clip.sourceEnd || clip.duration, { min: 0.1, max: clip.sourceDuration || clip.duration, step: '0.01' })}
                </div>
                ${showSourceDuration ? `<p class="editor-inspector-flat-note">${this.t('editor.sourceDuration', '源时长')} ${this.formatDuration(sourceDuration)}</p>` : ''}
            `,
            {}
        ));

        this.elements.body.innerHTML = `
            ${this.renderClipHeader({
                title,
                fullTitle,
                kindLabel: this.getMediaKindLabel(clipKind),
                metaItems: [
                    this.formatDuration(clip.duration),
                    sourceResolution
                ].filter(Boolean),
                toolsMarkup
            })}
            <div class="editor-inspector-stack">
                ${sections.join('')}
            </div>
        `;

        // Guard against global i18n overwriting text-only action labels
        this.elements.body.querySelectorAll('.editor-inspector-action-btn[data-action-label]').forEach((btn) => {
            const label = btn.getAttribute('data-action-label');
            if (label && (!btn.textContent || btn.textContent.includes('.') || btn.textContent === 'download.pauseUnsupported')) {
                btn.textContent = label;
            }
        });

        this.bindFieldEvents(clip.id);
    }

    render(state) {
        if (!this.elements.body) return;

        this.syncActiveTabForSelection(state);
        this.syncTabs();

        const selectedClips = this.flow.store.getSelectedClips();
        const clip = state.selectedClipId ? this.flow.store.getSelectedClip() : null;
        const asset = clip ? this.flow.store.getAssetById(clip.assetId) : null;

        if (selectedClips.length > 1 && (!clip || !asset)) {
            this.renderMultiSelection(selectedClips);
            return;
        }

        if (!clip || !asset) {
            this.renderIdleState(state);
            return;
        }

        this.renderSingleClip(clip, asset);
    }
}

window.EditorInspectorManager = EditorInspectorManager;

if (typeof module !== 'undefined') {
    module.exports = EditorInspectorManager;
}
