import React from 'react';

/**
 * Reusable labeled text/email/tel/number input
 */
const InputField = ({
  label,
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  required,
  autoComplete,
}) => (
  <div className="input-group">
    {label && (
      <label htmlFor={id}>
        {label}
        {required && <span style={{ color: 'var(--text-error)' }}> *</span>}
      </label>
    )}
    <div className="input-wrap">
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={error ? 'input-error' : ''}
      />
    </div>
    {error && <span className="error-msg">⚠ {error}</span>}
  </div>
);

export default InputField;
