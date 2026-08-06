import styles from './phones.module.css';

/**
 * In-page recreation of the mobile Record (focus mode) screen — the money
 * shot for the landing hero. Deliberately dark in both color schemes; all
 * motion (pulse rings, waveform, cursor, listening dot) is gated behind
 * prefers-reduced-motion: no-preference in phones.module.css.
 */

const WAVE_BARS: Array<{ height: number; delay: number }> = [
  { height: 10, delay: 0 },
  { height: 18, delay: 0.1 },
  { height: 24, delay: 0.2 },
  { height: 14, delay: 0.3 },
  { height: 22, delay: 0.4 },
  { height: 12, delay: 0.5 },
  { height: 20, delay: 0.6 },
  { height: 26, delay: 0.7 },
  { height: 15, delay: 0.8 },
  { height: 9, delay: 0.9 },
];

export default function PhoneRecord({ className }: { className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`} aria-hidden="true">
      <div className={`${styles.screen} ${styles.sRecord}`}>
        <div className={styles.island} />
        <div className={styles.statusbar}>
          <span>9:41</span>
          <span className={styles.sbRight}>●●●</span>
        </div>

        <div className={styles.rTop}>
          <span className={styles.rChip}>
            <span className={styles.rDot} /> Listening
          </span>
          <span className={styles.rClose}>✕</span>
        </div>

        <div className={styles.rStage}>
          <div className={styles.rOrbWrap}>
            <div className={styles.rRing} />
            <div className={`${styles.rRing} ${styles.rRingD2}`} />
            <div className={`${styles.rRing} ${styles.rRingD3}`} />
            <div className={styles.rOrb}>
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
                <path d="M6 11a6 6 0 0 0 12 0" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
          </div>
          <div className={styles.rTimer}>00:42</div>
          <div className={styles.rWave}>
            {WAVE_BARS.map((bar, i) => (
              <span
                key={i}
                className={styles.rBar}
                style={{ height: bar.height, animationDelay: `${bar.delay}s` }}
              />
            ))}
          </div>
        </div>

        <div className={styles.rTranscript}>
          …and remind me when I&apos;m at Bunnings to grab the deck sandpaper, plus{' '}
          <span className={styles.rLive}>book the squat rack for Thursday six a.m.</span>
          <span className={styles.rCursor} />
        </div>

        <div className={styles.rActions}>
          <span className={styles.rStop}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#14201c">
              <rect x="6" y="6" width="12" height="12" rx="2.5" />
            </svg>
            Done — offload it
          </span>
        </div>

        <div className={styles.homebar} />
      </div>
    </div>
  );
}
