class CreatorAudioHandler {
    constructor(creatorFlow) {
        this.app = creatorFlow;
        this.mixAudioFile = null;
        this.demucsAvailable = false;
        this.currentDemucsFiles = null;
        this.mixerTools = new window.CreatorAudioMixerTools(this);
        this.demucsTools = new window.CreatorAudioDemucsTools(this);

        CreatorAudioHandler.current = this;
    }

    init() {
        this.setupMixer();
        this.setupDenoiseListeners();
        this.setupDemucs();
    }

    setupDenoiseListeners() {
        return this.mixerTools.setupDenoiseListeners();
    }

    setupMixer() {
        return this.mixerTools.setupMixer();
    }

    async startMix(options = {}) {
        return this.mixerTools.startMix(options);
    }

    async denoiseAudio(options = {}) {
        return this.mixerTools.denoiseAudio(options);
    }

    setupDemucsListeners() {
        return this.demucsTools.setupDemucsListeners();
    }

    async setupDemucs() {
        return this.demucsTools.setupDemucs();
    }

    async checkDemucsStatus() {
        return this.demucsTools.checkDemucsStatus();
    }

    async installDemucs() {
        return this.demucsTools.installDemucs();
    }

    async separateAudio(options = {}) {
        return this.demucsTools.separateAudio(options);
    }

    renderDemucsResults() {
        return this.demucsTools.renderDemucsResults();
    }

    toggleTrackPlay(name, themeColor = '#6b9ad4') {
        return this.demucsTools.toggleTrackPlay(name, themeColor);
    }

    async downloadAllDemucs() {
        return this.demucsTools.downloadAllDemucs();
    }

    async downloadSingleDemucs(name) {
        return this.demucsTools.downloadSingleDemucs(name);
    }
}

window.CreatorAudioHandler = CreatorAudioHandler;
CreatorAudioHandler.current = null;
