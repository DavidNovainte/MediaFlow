function roundFilterNumber(value, digits = 6) {
    return Number.parseFloat(Number(value || 0).toFixed(digits));
}

function buildAtempoValues(speed) {
    const normalized = Number(speed) || 1;
    if (normalized <= 0) {
        throw new Error('Speed must be greater than 0');
    }

    if (Math.abs(normalized - 1) < 0.000001) {
        return [];
    }

    const values = [];
    let remaining = normalized;

    while (remaining > 2.0) {
        values.push(2.0);
        remaining /= 2.0;
    }

    while (remaining < 0.5) {
        values.push(0.5);
        remaining /= 0.5;
    }

    values.push(roundFilterNumber(remaining));
    return values.filter((value) => Math.abs(value - 1) > 0.000001);
}

function buildAtempoFilterChain(speed) {
    return buildAtempoValues(speed).map((value) => `atempo=${value}`);
}

module.exports = {
    buildAtempoValues,
    buildAtempoFilterChain,
    roundFilterNumber
};
