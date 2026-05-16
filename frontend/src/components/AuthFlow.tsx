import { useEffect, useState } from 'react';
import { authCheckPhone, getAllUsers, loginWithPin, requestPinReset, signup, verifyPinReset, type User } from '../api';
import { S } from '../theme';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

type AuthStep = 'phone' | 'pin' | 'forgot' | 'reset-code' | 'signup-name' | 'signup-email' | 'signup-pin';

function AuthFlow({ onAuth }: { onAuth: (user: User) => void }) {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    getAllUsers().then(users => {
      if (Array.isArray(users) && users.length < 10) setAllUsers(users);
    }).catch(() => {});
  }, []);

  const handlePhoneContinue = async (overridePhone?: string) => {
    const p = overridePhone ?? phone;
    if (!p) { setError('Please select or enter a phone number.'); return; }
    setError(''); setLoading(true);
    try {
      const data = await authCheckPhone(p);
      setPhone(p);
      setStep(data.exists ? 'pin' : 'signup-name');
    } catch {
      setError('Could not reach server. Please try again.');
    }
    setLoading(false);
  };

  const handlePinLogin = async () => {
    if (!pin) { setError('PIN is required.'); return; }
    setError(''); setLoading(true);
    try {
      const data = await loginWithPin(phone, pin);
      if (data.success) onAuth(data.user);
      else setError(data.message || 'Incorrect PIN');
    } catch {
      setError('Could not reach server.');
    }
    setLoading(false);
  };

  const handleRequestReset = async () => {
    setError(''); setLoading(true);
    try {
      const data = await requestPinReset(phone);
      if (data.success) {
        setMaskedEmail(data.maskedEmail || '');
        setInfo(data.sent ? `Code sent to ${data.maskedEmail}` : 'SMTP not configured – check server console for the code.');
        setStep('reset-code');
      } else {
        setError(data.message || 'Could not send reset code.');
      }
    } catch {
      setError('Could not reach server.');
    }
    setLoading(false);
  };

  const handleVerifyReset = async () => {
    if (!resetCode || !newPin) { setError('All fields required.'); return; }
    setError(''); setLoading(true);
    try {
      const data = await verifyPinReset(phone, resetCode, newPin);
      if (data.success) onAuth(data.user);
      else setError(data.message || 'Invalid or expired code.');
    } catch {
      setError('Could not reach server.');
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    if (pin.length !== 4) { setError('PIN must be exactly 4 digits.'); return; }
    if (pin !== pinConfirm) { setError('PINs do not match.'); return; }
    setError(''); setLoading(true);
    try {
      const data = await signup(phone, firstName, lastName, email, pin);
      if (data.success) onAuth(data.user);
      else setError(data.message || 'Signup failed.');
    } catch {
      setError('Could not reach server.');
    }
    setLoading(false);
  };

  const pinInput = (value: string, onChange: (v: string) => void, onEnter?: () => void) => (
    <input type="password" inputMode="numeric" maxLength={4} placeholder="••••"
      value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      onKeyDown={e => e.key === 'Enter' && onEnter?.()}
      style={{ ...S.inp, letterSpacing: '0.4em', fontSize: '1.4rem', textAlign: 'center' }} autoFocus />
  );

  const backBtn = (toStep: AuthStep, label = '← Back') => (
    <div style={{ textAlign: 'center' }}>
      <button onClick={() => { setStep(toStep); setError(''); }} style={S.linkBtn}>{label}</button>
    </div>
  );

  const showDropdown = allUsers.length > 0 && allUsers.length < 10;

  return (
    <div style={S.authPage}>
      <div style={S.authCard}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.75rem', marginBottom: '0.3rem' }}>🏆</div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#78350f' }}>Ladder League</h1>
          <p style={{ margin: '0.3rem 0 0', color: '#6b7280', fontSize: '0.88rem' }}>Compete. Track. Dominate.</p>
        </div>

        {step === 'phone' && (<>
          <div style={S.fieldGroup}>
            <label style={S.label}>Who are you?</label>
            {showDropdown ? (
              <select
                style={{ ...S.inp, cursor: 'pointer' }}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                autoFocus
              >
                <option value="">— Select your name —</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.phone}>
                    {u.firstName} {u.lastName} · {u.phone}
                  </option>
                ))}
              </select>
            ) : (
              <input type="tel" placeholder="e.g. 7321234567" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handlePhoneContinue()}
                style={S.inp} autoFocus />
            )}
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={() => handlePhoneContinue()} style={S.primaryBtn} disabled={loading || !phone}>
            {loading ? 'Checking…' : 'Continue →'}
          </button>
          {IS_LOCAL && (
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const data = await loginWithPin('7327184414', '0000');
                    if (data.success) onAuth(data.user);
                    else setError('Demo login failed.');
                  } catch { setError('Could not reach server.'); }
                  setLoading(false);
                }}
                style={{ ...S.linkBtn, fontSize: '0.82rem', color: '#9ca3af' }}
                disabled={loading}
              >
                🎮 Demo login
              </button>
            </div>
          )}
        </>)}

        {step === 'pin' && (<>
          <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
            Welcome back! Enter your 4-digit PIN.
          </p>
          <div style={S.fieldGroup}>
            <label style={S.label}>PIN</label>
            {pinInput(pin, setPin, handlePinLogin)}
            <p style={{ margin: '0.4rem 0 0', textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af' }}>
              💡 Default PIN is <strong>0000</strong> if you haven't changed it
            </p>
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={handlePinLogin} style={S.primaryBtn} disabled={loading}>
            {loading ? 'Verifying…' : 'Log In →'}
          </button>
          <div style={{ textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button onClick={() => { setStep('forgot'); setError(''); }} style={S.linkBtn}>Forgot PIN?</button>
            {backBtn('phone', '← Change')}
          </div>
        </>)}

        {step === 'forgot' && (<>
          <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
            We'll send a 4-digit reset code to the email on your account.
          </p>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={handleRequestReset} style={S.primaryBtn} disabled={loading}>
            {loading ? 'Sending…' : 'Send Reset Code'}
          </button>
          {backBtn('pin')}
        </>)}

        {step === 'reset-code' && (<>
          {info && <div style={S.successBox}>{info}</div>}
          <div style={S.fieldGroup}>
            <label style={S.label}>Reset Code</label>
            <input type="text" inputMode="numeric" maxLength={4} placeholder="4-digit code"
              value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...S.inp, letterSpacing: '0.4em', fontSize: '1.4rem', textAlign: 'center' }} autoFocus />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>New PIN</label>
            {pinInput(newPin, setNewPin, handleVerifyReset)}
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={handleVerifyReset} style={S.primaryBtn} disabled={loading}>
            {loading ? 'Verifying…' : 'Reset PIN & Log In →'}
          </button>
          {backBtn('forgot')}
        </>)}

        {step === 'signup-name' && (<>
          <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
            New here — let's set up your account.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={S.fieldGroup}>
              <label style={S.label}>First Name</label>
              <input type="text" placeholder="First" value={firstName}
                onChange={e => setFirstName(e.target.value)} style={S.inp} autoFocus />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Last Name</label>
              <input type="text" placeholder="Last" value={lastName}
                onChange={e => setLastName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && firstName && lastName) { setError(''); setStep('signup-email'); } }} style={S.inp} />
            </div>
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={() => { if (!firstName || !lastName) { setError('Name is required.'); return; } setError(''); setStep('signup-email'); }} style={S.primaryBtn}>
            Next →
          </button>
          {backBtn('phone')}
        </>)}

        {step === 'signup-email' && (<>
          <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
            Add your email for PIN resets.
          </p>
          <div style={S.fieldGroup}>
            <label style={S.label}>Email Address</label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && email.includes('@')) { setError(''); setStep('signup-pin'); } }}
              style={S.inp} autoFocus />
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={() => { if (!email || !email.includes('@')) { setError('Valid email is required.'); return; } setError(''); setStep('signup-pin'); }} style={S.primaryBtn}>
            Next →
          </button>
          {backBtn('signup-name')}
        </>)}

        {step === 'signup-pin' && (<>
          <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
            Choose a 4-digit PIN for future logins.
          </p>
          <div style={S.fieldGroup}>
            <label style={S.label}>PIN</label>
            {pinInput(pin, setPin)}
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Confirm PIN</label>
            {pinInput(pinConfirm, setPinConfirm, handleSignup)}
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={handleSignup} style={S.primaryBtn} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account →'}
          </button>
          {backBtn('signup-email')}
        </>)}
      </div>
    </div>
  );
}

export default AuthFlow;
