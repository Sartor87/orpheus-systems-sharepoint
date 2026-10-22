import * as React from 'react';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import { footerText } from '../menu';
import OrpheusMark from './OrpheusMark';
import { chromeVars } from './chromeVars';
import styles from './OrpheusChrome.module.scss';

export interface IOrpheusFooterProps {
  /** Manifest version, without the leading "v". */
  version: string;
}

const OrpheusFooter: React.FC<IOrpheusFooterProps> = ({ version }) => {
  const text = footerText(version);
  return (
    <footer className={styles.footer} style={chromeVars}>
      <div className={styles.footerInner}>
        <div className={styles.footerLead}>
          <OrpheusMark size={16} color={orpheusTokens.amber} />
          <span className={styles.kicker}>{text.kicker}</span>
        </div>
        <div className={styles.footerMeta}>
          <a className={styles.footerLink} href={`mailto:${text.contact}`}>{text.contact}</a>
          <span className={styles.footerSep} aria-hidden="true">·</span>
          <span className={styles.version}>{text.version}</span>
        </div>
      </div>
    </footer>
  );
};

export default OrpheusFooter;
