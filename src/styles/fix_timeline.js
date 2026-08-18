const fs = require('fs');
const files = [
    'f:/Codage/VideoDownloader/MediaFlow/src/styles/subtitle_parts/layout.css',
    'f:/Codage/VideoDownloader/MediaFlow/src/styles/subtitle_parts/video.css'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // For layout classes
    content = content.replace(/#page-subtitle \.(timeline-section-pro|inspector-aside-pro|subtitle-main-layout|workspace-center-pro|video-stage-pro|pro-monitor)/g,
        (match, p1) => `#page-subtitle .${p1}, #page-creator .${p1}`);

    // For specific timeline components in video.css
    content = content.replace(/#page-subtitle \.(timeline-header|time-display|timeline-controls|timeline-body|ruler-area|waveform-area|timeline-sidebar-label|ruler-label|waveform-label|tracks-viewport|timeline-track-headers|track-header-item|track-header-color|track-header-name|track-header-controls|track-header-btn|timeline-track-row|timeline-tracks-list|timeline-clip|clip-handle|timeline-playhead|timeline-snap-guide|track-visibility)/g,
        (match, p1) => `#page-subtitle .${p1}, #page-creator .${p1}`);

    // Update video mirror, overlay, zoom popover
    content = content.replace(/#page-subtitle (video\.v-mirrored|\.crop-overlay|\.crop-rect|\.crop-handle|\.subtitle-overlay|\.blur-preview-overlay)/g,
        (match, p1) => `#page-subtitle ${p1}, #page-creator ${p1}`);

    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
});
