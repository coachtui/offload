export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Record: undefined;
  Sessions: undefined;
  Objects: { geofenceId?: string; objectId?: string } | undefined;
  Geofences: undefined;
  CreateGeofence: undefined;
  ManageGeofenceObjects: { geofenceId: string; geofenceName: string };
  Search: undefined;
  AIQuery: undefined;
  Synthesis: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
