import { useEffect, useState } from 'react';
import { getAppConfig, type AppConfig } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { phone: string };

export default function AppConfigView({ phone }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getAppConfig(phone)
      .then(res => { if (res.success) setConfig(res.config); else setError(res.message || 'Failed'); })
      .catch(e => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [phone]);

  if (loading) return <div style={S.card}><p style={mutedText}>Loading config…</p></div>;
  if (error) return <div style={S.errorBox}>{error}</div>;
  if (!config) return null;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Environment */}
      <Section title="🌐 Environment">
        <Row label="Environment" value={config.environment} highlight={config.environment !== 'local'} />
        <Row label="Data directory" value={config.dataDir} mono />
        <Row label="Python version" value={config.pythonVersion.split(' ')[0]} mono />
      </Section>

      {/* Data summary */}
      <Section title="📊 Data summary">
        <Row label="Total users" value={String(config.userCount)} />
        <Row label="Total data files" value={String(config.totalDataFiles)} />
        {config.sports.map(s => (
          <Row key={s.id} label={`Leagues — ${s.label}`} value={String(config.leagueCountBySport[s.id] ?? 0)} />
        ))}
      </Section>

      {/* Super admins */}
      <Section title="🔐 Super admins">
        {config.superAdmins.length === 0
          ? <p style={mutedText}>No super admins configured.</p>
          : config.superAdmins.map((phone, i) => (
            <div key={i} style={{ padding: '0.4rem 0.6rem', background: '#fef3c7', borderRadius: '0.5rem', fontFamily: 'monospace', fontSize: '0.88rem', color: '#78350f' }}>
              {phone}
            </div>
          ))}
      </Section>

      {/* Sports & scoring */}
      <Section title="🏓 Sports & default scoring">
        {config.sports.map(s => {
          const sc = config.sportScoring[s.id];
          return (
            <div key={s.id} style={{ padding: '0.6rem 0.75rem', background: '#fffbeb', borderRadius: '0.6rem', border: '1px solid #fde68a', display: 'grid', gap: '0.25rem' }}>
              <strong style={{ color: '#78350f' }}>{s.label}</strong>
              {sc && (
                <span style={{ ...mutedText, fontSize: '0.82rem' }}>
                  {sc.wins_needed} {sc.unit_plural} to win · {sc.points_to_win} pts/{sc.unit} · win by {sc.win_by}
                  {sc.max_points ? ` · cap ${sc.max_points}` : ''}
                </span>
              )}
            </div>
          );
        })}
      </Section>

      {/* Default rules */}
      <Section title="⚖️ Default league rules">
        <pre style={{ background: '#0f172a', color: '#a3e635', borderRadius: '0.75rem', padding: '1rem', fontSize: '0.78rem', overflowX: 'auto', margin: 0, lineHeight: 1.5 }}>
          {JSON.stringify(config.defaultRules, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...S.card, display: 'grid', gap: '0.65rem' }}>
      <h3 style={{ ...subheading, margin: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.3rem 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ ...mutedText, fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? '0.82rem' : '0.88rem', fontWeight: 600, color: highlight ? '#16a34a' : '#78350f', wordBreak: 'break-all', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}
