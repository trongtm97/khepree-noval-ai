import { APP_NAME_LINE1, APP_NAME_LINE2 } from '@shared/constants/app';
import logoUrl from '../../assets/brand/logo.png';

interface AppBrandProps {
  showVersion?: string;
  className?: string;
}

export function AppBrand({ showVersion, className }: AppBrandProps) {
  const rootClass = ['app-brand', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      <img src={logoUrl} alt="" className="app-brand-logo" aria-hidden="true" />
      <div className="app-brand-text">
        <div className="app-brand-name" aria-label={`${APP_NAME_LINE1} ${APP_NAME_LINE2}`}>
          <span className="app-brand-name-line">{APP_NAME_LINE1}</span>
          <span className="app-brand-name-line">{APP_NAME_LINE2}</span>
        </div>
        {showVersion ? <span className="app-brand-version">v{showVersion}</span> : null}
      </div>
    </div>
  );
}
