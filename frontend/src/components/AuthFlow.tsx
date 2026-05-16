import { useEffect, useRef, useState } from 'react';
import { authCheckPhone, getAllUsers, loginWithPin, requestPinReset, signup, verifyPinReset, type User } from '../api';
import { SPORT_SCORING } from '../api';
import { S } from '../theme';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const SPORTS = Object.entries(SPORT_SCORING).map(([id]) => {
  const labels: Record<string, string> = { tennis: 'Tennis 🎾', 'table-tennis': 'Table Tennis 🏓', pickleball: 'Pickleball 🥒', badminton: 'Badminton 🏸' };
  return { id, label: labels[id] ?? id };
});

type AuthStep = 'phone' | 'pin' | 'forgot' | 'reset-code' | 'signup-name' | 'signup-email' | 'signup-sport' | 'signup-pin';

function AuthFlow({ onAuth }: { onAuth: (user: User) => void }) {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [query, setQuery] = useState('');          // typeahead input value
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [favoriteSport, setFavoriteSport] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllUsers().then(users => {
      if (Array.isArray(users)) setAllUsers(users);
    }).catch(() => {});
  }, []);

  // Filter users for typeahead
  const suggestions = (() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return allUsers.filter(u => {
      const full = `${u.firstName} ${u.lastName}`.toLowerCase();
      const phone = u.phone.toLowerCase();
      return full.includes(q) || phone.includes(q);
    }).slice(0, 6);
  })();

  // Dismiss suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!suggestionsRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSuggestion = (u: User) => {
    setPhone(u.phone);
    setQuery(`${u.firstName} ${u.lastName}`);
    setShowSuggestions(false);
    handlePhoneContinue(u.phone);
  };

  const handlePhoneContinue = async (overridePhone?: string) => {
    // Try to parse phone from query if no explicit phone
    const rawPhone = overridePhone ?? phone;
    const resolvedPhone = rawPhone || query.replace(/\D/g, '');
    if (!resolvedPhone) { setError('Please enter your name or phone number.'); return; }
    setError(''); setLoading(true);
    try {
      const data = await authCheckPhone(resolvedPhone);
      setPhone(resolvedPhone);
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
      const data = await signup(phone, firstName, lastName, email, pin, favoriteSport || undefined);
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
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Type your name or phone number…"
                value={query}
                onChange={e => { setQuery(e.target.value); setPhone(''); setShowSuggestions(true); setError(''); }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setShowSuggestions(false); handlePhoneContinue(); }
                  if (e.key === 'Escape') setShowSuggestions(false);
                }}
                style={S.inp}
                autoFocus
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: '#fff', borderRadius: '0 0 0.75rem 0.75rem',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    border: '1px solid #fde68a', borderTop: 'none',
                    overflow: 'hidden',
                  }}
                >
                  {suggestions.map(u => (
                    <button
                      key={u.id}
                      onMouseDown={e => { e.preventDefault(); selectSuggestion(u); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.65rem 0.9rem', background: 'none', border: 'none',
                        borderBottom: '1px solid #fef3c7', cursor: 'pointer',
                        textAlign: 'left', gap: '0.5rem',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fffbeb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#92400e', flexShrink: 0 }}>
                          {u.firstName[0]}{u.lastName[0]}
                        </div>
                        <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '0.9rem' }}>{u.firstName} {u.lastName}</span>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                        ···{u.phone.slice(-4)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
              New player? Just enter your phone number to sign up.
            </p>
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={() => handlePhoneContinue()} style={S.primaryBtn} disabled={loading || (!phone && !query.trim())}>
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
              onKeyDown={e => { if (e.key === 'Enter' && email.includes('@')) { setError(''); setStep('signup-sport'); } }}
              style={S.inp} autoFocus />
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
          <button onClick={() => { if (!email || !email.includes('@')) { setError('Valid email is required.'); return; } setError(''); setStep('signup-sport'); }} style={S.primaryBtn}>
            Next →
          </button>
          {backBtn('signup-name')}
        </>)}

        {step === 'signup-sport' && (<>
          <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
            What's your favourite sport? We'll show it by default.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {SPORTS.map(s => (
              <button
                key={s.id}
                onClick={() => setFavoriteSport(favoriteSport === s.id ? '' : s.id)}
                style={{
                  padding: '0.75rem 0.5rem',
                  borderRadius: '0.75rem',
                  border: `2px solid ${favoriteSport === s.id ? '#f59e0b' : '#e5e7eb'}`,
                  background: favoriteSport === s.id ? '#fef3c7' : '#fff',
                  color: favoriteSport === s.id ? '#92400e' : '#374151',
                  fontWeight: favoriteSport === s.id ? 700 : 500,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button onClick={() => setStep('signup-pin')} style={S.primaryBtn}>
            {favoriteSport ? 'Next →' : 'Skip →'}
          </button>
          {backBtn('signup-email')}
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
          {backBtn('signup-sport')}
        </>)}
      </div>
    </div>
  );
}

export default AuthFlow;
