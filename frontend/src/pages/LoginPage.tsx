import { useState, type FormEvent } from 'react';
import { Lock, LogIn, User } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { errorText } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

import { NetworkBackground } from './NetworkBackground';

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorText(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__aurora" />
      <NetworkBackground />
      <main className="login__card">
        <div className="login__brand">
          <img src="/xcore-mark.svg" alt="" />
          <div>
            <div className="login__title">X-Core</div>
          </div>
        </div>
        <p className="login__tag">The Business Excellence Platform · Enterprise Management Platform</p>
        <span className="login__module">Process Hub</span>
        <form onSubmit={submit} noValidate>
          <label className="field">
            <span>
              <User size={12} /> Username
            </span>
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={150}
              autoFocus
            />
          </label>
          <label className="field">
            <span>
              <Lock size={12} /> Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={256}
            />
          </label>
          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}
          <button className="btn" disabled={busy || !username || !password}>
            <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login__foot">
          <span>Protected system · activity is audited</span>
          <img src="/al-ayuni-logo.png" alt="Al-Ayuni" />
        </div>
      </main>
    </div>
  );
}
