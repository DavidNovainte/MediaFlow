const fs = require('fs');
let content = fs.readFileSync('f:/Codage/VideoDownloader/MediaFlow/src/styles/subtitle_parts/video.css', 'utf8');

const classes = [
    'timeline-section-pro', 'timeline-header', 'time-display', 'timeline-controls',
    'timeline-body', 'ruler-area', 'waveform-area', 'timeline-sidebar-label',
    'ruler-label', 'waveform-label', 'tracks-viewport', 'timeline-track-headers',
    'track-header-item', 'track-header-color', 'track-header-name', 'track-header-controls',
    'track-header-btn', 'timeline-track-row', 'timeline-tracks-list', 'timeline-clip',
    'clip-handle', 'timeline-playhead', 'timeline-snap-guide', 'track-visibility',
    'crop-overlay', 'crop-rect', 'crop-handle', 'subtitle-overlay', 'blur-preview-overlay'
];

classes.forEach(cls => {
    const re = new RegExp(`#page-subtitle \\\\.(${cls})(?![\\\\w\\\\-])`, 'g');
    content = content.replace(re, '#page-subtitle .$1, #page-creator .$1');
});

content = content.replace(/#page-subtitle video\.v-mirrored(?![\\w\\-])/g, '#page-subtitle video.v-mirrored, #page-creator video.v-mirrored');

fs.writeFileSync('f:/Codage/VideoDownloader/MediaFlow/src/styles/subtitle_parts/video.css', content);
console.log('Safe replacement done');
