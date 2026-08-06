import styles from './phones.module.css';

/**
 * In-page recreation of the mobile Home screen (light). Static — no
 * animation. Interior colors are fixed to the mock's light Deep Lagoon
 * values in both color schemes.
 */

function NoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0f6b5f"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export default function PhoneHome({ className }: { className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`} aria-hidden="true">
      <div className={`${styles.screen} ${styles.sHome}`}>
        <div className={styles.island} />
        <div className={styles.statusbar}>
          <span>9:41</span>
          <span className={styles.sbRight}>●●●</span>
        </div>

        <div className={styles.hHeader}>
          <div>
            <div className={styles.hGreetSm}>Wednesday 6 Aug</div>
            <div className={styles.hGreet}>Good evening, Tui</div>
          </div>
          <div className={styles.hAvatar}>T</div>
        </div>

        <div className={styles.hSearch}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9aa39e"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          Search notes, places, ideas…
        </div>

        <div className={styles.hSec}>
          <span className={styles.hSecTitle}>For you right now</span>
          <span className={styles.hSecAction}>See all</span>
        </div>
        <div className={styles.hForyou}>
          <div className={styles.hLoc}>
            <span className={styles.hLocChip}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0f6b5f"
                strokeWidth="2.4"
              >
                <path d="M3 11l18-8-8 18-2.5-7.5z" />
              </svg>
              Near Bunnings Warehouse
            </span>
          </div>
          <div className={styles.hNote}>
            <div className={styles.chipicon} style={{ background: '#e4f0ec' }}>
              <NoteIcon />
            </div>
            <div>
              <div className={styles.hNoteTitle}>Pick up whiteboard markers</div>
              <div className={styles.hNoteDetail}>Business · noted Tue</div>
            </div>
          </div>
          <div className={styles.hNote}>
            <div className={styles.chipicon} style={{ background: '#e4f0ec' }}>
              <NoteIcon />
            </div>
            <div>
              <div className={styles.hNoteTitle}>Get sandpaper for the deck rail</div>
              <div className={styles.hNoteDetail}>Home · noted Sun</div>
            </div>
          </div>
        </div>

        <div className={styles.hSec}>
          <span className={styles.hSecTitle}>Shortcuts</span>
        </div>
        <div className={styles.hGrid}>
          <div className={styles.hCard}>
            <div className={styles.chipicon} style={{ background: '#e4f0ec' }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0f6b5f"
                strokeWidth="2"
              >
                <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8z" />
              </svg>
            </div>
            <div className={styles.hCardTitle}>Ask Offload</div>
            <div className={styles.hCardDetail}>Search by voice</div>
          </div>
          <div className={styles.hCard}>
            <div className={styles.chipicon} style={{ background: '#faeee9' }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#c2492f"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 18h6M10 21h4" />
                <path d="M12 3a6 6 0 0 1 3.5 10.9c-.5.4-.5 1.1-.5 2.1h-6c0-1 0-1.7-.5-2.1A6 6 0 0 1 12 3z" />
              </svg>
            </div>
            <div className={styles.hCardTitle}>Insights</div>
            <div className={styles.hCardDetail}>Weekly synthesis</div>
          </div>
          <div className={styles.hCard}>
            <div className={styles.chipicon} style={{ background: '#eef2e2' }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5d7025"
                strokeWidth="2"
              >
                <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </div>
            <div className={styles.hCardTitle}>Places</div>
            <div className={styles.hCardDetail}>3 active</div>
          </div>
          <div className={styles.hCard}>
            <div className={styles.chipicon} style={{ background: '#f7efdd' }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a1740c"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
                <line x1="9" y1="13" x2="15" y2="13" />
              </svg>
            </div>
            <div className={styles.hCardTitle}>Notes</div>
            <div className={styles.hCardDetail}>128 captured</div>
          </div>
        </div>

        <div className={styles.hMicdock}>
          <div className={styles.hMic}>
            <svg
              width="26"
              height="26"
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
          <div className={styles.hMicLabel}>Offload something</div>
        </div>

        <div className={styles.homebar} />
      </div>
    </div>
  );
}
