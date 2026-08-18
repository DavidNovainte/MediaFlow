/**
 * SubtitleTTSLocalUI.js
 * 
 * 专门处理单句配音参数调节的浮窗 UI。
 * 实现“单句覆盖全局”的参数交互。
 */

class SubtitleTTSLocalUI {
    constructor() {
        this.popover = null;
        this.activeIndex = -1;
        this.currentSettings = null;
    }

    /**
     * 静态显示方法
     * @param {Event} event - 点击事件
     * @param {number} index - 字幕索引
     */
    static show(eventOrTrigger, index) {
        if (!window.subtitleTTSLocalUI) {
            window.subtitleTTSLocalUI = new SubtitleTTSLocalUI();
        }
        window.subtitleTTSLocalUI._show(eventOrTrigger, index);
    }

    _show(eventOrTrigger, index) {
        const trigger = eventOrTrigger?.currentTarget || eventOrTrigger?.target || eventOrTrigger || null;
        if (typeof eventOrTrigger?.preventDefault === 'function') {
            eventOrTrigger.preventDefault();
        }
        if (typeof eventOrTrigger?.stopPropagation === 'function') {
            eventOrTrigger.stopPropagation();
        }

        this.activeIndex = index;
        const sub = window.subtitleEditor?.subtitles[index];
        if (!sub) return;

        // 获取当前字幕的本地设置或空对象
        this.currentSettings = sub.ttsLocal ? { ...sub.ttsLocal } : null;

        this._createPopover();
        this._positionPopover(trigger);
        this._renderContent(sub);
        this._bindPopoverEvents(index);
        
        // 点击外部关闭逻辑 (增加延迟避免立即触发自身)
        const closeHandler = (e) => {
            if (this.popover && !this.popover.contains(e.target)) {
                this.popover.classList.remove('active');
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
    }

    _createPopover() {
        if (this.popover) return;

        this.popover = document.createElement('div');
        this.popover.className = 'tts-local-popover glass-panel';
        this.popover.innerHTML = `
            <div class="popover-header">
                <div class="title"><i class="fa-solid fa-microphone-lines"></i> <span data-i18n="subtitle.tts.local_settings">Voice Settings</span></div>
                <button class="btn-icon-sm" id="btn-tts-local-close"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="popover-body">
                <!-- 内容动态填充 -->
            </div>
            <div class="popover-footer">
                <button class="btn-text btn-sm" id="btn-tts-local-reset" data-i18n="subtitle.tts.reset">Default</button>
                <button class="btn-primary btn-sm" id="btn-tts-local-preview">
                    <i class="fa-solid fa-play"></i> <span data-i18n="subtitle.tts.preview">Preview</span>
                </button>
            </div>
        `;
        document.body.appendChild(this.popover);

        this.popover.querySelector('#btn-tts-local-close').onclick = () => {
            this.popover.classList.remove('active');
        };
    }

    _positionPopover(trigger) {
        const fallbackRect = {
            top: window.innerHeight * 0.25,
            left: window.innerWidth * 0.5 - 140,
            bottom: window.innerHeight * 0.25 + 32,
            right: window.innerWidth * 0.5 + 140,
            width: 32,
            height: 32
        };
        const rect = typeof trigger?.getBoundingClientRect === 'function'
            ? trigger.getBoundingClientRect()
            : fallbackRect;
        const popoverWidth = 280;
        const viewportPadding = 12;

        // The popover uses position: fixed, so coordinates must stay in viewport space.
        let top = rect.bottom + 10;
        let left = rect.left;

        if (left + popoverWidth + viewportPadding > window.innerWidth) {
            left = window.innerWidth - popoverWidth - viewportPadding;
        }

        if (left < viewportPadding) {
            left = viewportPadding;
        }

        const estimatedHeight = 240;
        if (top + estimatedHeight + viewportPadding > window.innerHeight) {
            top = Math.max(viewportPadding, rect.top - estimatedHeight - 10);
        }

        this.popover.style.top = `${top}px`;
        this.popover.style.left = `${left}px`;
        this.popover.classList.add('active');
    }

    _renderContent() {
        const body = this.popover.querySelector('.popover-body');
        const ttsHandler = window.subtitleFlow?.ttsHandler;
        if (!ttsHandler) return;

        const global = ttsHandler.getSettings();
        
        // 初始逻辑状态 (如果有本地覆盖则用本地，否则显示全局值作为占位预览)
        const settings = this.currentSettings || {};
        const voice = settings.voice || global.voice;
        const rate = settings.rate !== undefined ? settings.rate : global.rate;
        const pitch = settings.pitch !== undefined ? settings.pitch : global.pitch;
        
        body.innerHTML = `
            <div class="setting-row">
                <label data-i18n="subtitle.tts.voice">Voice</label>
                <select id="local-tts-voice" class="setting-select-sm">
                    <!-- 同步全局列表 -->
                </select>
            </div>
            <div class="setting-row">
                <div class="label-group">
                    <label data-i18n="subtitle.tts.rate">Speed</label>
                    <span class="val-badge" id="local-rate-val">${(rate / 100 + 1).toFixed(1)}x</span>
                </div>
                <input type="range" id="local-tts-rate" min="-100" max="200" value="${rate}" step="5">
            </div>
            <div class="setting-row">
                <div class="label-group">
                    <label data-i18n="subtitle.tts.pitch">Pitch</label>
                    <span class="val-badge" id="local-pitch-val">${pitch}Hz</span>
                </div>
                <input type="range" id="local-tts-pitch" min="-50" max="50" value="${pitch}" step="1">
            </div>
        `;

        // 同步发音人列表 (从 SubtitleFlow 的实体中获取)
        const voiceSelect = body.querySelector('#local-tts-voice');
        const mainVoiceSelect = document.getElementById('tts-voice');
        if (mainVoiceSelect) {
            voiceSelect.innerHTML = mainVoiceSelect.innerHTML;
            voiceSelect.value = voice;
        }

        // 初始化 i18n
        if (window.i18n) window.i18n.localize?.(body);
    }

    _bindPopoverEvents(index) {
        const rateSlider = this.popover.querySelector('#local-tts-rate');
        const pitchSlider = this.popover.querySelector('#local-tts-pitch');
        const voiceSelect = this.popover.querySelector('#local-tts-voice');
        const rateVal = this.popover.querySelector('#local-rate-val');
        const pitchVal = this.popover.querySelector('#local-pitch-val');

        const updateData = () => {
            const settings = {
                voice: voiceSelect.value,
                rate: parseInt(rateSlider.value),
                pitch: parseInt(pitchSlider.value)
            };
            this.currentSettings = settings;
            rateVal.textContent = `${(settings.rate / 100 + 1).toFixed(1)}x`;
            pitchVal.textContent = `${settings.pitch}Hz`;
            
            // 通知编辑器
            window.subtitleEditor?.updateSubtitleLocalTTS(index, settings);
        };

        rateSlider.oninput = updateData;
        pitchSlider.oninput = updateData;
        voiceSelect.onchange = updateData;

        this.popover.querySelector('#btn-tts-local-reset').onclick = () => {
            window.subtitleEditor?.updateSubtitleLocalTTS(index, null);
            this.currentSettings = null;
            this.popover.classList.remove('active');
        };

        this.popover.querySelector('#btn-tts-local-preview').onclick = (e) => {
            e.stopPropagation();
            window.subtitleEditor?.previewTts(index);
        };
    }
}

window.SubtitleTTSLocalUI = SubtitleTTSLocalUI;
