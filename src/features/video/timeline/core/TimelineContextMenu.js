/**
 * TimelineContextMenu
 * Builds and binds segment/track context menus for the timeline UI.
 */
class TimelineContextMenu {
    static escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    static clampToViewport(menu, preferredX, preferredY) {
        if (!menu) return;

        const padding = 8;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;
        const menuWidth = menu.offsetWidth || 0;
        const menuHeight = menu.offsetHeight || 0;

        let left = preferredX;
        let top = preferredY;

        if (left + menuWidth + padding > viewportWidth) {
            left = Math.max(padding, viewportWidth - menuWidth - padding);
        }
        if (top + menuHeight + padding > viewportHeight) {
            top = Math.max(padding, preferredY - menuHeight);
        }

        left = Math.max(padding, left);
        top = Math.max(padding, top);

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    static applyBaseStyle(menu, x, y) {
        menu.className = 'custom-context-menu dropdown-content-pro show';
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.zIndex = '999999';
        menu.style.minWidth = '160px';
        menu.style.padding = '4px';
        menu.style.background = 'rgba(15, 23, 42, 0.95)';
        menu.style.border = '1px solid var(--fill-hover)';
        menu.style.backdropFilter = 'blur(12px)';
        menu.style.fontSize = '12px';
    }

    static bindOutsideClose(menu) {
        const closeMenu = (ev) => {
            if (menu.parentElement && !menu.contains(ev.target)) {
                menu.remove();
            }
            window.removeEventListener('mousedown', closeMenu);
        };

        setTimeout(() => window.addEventListener('mousedown', closeMenu), 10);
    }

    static ensureTrackActionBinding(manager) {
        if (manager._actionBound) return;

        document.addEventListener('timeline-action', (ev) => {
            const { action, type, relativeId, position, trackId } = ev.detail || {};
            if (action === 'addTrack') manager.addTrack(type, relativeId, position);
            if (action === 'removeTrack') manager.removeTrack(trackId);

            const menu = document.getElementById('timeline-context-menu');
            if (menu) menu.remove();
        });

        manager._actionBound = true;
    }

    static showSegment(manager, e, trackId, index) {
        e.preventDefault();
        e.stopPropagation();

        const segment = manager.tracks[trackId]?.segments?.[index];
        if (!segment) return;

        document.getElementById('segment-context-menu')?.remove();

        const menu = document.createElement('div');
        menu.id = 'segment-context-menu';
        this.applyBaseStyle(menu, e.clientX, e.clientY);

        let menuHtml = `
            <div class="pop-item" id="menu-seg-split"><span><i class="fa-solid fa-scissors"></i> ${window.i18n?.t('creator.timeline.menuSplit') || 'Split Segment'}</span></div>
            <div class="pop-item" id="menu-seg-tostart"><span><i class="fa-solid fa-angles-left"></i> ${window.i18n?.t('creator.timeline.menuToStart') || 'Move to Start'}</span></div>
            <div class="pop-item text-danger" id="menu-seg-delete"><span><i class="fa-solid fa-trash"></i> ${window.i18n?.t('creator.timeline.menuDelete') || 'Delete Segment'}</span></div>
        `;

        if (trackId.startsWith('a')) {
            menuHtml += `
                <div class="pop-item" id="menu-seg-demucs"><span><i class="fa-solid fa-wand-magic-sparkles"></i> ${window.i18n?.t('creator.timeline.menuSeparateAudio') || 'Separate Audio'}</span></div>
            `;
        }

        menuHtml += '<div class="pop-separator"></div>';

        if (segment.groupId) {
            menuHtml += `<div class="pop-item" id="menu-seg-unlink"><span><i class="fa-solid fa-link-slash"></i> ${window.i18n?.t('creator.timeline.menuUnlink') || 'Unlink Audio/Video'}</span></div>`;
        } else {
            menuHtml += `<div class="pop-item" id="menu-seg-link" title="${window.i18n?.t('creator.timeline.menuRelinkTip') || 'Find other segments at the same start time'}"><span><i class="fa-solid fa-link"></i> ${window.i18n?.t('creator.timeline.menuRelink') || 'Relink'}</span></div>`;
        }

        menu.innerHTML = menuHtml;
        document.body.appendChild(menu);
        this.clampToViewport(menu, e.clientX, e.clientY);

        const bindMenuItem = (selector, handler) => {
            const btn = menu.querySelector(selector);
            if (!btn) return;

            btn.onmousedown = (ev) => {
                ev.stopPropagation();
                handler(ev);
                menu.remove();
            };
        };

        bindMenuItem('#menu-seg-split', () => {
            manager.currentTime = segment.start + (e.offsetX / (manager.pixelsPerSecond * (manager.zoomLevel / 100)));
            manager.splitAtPlayhead();
        });

        bindMenuItem('#menu-seg-delete', () => {
            manager.selectedTrackId = trackId;
            manager.selectedSegmentIndex = index;
            manager.deleteSelectedSegment();
        });

        bindMenuItem('#menu-seg-tostart', () => manager.moveSegmentToStart(trackId, index));
        bindMenuItem('#menu-seg-demucs', async () => {
            manager.selectedTrackId = trackId;
            manager.selectedSegmentIndex = index;
            manager.renderAll();
            await manager.app.audioHandler?.separateAudio({
                trackId,
                index
            });
        });
        bindMenuItem('#menu-seg-unlink', () => manager.unlinkSegment(segment.groupId));
        bindMenuItem('#menu-seg-link', () => manager.autoLinkSegment(trackId, index));

        this.bindOutsideClose(menu);
    }

    static showTrack(manager, e, trackId) {
        document.getElementById('timeline-context-menu')?.remove();

        const menu = document.createElement('div');
        menu.id = 'timeline-context-menu';
        this.applyBaseStyle(menu, e.clientX, e.clientY);

        const isMainTrack = trackId === 'v1' || trackId === 'a1';
        const safeTrackId = this.escapeHtml(trackId);
        let menuHtml = `
            <div class="pop-item" data-action="addTrack" data-type="video" data-relative-id="${safeTrackId}" data-position="above">
                <span><i class="fa-solid fa-plus"></i> ${window.i18n?.t('creator.timeline.menuAddTrackV') || 'Insert Video Track Above'}</span>
            </div>
            <div class="pop-item" data-action="addTrack" data-type="audio" data-relative-id="${safeTrackId}" data-position="below">
                <span><i class="fa-solid fa-plus"></i> ${window.i18n?.t('creator.timeline.menuAddTrackA') || 'Insert Audio Track Below'}</span>
            </div>
            <div class="pop-separator"></div>
        `;

        if (!isMainTrack) {
            menuHtml += `
                <div class="pop-separator"></div>
                <div class="pop-item text-danger" data-action="removeTrack" data-track-id="${safeTrackId}">
                    <span><i class="fa-solid fa-trash"></i> ${window.i18n?.t('creator.timeline.menuRemoveTrack') || 'Delete Current Track'}</span>
                </div>
            `;
        } else {
            menuHtml += `
                <div class="pop-item disabled" style="opacity: 0.5; cursor: not-allowed;">
                    <span><i class="fa-solid fa-lock"></i> ${window.i18n?.t('creator.timeline.mainTrackLocked') || 'Main track cannot be deleted'}</span>
                </div>
            `;
        }

        menu.innerHTML = menuHtml;
        document.body.appendChild(menu);
        this.clampToViewport(menu, e.clientX, e.clientY);
        menu.addEventListener('mousedown', (ev) => {
            const item = ev.target?.closest?.('[data-action]');
            if (!item || !menu.contains(item)) return;

            ev.stopPropagation();
            const action = item.dataset.action;
            if (action === 'addTrack') {
                manager.addTrack(item.dataset.type, item.dataset.relativeId, item.dataset.position);
            } else if (action === 'removeTrack') {
                manager.removeTrack(item.dataset.trackId);
            }
            menu.remove();
        });

        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        document.addEventListener('mousedown', closeMenu);

        this.ensureTrackActionBinding(manager);
    }
}

window.TimelineContextMenu = TimelineContextMenu;
