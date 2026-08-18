(function initSubtitleDisplayMode(globalScope) {
    const root = globalScope || window;
    const VALID_MODES = ['translated', 'bilingual', 'original'];

    function normalize(mode) {
        return VALID_MODES.includes(mode) ? mode : 'translated';
    }

    function fromEditor(editor) {
        if (!editor) return 'translated';
        const showOriginal = editor.showOriginal !== false;
        const showTranslation = !!editor.showTranslation;

        if (showOriginal && showTranslation) return 'bilingual';
        if (showOriginal) return 'original';
        return 'translated';
    }

    function applyToEditor(editor, mode) {
        if (!editor) return;
        const normalized = normalize(mode);
        editor.showOriginal = normalized === 'bilingual' || normalized === 'original';
        editor.showTranslation = normalized === 'bilingual' || normalized === 'translated';
    }

    function cycle(mode) {
        const normalized = normalize(mode);
        if (normalized === 'translated') return 'bilingual';
        if (normalized === 'bilingual') return 'original';
        return 'translated';
    }

    root.SubtitleDisplayMode = {
        normalize,
        fromEditor,
        applyToEditor,
        cycle
    };
}(window));
