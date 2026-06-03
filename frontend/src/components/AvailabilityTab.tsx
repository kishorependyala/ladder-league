import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLeagueAvailability, saveMyAvailability, type League, type Match, type PlayerAvailability, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

const HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const HOUR_LABELS: Record<number, string> = {
  6: '6–8am', 8: '8–10am', 10: '10am–12', 12: '12–2pm',
  14: '2–4pm', 16: '4–6pm', 18: '6–8pm', 20: '8–10pm',
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Generate the next 7 days (today + 6) as { iso: 'YYYY-MM-DD', label: 'Mon\n2 Jun' } */
function getNext7Days() {
  const days: { iso: string; dayName: string; dateLabel: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayName = DAY_NAMES[d.getDay()];
    const dateLabel = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
    days.push({ iso, dayName, dateLabel });
  }
  return days;
}

function slotId(dateIso: string, hour: number) {
  return `${dateIso}-${String(hour).padStart(2, '0')}`;
}

interface Props {
  league: League;
  user: User;
  matches: Match[];
}

export default function AvailabilityTab({ league, user, matches }: Props) {
  const [availability, setAvailability] = useState<PlayerAvailability[]>([]);
  const [mySlots, setMySlots] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  const days = useMemo(() => getNext7Days(), []);

  const players = league.players ?? [];
  const playerMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of players) m[p.id] = `${p.firstName} ${p.lastName}`;
    return m;
  }, [players]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLeagueAvailability(league.id);
      if (res.success) {
        setAvailability(res.availability ?? []);
        const mine = res.availability?.find(a => a.playerId === user.id);
        setMySlots(new Set(mine?.slots ?? []));
      }
    } catch { setError('Could not load availability.'); }
    setLoading(false);
  }, [league.id, user.id]);

  useEffect(() => { load(); }, [load]);

  const toggleSlot = (slot: string) => {
    setMySlots(prev => {
      const next = new Set(prev);
      next.has(slot) ? next.delete(slot) : next.add(slot);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await saveMyAvailability(league.id, user.phone, Array.from(mySlots));
      if (!res.success) throw new Error(res.message || 'Save failed');
      setMessage('✅ Availability saved!');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error saving.'); }
    setSaving(false);
  };

  const slotOthers = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const avail of availability) {
      if (avail.playerId === user.id) continue;
      for (const s of avail.slots) {
        if (!map[s]) map[s] = [];
        map[s].push(avail.playerId);
      }
    }
    return map;
  }, [availability, user.id]);

  const suggestions = useMemo(() => {
    const acceptedMatches = matches.filter(m => m.status === 'accepted');
    return players
      .filter(p => p.id !== user.id)
      .map(p => {
        const theirSlots = new Set(availability.find(a => a.playerId === p.id)?.slots ?? []);
        const overlap = Array.from(mySlots).filter(s => theirSlots.has(s)).length;
        const h2h = acceptedMatches.filter(m =>
          (m.submitterId === user.id && m.opponentId === p.id) ||
          (m.submitterId === p.id && m.opponentId === user.id)
        ).length;
        return { player: p, overlap, h2h, overlapSlots: Array.from(mySlots).filter(s => theirSlots.has(s)) };
      })
      .filter(s => s.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || a.h2h - b.h2h);
  }, [players, mySlots, availability, matches, user.id]);

  const cellStyle = (slot: string): React.CSSProperties => {
    const isMine = mySlots.has(slot);
    const othersCount = slotOthers[slot]?.length ?? 0;
    const isHovered = hoveredSlot === slot;
    return {
      border: '1px solid #e5e7eb',
      borderRadius: '0.4rem',
      padding: '0.3rem 0.25rem',
      textAlign: 'center',
      cursor: 'pointer',
      fontSize: '0.72rem',
      transition: 'all 0.12s',
      background: isMine
        ? isHovered ? '#d97706' : '#f59e0b'
        : othersCount > 0
          ? isHovered ? '#bbf7d0' : '#dcfce7'
          : isHovered ? '#f3f4f6' : '#fff',
      color: isMine ? '#fff' : othersCount > 0 ? '#166534' : '#9ca3af',
      fontWeight: isMine ? 700 : othersCount > 0 ? 600 : 400,
      minHeight: '2.2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '1px',
      userSelect: 'none',
    };
  };

  /** Format a slot ID like "2026-06-02-06" → "Mon 2 Jun 6–8am" */
  const formatSlotLabel = (slot: string) => {
    const parts = slot.split('-');
    if (parts.length === 4) {
      const iso = `${parts[0]}-${parts[1]}-${parts[2]}`;
      const hour = parseInt(parts[3]);
      const d = new Date(iso + 'T12:00:00');
      return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${HOUR_LABELS[hour] ?? hour}`;
    }
    return slot;
  };

  if (loading) return <p style={mutedText}>Loading availability…</p>;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ ...subheading, margin: 0 }}>📆 Find a Match</h3>
          <p style={{ ...mutedText, fontSize: '0.82rem', marginTop: '0.2rem' }}>Tap slots to mark when you're free. Green = others available.</p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...S.smallBtn, minWidth: 90 }}>
          {saving ? '⏳ Saving…' : '💾 Save'}
        </button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}
      {message && <div style={{ padding: '0.6rem 0.9rem', borderRadius: '0.7rem', background: '#d1fae5', color: '#065f46', fontSize: '0.88rem', fontWeight: 600 }}>{message}</div>}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#6b7280' }}>
        <span><span style={{ background: '#f59e0b', color: '#fff', borderRadius: '0.3rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}>You</span> = your available slots</span>
        <span><span style={{ background: '#dcfce7', color: '#166534', borderRadius: '0.3rem', padding: '0.1rem 0.4rem', fontWeight: 600 }}>3</span> = other players available</span>
      </div>

      {/* Grid — next 7 days */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `74px repeat(7, 1fr)`, gap: '0.25rem', minWidth: 500 }}>
          {/* Header row */}
          <div />
          {days.map(d => (
            <div key={d.iso} style={{ textAlign: 'center', padding: '0.2rem 0.1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#78350f' }}>{d.dayName}</div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}>{d.dateLabel}</div>
            </div>
          ))}

          {/* Slot rows */}
          {HOURS.map(hour => (
            <>
              <div key={`label-${hour}`} style={{ display: 'flex', alignItems: 'center', fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, paddingRight: '0.3rem' }}>
                {HOUR_LABELS[hour]}
              </div>
              {days.map(day => {
                const slot = slotId(day.iso, hour);
                const othersHere = slotOthers[slot] ?? [];
                const isMine = mySlots.has(slot);
                return (
                  <div
                    key={slot}
                    style={cellStyle(slot)}
                    onClick={() => toggleSlot(slot)}
                    onMouseEnter={() => setHoveredSlot(slot)}
                    onMouseLeave={() => setHoveredSlot(null)}
                    title={othersHere.length > 0 ? othersHere.map(id => playerMap[id] ?? id).join(', ') : ''}
                  >
                    {isMine && <span>✓</span>}
                    {othersHere.length > 0 && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                        {isMine ? `+${othersHere.length}` : othersHere.length}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Who's available at hovered slot */}
      {hoveredSlot && slotOthers[hoveredSlot]?.length > 0 && (
        <div style={{ padding: '0.6rem 1rem', borderRadius: '0.7rem', background: '#fef3c7', border: '1px solid #fde68a', fontSize: '0.85rem', color: '#78350f' }}>
          <strong>Available {formatSlotLabel(hoveredSlot)}:</strong>{' '}
          {slotOthers[hoveredSlot].map(id => playerMap[id] ?? id).join(', ')}
        </div>
      )}

      {/* Suggested matchups */}
      {mySlots.size > 0 && (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <h4 style={{ ...subheading, margin: 0, fontSize: '1rem' }}>🎾 Suggested Opponents</h4>
          {suggestions.length === 0 ? (
            <p style={mutedText}>No players with overlapping availability yet. Check back after others set their slots!</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {suggestions.map(({ player, overlap, h2h, overlapSlots }) => (
                <div key={player.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.75rem 1rem', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <strong style={{ color: '#78350f' }}>{player.firstName} {player.lastName}</strong>
                    {h2h === 0 && <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', background: '#fde68a', color: '#92400e', borderRadius: '999px', padding: '0.1rem 0.5rem', fontWeight: 700 }}>Haven't played yet!</span>}
                    <div style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      {overlapSlots.slice(0, 4).map(s => formatSlotLabel(s)).join(' · ')}
                      {overlapSlots.length > 4 && ` +${overlapSlots.length - 4} more`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#6b7280' }}>
                    <div><strong style={{ color: '#16a34a' }}>{overlap}</strong> overlapping slot{overlap !== 1 ? 's' : ''}</div>
                    <div>{h2h} match{h2h !== 1 ? 'es' : ''} played</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
