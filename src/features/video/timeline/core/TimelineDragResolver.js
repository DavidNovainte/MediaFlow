/**
 * TimelineDragResolver
 *
 * Centralizes drag/drop target resolution so hover-track detection and
 * linked-track routing stay consistent even when the target track does not
 * exist yet.
 */
class TimelineDragResolver {
    static resolveHoveredTrackId({ rows, typePrefix, currentTrackId, clientY, parseTrackNumber, maxAutoCreateNumber = null }) {
        let hoveredTrackId = currentTrackId;
        let minDist = Infinity;

        rows.forEach((row) => {
            const contentArea = row.querySelector('.track-content-area, .waveform-area');
            if (!contentArea) return;

            const trackId = contentArea.id.replace('track-content-', '').replace('timeline-waveform-', '');
            if (!trackId.startsWith(typePrefix)) return;

            const rect = row.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const dist = Math.abs(clientY - centerY);

            if (dist < minDist && dist < 150) {
                minDist = dist;
                hoveredTrackId = trackId;
            }
        });

        const sameTypeRows = rows.filter((row) => {
            const contentArea = row.querySelector('.track-content-area, .waveform-area');
            if (!contentArea) return false;
            const trackId = contentArea.id.replace('track-content-', '').replace('timeline-waveform-', '');
            return trackId.startsWith(typePrefix);
        });

        if (sameTypeRows.length) {
            const firstRow = sameTypeRows[0];
            const firstTrackId = firstRow.id.replace('track-', '');
            const firstRect = firstRow.getBoundingClientRect();
            const createThreshold = Math.max(28, firstRect.height * 0.45);

            if (clientY < firstRect.top - createThreshold) {
                // Once the dragged segment already sits on the current top row,
                // keep targeting that row instead of creating one more track on
                // every mousemove while the pointer stays above it.
                if (currentTrackId === firstTrackId) {
                    return currentTrackId;
                }

                const maxTrackNumber = Math.max(
                    ...sameTypeRows.map((row) => parseTrackNumber(row.id.replace('track-', '')))
                );
                const nextTrackNumber = maxTrackNumber + 1;
                const safeTrackNumber = maxAutoCreateNumber
                    ? Math.min(nextTrackNumber, maxAutoCreateNumber)
                    : nextTrackNumber;
                hoveredTrackId = `${typePrefix}${safeTrackNumber}`;
            }
        }

        return hoveredTrackId;
    }

    static getTargetTrackIndex({ trackId, type, orderedTrackIds, parseTrackNumber }) {
        const existingIndex = orderedTrackIds.indexOf(trackId);
        if (existingIndex !== -1) return existingIndex;

        const targetNum = parseTrackNumber(trackId);

        if (type === 'audio') {
            for (let index = 0; index < orderedTrackIds.length; index++) {
                if (targetNum < parseTrackNumber(orderedTrackIds[index])) {
                    return index;
                }
            }
            return orderedTrackIds.length;
        }

        for (let index = 0; index < orderedTrackIds.length; index++) {
            if (targetNum > parseTrackNumber(orderedTrackIds[index])) {
                return index;
            }
        }

        return orderedTrackIds.length;
    }

    static resolveLinkedTrackId({
        linkType,
        primaryType,
        primaryTrackNumber,
        deltaTracks,
        originalTrackIndex,
        ensureTrackNumber,
        getTrackIdByIndex
    }) {
        if (linkType !== primaryType) {
            return ensureTrackNumber(linkType, primaryTrackNumber);
        }

        return getTrackIdByIndex(originalTrackIndex + deltaTracks, linkType);
    }
}

window.TimelineDragResolver = TimelineDragResolver;
