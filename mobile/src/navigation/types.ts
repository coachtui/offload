export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Record: undefined;
  History: undefined;
  Objects: { geofenceId?: string; objectId?: string } | undefined;
  Reminders: undefined;
  CreateGeofence: undefined;
  ManageGeofenceObjects: { geofenceId: string; geofenceName: string };
  Search: undefined;
  Chat: undefined;
  Insights: undefined;
  PlaceSummary: { placeId: string; placeName: string; eventType: 'enter' | 'exit' };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
