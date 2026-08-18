/** @jest-environment jsdom */

describe('EditorTimelineSnapUtils', () => {
    beforeAll(() => {
        require('../../../src/features/editor/EditorProjectStore');
        require('../../../src/features/editor/timeline/EditorTimelineSnapUtils');
    });

    beforeEach(() => {
        this.store = new window.EditorProjectStore();
        this.store.upsertAssets([
            { id: 'asset-a', name: 'a.mp4', kind: 'video', duration: 8 },
            { id: 'asset-b', name: 'b.mp4', kind: 'video', duration: 6 }
        ]);
        this.first = this.store.addAssetToTimeline('asset-a');
        this.second = this.store.addAssetToTimeline('asset-b');
        this.flow = { store: this.store };
    });

    it('collects edges from sibling clips on the same track', () => {
        const edges = window.EditorTimelineSnapUtils.getTrackEdges(this.flow, this.second.id);
        expect(edges).toEqual([0, 8]);
    });

    it('snaps to the nearest edge within threshold', () => {
        const snapped = window.EditorTimelineSnapUtils.snapValue(7.9, [8]);
        expect(snapped).toBe(8);
    });

    it('keeps values untouched when they are outside the snap threshold', () => {
        const snapped = window.EditorTimelineSnapUtils.snapValue(7.4, [8]);
        expect(snapped).toBe(7.4);
    });
});
