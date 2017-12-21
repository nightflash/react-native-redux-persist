# react-native-redux-persist

Simple, lightweight persist component for react-native.

## Installation


Without persist:

```javascript
import {createStore} from 'redux'

import reducer from './reducer';

const store = createStore(reducer);

export default store;
```

With persist:

```javascript
import {createStore} from 'redux'

import reducer from './reducer';

const store = createStore(reducer);

export const persist = persistStore(store, reducer);

export default store;
```