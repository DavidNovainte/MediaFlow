/**
 * ScribeSpeakerManager.js
 * 负责管理说话人信息，包括颜色分配、重命名弹窗逻辑等
 */
class ScribeSpeakerManager {
    /**
     * @param {ScribeEditor} editor - ScribeEditor 实例 (用于回调 render)
     */
    constructor(editor) {
        this.editor = editor;
        this.app = editor.app; // 方便访问 app 数据
        this.customSpeakerColors = {}; // 存储用户自定义颜色
    }

    /**
     * 根据说话人生成固定颜色
     */
    getSpeakerColor(speaker) {
        if (!speaker) return '#4a90e2';

        // 优先级 1: 用户自定义颜色
        if (this.customSpeakerColors[speaker]) {
            return this.customSpeakerColors[speaker];
        }

        // 优先级 2: 哈希生成
        let hash = 0;
        for (let i = 0; i < speaker.length; i++) {
            hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = [
            '#4a90e2', '#ff5fa2', '#44c08a', '#f39c12',
            '#2f5fad', '#00b894', '#eb4d4b', '#34495e'
        ];
        return colors[Math.abs(hash) % colors.length];
    }

    /**
     * 打开说话人重命名对话框 (动态创建弹窗)
     */
    renameSpeaker(oldName) {
        console.log('[ScribeSpeakerManager] renameSpeaker called for:', oldName);

        // 移除已存在的弹窗（避免重复）
        const existingModal = document.getElementById('dynamic-speaker-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 当前颜色
        let selectedColor = this.getSpeakerColor(oldName);

        // 颜色列表 (去重且精选)
        const colors = [
            '#4a90e2', // Blue
            '#ff5fa2', // Pink
            '#44c08a', // Green
            '#f39c12', // Orange
            '#2f5fad', // Purple
            '#00b894', // Teal
            '#eb4d4b', // Red
            '#34495e', // Navy
            '#f1c40f', // Yellow
            '#e67e22', // Dark Orange
            '#8e44ad', // Dark Purple
            '#2c3e50'  // Dark Blue Grey
        ];

        // 动态创建弹窗 HTML
        const modalHTML = `
            <div id="dynamic-speaker-modal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2147483647;
                backdrop-filter: blur(4px);
            ">
                <div style="
                    background: var(--bg-card);
                    padding: 24px;
                    border-radius: 12px;
                    min-width: 320px;
                    max-width: 400px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    border: 1px solid var(--fill-hover);
                ">
                    <h3 style="
                        margin: 0 0 20px 0;
                        color: #fff;
                        font-size: 18px;
                        font-weight: 600;
                    ">${window.i18n?.t('common.scribe.editSpeaker') || 'Edit Speaker'}</h3>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="
                            color: #a0a0b8;
                            font-size: 12px;
                            display: block;
                            margin-bottom: 8px;
                        ">${window.i18n?.t('common.scribe.speakerName') || 'Speaker Name'}</label>
                        <input type="text" id="dynamic-speaker-input" value="${oldName}" style="
                            width: 100%;
                            padding: 12px;
                            background: #0f0f1a;
                            border: 1px solid var(--fill-hover);
                            border-radius: 8px;
                            color: #fff;
                            font-size: 14px;
                            outline: none;
                            box-sizing: border-box;
                        ">
                    </div>
                    
                    <div style="margin-bottom: 24px;">
                        <label style="
                            color: #a0a0b8;
                            font-size: 12px;
                            display: block;
                            margin-bottom: 10px;
                        ">${window.i18n?.t('common.scribe.exclusiveColor') || 'Exclusive Color'}</label>
                        <div id="dynamic-color-palette" style="
                            display: flex;
                            gap: 10px;
                            flex-wrap: wrap;
                        ">
                            ${colors.map(c => `
                                <div class="color-option" data-color="${c}" style="
                                    width: 28px;
                                    height: 28px;
                                    border-radius: 50%;
                                    background: ${c};
                                    cursor: pointer;
                                    border: 3px solid ${c === selectedColor ? '#fff' : 'transparent'};
                                    box-shadow: ${c === selectedColor ? '0 0 0 2px #4d82c9' : 'none'};
                                    transition: all 0.2s;
                                "></div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="dynamic-cancel-btn" style="
                            padding: 10px 20px;
                            background: #252542;
                            border: 1px solid var(--fill-hover);
                            border-radius: 8px;
                            color: #fff;
                            font-size: 14px;
                            cursor: pointer;
                        ">${window.i18n?.t('common.actions.cancel') || 'Cancel'}</button>
                        <button id="dynamic-save-btn" style="
                            padding: 10px 20px;
                            background: linear-gradient(135deg, #4d82c9 0%, #3d6eb8 100%);
                            border: none;
                            border-radius: 8px;
                            color: #fff;
                            font-size: 14px;
                            font-weight: 600;
                            cursor: pointer;
                        ">${window.i18n?.t('common.actions.save') || 'Save'}</button>
                    </div>
                </div>
            </div>
        `;

        // 插入到 body 最后
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('dynamic-speaker-modal');
        const input = document.getElementById('dynamic-speaker-input');
        const palette = document.getElementById('dynamic-color-palette');
        const cancelBtn = document.getElementById('dynamic-cancel-btn');
        const saveBtn = document.getElementById('dynamic-save-btn');

        console.log('[ScribeSpeakerManager] Dynamic modal created:', modal ? 'OK' : 'FAILED');

        // 聚焦输入框
        setTimeout(() => input.focus(), 100);

        // 颜色选择事件
        palette.querySelectorAll('.color-option').forEach(swatch => {
            swatch.addEventListener('click', () => {
                // 重置所有
                palette.querySelectorAll('.color-option').forEach(s => {
                    s.style.border = '3px solid transparent';
                    s.style.boxShadow = 'none';
                });
                // 选中当前
                swatch.style.border = '3px solid #fff';
                swatch.style.boxShadow = '0 0 0 2px #4d82c9';
                selectedColor = swatch.dataset.color;
            });
        });

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
            modal.remove();
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // 保存按钮
        saveBtn.addEventListener('click', () => {
            const newName = input.value.trim();
            if (!newName) {
                window.app?.showToast(window.i18n?.t('common.scribe.nameEmpty') || 'Name cannot be empty', 'warning');
                return;
            }

            // 1. 更新颜色映射
            this.customSpeakerColors[newName] = selectedColor;

            // 2. 批量更新所有相同说话人的标签
            let count = 0;
            [this.app.rawSegments, this.app.polishedSegments].forEach(list => {
                if (list) {
                    list.forEach(seg => {
                        if (seg.speaker === oldName) {
                            seg.speaker = newName;
                            count++;
                        }
                    });
                }
            });

            // 3. 重新渲染转录结果
            this.editor.render();

            // 4. 关闭弹窗
            modal.remove();

            // 5. 提示成功
            window.app?.showToast(window.i18n?.t('common.scribe.speakersUpdated', {count}) || `Updated ${count} speaker labels`, 'success');
        });
    }
}

window.ScribeSpeakerManager = ScribeSpeakerManager;
