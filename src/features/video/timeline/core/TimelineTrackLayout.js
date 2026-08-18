/**
 * TimelineTrackLayout
 *
 * Centralizes track numbering, ordering, indexing and insertion rules.
 */
class TimelineTrackLayout {
    static getPrefix(type) {
        return type === 'video' ? 'v' : 'a';
    }

    static parseTrackNumber(trackId) {
        return parseInt((trackId || '').slice(1), 10) || 1;
    }

    static getTrackOrder({ tracks, timelineBody, type, trackOrder }) {
        const prefix = this.getPrefix(type);
        const explicitOrder = Array.isArray(trackOrder?.[type]) ? trackOrder[type] : [];
        if (explicitOrder.length) {
            const existingIds = Object.keys(tracks || {}).filter((id) => id.startsWith(prefix));
            const ordered = explicitOrder.filter((id) => existingIds.includes(id));
            existingIds.forEach((id) => {
                if (!ordered.includes(id)) {
                    ordered.push(id);
                }
            });
            if (ordered.length) {
                return ordered;
            }
        }

        const rows = Array.from(timelineBody?.querySelectorAll('.timeline-track:not(.ruler-track)') || []);
        const orderedFromDom = rows
            .map((row) => row.id?.replace('track-', ''))
            .filter((id) => id && id.startsWith(prefix));

        if (orderedFromDom.length) {
            return orderedFromDom;
        }

        return Object.keys(tracks || {})
            .filter((id) => id.startsWith(prefix))
            .sort((a, b) => this.parseTrackNumber(a) - this.parseTrackNumber(b));
    }

    static getTrackInsertPosition({ trackId, type, tracks, timelineBody, trackOrder }) {
        const targetNum = this.parseTrackNumber(trackId);
        const ordered = this.getTrackOrder({ tracks, timelineBody, type, trackOrder }).filter((id) => id !== trackId);

        if (type === 'audio') {
            for (const existingId of ordered) {
                if (targetNum < this.parseTrackNumber(existingId)) {
                    return { relativeId: existingId, position: 'above' };
                }
            }
        } else {
            for (const existingId of ordered) {
                if (targetNum > this.parseTrackNumber(existingId)) {
                    return { relativeId: existingId, position: 'above' };
                }
            }
        }

        if (ordered.length) {
            return { relativeId: ordered[ordered.length - 1], position: 'below' };
        }

        return { relativeId: null, position: null };
    }

    static ensureTrackNumber({ type, number, ensureTrackExists }) {
        const prefix = this.getPrefix(type);
        const safeNumber = Math.max(1, number);

        for (let current = 1; current <= safeNumber; current++) {
            ensureTrackExists(`${prefix}${current}`, type);
        }

        return `${prefix}${safeNumber}`;
    }

    static getTrackIndex({ trackId, tracks, timelineBody, trackOrder }) {
        const type = trackId.startsWith('v') ? 'video' : 'audio';
        return this.getTrackOrder({ tracks, timelineBody, type, trackOrder }).indexOf(trackId);
    }

    static getTrackIdByIndex({ index, type, tracks, timelineBody, trackOrder }) {
        const list = this.getTrackOrder({ tracks, timelineBody, type, trackOrder });
        if (!list.length) return null;
        if (index < 0) index = 0;
        if (index >= list.length) index = list.length - 1;
        return list[index];
    }

    static getPlaybackTrackIds({ tracks, timelineBody, trackOrder }) {
        return [
            ...this.getTrackOrder({ tracks, timelineBody, type: 'video', trackOrder }),
            ...this.getTrackOrder({ tracks, timelineBody, type: 'audio', trackOrder })
        ];
    }
}

window.TimelineTrackLayout = TimelineTrackLayout;
