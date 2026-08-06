import styles from './hero.module.css';

/**
 * Decorative thought-strands drifting across the hero toward the phone —
 * the one purposeful piece of motion on the page. Positioned absolutely
 * inside a relative hero section; purely presentational.
 */
export default function HeroStrands() {
  return (
    <svg
      className={styles.strands}
      viewBox="0 0 1000 480"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className={`${styles.strand} ${styles.strandDraw}`}
        d="M-20 210 C 180 170, 320 260, 470 215 S 640 150, 700 195"
      />
      <path
        className={`${styles.strand} ${styles.strand2} ${styles.strandDraw} ${styles.strandDrawD2}`}
        d="M-20 260 C 200 230, 340 300, 500 255 S 660 200, 705 235"
      />
      <path
        className={`${styles.strand} ${styles.strand3} ${styles.strandDraw} ${styles.strandDrawD3}`}
        d="M-20 160 C 160 130, 330 210, 480 175 S 650 110, 698 160"
      />
    </svg>
  );
}
