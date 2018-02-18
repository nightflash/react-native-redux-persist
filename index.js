import { AsyncStorage } from 'react-native';

const createFilterKeys = config => key => {
  if (config.whitelist) {
    return config.whitelist.indexOf(key) !== -1;
  } else if (config.blacklist) {
    return config.blacklist.indexOf(key) === -1;
  }

  return true;
};

const TAG = 'Persist:';

class Persist {
  static STATE = {
    INIT: 0,
    RESTORING: 1,
    READY: 2
  };

  static ACTION_TYPE = 'REHYDRATE';

  state = Persist.STATE.INIT;
  store = null;
  reducer = null;
  config = {
    log: false,
    prefix: 'reduxPersist:'
  };
  filter = () => true;
  lastStateMap = new Map();

  constructor(store, reducer, config = {}) {
    this.store = store;
    this.reducer = reducer;
    this.config = {
      ...this.config,
      ...config
    };
    this.filter = createFilterKeys(config);

    this.store.subscribe(this._onStateChange);
    this.store.replaceReducer(this._newReducer);
  }

  _eventHandlers = new Map();

  addEventListener(eventName, fn) {
    this._eventHandlers.set(eventName, [...(this._eventHandlers.get(eventName) || []).filter(e => e !== fn), fn]);
  }

  removeEventListener(eventName, fn) {
    if(this._eventHandlers.has(eventName)) {
      const newHandlers = this._eventHandlers.get(eventName).filter(e => e !== fn);
      if (newHandlers.length > 0) {
        this._eventHandlers.set(eventName, newHandlers);
      } else {
        this._eventHandlers.delete(eventName);
      }
    }
  }

  isRestored() {
    return this._restored;
  }

  _log(...args) {
    this.config.log && console.log(...args);
  }

  _callEvent(eventName, ...args) {
    this._log(TAG, eventName, ...args);
    if(this._eventHandlers.has(eventName)) {
      this._eventHandlers.get(eventName).forEach(fn => fn(...args));
    }
  }

  _buildKey = key =>`${this.config.prefix}${key}`;
  _parseKey = key => key.replace(this.config.prefix, '');

  _buildValue = value => JSON.stringify(value);
  _parseValue = value => JSON.parse(value);


  _onStateChange = () => {
    const state = this.store.getState();
    this._log(TAG, '~~ state change');

    if (this.state === Persist.STATE.INIT) {
      this.state = Persist.STATE.RESTORING;
      this._restore(state);
    } else if (this.state === Persist.STATE.READY) {
      this._save(state);
    } else {
      this._log(TAG, '== not ready to save changes yet');
    }
  };

  async _save(state) {
    this._log(TAG, '<< save');
    let dataToSave = [];
    let payload = {};

    Object.keys(state).filter(this.filter).forEach(key => {
      if (!state.hasOwnProperty(key)) {
        return;
      }

      const value = state[key];

      const encodedKey = this._buildKey(key);
      const encodedValue = this._buildValue(value);

      if (this.lastStateMap.get(encodedKey) !== encodedValue) {
        this.lastStateMap.set(encodedKey, encodedValue);
        dataToSave.push([encodedKey, encodedValue]);
        payload[key] = value;
        this._log(TAG, 'save', key, value);
      }
    });

    if (dataToSave.length) {
      try {
        await AsyncStorage.multiSet(dataToSave).then(() => {
          this._callEvent('save', payload);
        });
      } catch (e) {
        logger.error(e);
      }
    }
  }

  _restored = false;
  async _restore(state) {
    this._log(TAG, '>> restore');

    const keys = Object.keys(state).filter(this.filter);

    try {
      await AsyncStorage.multiGet(keys.map(this._buildKey), async (err, results) => {
        const stored = {};
        const notStored = {};

        results.forEach(([encodedKey, encodedValue]) => {
          const key = this._parseKey(encodedKey);
          const value = this._parseValue(encodedValue);

          if (value !== null) {
            this._log(TAG, 'restore', encodedKey, encodedValue);
            this.lastStateMap.set(encodedKey, encodedValue);
            stored[key] = value;
          } else {
            notStored[key] = state[key];
          }
        });

        // Save initial values
        if (Object.keys(notStored).length > 0) {
          this._log(TAG, '>> save initial values', notStored);
          await this._save(notStored);
        }

        this.store.dispatch({
          type: Persist.ACTION_TYPE,
          payload: {
            ...stored,
            ...notStored
          }
        });
        this._callEvent('restore', {
          ...stored,
          ...notStored
        });
        this.state = Persist.STATE.READY;
        this._restored = true;
      });
    } catch(e) {
      logger.error(e);
    }
  }

  _newReducer = (state, action) => {
    if (action.type === Persist.ACTION_TYPE) {
      return this.reducer({
        ...state,
        ...action.payload
      }, action);
    } else {
      return this.reducer(state, action);
    }
  };
}

export default (...args) => new Persist(...args);
