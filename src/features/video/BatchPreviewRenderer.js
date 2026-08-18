class BatchPreviewRenderer {
    constructor(flow) {
        this.flow = flow;
        this.carousel = document.querySelector('.preview-carousel');
    }

    render(files) {
        if (!this.carousel) this.carousel = document.querySelector('.preview-carousel');
        if (!this.carousel) return;

        this.carousel.innerHTML = '';
        if (files.length === 0) {
            this.renderEmptyState();
            return;
        }

        const actionType = document.getElementById('batch-action-select')?.value || document.getElementById('batch-action-type')?.value;
        const isMerge = actionType === 'merge';
        let commonRes = null;
        if (isMerge && files.length > 0) {
            const firstWithRes = files.find(f => f.resolution);
            if (firstWithRes) commonRes = `${firstWithRes.resolution.width}x${firstWithRes.resolution.height}`;
        }

        files.forEach((item, index) => {
            const card = this.createPreviewCard(item, index, isMerge, commonRes);
            card.setAttribute('data-index', index);
            this.carousel.appendChild(card);
        });
    }

    /**
     * Targeted update for progress
     */
    updateItemProgress(index, progress) {
        if (!this.carousel) return;
        const card = this.carousel.querySelector(`.preview-card[data-index="${index}"]`);
        if (!card) return;

        // Update progress bar
        const bar = card.querySelector('.preview-card-progress-bar');
        if (bar) {
            bar.style.width = `${progress}%`;
        }

        // Update percent text
        const status = card.querySelector('.preview-card-status');
        if (status) {
            // Check if it's already an error or done status to avoid overwriting final results
            if (!status.textContent.includes('✅') && !status.textContent.includes('❌')) {
                status.textContent = `${Math.round(progress)}%`;
            }
        }
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    renderEmptyState() {
        this.carousel.innerHTML = `
            <div class="batch-empty-state" style="width: 100%; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px dashed var(--border-color); border-radius: 12px; color: var(--text-muted); transition: all 0.3s ease;">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 15px; opacity: 0.5;">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <div style="font-size: 15px; font-weight: 500; margin-bottom: 8px;">${window.i18n?.t('common.status.noFiles') || 'No files yet'}</div>
                <div style="font-size: 13px; opacity: 0.7;">${window.i18n?.t('creator.batch.emptyHint') || 'Drag videos here, or click "Add Video" to start'}</div>
            </div>
        `;

        const emptyState = this.carousel.querySelector('.batch-empty-state');
        emptyState.style.cursor = 'pointer';
        emptyState.addEventListener('click', () => {
            document.getElementById('btn-batch-add-more')?.click();
        });

        emptyState.addEventListener('mouseenter', () => {
            emptyState.style.borderColor = 'var(--accent-primary)';
            emptyState.style.backgroundColor = 'rgba(77, 130, 201, 0.05)';
            emptyState.style.color = 'var(--accent-primary)';
        });
        emptyState.addEventListener('mouseleave', () => {
            emptyState.style.borderColor = 'var(--border-color)';
            emptyState.style.backgroundColor = 'transparent';
            emptyState.style.color = 'var(--text-muted)';
        });
    }

    createPreviewCard(item, index, isMerge, commonRes) {
        const card = document.createElement('div');
        card.className = 'preview-card';
        card.draggable = true;
        card.dataset.index = index;

        let statusIcon = '⏳';
        if (item.status === 'processing') statusIcon = '🔄';
        if (item.status === 'done') statusIcon = '✅';
        if (item.status === 'error') statusIcon = '❌';

        const file = item.file || {};
        const fileName = this.escapeHtml(file.name || '');
        const fileSize = Number.isFinite(Number(file.size)) ? Number(file.size) : 0;
        const fileSizeText = this.escapeHtml((fileSize / 1024 / 1024).toFixed(1));
        const progress = Number.isFinite(Number(item.progress)) ? Math.max(0, Math.min(100, Number(item.progress))) : 0;

        let warningOverlay = '';
        if (isMerge && item.resolution && commonRes) {
            const itemRes = `${item.resolution.width}x${item.resolution.height}`;
            if (itemRes !== commonRes) {
                const itemResText = this.escapeHtml(itemRes);
                const warningTitle = this.escapeHtml(window.i18n?.t('creator.batch.resMismatch', { res: itemRes }) || ('Resolution mismatch: ' + itemRes));
                warningOverlay = `<div style="position:absolute; top:5px; left:30px; background:rgba(0,0,0,0.7); color:#f59e0b; padding:2px 6px; border-radius:4px; font-size:10px; z-index:15;" title="${warningTitle}">⚠️ ${itemResText}</div>`;
            }
        }

        const videoUrl = item.objectUrl || (item.file ? URL.createObjectURL(item.file) : '');
        item.objectUrl = videoUrl;
        const safeVideoUrl = this.escapeHtml(videoUrl);

        card.innerHTML = `
            <div class="drag-indicator" style="position:absolute; top:8px; left:8px; z-index:10; cursor:grab; text-shadow: 0 1px 2px var(--overlay-scrim); color:white; opacity:0.8;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                     <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
                </svg>
            </div>
            ${warningOverlay}
            <video src="${safeVideoUrl}" muted preload="metadata" style="width:100%; height:100%; object-fit:cover; border-radius: 8px;"></video>
            <div class="card-overlay-actions" style="position:absolute; top:5px; right:5px; z-index:20;">
                <button class="btn-remove-icon" data-index="${index}" style="background:rgba(0,0,0,0.5); color:white; width:24px; height:24px; border:none; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
            <div class="preview-card-info">
                <div class="preview-card-name" title="${fileName}">${fileName}</div>
                 <div class="preview-card-meta">
                    <span>${fileSizeText} MB</span>
                    <span class="preview-card-status">${item.status === 'processing' ? `${Math.round(progress)}%` : statusIcon}</span>
                </div>
                ${item.status === 'processing' ? `
                <div class="preview-card-progress-container">
                    <div class="preview-card-progress-bar" style="width: ${progress}%"></div>
                </div>
                ` : ''}
            </div>
        `;

        const video = card.querySelector('video');
        card.addEventListener('mouseenter', () => video?.play().catch(() => { }));
        card.addEventListener('mouseleave', () => {
            if (video) { video.pause(); video.currentTime = 0; }
        });

        if (item.status !== 'processing') {
            card.querySelector('.btn-remove-icon')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.flow.removeFile(index);
            });
        }

        if (item.status === 'pending') {
            this.bindDragEvents(card, index);
        }

        return card;
    }

    bindDragEvents(element, index) {
        element.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({ index, mode: 'carousel' }));
            }
            element.classList.add('dragging');
            window._batchDragging = { index, mode: 'carousel' };
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
            document.querySelectorAll('.drag-over-target').forEach(el => el.classList.remove('drag-over-target'));
            window._batchDragging = null;
            window._lastDragOverTarget = null;
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            const target = typeof e.target?.closest === 'function'
                ? e.target.closest('.preview-card')
                : e.target?.parentElement?.closest?.('.preview-card') || null;
            if (target && target !== element && target !== window._lastDragOverTarget) {
                if (window._lastDragOverTarget) window._lastDragOverTarget.classList.remove('drag-over-target');
                target.classList.add('drag-over-target');
                window._lastDragOverTarget = target;
            }
        });

        element.addEventListener('dragleave', (e) => {
            const relatedTarget = e.relatedTarget?.closest?.('.preview-card');
            if (!relatedTarget || relatedTarget === element) {
                element.classList.remove('drag-over-target');
                if (window._lastDragOverTarget === element) window._lastDragOverTarget = null;
            }
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.drag-over-target').forEach(el => el.classList.remove('drag-over-target'));

            let fromIndex, fromMode;
            try {
                const rawData = e.dataTransfer?.getData?.('text/plain');
                if (rawData) {
                    const data = JSON.parse(rawData);
                    fromIndex = data.index;
                    fromMode = data.mode;
                } else if (window._batchDragging) {
                    fromIndex = window._batchDragging.index;
                    fromMode = window._batchDragging.mode;
                }
            } catch (dragParseError) {
                void dragParseError;
            }

            if (fromIndex !== undefined && fromMode === 'carousel' && fromIndex !== index) {
                this.flow.reorderFiles(fromIndex, index);
            }
        });
    }

    showPreviewDialog(onQuick, onReal) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--overlay-scrim); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s ease;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--bg-card); border-radius: 16px; padding: 24px 30px;
            max-width: 400px; text-align: center; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--border-color);
        `;

        dialog.innerHTML = `
            <h3 style="color: var(--text-primary); margin: 0 0 10px 0; font-size: 1.2rem;">${window.i18n?.t('creator.batch.previewTitle') || 'Select Preview Mode'}</h3>
            <p style="color: var(--text-secondary); margin: 0 0 20px 0; font-size: 0.9rem; line-height: 1.5;">
                ${window.i18n?.t('creator.batch.quickPreviewDesc') || 'Quick Preview: Play segments in sequence'}<br>
                ${window.i18n?.t('creator.batch.realPreviewDesc') || 'Real Preview: Generate temp merge file then play'}
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btn-preview-quick" style="
                    padding: 10px 20px; border-radius: 8px; border: 1px solid var(--border-color);
                    background: var(--fill-muted); color: var(--text-primary); cursor: pointer;
                    font-size: 14px; font-weight: 500; transition: all 0.2s;
                ">${window.i18n?.t('creator.batch.btnQuickPreview') || '⚡ Quick Preview'}</button>
                <button id="btn-preview-real" style="
                    padding: 10px 20px; border-radius: 8px; border: none;
                    background: var(--accent-primary); color: white; cursor: pointer;
                    font-size: 14px; font-weight: 500; transition: all 0.2s;
                ">${window.i18n?.t('creator.batch.btnRealPreview') || '🎬 Real Preview'}</button>
            </div>
            <button id="btn-preview-cancel" style="
                margin-top: 15px; padding: 8px 16px; border-radius: 6px;
                background: transparent; border: none; color: var(--text-muted);
                cursor: pointer; font-size: 13px;
            ">${window.i18n?.t('common.actions.cancel') || 'Cancel'}</button>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.style.opacity = '1');

        const closeDialog = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) document.body.removeChild(overlay);
            }, 200);
        };

        dialog.querySelector('#btn-preview-cancel').onclick = closeDialog;
        overlay.onclick = (e) => { if (e.target === overlay) closeDialog(); };

        dialog.querySelector('#btn-preview-quick').onclick = () => {
            closeDialog();
            onQuick();
        };

        dialog.querySelector('#btn-preview-real').onclick = () => {
            closeDialog();
            onReal();
        };
    }

    playVideo(src, title) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.95); z-index: 10000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease;
        `;

        const container = document.createElement('div');
        container.style.cssText = 'position: relative; width: 90%; max-width: 1000px; display: flex; flex-direction: column; align-items: center;';

        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.src = src;
        video.style.cssText = 'width: 100%; max-height: 70vh; border-radius: 12px; box-shadow: 0 0 50px var(--overlay-scrim); background: #000;';

        const info = document.createElement('div');
        info.style.cssText = 'color: #fff; margin-top: 20px; font-size: 1rem; text-align: center;';
        if (title) info.textContent = title;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = window.i18n?.t('common.actions.close') || 'Close Preview';
        closeBtn.style.cssText = 'margin-top: 15px; padding: 10px 24px; border-radius: 8px; background: var(--fill-hover); border: none; color: var(--text-secondary); cursor: pointer; font-size: 14px;';

        closeBtn.onclick = () => {
            overlay.style.opacity = '0';
            video.pause();
            setTimeout(() => {
                if (overlay.parentNode) document.body.removeChild(overlay);
            }, 300);
        };

        container.appendChild(video);
        container.appendChild(info);
        container.appendChild(closeBtn);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.style.opacity = '1');
    }

    playQuickSequence(files) {
        if (!files || files.length === 0) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.95); z-index: 10000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease;
        `;

        const container = document.createElement('div');
        container.style.cssText = 'position: relative; width: 90%; max-width: 1000px; display: flex; flex-direction: column; align-items: center;';

        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.cssText = 'width: 100%; max-height: 70vh; border-radius: 12px; box-shadow: 0 0 50px var(--overlay-scrim); background: #000;';

        const info = document.createElement('div');
        info.style.cssText = 'color: #fff; margin-top: 20px; font-size: 1rem; text-align: center; min-height: 60px;';

        const controls = document.createElement('div');
        controls.style.cssText = 'margin-top: 15px; display: flex; gap: 12px; align-items: center;';

        const createBtn = (text, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = `
                padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
                font-size: 14px; font-weight: 500; transition: all 0.2s;
                background: var(--fill-hover); color: var(--text-secondary);
                user-select: none;
            `;
            btn.addEventListener('mouseenter', () => btn.style.backgroundColor = 'rgba(255,255,255,0.2)');
            btn.addEventListener('mouseleave', () => btn.style.backgroundColor = 'var(--fill-hover)');
            btn.onclick = onClick;
            return btn;
        };

        let currentIndex = 0;
        let keyHandler = null;

        const closeOverlay = () => {
            if (keyHandler) document.removeEventListener('keydown', keyHandler);
            overlay.style.opacity = '0';
            video.pause();
            setTimeout(() => {
                if (overlay.parentNode) document.body.removeChild(overlay);
            }, 300);
        };

        const playVideo = async (index) => {
            if (index < 0) index = 0;
            if (index >= files.length) return;
            currentIndex = index;

            const item = files[currentIndex];
            const label = window.i18n?.t('creator.batch.quickPreviewLabel', { current: currentIndex + 1, total: files.length }) || `Quick Preview - Segment ${currentIndex + 1} / ${files.length}`;
            const safeLabel = this.escapeHtml(label);
            const safeName = this.escapeHtml(item.file?.name || '');
            info.innerHTML = `
                <div style="opacity: 0.6; margin-bottom: 4px; font-size: 0.9em;">
                    ${safeLabel}
                </div>
                <div style="font-weight: 600;">${safeName}</div>
            `;

            try {
                video.src = item.objectUrl || URL.createObjectURL(item.file);
                await video.play();
            } catch (err) {
                console.warn('Playback issue', err);
            }

            if (prevBtn) prevBtn.style.opacity = currentIndex === 0 ? '0.5' : '1';
            if (nextBtn) nextBtn.textContent = currentIndex === files.length - 1 ? (window.i18n?.t('common.actions.end') || 'End') : (window.i18n?.t('common.actions.next') || 'Next') + ' ⏭';
        };

        const prevBtn = createBtn(window.i18n?.t('common.actions.prev') || '⏮ Prev', () => playVideo(currentIndex - 1));
        const nextBtn = createBtn((window.i18n?.t('common.actions.next') || 'Next') + ' ⏭', () => {
            if (currentIndex >= files.length - 1) closeOverlay();
            else playVideo(currentIndex + 1);
        });
        const closeBtn = createBtn(window.i18n?.t('common.actions.close') || 'Close', closeOverlay);

        controls.appendChild(prevBtn);
        controls.appendChild(closeBtn);
        controls.appendChild(nextBtn);

        container.appendChild(video);
        container.appendChild(info);
        container.appendChild(controls);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.style.opacity = '1');

        video.onended = () => {
            if (currentIndex < files.length - 1) {
                playVideo(currentIndex + 1);
            } else {
                const endText = this.escapeHtml(window.i18n?.t('common.status.previewEnd') || '✓ Preview End');
                info.innerHTML = `<span style="color: var(--accent-primary);">${endText}</span>`;
            }
        };

        video.onerror = () => {
            const skipText = this.escapeHtml(window.i18n?.t('common.errors.playbackSkip') || '⚠ Playback failed, auto-skip in 1.5s...');
            const failedName = this.escapeHtml(files[currentIndex].file?.name || '');
            info.innerHTML = `<span style="color: #f59e0b;">${skipText}</span><br>${failedName}`;
            setTimeout(() => {
                if (currentIndex < files.length - 1) playVideo(currentIndex + 1);
            }, 1500);
        };

        keyHandler = (e) => {
            if (e.isComposing) return;
            if (e.key === 'ArrowLeft') playVideo(currentIndex - 1);
            else if (e.key === 'ArrowRight') {
                if (currentIndex < files.length - 1) playVideo(currentIndex + 1);
            } else if (e.key === 'Escape') closeOverlay();
            else if (e.key === ' ') {
                e.preventDefault();
                if (video.paused) video.play();
                else video.pause();
            }
        };
        document.addEventListener('keydown', keyHandler);

        playVideo(0);
    }
}

window.BatchPreviewRenderer = BatchPreviewRenderer;
