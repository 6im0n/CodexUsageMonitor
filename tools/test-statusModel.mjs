import assert from 'node:assert/strict';
import {normalizeStatus, planLabel, resetText} from '../src/lib/statusModel.js';

const status = normalizeStatus({
    plan_type: 'plus',
    rate_limit: {
        primary_window: {used_percent: 11, limit_window_seconds: 18000, reset_at: 1791570314},
        secondary_window: {used_percent: 2, limit_window_seconds: 604800, reset_at: 1792048329},
    },
});
assert.equal(status.plan, 'PLUS');
assert.deepEqual(status.windows.map(w => [w.key, w.label, w.tag, w.percent]), [
    ['primary', '5-hour', '5h', 11],
    ['secondary', '7-day', '7d', 2],
]);
assert.equal(planLabel('business'), 'BUSINESS');
assert.equal(planLabel('team'), 'BUSINESS');
assert.equal(planLabel('pro'), 'PRO');
assert.equal(planLabel(null), 'CODEX');
assert.deepEqual(normalizeStatus({rate_limit: {primary_window: {used_percent: null}}}).windows, []);
assert.equal(resetText(90_000, true, 0), '1m');
assert.equal(resetText(null), '');
console.log('statusModel: OK');
