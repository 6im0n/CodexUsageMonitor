import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Cairo from 'cairo';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {StatusClient} from './lib/statusClient.js';
import {normalizeStatus, resetText} from './lib/statusModel.js';

const Ring = GObject.registerClass(class Ring extends St.DrawingArea {
    _init() {
        super._init({style_class: 'cu-ring', x_align: Clutter.ActorAlign.CENTER});
        this.set_size(18, 18);
        this._percent = null;
    }

    setPercent(percent) {
        this._percent = percent;
        this.queue_repaint();
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const radius = Math.min(width, height) / 2 - 2;
        cr.setLineWidth(3);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setSourceRGBA(0.5, 0.5, 0.5, 0.3);
        cr.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
        cr.stroke();
        if (this._percent !== null && this._percent > 0) {
            const color = this._percent >= 90 ? [0.88, 0.11, 0.14] :
                this._percent >= 75 ? [1, 0.47, 0] : [0.2, 0.82, 0.48];
            cr.setSourceRGBA(...color, 1);
            cr.arc(width / 2, height / 2, radius, -Math.PI / 2,
                -Math.PI / 2 + this._percent / 100 * 2 * Math.PI);
            cr.stroke();
        }
        cr.$dispose();
    }
});

function level(percent) {
    return percent >= 90 ? 'crit' : percent >= 75 ? 'warn' : 'ok';
}

// Owns one panel gauge and one popup meter, in the same visual vocabulary as
// Claude Code Usage Monitor. Codex supplies the actual windows and plan.
class WindowView {
    constructor(window, gauge) {
        this.window = window;
        this.panel = new St.BoxLayout({style_class: 'cu-panel-gauge'});
        this._tag = new St.Label({text: window.tag, style_class: 'cu-panel-wtag', y_align: Clutter.ActorAlign.CENTER});
        this._ring = new Ring();
        this._ring.setPercent(window.percent);
        this._bar = new St.BoxLayout({style_class: 'cu-panel-bar', y_align: Clutter.ActorAlign.CENTER});
        this._barFill = new St.Widget({style_class: `cu-panel-bar-fill cu-${level(window.percent)}`});
        this._barFill.set_width(Math.round(window.percent * 0.36));
        this._bar.add_child(this._barFill);
        this._percent = new St.Label({text: `${Math.round(window.percent)}%`, style_class: `cu-panel-pct cu-${level(window.percent)}`, y_align: Clutter.ActorAlign.CENTER});
        this._reset = new St.Label({style_class: 'cu-panel-reset', y_align: Clutter.ActorAlign.CENTER});
        this.panel.add_child(this._tag);
        this.panel.add_child(this._ring);
        this.panel.add_child(this._bar);
        this.panel.add_child(this._percent);
        this.panel.add_child(this._reset);
        this.setGauge(gauge);

        this.meter = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'cu-meter'});
        this._row = new St.BoxLayout({style_class: 'cu-meter-row'});
        this._name = new St.Label({text: window.label, style_class: 'cu-meter-name', x_expand: true});
        this._meterPercent = new St.Label({text: `${Math.round(window.percent)}%`, style_class: 'cu-meter-pct'});
        this._row.add_child(this._name);
        this._row.add_child(this._meterPercent);
        this._track = new St.BoxLayout({style_class: 'cu-track'});
        this._fill = new St.Widget({style_class: `cu-fill cu-${level(window.percent)}`});
        this._track.add_child(this._fill);
        this._track.connectObject('notify::width', () => this._resizeFill(), this);
        this._caption = new St.Label({style_class: 'cu-caption'});
        this.meter.add_child(this._row);
        this.meter.add_child(this._track);
        this.meter.add_child(this._caption);
        this._resizeFill();
        this.tick();
    }

    setGauge(gauge) {
        this._ring.visible = gauge === 'ring';
        this._bar.visible = gauge === 'bar';
    }

    setOptions({tag, percentage, reset}) {
        this._tag.visible = tag;
        this._percent.visible = percentage;
        this._reset.visible = reset && !!this.window.resetAt;
    }

    _resizeFill() {
        this._fill.set_width(Math.round(this._track.get_width() * this.window.percent / 100));
    }

    tick() {
        this._reset.text = resetText(this.window.resetAt, true);
        this._caption.text = resetText(this.window.resetAt);
        this._caption.visible = !!this._caption.text;
    }

    destroy() {
        this._track.disconnectObject(this);
        for (const actor of [this._tag, this._ring, this._barFill, this._bar,
            this._percent, this._reset, this.panel, this._name, this._meterPercent,
            this._row, this._fill, this._track, this._caption, this.meter])
            actor.destroy();
        this.window = null;
        this.panel = null;
        this.meter = null;
        this._track = null;
    }
}

