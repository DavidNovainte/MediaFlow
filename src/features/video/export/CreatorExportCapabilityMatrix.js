const CreatorExportCapabilityMatrix = {
    videoFormats: ['mp4'],
    audioFormats: ['mp3'],
    transitions: [
        'none',
        'fade',
        'wiperight',
        'wipeleft',
        'wipeup',
        'wipedown',
        'slideright',
        'slideleft',
        'slideup',
        'slidedown',
        'circlecrop',
        'radial',
        'zoomin',
        'pixelize',
        'hblur'
    ],
    videoExportTypes: ['video+audio', 'video'],
    audioExportTypes: ['audio']
};

if (typeof window !== 'undefined') {
    window.CreatorExportCapabilityMatrix = CreatorExportCapabilityMatrix;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CreatorExportCapabilityMatrix;
}
