# Phase 6: Geofencing - Quick Start Guide

**Privacy-First Geofencing is Ready!** 🎉

---

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
cd mobile
npm install
```

**New packages added**:
- `expo-location` - Geofencing + location permissions
- `expo-notifications` - Local notifications
- `expo-task-manager` - Background tasks
- `react-native-maps` - Map interface

### 2. Configure Permissions

**iOS** (`mobile/ios/mobile/Info.plist`):
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to create geofences. Your location is only used when you explicitly create a geofence and is not tracked.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>We need background location access to notify you when you enter geofences. Your movements are not tracked.</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

**Android** (`mobile/android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

### 3. Run the App
```bash
# Start Metro
npm start

# iOS
npm run ios

# Android
npm run android
```

---

## 📱 Test Geofencing

### Create Your First Geofence

1. **Open App** → Navigate to "Geofences" screen
   - (Add to HomeScreen navigation if not visible)

2. **Tap "+" Button** → Create Geofence screen opens

3. **Grant Permission**:
   - Read privacy notice: "Location only used to set geofence..."
   - Tap "Allow" when prompted for location access
   - Map shows your current location

4. **Set Geofence Location**:
   - Option A: Use current location (already centered)
   - Option B: Tap anywhere on map to set custom location

5. **Configure Geofence**:
   - **Name**: "Home", "Office", "Gym", etc.
   - **Type**: Choose from buttons (home, work, gym, store, custom)
   - **Radius**: Select 50m, 100m, 200m, 500m, or 1km
   - **Notifications**:
     - ✅ Notify on entry (recommended)
     - ⬜ Notify on exit (optional)

6. **Background Permission** (if notifications enabled):
   - Explanation shown: "Background location needed..."
   - Tap "Enable Notifications" to grant
   - Or decline to create geofence without notifications

7. **Create** → Geofence is saved and monitoring starts!

### Test Geofence Notification

**Option A: Physically Visit Location**
- Walk/drive to the geofence location
- When you enter the radius, you'll get a notification
- Notification shows: "📍 Arrived at [Name]" + relevant notes count

**Option B: Simulate Location (iOS Simulator)**
```
Debug → Location → Custom Location
Enter coordinates near your geofence
```

**Option C: Simulate Location (Android Emulator)**
```
Extended Controls (3 dots) → Location
Enter coordinates near your geofence
```

**Option D: Simulate Movement (GPX File)**
```
Create GPX file with route to geofence
Load in simulator/emulator
```

---

## 🔍 Verify Implementation

### Check Location Service
```typescript
import { locationService } from './src/services/locationService';

// Check permissions
const permissions = await locationService.checkPermissions();
console.log('Permissions:', permissions);

// Get privacy summary
const summary = await locationService.getPrivacySummary();
console.log('Privacy:', summary);
```

### Check Monitoring Status
```typescript
import { geofenceMonitoringService } from './src/services/geofenceMonitoringService';

// Get active regions
const active = geofenceMonitoringService.getActiveRegions();
console.log('Active geofences:', active);

// Get stats
const stats = geofenceMonitoringService.getMonitoringStats();
console.log('Stats:', stats);
```

### Check Geofences
```typescript
import { useGeofences } from './src/hooks/useGeofences';

// In component:
const { geofences, loading, error } = useGeofences();

console.log('Geofences:', geofences);
```

---

## 🔒 Privacy Features to Verify

### 1. Permission Explanations
- ✅ Explanation shown before foreground permission request
- ✅ Separate explanation for background permission
- ✅ User can decline without breaking app

### 2. No Continuous Tracking
- ✅ Check battery usage (should be < 5%)
- ✅ Location only accessed when creating geofence
- ✅ App not polling location continuously

### 3. Transparency
- ✅ Privacy dashboard shows all geofences
- ✅ Active/paused status visible
- ✅ "Delete All" button works

### 4. Data Deletion
- ✅ Deleting geofence removes from OS
- ✅ Deleting geofence removes from server
- ✅ No traces left

---

## 🐛 Troubleshooting

### Notifications Not Showing
1. Check notification permissions: Settings → [App] → Notifications
2. Verify background location granted
3. Check if geofence is enabled (toggle in list)
4. Ensure location services enabled on device

### Map Not Loading
1. Check internet connection (map tiles need network)
2. Verify location permission granted
3. Check console for errors

### Geofence Not Triggering
1. **iOS**: Geofences may take 3-5 minutes to activate
2. **Android**: Geofences activate faster (1-2 minutes)
3. Ensure radius is large enough (>100m recommended for testing)
4. Check device location accuracy (Settings → Location)

### Permission Denied
1. Open device Settings → [App] → Location
2. Change to "While Using" or "Always"
3. Restart app

---

## 📊 Test Checklist

### Basic Functionality
- [ ] Create geofence with map
- [ ] Geofence appears in list
- [ ] Toggle enable/disable works
- [ ] Delete geofence works
- [ ] Entry notification received
- [ ] Exit notification received (if enabled)

### Privacy
- [ ] Permission explanation shown
- [ ] Location not accessed without permission
- [ ] Privacy dashboard shows accurate info
- [ ] Delete all removes everything
- [ ] No continuous location access

### Edge Cases
- [ ] Create geofence without background permission
- [ ] Disable notifications after creation
- [ ] Create 10+ geofences (test OS limits)
- [ ] Delete geofence while monitoring
- [ ] App restart preserves geofences

---

## 🎯 Next Steps

### Immediate (This Sprint)
1. **Test on real devices** (iOS + Android)
2. **Measure battery impact** with 5-10 geofences
3. **Integrate with objects** - link geofences to voice notes

### Short Term (Next Sprint)
4. **Edit geofence** screen
5. **Quiet hours** configuration
6. **Object filtering** by geofence

### Long Term (Future)
7. Analytics (opt-in event logging)
8. Geofence templates
9. Import from Maps

---

## 📚 Documentation

- **Full Spec**: `plans/PHASE_6_PLAN.md`
- **Handoff Doc**: `plans/PHASE_6_HANDOFF.md`
- **Code**: `mobile/src/services/` and `mobile/src/screens/`

---

## 💡 Tips

### For Testing
- Use large radius (500m+) for initial tests
- Test entry events first (easier than exit)
- iOS geofences take longer to activate (3-5 min)
- Android responds faster (1-2 min)

### For Privacy
- Always show explanations before permission requests
- Make background permission optional
- Provide "Delete All" option
- Be transparent about what's monitored

### For Performance
- Limit to 10-15 active geofences for best battery life
- Use appropriate radius (too small = frequent triggers)
- Test battery drain over 24 hours

---

## 🎉 You're Ready!

Phase 6 core implementation is complete. Time to:
1. **Test** on real devices
2. **Integrate** with objects
3. **Polish** UX
4. **Celebrate** privacy-first geofencing! 🚀

Questions? See `plans/PHASE_6_HANDOFF.md` for detailed documentation.
