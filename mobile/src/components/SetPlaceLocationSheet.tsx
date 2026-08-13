/**
 * "Where is Melaleuca?" — the confirm sheet for a pending place lookup.
 *
 * A spoken place name the geocoders couldn't silently resolve (or resolved to
 * two different destinations sharing one name) lands here as one question.
 * Whatever the user taps — a listed candidate, their current location, the map
 * picker, or "not a place" — the server records it against a MANUAL geofence,
 * so the word is taught once and every future note about it just works.
 *
 * Shared between PlacesScreen (the "Needs a location" section) and the note
 * chip in ObjectsScreen — one sheet, one behaviour, wherever the question
 * surfaces.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSheet, AppText, AppPressable, Spacing, Radius, useToast } from './ui';
import { ThemeColors, Fonts, useTheme, useThemedStyles } from '../theme';
import { haptic } from '../theme/haptics';
import { apiService, PendingPlaceCandidate } from '../services/api';
import { locationService } from '../services/locationService';
import { syncGeofencesWithOS } from '../services/geofenceSync';

export interface PendingLookupForSheet {
  id: string;
  query: string;
  notePreview?: string | null;
  candidates: PendingPlaceCandidate[];
}

interface Props {
  visible: boolean;
  lookup: PendingLookupForSheet | null;
  onClose: () => void;
  /** The lookup was answered (resolved or dismissed) — refresh whatever list showed it. */
  onDone: () => void;
  /** "Pick on the map" — parent navigates to the map picker; the sheet closes itself. */
  onPickOnMap: (lookup: PendingLookupForSheet) => void;
}

export function SetPlaceLocationSheet({ visible, lookup, onClose, onDone, onPickOnMap }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!lookup) return null;

  async function finishResolve(work: () => Promise<void>, successMessage: string) {
    haptic.tap();
    setBusy(true);
    try {
      await work();
      haptic.success();
      // Arm the new region now — the server created it, but iOS knows nothing
      // until a sync runs, and the user is right here with the app open.
      await syncGeofencesWithOS('pending-lookup-resolved').catch(() => 0);
      toast.show({ message: successMessage, tone: 'success' });
      onDone();
      onClose();
    } catch (e: any) {
      console.warn('[SetPlaceLocationSheet] resolve failed', e);
      toast.show({
        message: "Couldn't save the location",
        description: e?.message || 'Please try again.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  const resolveCandidate = (index: number) =>
    finishResolve(async () => {
      await apiService.resolvePendingPlace(lookup.id, { candidateIndex: index });
    }, `Reminder set for ${lookup.query}`);

  const resolveCurrentLocation = () =>
    finishResolve(async () => {
      const loc = await locationService.getCurrentLocation();
      if (!loc) throw new Error("Couldn't get your location");
      await apiService.resolvePendingPlace(lookup.id, {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    }, `${lookup.query} saved at your location`);

  const dismissLookup = () =>
    finishResolve(async () => {
      await apiService.dismissPendingPlace(lookup.id);
    }, `Got it — won't ask about "${lookup.query}" again`);

  const handlePickOnMap = () => {
    haptic.tap();
    onClose();
    onPickOnMap(lookup);
  };

  return (
    <AppSheet visible={visible} onClose={busy ? () => {} : onClose}>
      <View style={styles.body}>
        <AppText variant="title" align="center">
          Where is {lookup.query}?
        </AppText>
        {lookup.notePreview ? (
          <AppText variant="secondary" color="muted" align="center" style={styles.lede}>
            “{lookup.notePreview}”
          </AppText>
        ) : (
          <AppText variant="secondary" color="muted" align="center" style={styles.lede}>
            Pick the right spot and the reminder will fire when you arrive.
          </AppText>
        )}

        {lookup.candidates.length > 0 && (
          <View style={styles.candidates}>
            {lookup.candidates.map((candidate, index) => (
              <AppPressable
                key={`${candidate.lat}:${candidate.lng}`}
                style={styles.candidateRow}
                onPress={() => resolveCandidate(index)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${candidate.name}${candidate.address ? `, ${candidate.address}` : ''}`}
              >
                <View style={styles.candidateIcon}>
                  <Ionicons name="location" size={18} color={colors.accent} />
                </View>
                <View style={styles.candidateBody}>
                  <AppText variant="body" style={styles.candidateName} numberOfLines={1}>
                    {candidate.name}
                  </AppText>
                  {candidate.address ? (
                    <AppText variant="secondary" color="muted" numberOfLines={1}>
                      {candidate.address}
                    </AppText>
                  ) : null}
                </View>
                {candidate.distanceKm != null && (
                  <AppText variant="secondary" color="muted" style={styles.distance}>
                    {candidate.distanceKm} km
                  </AppText>
                )}
              </AppPressable>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <AppPressable
          style={styles.actionRow}
          onPress={resolveCurrentLocation}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
        >
          <Ionicons name="navigate" size={18} color={colors.accent} />
          <AppText variant="body" style={styles.actionText}>
            Use my current location
          </AppText>
        </AppPressable>

        <AppPressable
          style={styles.actionRow}
          onPress={handlePickOnMap}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Pick on the map"
        >
          <Ionicons name="map-outline" size={18} color={colors.accent} />
          <AppText variant="body" style={styles.actionText}>
            Pick on the map
          </AppText>
        </AppPressable>

        <AppPressable
          style={styles.actionRow}
          onPress={dismissLookup}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Not a place"
        >
          <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
          <AppText variant="body" color="muted" style={styles.actionText}>
            Not a place — don't ask again
          </AppText>
        </AppPressable>
      </View>
    </AppSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
    lede: { marginTop: Spacing.sm, paddingHorizontal: Spacing.md },
    candidates: { marginTop: Spacing.xl, gap: Spacing.sm },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgMuted,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.lg,
    },
    candidateIcon: {
      width: 34,
      height: 34,
      borderRadius: Radius.sm,
      backgroundColor: c.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    candidateBody: { flex: 1, marginHorizontal: Spacing.md },
    candidateName: { fontFamily: Fonts.semibold },
    distance: { marginLeft: Spacing.sm },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: Spacing.lg,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
    },
    actionText: { flex: 1 },
  });
