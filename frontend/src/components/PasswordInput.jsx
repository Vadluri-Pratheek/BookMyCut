import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

/**
 * Password input with show/hide toggle
 */
const PasswordInput = ({
  label = 'Password',
  id,
  placeholder = 'Enter password',
  value,
  onChange,
  error,
  required,
  autoComplete,
}) => {
  const [show, setShow] = useState(false);

  return (
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
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className={error ? 'input-error' : ''}
          style={{ paddingRight: '2.8rem' }}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>
      {error && <span className="error-msg">⚠ {error}</span>}
    </div>
  );
};

export default PasswordInput;
