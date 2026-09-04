import type { ReactNode } from 'react';

/** Short plain-language helper under a control. Not a tooltip substitute. */
export function FieldHelp({ children }: { children: ReactNode }) {
  return <p className="field-help">{children}</p>;
}

/** Label + optional help + control stack. */
export function FormField({
  label,
  htmlFor,
  help,
  example,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  example?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {help ? <div className="form-field__help">{help}</div> : null}
      <div className="form-field__control">{children}</div>
      {example ? <div className="form-field__example">{example}</div> : null}
      {error ? (
        <div className="form-field__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
