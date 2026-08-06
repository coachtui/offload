import styles from './phones.module.css';

/**
 * In-page recreation of the mobile Notes screen. Static — no animation.
 * `dark` renders the sea-glass dark variant; both variants keep fixed
 * interior colors in either page color scheme.
 */

function PinIcon({ stroke }: { stroke: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function FilterIcon({ stroke }: { stroke: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="17" x2="9" y2="17" />
    </svg>
  );
}

function NotesDark({ className }: { className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`} aria-hidden="true">
      <div className={`${styles.screen} ${styles.sNotes}`}>
        <div className={styles.island} />
        <div className={styles.statusbar}>
          <span>9:41</span>
          <span className={styles.sbRight}>●●●</span>
        </div>

        <div className={styles.nHeader}>
          <span className={styles.nTitle}>Notes</span>
          <span className={styles.nIconbtn}>
            <FilterIcon stroke="#9ba6a0" />
          </span>
        </div>

        <div className={styles.nChips}>
          <span className={`${styles.nChip} ${styles.nChipOn}`}>All</span>
          <span className={styles.nChip}>Business</span>
          <span className={styles.nChip}>Gym</span>
          <span className={styles.nChip}>Family</span>
          <span className={`${styles.nChip} ${styles.nChipMore}`}>+9 more</span>
          <span className={styles.nChip}>Home</span>
        </div>

        <div className={styles.nCard}>
          <div className={styles.nCardTitle}>
            Follow up with Mele on the invoice template before Friday
          </div>
          <div className={styles.nCardDetail}>
            &quot;…she said the GST line needs to sit under the subtotal, not above…&quot;
          </div>
          <div className={styles.nMeta}>
            <span className={`${styles.nTag} ${styles.nTagBiz}`}>Business</span>
            <span className={styles.nPlace}>
              <PinIcon stroke="#87938d" /> Office
            </span>
            <span className={styles.nPlace}>2 h ago</span>
          </div>
        </div>
        <div className={styles.nCard}>
          <div className={styles.nCardTitle}>
            Shoulder felt fine on incline press — go up 2.5 kg next session
          </div>
          <div className={styles.nCardDetail}>
            &quot;…no pinch at the top this time, keep the tempo slow on the way down…&quot;
          </div>
          <div className={styles.nMeta}>
            <span className={`${styles.nTag} ${styles.nTagGym}`}>Gym</span>
            <span className={styles.nPlace}>
              <PinIcon stroke="#87938d" /> Anytime Fitness
            </span>
            <span className={styles.nPlace}>Yesterday</span>
          </div>
        </div>
        <div className={styles.nCard}>
          <div className={styles.nCardTitle}>
            Sina&apos;s recital is moved to the 19th — swap the Thursday call
          </div>
          <div className={styles.nMeta}>
            <span className={`${styles.nTag} ${styles.nTagFam}`}>Family</span>
            <span className={styles.nPlace}>Monday</span>
          </div>
        </div>

        <div className={styles.nToast}>
          <span className={styles.nToastOk}>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8fd4c6"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <polyline points="4 12.5 9.5 18 20 6.5" />
            </svg>
          </span>
          <div>
            <div className={styles.nToastTitle}>Note archived</div>
            <div className={styles.nToastDetail}>Moved out of Business</div>
          </div>
          <span className={styles.nToastUndo}>Undo</span>
        </div>

        <div className={styles.homebar} />
      </div>
    </div>
  );
}

function NotesLight({ className }: { className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`} aria-hidden="true">
      <div className={`${styles.screen} ${styles.sNotesl}`}>
        <div className={styles.island} />
        <div className={styles.statusbar}>
          <span>9:41</span>
          <span className={styles.sbRight}>●●●</span>
        </div>

        <div className={styles.nlHeader}>
          <span className={styles.nlTitle}>Notes</span>
          <span className={styles.nlSelect}>Select</span>
        </div>

        <div className={styles.nlSearch}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9aa39e"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          What did you want to remember?
        </div>

        <div className={styles.nlChips}>
          <span className={`${styles.nlChip} ${styles.nlChipOn}`}>All</span>
          <span className={styles.nlChip}>
            <span className={styles.nlChipDot} style={{ background: '#2c6e8f' }} />
            Business
          </span>
          <span className={styles.nlChip}>
            <span className={styles.nlChipDot} style={{ background: '#1e7b54' }} />
            Gym
          </span>
          <span className={`${styles.nlChip} ${styles.nlChipMore}`}>
            <FilterIcon stroke="#0f6b5f" />
            +9 more
          </span>
        </div>

        <div className={styles.nlSec}>Today</div>
        <div className={styles.nlCard}>
          <div className={styles.nlCardTitle}>
            Follow up with Mele on the invoice template
          </div>
          <div className={styles.nlSnip}>
            &quot;…she said the GST line needs to sit under the subtotal, not above it, before
            Friday…&quot;
          </div>
          <div className={styles.nlNext}>→ Send revised template to Mele</div>
          <div className={styles.nlMeta}>
            <span
              className={styles.nlTag}
              style={{ background: 'rgba(44,110,143,0.12)', color: '#2c6e8f' }}
            >
              Business
            </span>
            <span className={styles.nlTime}>2 h ago</span>
            <span className={styles.nlUrgent}>
              <span className={styles.nlUrgentDot} />
              Urgent
            </span>
          </div>
        </div>

        <div className={styles.nlSec}>Yesterday</div>
        <div className={styles.nlCard}>
          <div className={styles.nlCardTitle}>
            Shoulder felt fine on incline press — go up 2.5 kg
          </div>
          <div className={styles.nlSnip}>
            &quot;…no pinch at the top this time, keep the tempo slow on the way down…&quot;
          </div>
          <div className={styles.nlMeta}>
            <span
              className={styles.nlTag}
              style={{ background: 'rgba(30,123,84,0.12)', color: '#1e7b54' }}
            >
              Gym
            </span>
            <span className={styles.nlTime}>Yesterday</span>
          </div>
        </div>
        <div className={styles.nlCard}>
          <div className={styles.nlCardTitle}>
            Sina&apos;s recital moved to the 19th — swap the Thursday call
          </div>
          <div className={styles.nlMeta}>
            <span
              className={styles.nlTag}
              style={{ background: 'rgba(161,116,12,0.12)', color: '#a1740c' }}
            >
              Family
            </span>
            <span className={styles.nlTime}>Yesterday</span>
          </div>
        </div>

        <div className={styles.homebar} />
      </div>
    </div>
  );
}

export default function PhoneNotes({
  dark = false,
  className,
}: {
  dark?: boolean;
  className?: string;
}) {
  return dark ? <NotesDark className={className} /> : <NotesLight className={className} />;
}
