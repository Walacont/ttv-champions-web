// State Manager - Zentralisierte Zustandsverwaltung für die Anwendung

const initialState = {
    user: {
        id: null,
        data: null,
        isAuthenticated: false,
        role: null,
        clubId: null,
    },
    ui: {
        currentTab: 'overview',
        isLoading: false,
        error: null,
        subgroupFilter: 'club',
    },
    cache: {
        clubPlayers: [],
        challenges: [],
        exercises: [],
    },
};

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

class StateManager {
    constructor() {
        this.state = deepClone(initialState);
        this.subscribers = new Map();
        this.subscriberId = 0;
    }

    get(path = null) {
        if (!path) return deepClone(this.state);

        const keys = path.split('.');
        let value = this.state;

        for (const key of keys) {
            if (value === undefined || value === null) return undefined;
            value = value[key];
        }

        return value;
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.state;

        for (const key of keys) {
            if (current[key] === undefined) {
                current[key] = {};
            }
            current = current[key];
        }

        const oldValue = current[lastKey];
        current[lastKey] = value;
        this.notify(path, value, oldValue);
    }

    update(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            this.set(path, value);
        });
    }

    reset(path = null) {
        if (!path) {
            this.state = deepClone(initialState);
            this.notify('', this.state, null);
            return;
        }

        const keys = path.split('.');
        let initialValue = initialState;
        for (const key of keys) {
            initialValue = initialValue?.[key];
        }

        if (initialValue !== undefined) {
            this.set(path, deepClone(initialValue));
        }
    }

    subscribe(pathOrCallback, callback = null) {
        const id = ++this.subscriberId;

        if (typeof pathOrCallback === 'function') {
            this.subscribers.set(id, { path: '*', callback: pathOrCallback });
        } else {
            this.subscribers.set(id, { path: pathOrCallback, callback });
        }

        return () => {
            this.subscribers.delete(id);
        };
    }

    notify(changedPath, newValue, oldValue) {
        this.subscribers.forEach(({ path, callback }) => {
            if (path === '*' || changedPath.startsWith(path) || path.startsWith(changedPath)) {
                try {
                    callback(newValue, oldValue, changedPath);
                } catch (e) {
                    console.error('State-Subscriber Fehler:', e);
                }
            }
        });
    }

    setUser(userData) {
        this.update({
            'user.id': userData?.id || null,
            'user.data': userData || null,
            'user.isAuthenticated': !!userData,
            'user.role': userData?.role || null,
            'user.clubId': userData?.clubId || null,
        });
    }

    clearUser() {
        this.reset('user');
    }

    setLoading(isLoading) {
        this.set('ui.isLoading', isLoading);
    }

    setError(error) {
        this.set('ui.error', error);
    }

    setTab(tab) {
        this.set('ui.currentTab', tab);
    }

    setSubgroupFilter(filter) {
        this.set('ui.subgroupFilter', filter);
    }

    setClubPlayers(players) {
        this.set('cache.clubPlayers', players);
    }

    getClubPlayers() {
        return this.get('cache.clubPlayers') || [];
    }
}

export const appState = new StateManager();

if (typeof window !== 'undefined') {
    window.__appState = appState;
}
