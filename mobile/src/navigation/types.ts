export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Permissions: undefined;
  Home: undefined;
  Record: undefined;
  Objects: { geofenceId?: string; objectId?: string; sessionId?: string } | undefined;
  Places: undefined;
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
  AskOffload: { initialQuery?: string } | undefined;
  Insights: undefined;
  PlaceSummary: { placeId?: string; geofenceId?: string; placeName: string; eventType?: 'enter' | 'exit' };
  Categories: undefined;
  Settings: undefined;
  DeleteAccount: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
