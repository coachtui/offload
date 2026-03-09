export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Record: undefined;
  Objects: { geofenceId?: string; objectId?: string } | undefined;
  Reminders: undefined;
  CreateGeofence: undefined;
  ManageGeofenceObjects: { geofenceId: string; geofenceName: string };
  Search: undefined;
  AskOffload: { initialQuery?: string } | undefined;
  Insights: undefined;
  PlaceSummary: { placeId: string; placeName: string; eventType: 'enter' | 'exit' };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
