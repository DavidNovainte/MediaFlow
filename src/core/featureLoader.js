/**
 * featureLoader.js — on-demand feature bundles (classic scripts).
 * Phase D: Enhance + Editor + Subtitle + Creator lazy load.
 *
 * Cold-start keeps shared pieces:
 * - TranslationService, SubtitleDisplayMode
 * - CreatorExportCapabilityMatrix / TimelineProjectSnapshot / CreatorExportPlanner (Editor export)
 */
(function (root) {
    const ENHANCE_SCRIPTS = Object.freeze([
        'features/enhance/EnhanceSmartSelector.js',
        'features/enhance/EnhanceZoomViewer.js',
        'features/enhance/EnhanceInfoManager.js',
        'features/enhance/EnhanceExportManager.js',
        'features/enhance/EnhanceUIManager.js',
        'features/enhance/EnhanceProcessManager.js',
        'features/enhance/EnhanceSettingsManager.js',
        'features/enhance/EnhanceStateManager.js',
        'features/enhance/EnhanceFlow.js'
    ]);

    const EDITOR_SCRIPTS = Object.freeze([
        'features/editor/EditorProjectStore.js',
        'features/editor/import/EditorMediaImporter.js',
        'features/editor/export/EditorTimelineProjectSnapshot.js',
        'features/editor/export/EditorExportManager.js',
        'features/editor/preview/EditorPreviewManager.js',
        'features/editor/playback/EditorPlaybackManager.js',
        'features/editor/timeline/EditorTimelineSnapUtils.js',
        'features/editor/timeline/EditorTimelineDragManager.js',
        'features/editor/timeline/EditorTimelineDropManager.js',
        'features/editor/timeline/EditorTimelineSelectionManager.js',
        'features/editor/timeline/EditorTimelinePlayheadManager.js',
        'features/editor/timeline/EditorTimelineZoomOptimizer.js',
        'features/editor/timeline/EditorTimelineViewportManager.js',
        'features/editor/timeline/EditorTimelineTrimManager.js',
        'features/editor/timeline/EditorTimelineManager.js',
        'features/editor/timeline/EditorTimelineActions.js',
        'features/editor/properties/EditorInspectorManager.js',
        'features/editor/ui/EditorUIManager.js',
        'features/editor/EditorFlow.js'
    ]);

    // TranslationService + SubtitleDisplayMode stay on cold-start (shared).
    const SUBTITLE_SCRIPTS = Object.freeze([
        'features/subtitle/SubtitleUtils.js',
        'features/subtitle/dubbing/SubtitleDubSegmentPlanner.js',
        'features/subtitle/dubbing/SubtitleDubTimingPlanner.js',
        'features/subtitle/dubbing/SubtitleDubGroupPlanner.js',
        'features/subtitle/dubbing/SubtitleDubAdapter.js',
        'features/subtitle/SubtitleService.js',
        'features/subtitle/SubtitleListRenderer.js',
        'features/subtitle/SubtitleEditorActionHandler.js',
        'features/subtitle/SubtitleEditor.js',
        'features/subtitle/SubtitleSearchHandler.js',
        'features/subtitle/SubtitleQualityHandler.js',
        'features/subtitle/SubtitleTrackManager.js',
        'features/subtitle/SubtitleTemplateManager.js',
        'features/subtitle/SubtitleContextMenu.js',
        'features/subtitle/SubtitlePreviewHandler.js',
        'features/subtitle/TTSConfig.js',
        'features/subtitle/SubtitleTTSHandler.js',
        'features/subtitle/SubtitleBatchHandler.js',
        'features/subtitle/SubtitleStyleManager.js',
        'features/subtitle/SubtitlePreferenceManager.js',
        'features/subtitle/ui/SubtitleUIBase.js',
        'features/subtitle/ui/SubtitleUITransform.js',
        'features/subtitle/ui/SubtitleUILayout.js',
        'features/subtitle/ui/SubtitleUISearch.js',
        'features/subtitle/ui/SubtitleUISettings.js',
        'features/subtitle/ui/SubtitleUIInject.js',
        'features/subtitle/ui/SubtitleTTSLocalUI.js',
        'features/subtitle/SubtitleUIManager.js',
        'features/subtitle/SubtitleMediaHandler.js',
        'features/subtitle/SubtitleVisualOptimizer.js',
        'features/subtitle/SubtitleAIHandler.js',
        'features/subtitle/SubtitleExportHandler.js',
        'features/subtitle/AudioWaveformLoader.js',
        'features/subtitle/SubtitleTimelineRenderer.js',
        'features/subtitle/SubtitleTimelineClips.js',
        'features/subtitle/SubtitleAudioManager.js',
        'features/subtitle/SubtitleAudioActionHandler.js',
        'features/subtitle/SubtitleTimeline.js',
        'features/subtitle/SubtitleDraftManager.js',
        'features/subtitle/SubtitleFlow.js'
    ]);

    // Export planner trio may already be on cold-start; ScriptLoader de-dupes.
    const CREATOR_SCRIPTS = Object.freeze([
        'features/video/integration/CreatorSubtitleProject.js',
        'features/video/integration/CreatorWorkflowImporter.js',
        'features/video/integration/CreatorSubtitleLaneManager.js',
        'features/video/integration/CreatorSubtitleCutActions.js',
        'features/video/integration/CreatorSubtitlePreviewOverlay.js',
        'features/video/integration/CreatorSubtitleAudioTrackImporter.js',
        'features/video/BatchListRenderer.js',
        'features/video/BatchFileManager.js',
        'features/video/BatchUIManager.js',
        'features/video/TransitionManager.js',
        'features/video/BatchMergePreview.js',
        'features/video/BatchPreviewRenderer.js',
        'features/video/BatchTaskRunner.js',
        'features/video/BatchProcessor.js',
        'features/video/CreatorService.js',
        'features/video/ui/DialogManager.js',
        'features/video/ui/InspectorManager.js',
        'features/video/ui/QuickToolsRenderer.js',
        'features/video/ui/ToolSettingsManager.js',
        'features/video/ui/CreatorExportManager.js',
        'features/video/CreatorUIManager.js',
        'features/video/export/CreatorSubtitleExportAdapter.js',
        'features/video/timeline/core/TimelineSelectionResolver.js',
        'features/video/timeline/core/TimelinePlaybackState.js',
        'features/video/timeline/core/TimelineTrackAudioControls.js',
        'features/video/timeline/core/TimelineTrackLayout.js',
        'features/video/timeline/core/TimelineTrackReorder.js',
        'features/video/timeline/core/TimelineTrackRegistry.js',
        'features/video/timeline/core/TimelineTrackSync.js',
        'features/video/timeline/core/TimelinePlaybackMapping.js',
        'features/video/timeline/render/TimelineRenderContext.js',
        'features/video/timeline/render/TimelineWaveformMipmaps.js',
        'features/video/timeline/render/TimelineWaveformRenderer.js',
        'features/video/timeline/render/TimelineViewportRenderer.js',
        'features/video/timeline/render/TimelineVideoTrackRenderer.js',
        'features/video/timeline/render/TimelineAudioTrackRenderer.js',
        'features/video/timeline/core/TimelineContextMenu.js',
        'features/video/timeline/core/TimelineDragResolver.js',
        'features/video/timeline/core/TimelineTrackMutation.js',
        'features/video/timeline/core/TimelineDragLifecycle.js',
        'features/video/timeline/core/TimelineDragSession.js',
        'features/video/timeline/core/TimelineDragPreview.js',
        'features/video/timeline/core/TimelineEditOperations.js',
        'features/video/timeline/core/TimelineActions.js',
        'features/video/timeline/core/TimelineClipControls.js',
        'features/video/timeline/core/TimelineStateSnapshot.js',
        'features/video/timeline/core/TimelineNavigation.js',
        'features/video/timeline/core/TimelineMediaSupport.js',
        'features/video/timeline/core/TimelineInteractionUtils.js',
        'features/video/timeline/core/TimelineBootstrap.js',
        'features/video/preview/core/CreatorPreviewBootstrap.js',
        'features/video/preview/core/CreatorPreviewPresentation.js',
        'features/video/CreatorPreview.js',
        'features/video/CreatorTimelineManager.js',
        'features/video/BatchCreatorFlow.js',
        'features/video/SilenceProcessor.js',
        'features/video/AudioTrackPlayer.js',
        'features/video/TimelineAudioMixer.js',
        'features/video/audio/core/CreatorAudioMixerTools.js',
        'features/video/audio/core/CreatorAudioDemucsResults.js',
        'features/video/audio/core/CreatorAudioDemucsTools.js',
        'features/video/CreatorAudioHandler.js',
        'features/video/VideoService.js',
        'features/video/VideoUIManager.js',
        'features/video/export/CreatorExportCapabilityMatrix.js',
        'features/video/export/TimelineProjectSnapshot.js',
        'features/video/export/CreatorExportPlanner.js',
        'features/video/VideoProcessor.js',
        'features/video/ContextMenu.js',
        'features/video/RangeSelector.js',
        'features/video/flow/core/CreatorFlowBootstrap.js',
        'features/video/flow/core/CreatorFlowProjectStore.js',
        'features/video/flow/core/CreatorFlowToolDispatcher.js',
        'features/video/CreatorFlow.js'
    ]);

    /** @type {Promise<*>|null} */
    let enhancePromise = null;
    /** @type {Promise<*>|null} */
    let editorPromise = null;
    /** @type {Promise<*>|null} */
    let subtitlePromise = null;
    /** @type {Promise<*>|null} */
    let creatorPromise = null;

    let _loadingDepth = 0;

    function t(key, fb) {
        try {
            const v = root.i18n?.t?.(key);
            if (v && v !== key) return v;
        } catch {
            /* ignore */
        }
        return fb;
    }

    function showFeatureLoading(featureKey) {
        if (typeof document === 'undefined') return;
        _loadingDepth += 1;
        let el = document.getElementById('feature-loading-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'feature-loading-overlay';
            el.className = 'feature-loading-overlay';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.innerHTML =
                '<div class="feature-loading-card">' +
                '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>' +
                '<span class="feature-loading-text"></span>' +
                '</div>';
            document.body.appendChild(el);
        }
        const labels = {
            enhance: t('common.loadingFeature.enhance', 'Loading AI Enhance…'),
            editor: t('common.loadingFeature.editor', 'Loading Editor…'),
            subtitle: t('common.loadingFeature.subtitle', 'Loading Subtitle studio…'),
            creator: t('common.loadingFeature.creator', 'Loading Creator tools…')
        };
        const text = el.querySelector('.feature-loading-text');
        if (text) text.textContent = labels[featureKey] || t('common.loadingFeature.generic', 'Loading…');
        el.classList.add('is-visible');
    }

    function hideFeatureLoading() {
        if (typeof document === 'undefined') return;
        _loadingDepth = Math.max(0, _loadingDepth - 1);
        if (_loadingDepth > 0) return;
        const el = document.getElementById('feature-loading-overlay');
        if (el) el.classList.remove('is-visible');
    }

    async function withFeatureLoading(featureKey, fn) {
        showFeatureLoading(featureKey);
        try {
            return await fn();
        } finally {
            hideFeatureLoading();
        }
    }

    async function ensureEnhance() {
        if (root.EnhanceFlow && typeof root.EnhanceFlow.init === 'function') {
            return root.EnhanceFlow;
        }

        if (enhancePromise) return enhancePromise;

        enhancePromise = withFeatureLoading('enhance', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            await loader.loadScripts(ENHANCE_SCRIPTS);

            if (!root.EnhanceFlow || typeof root.EnhanceFlow.init !== 'function') {
                const Cls = root.EnhanceFlowClass;
                if (typeof Cls !== 'function') {
                    throw new Error('[FeatureLoader] EnhanceFlowClass not found after script load');
                }
                root.EnhanceFlow = new Cls();
            }

            return root.EnhanceFlow;
        }).catch((err) => {
            enhancePromise = null;
            console.error('[FeatureLoader] ensureEnhance failed:', err);
            throw err;
        });

        return enhancePromise;
    }

    async function ensureEditor(app) {
        if (root.editorFlow && typeof root.editorFlow.init === 'function') {
            return root.editorFlow;
        }

        if (editorPromise) return editorPromise;

        editorPromise = withFeatureLoading('editor', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            await loader.loadScripts(EDITOR_SCRIPTS);

            const EditorCls = root.EditorFlow;
            if (typeof EditorCls !== 'function') {
                throw new Error('[FeatureLoader] EditorFlow not found after script load');
            }

            const appRef = app || root.app || null;
            const flow = new EditorCls(appRef);
            root.editorFlow = flow;
            if (appRef) {
                appRef.editorFlow = flow;
            }

            if (typeof flow.init === 'function' && !flow._featureLoaderInited) {
                await flow.init();
                flow._featureLoaderInited = true;
            }

            return flow;
        }).catch((err) => {
            editorPromise = null;
            console.error('[FeatureLoader] ensureEditor failed:', err);
            throw err;
        });

        return editorPromise;
    }

    async function ensureSubtitle(app) {
        if (root.subtitleFlow && typeof root.subtitleFlow.init === 'function') {
            return root.subtitleFlow;
        }

        if (subtitlePromise) return subtitlePromise;

        subtitlePromise = withFeatureLoading('subtitle', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            if (!root.TranslationService) {
                console.warn(
                    '[FeatureLoader] TranslationService not on window yet — subtitle AI may fail until loaded'
                );
            }

            await loader.loadScripts(SUBTITLE_SCRIPTS);

            const SubtitleCls = root.SubtitleFlow;
            if (typeof SubtitleCls !== 'function') {
                throw new Error('[FeatureLoader] SubtitleFlow not found after script load');
            }

            const appRef = app || root.app || null;
            const flow = new SubtitleCls(appRef);
            root.subtitleFlow = flow;
            if (appRef) {
                appRef.subtitleFlow = flow;
            }

            if (typeof flow.init === 'function' && !flow._featureLoaderInited) {
                await flow.init();
                flow._featureLoaderInited = true;
            }

            return flow;
        }).catch((err) => {
            subtitlePromise = null;
            console.error('[FeatureLoader] ensureSubtitle failed:', err);
            throw err;
        });

        return subtitlePromise;
    }

    /**
     * Ensure Creator toolbox scripts + CreatorFlow are ready (once).
     * @param {object} [app]
     * @returns {Promise<object|null>}
     */
    async function ensureCreator(app) {
        if (root.creatorFlow && typeof root.creatorFlow.init === 'function') {
            return root.creatorFlow;
        }

        if (creatorPromise) return creatorPromise;

        creatorPromise = withFeatureLoading('creator', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            await loader.loadScripts(CREATOR_SCRIPTS);

            const CreatorCls = root.CreatorFlow;
            if (typeof CreatorCls !== 'function') {
                throw new Error('[FeatureLoader] CreatorFlow not found after script load');
            }

            const appRef = app || root.app || null;
            const flow = new CreatorCls(appRef);
            root.creatorFlow = flow;
            if (appRef) {
                appRef.creatorFlow = flow;
            }

            if (typeof flow.init === 'function' && !flow._featureLoaderInited) {
                await flow.init();
                flow._featureLoaderInited = true;
            }

            return flow;
        }).catch((err) => {
            creatorPromise = null;
            console.error('[FeatureLoader] ensureCreator failed:', err);
            throw err;
        });

        return creatorPromise;
    }

    root.FeatureLoader = {
        ENHANCE_SCRIPTS,
        EDITOR_SCRIPTS,
        SUBTITLE_SCRIPTS,
        CREATOR_SCRIPTS,
        ensureEnhance,
        ensureEditor,
        ensureSubtitle,
        ensureCreator
    };
})(typeof window !== 'undefined' ? window : globalThis);
