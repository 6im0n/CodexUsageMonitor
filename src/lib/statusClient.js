import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const decoder = new TextDecoder();

export class StatusClient {
    constructor() {
        this._session = new Soup.Session({timeout: 15});
    }

    async fetch(cancellable) {
        const home = GLib.getenv('CODEX_HOME') || GLib.build_filenamev([GLib.get_home_dir(), '.codex']);
        const file = Gio.File.new_for_path(GLib.build_filenamev([home, 'auth.json']));
        let auth;
        try {
            const data = await new Promise((resolve, reject) => {
                file.load_contents_async(cancellable, (source, result) => {
                    try {
                        const [ok, bytes] = source.load_contents_finish(result);
                        resolve(ok ? bytes : null);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            auth = JSON.parse(decoder.decode(data));
        } catch (error) {
            if (cancellable?.is_cancelled())
                throw error;
            throw new Error('Sign in with “codex login” to show usage.');
        }
        if (auth?.auth_mode !== 'chatgpt' || !auth?.tokens?.access_token)
            throw new Error('A ChatGPT Codex login is required. Run “codex login”.');

        const message = Soup.Message.new('GET', USAGE_URL);
        const headers = message.get_request_headers();
        headers.append('Authorization', `Bearer ${auth.tokens.access_token}`);
        headers.append('Accept', 'application/json');
        headers.append('User-Agent', 'codex-cli');
        if (auth.tokens.account_id)
            headers.append('ChatGPT-Account-Id', auth.tokens.account_id);

        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    if (message.status_code < 200 || message.status_code >= 300)
                        throw new Error(message.status_code === 401 ? 'Codex login expired. Run “codex login”.' : `Codex status: HTTP ${message.status_code}`);
                    const status = JSON.parse(decoder.decode(bytes.get_data()));
                    if (!status || typeof status !== 'object' || !status.rate_limit)
                        throw new Error('Codex status format changed.');
                    resolve(status);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    destroy() {
        this._session.abort();
        this._session = null;
    }
}
