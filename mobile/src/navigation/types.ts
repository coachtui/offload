export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Record: undefined;
  Objects: { geofenceId?: string; objectId?: string } | undefined;
  Reminders: undefined;
  CreateGeofence: undefined;
  ManageGeofenceObjects: { geofenceId: string; geofenceName: string };
  EditGeofence: {
    geofenceId: string;
    geofenceName: string;
    type: 'home' | 'work' | 'gym' | 'store' | 'custom';
    radius: number;
    notifyOnEnter: boolean;
    notifyOnExit: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    location: { latitude: number; longitude: number };
  };
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
