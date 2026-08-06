import styles from './phones.module.css';
import { LogoGlyph } from '@/components/ui/icons';

/**
 * Lock-screen recreation for the place-reminder section: the Offload
 * notification arriving as you reach the store. The notification's spring-in
 * loop is gated behind prefers-reduced-motion in phones.module.css.
 */
export default function PhoneLock({ className }: { className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`} aria-hidden="true">
      <div className={`${styles.screen} ${styles.sLock}`}>
        <div className={styles.island} />
        <div className={styles.statusbar}>
          <span />
          <span className={styles.sbRight}>●●●</span>
        </div>

        <div className={styles.lkTime}>
          <div className={styles.lkClock}>5:42</div>
          <div className={styles.lkDate}>Thursday, 6 August</div>
        </div>

        <div className={styles.lkNotif}>
          <span className={styles.lkAppicon}>
            <LogoGlyph className={styles.lkAppiconGlyph} />
          </span>
          <div className={styles.lkBody}>
            <div className={styles.lkRow1}>
              <span className={styles.lkApp}>Offload</span>
              <span className={styles.lkWhen}>now</span>
            </div>
            <div className={styles.lkTitle}>You&apos;re near Costco</div>
            <div className={styles.lkText}>
              3 open notes · Paper towels, AA batteries, rotisserie chicken
            </div>
          </div>
        </div>

        <div className={styles.lkHint}>Swipe up to open</div>
        <div className={styles.homebar} />
      </div>
    </div>
  );
}
