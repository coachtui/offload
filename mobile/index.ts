import { registerRootComponent } from 'expo';

// IMPORTANT: must be imported before registerRootComponent so TaskManager.defineTask
// runs in both the foreground and the background task JS context.
import './src/services/geofenceMonitoringService';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
