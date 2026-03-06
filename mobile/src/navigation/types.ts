export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Record: undefined;
  Sessions: undefined;
  Objects: { geofenceId?: string } | undefined;
  Geofences: undefined;
  CreateGeofence: undefined;
  Search: undefined;
  AIQuery: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
