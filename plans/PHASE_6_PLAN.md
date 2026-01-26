# Phase 6: Privacy-First Geofencing & Context-Aware Features

**Status**: Planning
**Timeline**: 2-3 weeks
**Priority**: Privacy & Security First

---

## 🔒 Privacy-First Principles

### Core Philosophy
**"Location data is collected ONLY when explicitly needed, with user consent, and never stored longer than necessary."**

### Privacy Commitments
1. ✅ **No Continuous Tracking** - Only use geofence regions (OS-level monitoring)
2. ✅ **Explicit Opt-In** - User must explicitly create each geofence
3. ✅ **Local-First** - Geofence monitoring happens on device, not server
4. ✅ **Minimal Data** - Only store coordinates user explicitly saves
5. ✅ **Transparent Controls** - Clear UI showing what location data exists
6. ✅ **Easy Deletion** - One-tap to delete any geofence and its location data
7. ✅ **No Location History** - No tracking of user movements
8. ✅ **Selective Sharing** - Location only sent to server when user saves an object with location

---

## 🏗️ Privacy-First Architecture

### Location Collection Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    USER CREATES GEOFENCE                    │
│  (Explicit action: "Remind me about X when I'm at Y")      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           PERMISSION REQUEST (One-time)                     │
│  "Allow location access to monitor this geofence?"         │
│  [x] Only while using app                                  │
│  [ ] Always (for background notifications)                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         OS-LEVEL GEOFENCE REGISTRATION                      │
│  • iOS/Android monitors the region (not our app)           │
│  • Minimal battery impact (hardware-level)                 │
│  • App only woken when user enters/exits                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         GEOFENCE ENTRY/EXIT EVENT (Local)                   │
│  • Event handled entirely on device                         │
│  • Retrieve relevant objects from local cache              │
│  • Display LOCAL notification (no server call)             │
│  • Optional: Log event to server (user configurable)       │
└─────────────────────────────────────────────────────────────┘
```

### What Gets Stored Where

| Data | Device | Server | Notes |
|------|--------|--------|-------|
| Geofence coordinates | ✅ Yes | ✅ Yes | Only when user explicitly creates geofence |
| Current location | ❌ No | ❌ No | Never stored, only used momentarily |
| Location history | ❌ No | ❌ No | Never tracked |
| Entry/exit events | ⚠️ Optional | ⚠️ Optional | Only if user enables "Analytics" |
| Object source location | ✅ Yes | ✅ Yes | Only if user chooses "Save with location" |

---

## 📋 Implementation Plan

### **Phase 6.1: Geofence Creation (Privacy-First)**

#### Mobile App Changes

**New Screen: `CreateGeofenceScreen.tsx`**
```typescript
Features:
- Map view with current location (one-time permission)
- Tap to set geofence center
- Adjust radius with slider (50m - 5km)
- Name and description
- Link to existing objects (optional)
- Privacy controls:
  ✓ "Notify me when I enter" (on/off)
  ✓ "Notify me when I exit" (on/off)
  ✓ "Quiet hours" (time range)
  ✓ "Log events to server" (on/off - default OFF)
```

**Permission Flow**:
1. User taps "Create Geofence"
2. App explains: "We need your location once to set up this geofence"
3. Request `whenInUse` permission
4. User sets location on map
5. For background notifications, separately request `always` permission with clear explanation
6. User can decline background and still use geofences (manual checking only)

#### Backend Changes (Minimal)

**No changes needed!** Geofence CRUD already exists from Phase 5.

Server only knows about geofences user explicitly creates - never tracks actual location.

---

### **Phase 6.2: Geofence Monitoring (Local-First)**

#### iOS Implementation (React Native)
```typescript
// Use iOS CoreLocation Geofencing
import * as Location from 'expo-location';

Features:
- Register geofence regions with iOS (max 20 per app)
- OS handles monitoring (not our app - battery efficient)
- App receives event only on entry/exit
- Works even when app is terminated
- Respects user's location settings
```

#### Android Implementation
```typescript
// Use Android Geofencing API
import * as Location from 'expo-location';

Features:
- Register geofence regions with Android
- Uses device location services (battery efficient)
- Transition events: ENTER, EXIT, DWELL
- Works in background
- Respects user's location settings
```

#### Privacy Features
- **No Continuous Polling**: OS monitors, not our app
- **No Location Storage**: Events trigger notification, location not saved
- **User Control**: Disable any geofence anytime
- **Battery Efficient**: Hardware-level monitoring
- **Offline**: Works without internet

---

### **Phase 6.3: Context-Aware Notifications (Local)**

#### Local Notification System
```typescript
When geofence triggered:
1. Fetch relevant objects from local database (SQLite)
2. Respect quiet hours (no server check needed)
3. Display notification with object count
4. User taps notification → Opens app with filtered objects
5. Optional: Log event to server (if user enabled analytics)
```

#### Notification Content
```
📍 You're at [Geofence Name]

