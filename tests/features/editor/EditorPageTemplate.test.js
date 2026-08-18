const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Editor page template', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../../src/pages/editor.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../../../src/styles/editor.css'), 'utf8');
    const document = new JSDOM(html).window.document;

    test('contains the static controls required by the editor managers', () => {
        [
            'page-editor',
            'editor-file-input',
            'btn-editor-import',
            'editor-asset-list',
            'editor-assets-count',
            'editor-project-name',
            'editor-project-meta',
            'editor-project-status',
            'editor-preview-empty',
            'editor-preview-video',
            'editor-preview-audio',
            'editor-preview-image',
            'editor-preview-context',
            'editor-preview-selection',
            'editor-preview-meta',
            'editor-preview-mode',
            'editor-preview-current-time',
            'editor-preview-duration',
            // Safe-frame is a stage overlay; toggle may be created by preview manager
            // 'btn-editor-preview-safe-frame' removed from static HTML
            'btn-editor-back-to-creator',
            'editor-playhead-time',
            'editor-layout-resizer',
            'editor-timeline-body',
            'editor-timeline-playhead-overlay',
            'editor-timeline-ruler',
            'editor-timeline-tracks',
            'editor-inspector-body',
            'btn-editor-export'
        ].forEach((id) => {
            expect(document.getElementById(id)).not.toBeNull();
        });

        // Safe frame visual guide remains in the preview stage
        expect(document.querySelector('.editor-preview-safe-frame')).not.toBeNull();
    });

    test('keeps the asset header focused on importing media', () => {
        const assetHeader = document.querySelector('.editor-assets-panel .editor-panel-head');

        expect(assetHeader.querySelector('#btn-editor-assets-insert')).toBeNull();
        expect(assetHeader.querySelector('#btn-editor-import span').textContent).toBe('导入素材');
    });

    test('renders the timeline toolbar as compact icon tools', () => {
        [
            ['btn-editor-add-track', 'fa-plus'],
            ['btn-editor-undo', 'fa-rotate-left'],
            ['btn-editor-redo', 'fa-rotate-right'],
            ['btn-editor-insert-selected', 'fa-circle-plus'],
            ['btn-editor-merge-clip', 'fa-object-group'],
            ['btn-editor-split-clip', 'fa-scissors'],
            ['btn-editor-delete-clip', 'fa-trash'],
            ['btn-editor-ripple-delete-clip', 'fa-delete-left'],
            ['btn-editor-fit-timeline', 'fa-arrows-left-right-to-line'],
            ['btn-editor-toggle-snap', 'fa-magnet']
        ].forEach(([id, iconClass]) => {
            const button = document.getElementById(id);

            expect(button).not.toBeNull();
            expect(button.classList.contains('editor-timeline-tool')).toBe(true);
            expect(button.querySelector(`i.${iconClass}`)).not.toBeNull();
            // Compact toolbar is icon-first; visible label may be aria-label/title only
            expect(
                button.querySelector('span') ||
                button.getAttribute('aria-label') ||
                button.getAttribute('title')
            ).toBeTruthy();
        });

        expect(document.querySelector('.editor-timeline-toolbar-group-export #btn-editor-export')).not.toBeNull();
        expect(document.querySelector('.editor-timeline-toolbar-group-view #btn-editor-fit-timeline')).not.toBeNull();
        expect(document.querySelector('.editor-timeline-toolbar-group-view #editor-timeline-zoom')).not.toBeNull();
    });

    test('keeps timeline toolbar text labels hidden from the compact button row', () => {
        expect(css).toContain('.editor-timeline-actions .editor-timeline-tool');
        expect(css).toContain('flex: 0 0 32px;');
        expect(css).toContain('max-width: 32px;');
        expect(css).toContain('#page-editor .editor-timeline-actions .editor-timeline-tool span');
        expect(css).toContain('display: none;');
        expect(css).toContain('#page-editor .editor-timeline-toolbar-group .editor-timeline-tool > span');
        expect(css).toContain('.editor-timeline-toolbar-group-view');
        expect(css).toContain('.editor-zoom-control');
        // Zoom is compact NLE-style (fixed width), not a growing flex filler
        expect(css).toMatch(/\.editor-zoom-control input\[type="range"\][\s\S]*?width:\s*72px;/);
        expect(css).toMatch(/\.editor-zoom-control[\s\S]*?border-left:\s*1px solid/);
    });

    test('safe-frame guide starts present on the preview stage', () => {
        const safeFrame = document.querySelector('.editor-preview-safe-frame');
        expect(safeFrame).not.toBeNull();
        expect(safeFrame.getAttribute('aria-hidden')).toBe('true');
    });
});