const Indicator = GObject.registerClass(class Indicator extends PanelMenu.Button {
    _init(settings, openPreferences) {
        super._init(0.0, 'Codex Usage Monitor');
        this._settings = settings;
        this._openPreferences = openPreferences;
        this._client = new StatusClient();
        this._cancellable = new Gio.Cancellable();
        this._status = null;
        this._views = [];
        this._lastFetch = 0;
        this._busy = false;

        this._panel = new St.BoxLayout({style_class: 'cu-panel'});
        this._icon = new St.Icon({icon_name: 'utilities-terminal-symbolic', style_class: 'cu-panel-icon'});
        this._plan = new St.Label({text: 'CODEX', style_class: 'cu-panel-tier', y_align: Clutter.ActorAlign.CENTER});
        this._divider = new St.Widget({style_class: 'cu-panel-divider-line', y_align: Clutter.ActorAlign.CENTER});
        this._panelWindows = new St.BoxLayout({style_class: 'cu-panel-gauges'});
        this._placeholder = new St.Label({text: '…', style_class: 'cu-panel-pct', y_align: Clutter.ActorAlign.CENTER});
        this._panel.add_child(this._icon);
        this._panel.add_child(this._plan);
        this._panel.add_child(this._divider);
        this._panel.add_child(this._panelWindows);
        this._panelWindows.add_child(this._placeholder);
        this.add_child(this._panel);

        this._item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._popup = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'cu-popup'});
        this._header = new St.BoxLayout({style_class: 'cu-profile-header'});
        this._popupIcon = new St.Icon({icon_name: 'utilities-terminal-symbolic', style_class: 'cu-logo'});
        this._titleBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._title = new St.Label({text: 'Codex usage', style_class: 'cu-title'});
        this._subtitle = new St.Label({text: 'Codex CLI account', style_class: 'cu-subtitle'});
        this._pill = new St.Label({text: 'CODEX', style_class: 'cu-pill', y_align: Clutter.ActorAlign.CENTER});
        this._titleBox.add_child(this._title);
        this._titleBox.add_child(this._subtitle);
        this._header.add_child(this._popupIcon);
        this._header.add_child(this._titleBox);
        this._header.add_child(this._pill);
        this._meters = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL});
        this._message = new St.Label({text: '', style_class: 'cu-error'});
        this._message.clutter_text.line_wrap = true;
        this._footer = new St.BoxLayout({style_class: 'cu-footer'});
        this._updated = new St.Label({text: '', style_class: 'cu-updated', x_expand: true});
        this._settingsButton = new St.Button({label: 'Settings', style_class: 'cu-refresh'});
        this._settingsButton.connectObject('clicked', () => this._openPreferences(), this);
        this._refresh = new St.Button({label: 'Refresh', style_class: 'cu-refresh'});
        this._refresh.connectObject('clicked', () => this._fetch(), this);
        this._footer.add_child(this._updated);
        this._footer.add_child(this._settingsButton);
        this._footer.add_child(this._refresh);
        this._popup.add_child(this._header);
        this._popup.add_child(this._meters);
        this._popup.add_child(this._message);
        this._popup.add_child(this._footer);
        this._item.add_child(this._popup);
        this.menu.addMenuItem(this._item);

        this._settings.connectObject('changed', () => {
            this._render();
            this._schedulePoll();
        }, this);
        this.menu.connectObject('open-state-changed', (_menu, open) => {
            if (open)
                this._fetch();
        }, this);
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            for (const view of this._views)
                view.tick();
            return GLib.SOURCE_CONTINUE;
        });
        this._schedulePoll();
        this._render();
        this._fetch();
    }

    _schedulePoll() {
        if (this._pollId)
            GLib.Source.remove(this._pollId);
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            Math.round(this._settings.get_double('poll-seconds')), () => {
                this._fetch();
                return GLib.SOURCE_CONTINUE;
            });
    }

    async _fetch() {
        if (this._busy || Date.now() - this._lastFetch < 60_000)
            return;
        this._busy = true;
        const cancellable = this._cancellable;
        try {
            const status = normalizeStatus(await this._client.fetch(cancellable));
            if (cancellable.is_cancelled())
                return;
            this._status = status;
            this._message.text = this._status.windows.length ? '' : 'No usage windows were returned for this account.';
            this._updated.text = `Updated ${new Date().toLocaleTimeString()}`;
            this._lastFetch = Date.now();
            this._render();
        } catch (error) {
            if (!cancellable.is_cancelled()) {
                this._status = null;
                this._message.text = error.message;
                this._updated.text = '';
                this._lastFetch = Date.now();
                this._render();
                this._placeholder.text = '!';
            }
        } finally {
            this._busy = false;
        }
    }

    _render() {
        for (const view of this._views)
            view.destroy();
        this._views = [];
        const plan = this._status?.plan || 'CODEX';
        this._plan.text = plan;
        this._pill.text = plan;
        this._icon.visible = this._settings.get_boolean('show-icon');
        this._plan.visible = this._settings.get_boolean('show-plan');
        this._divider.visible = this._icon.visible || this._plan.visible;
        const windows = this._status?.windows ?? [];
        const selected = this._settings.get_uint('panel-windows');
        const panelWindows = windows.filter(window => selected === 2 || window.key === (selected === 0 ? 'primary' : 'secondary'));
        this._placeholder.visible = panelWindows.length === 0;
        this._placeholder.text = windows.length ? '—' : '…';
        for (const window of windows) {
            const view = new WindowView(window, ['ring', 'bar', 'none'][this._settings.get_uint('panel-gauge')]);
            const onPanel = panelWindows.includes(window);
            view.setOptions({
                tag: panelWindows.length > 1,
                percentage: this._settings.get_boolean('show-percentage'),
                reset: this._settings.get_boolean('show-reset'),
            });
            if (onPanel)
                this._panelWindows.add_child(view.panel);
            this._meters.add_child(view.meter);
            this._views.push(view);
        }
    }

    destroy() {
        this._cancellable.cancel();
        if (this._pollId)
            GLib.Source.remove(this._pollId);
        if (this._tickId)
            GLib.Source.remove(this._tickId);
        this.menu.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settingsButton.disconnectObject(this);
        this._refresh.disconnectObject(this);
        this._client.destroy();
        for (const view of this._views)
            view.destroy();
        this._views = [];
        for (const actor of [this._placeholder, this._panelWindows, this._divider,
            this._plan, this._icon, this._panel, this._title, this._subtitle,
            this._titleBox, this._popupIcon, this._pill, this._header, this._meters,
            this._message, this._updated, this._settingsButton, this._refresh, this._footer,
            this._popup, this._item])
            actor.destroy();
        this._client = null;
        this._cancellable = null;
        this._settings = null;
        this._openPreferences = null;
        super.destroy();
    }
});

export default class CodexUsageExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new Indicator(this._settings, () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