You have 3 relevant notes:
• Call mom about Sunday dinner
• Pick up dry cleaning
• Gym routine update

Tap to view
```

#### Privacy Controls
```typescript
Settings:
- [x] Enable geofence notifications
- [ ] Log geofence events to server (analytics)
- [x] Respect quiet hours (10pm - 8am)
- [ ] Share location with objects (adds GPS to voice notes)
- [ ] Allow background location (required for notifications)
```

---

### **Phase 6.4: Geofence Management UI**

#### New Screen: `GeofencesScreen.tsx`
```typescript
Features:
- List of all geofences
- Visual indicator: Active/Paused
- Quick actions:
  ✓ Pause/Resume notifications
  ✓ Edit geofence
  ✓ Delete geofence (removes from OS + server)
- Privacy dashboard:
  ✓ "Location accessed: Never" (until geofence created)
  ✓ "Active geofences: 3"
  ✓ "Events logged: 0" (if analytics disabled)
```

#### Geofence Detail View
```typescript
- Map showing geofence radius
- Associated objects (clickable)
- Event history (if user enabled analytics)
- Privacy controls per geofence
- One-tap delete with confirmation
```

---

## 🔐 Privacy Features Checklist

### User Controls
- [ ] Granular permissions per geofence
- [ ] Easy enable/disable for notifications
- [ ] One-tap delete with no trace
- [ ] Analytics opt-in (default OFF)
- [ ] Quiet hours configuration
- [ ] Privacy dashboard showing all location usage

### Technical Safeguards
- [ ] No location storage beyond user-created geofences
- [ ] No location history tracking
- [ ] No server-side location polling
- [ ] Encrypted location data in database
- [ ] Local processing of geofence events when possible
- [ ] Clear audit log of location access (user-facing)

### Transparency
- [ ] Clear permission explanations
- [ ] Real-time indicator when location accessed
- [ ] Privacy policy section for location
- [ ] Data export includes all location data
- [ ] Data deletion removes all location traces

---

## 🛠️ Technical Implementation

### Dependencies to Add

```json
{
  "expo-location": "~16.5.0",  // Geofencing + permissions
  "react-native-maps": "^1.10.0",  // Map UI
  "expo-notifications": "~0.27.0",  // Local notifications
  "expo-task-manager": "~11.6.0"  // Background tasks
}
```

### Mobile File Structure

```
mobile/src/
├── screens/
│   ├── GeofencesScreen.tsx         (NEW - List geofences)
│   ├── CreateGeofenceScreen.tsx    (NEW - Create/edit)
│   └── GeofenceDetailScreen.tsx    (NEW - View details)
├── hooks/
│   ├── useGeofences.ts              (NEW - CRUD operations)
│   ├── useLocation.ts               (NEW - Permission handling)
│   └── useGeofenceMonitoring.ts     (NEW - OS-level monitoring)
├── services/
│   ├── geofenceService.ts           (NEW - OS integration)
│   ├── notificationService.ts       (NEW - Local notifications)
│   └── locationService.ts           (NEW - Permission mgmt)
├── components/
│   ├── MapView.tsx                  (NEW - Map display)
│   ├── GeofenceMarker.tsx          (NEW - Geofence on map)
│   └── PrivacyIndicator.tsx        (NEW - Shows location usage)
└── context/
    └── LocationContext.tsx          (NEW - Location state)
```

### Backend Changes (Minimal)

**No new endpoints needed!** Everything exists from Phase 5.

Optional enhancement:
```typescript
// backend/api/src/routes/geofences.ts
// Add optional endpoint for event logging (if user opts in)
POST /api/v1/geofences/:id/events
Body: { type: 'enter' | 'exit', timestamp: ISO8601 }

