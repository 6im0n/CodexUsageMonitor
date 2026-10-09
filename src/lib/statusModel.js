// Pure shaping of the Codex usage response. The service decides which windows
// and plan exist; no subscription is assumed to have a particular limit.
export function planLabel(value) {
    const name = String(value ?? '').trim().replace(/[_-]+/g, ' ');
    if (name.toLowerCase() === 'team')
        return 'BUSINESS';
    return name ? name.toUpperCase() : 'CODEX';
}

function durationLabel(seconds) {
    if (seconds === 5 * 3600)
        return ['5-hour', '5h'];
    if (seconds === 7 * 86400)
        return ['7-day', '7d'];
    if (Number.isFinite(seconds) && seconds > 0) {
        const hours = Math.round(seconds / 3600);
        return [`${hours}-hour`, `${hours}h`];
    }
    return ['Usage', 'Use'];
}

export function normalizeStatus(status) {
    const windows = [];
    for (const [key, window] of [
        ['primary', status?.rate_limit?.primary_window],
        ['secondary', status?.rate_limit?.secondary_window],
    ]) {
        const percent = Number(window?.used_percent);
        if (window?.used_percent == null || !Number.isFinite(percent))
            continue;
        const [label, tag] = durationLabel(Number(window.limit_window_seconds));
        const reset = Number(window.reset_at);
        windows.push({
            key,
            label,
            tag,
            percent: Math.max(0, Math.min(100, percent)),
            resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
        });
    }
    return {plan: planLabel(status?.plan_type), windows};
}

export function resetText(resetAt, compact = false, now = Date.now()) {
    if (!resetAt)
        return '';
    const seconds = Math.max(0, Math.ceil((resetAt - now) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const value = days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m` : `${seconds}s`;
    return compact ? value.replace(' ', '') : `Resets in ${value}`;
}
