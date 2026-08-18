class EditorMediaImporter {
    constructor(flow) {
        this.flow = flow;
    }

    inferKind(fileLike) {
        const type = String(fileLike?.type || '').toLowerCase();
        const name = String(fileLike?.name || fileLike?.path || '').toLowerCase();

        if (
            type.startsWith('audio/')
            || name.endsWith('.mp3')
            || name.endsWith('.wav')
            || name.endsWith('.m4a')
            || name.endsWith('.flac')
            || name.endsWith('.aac')
            || name.endsWith('.ogg')
            || name.endsWith('.opus')
        ) {
            return 'audio';
        }
        if (type.startsWith('image/') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp')) {
            return 'image';
        }
        return 'video';
    }

    normalizeFile(fileLike) {
        if (!fileLike) return null;

        const source = typeof fileLike === 'string'
            ? {
                name: fileLike.split(/[\\/]/).pop(),
                path: fileLike,
                type: ''
            }
            : fileLike;

        const kind = this.inferKind(source);
        const idSeed = source.path || `${source.name}-${source.lastModified || Date.now()}`;

        return {
            id: `asset-${idSeed.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
            name: source.name || '未命名素材',
            path: source.path || '',
            type: source.type || '',
            kind,
            duration: kind === 'image' ? 5 : 0,
            src: window.urlUtils?.getMediaSrc?.(source) || '',
            file: source
        };
    }

    importFiles(files) {
        const list = Array.isArray(files) ? files : Array.from(files || []);
        return list.map(file => this.normalizeFile(file)).filter(Boolean);
    }

    importLocalPath(filePath) {
        const asset = this.normalizeFile(filePath);
        return asset ? [asset] : [];
    }
}

window.EditorMediaImporter = EditorMediaImporter;

if (typeof module !== 'undefined') {
    module.exports = EditorMediaImporter;
}