// Only called if user enabled analytics
// Can be rate-limited to 1 event per hour per geofence
```

---

## 📊 Privacy-First User Flow Examples

### Example 1: Creating a Geofence (First Time)
```
1. User: Opens "Geofences" tab → "Create New"
2. App: Shows explanation: "Geofences help remind you about notes when you're at specific places"
3. App: Requests "while using" location permission
4. User: Grants permission
5. App: Shows map with current location (one-time use)
6. User: Taps location, sets radius, names it "Home"
7. User: Links 3 existing objects about home chores
8. App: Asks: "Enable background notifications?" with explanation
9. User: Can choose "No, I'll check manually" or "Yes" (requests "always" permission)
10. App: Creates geofence
11. Server: Stores geofence metadata (name, radius) - NOT user's actual location movements
```

### Example 2: Geofence Triggers (Background)
```
1. User: Approaches "Grocery Store" geofence
2. iOS/Android: Detects entry (hardware-level, not our app)
3. iOS/Android: Wakes our app with entry event
4. App: Fetches 2 relevant objects from local SQLite cache
5. App: Checks time (7:30pm - within active hours)
6. App: Shows local notification: "📍 Grocery Store - 2 items to remember"
7. Optional: If analytics enabled, log event to server (timestamp only)
8. User: Taps notification → App opens with filtered objects
```

### Example 3: Privacy Dashboard
```
User: Opens Settings → Privacy & Location

Display:
┌─────────────────────────────────────┐
│  📍 Location Usage                  │
├─────────────────────────────────────┤
│  Active Geofences: 4                │
│  • Home (notifications on)          │
│  • Office (paused)                  │
│  • Gym (notifications on)           │
│  • Grocery Store (notifications on) │
│                                     │
│  Location History: Not tracked      │
│  Events Logged: 0 (analytics off)   │
│                                     │
│  [View All Geofences]               │
│  [Delete All Location Data]         │
└─────────────────────────────────────┘
```

---

## 🧪 Testing Strategy

### Privacy Testing
- [ ] Verify location never accessed without user action
- [ ] Confirm no location data in logs
- [ ] Test geofence deletion removes all traces
- [ ] Verify background monitoring stops when disabled
- [ ] Check no location sent to server except with objects
- [ ] Test app works with location permission denied

### Functional Testing
- [ ] Geofence creation with map
- [ ] OS-level geofence registration
- [ ] Entry/exit notifications
- [ ] Quiet hours respected
- [ ] Object linking to geofences
- [ ] Geofence editing and deletion

### Battery Testing
- [ ] Monitor battery usage with 10 active geofences
- [ ] Verify OS handles monitoring (not app polling)
- [ ] Test background behavior vs foreground

---

## 📈 Success Metrics

### Privacy Metrics
- ✅ Zero location tracking beyond user-created geofences
- ✅ Zero server-side location storage except explicit saves
- ✅ 100% of location access requires user action
- ✅ Full location data deletion capability

### Feature Metrics
- 🎯 Users create avg 3-5 geofences
- 🎯 Geofence notifications have 70%+ engagement
- 🎯 Battery impact < 5% with 10 active geofences
- 🎯 95% of notifications delivered within 1 min of entry

---

## 🚀 Implementation Timeline

### Week 1: Foundation
- **Days 1-2**: Geofence creation UI with map
- **Days 3-4**: Permission handling & user education
- **Days 5**: Privacy controls & settings

### Week 2: Monitoring & Notifications
- **Days 1-2**: iOS geofence monitoring
- **Days 3-4**: Android geofence monitoring
- **Days 5**: Local notification system

### Week 3: Polish & Testing
- **Days 1-2**: Privacy dashboard & transparency
- **Days 3-4**: Testing (privacy, battery, functionality)
- **Days 5**: Documentation & handoff

---

## ✅ Definition of Done

- [ ] User can create geofences with map UI
- [ ] Geofence monitoring works on iOS (hardware-level)
- [ ] Geofence monitoring works on Android (hardware-level)
- [ ] Local notifications on geofence entry
- [ ] Quiet hours respected
- [ ] Privacy dashboard shows location usage
- [ ] Easy deletion of geofences and location data
- [ ] No location tracking beyond explicit geofences
- [ ] Battery impact < 5%
- [ ] Documentation complete
- [ ] Privacy policy updated

---

## 📝 Privacy Policy Updates Needed

Add section:
```markdown
### Location Data

**What we collect:**
- Coordinates of geofences you explicitly create
- Optional: GPS coordinates when you choose "Save with location" on a note

**What we DON'T collect:**
- Your location history or movements
- Background location tracking
- Location when app is not in use (unless you enabled background notifications)

**How it's used:**
- Geofence monitoring happens on your device (not our servers)
- Location is only sent to our servers when you save a note with location
- You can delete any geofence and its data anytime

**Your controls:**
- Enable/disable background location anytime
- Pause/resume individual geofences
- Delete all location data in one tap
```

---

## 🎯 Next Steps

1. Review this plan with team
2. Get user feedback on privacy controls
3. Start implementation with geofence creation UI
4. Iterate based on testing

**Privacy is not a feature - it's a fundamental design principle.**

