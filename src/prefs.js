import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CodexUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-system-symbolic'});
        window.add(page);

        const panel = new Adw.PreferencesGroup({
            title: 'Top bar',
            description: 'Choose what appears in the panel. The popup always shows every reported window.',
        });
        page.add(panel);
        for (const [key, title] of [
            ['show-icon', 'Show icon'],
            ['show-plan', 'Show subscription plan'],
            ['show-percentage', 'Show percentage'],
            ['show-reset', 'Show time until reset'],
        ]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', 0);
            panel.add(row);
        }

        for (const [key, title, labels] of [
            ['panel-gauge', 'Usage gauge', ['Ring', 'Bar', 'None']],
            ['panel-windows', 'Panel reflects', ['First window', 'Second window', 'Both windows']],
        ]) {
            const model = Gtk.StringList.new(labels);
            const row = new Adw.ComboRow({title, model});
            settings.bind(key, row, 'selected', 0);
            panel.add(row);
        }

        const polling = new Adw.PreferencesGroup({title: 'Refresh'});
        page.add(polling);
        const row = new Adw.SpinRow({
            title: 'Interval (seconds)',
            subtitle: 'The status endpoint is refreshed at most once per minute.',
            adjustment: new Gtk.Adjustment({lower: 60, upper: 1800, step_increment: 30, page_increment: 60}),
        });
        settings.bind('poll-seconds', row, 'value', 0);
        polling.add(row);
    }
}
