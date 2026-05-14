window.chrome = {
  storage: {
    local: {
      _data: {},
      get: function(keys, callback) {
        const result = {};
        let stored = {};
        try {
          stored = JSON.parse(localStorage.getItem('void_storage') || '{}');
          // Always strip any saved apiBase — the app always uses its own origin
          delete stored.apiBase;
        } catch(e) {}

        const source = Object.assign({}, this._data, stored);

        if (Array.isArray(keys)) {
          keys.forEach(k => { if (source[k] !== undefined) result[k] = source[k]; });
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach(k => { result[k] = source[k] !== undefined ? source[k] : keys[k]; });
        } else if (typeof keys === 'string') {
          if (source[keys] !== undefined) result[keys] = source[keys];
        }
        callback(result);
      },
      set: function(items, callback) {
        // Never persist apiBase — always use current origin
        const toSave = Object.assign({}, items);
        delete toSave.apiBase;
        Object.assign(this._data, toSave);
        try {
          const stored = JSON.parse(localStorage.getItem('void_storage') || '{}');
          delete stored.apiBase;
          Object.assign(stored, toSave);
          localStorage.setItem('void_storage', JSON.stringify(stored));
        } catch(e) {}
        if (callback) callback();
      }
    }
  },
  tabs: {
    query: function(opts, callback) {
      callback([{ url: window.location.href, title: document.title }]);
    }
  }
};
