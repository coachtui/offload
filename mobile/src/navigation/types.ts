export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Record: undefined;
  Sessions: undefined;
  Objects: undefined;
  Geofences: undefined;
  CreateGeofence: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
