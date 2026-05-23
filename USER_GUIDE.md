# 🎾 Ladder League — User Guide

> **Ladder League** is a web app for running competitive sports leagues with rankings, playoffs, doubles, and team formats.

---

## 📱 Getting Started

### Login
```
┌─────────────────────────────────────┐
│  Enter your phone number            │
│  ┌───────────────┐                  │
│  │  +1 555-0100  │ → Send PIN       │
│  └───────────────┘                  │
│  Enter 4-digit PIN → Sign in ✓      │
└─────────────────────────────────────┘
```
First-time users are prompted to set their **name** and **PIN** after entering their phone number.

---

## 🏠 Dashboard

```
┌──────────────────────────────────────────────┐
│  🎾 Monroe Tennis Ladder League   [+Join]     │
│  Status: ACTIVE  ·  Players: 12  ·  Wk 3/8   │
│  [Open League →]                              │
├──────────────────────────────────────────────┤
│  🎾 Doubles Summer League         [+Join]     │
│  Status: RANKING  ·  Players: 8               │
│  [Open League →]                              │
└──────────────────────────────────────────────┘
```

| Badge | Meaning |
|-------|---------|
| `DRAFT` | League created, not yet started |
| `RANKING` | Players establishing seed rankings |
| `ACTIVE` | Season in progress |
| `PLAYOFFS` | Top players in bracket |
| `COMPLETED` | Season over |

---

## 🏆 League Lifecycle

```
  [DRAFT] ──► [RANKING] ──► [ACTIVE] ──► [PLAYOFFS] ──► [COMPLETED]
     │              │
     │         Players submit
     │         ranking matches
     │         Admin freezes ranks
     └── Admin starts when ready
```

---

## 📊 Standings Tab

```
┌───┬──────────────┬───┬───┬───┬──────┐
│ # │ Player       │ W │ L │Pts│ Trend│
├───┼──────────────┼───┼───┼───┼──────┤
│ 1 │ Kishore P.   │ 8 │ 1 │26 │  ↑   │
│ 2 │ Ganesh M.    │ 6 │ 3 │19 │  →   │
│ 3 │ Dickson R.   │ 5 │ 4 │16 │  ↓   │
└───┴──────────────┴───┴───┴──────────┘
```

**Tiebreaker order:** Points → Wins → Head-to-head

**Upset Bonus 🌟** — Beating a higher-ranked player earns +1 bonus point.

---

## 🎯 Submitting a Match (Singles)

```
  [📋 Schedule Tab] → [Submit Result]
       │
       ▼
  Select opponent → Enter score → Add note (optional) → Submit
       │
       ▼
  Opponent sees notification → Accepts or Rejects
       │
       ▼
  ✅ Accepted → Points awarded
  ❌ Rejected → Match voided
```

**Score formats:**
| Format | Example |
|--------|---------|
| Sets (Tennis) | `6-4, 7-5` |
| Games | `21-15` |
| Simple W/L | Win or Loss toggle |

---

## 🏸 Doubles Mode

Two sub-modes are available:

### Ad-hoc Doubles
Players pair up freely each match. Any 4 players form 2 teams per match.

```
Submit Doubles Match:
┌─────────────────────────────────────────┐
│  Team 1: [Player A ▼] + [Player B ▼]   │
│  Team 2: [Player C ▼] + [Player D ▼]   │
│  Score:  6-3, 6-4                       │
│  [Submit →]                             │
└─────────────────────────────────────────┘
```

All 4 players must **accept** before the match counts.

### Fixed Pairs
Admin pre-registers permanent pairs. Pairs compete as a unit throughout the season.

---

## 🏅 Doubles Standings

```
┌───┬─────────────────────┬───┬───┬────┬──────┬──────┬──────┐
│ # │ Pair                │ W │ L │ Pts│ Sets │Games │      │
├───┼─────────────────────┼───┼───┼────┼──────┼──────┼──────┤
│ 1 │ Kishore + Ganesh    │ 5 │ 0 │ 15 │  10  │  86  │  🥇  │
│ 2 │ Dickson + Vinodh    │ 3 │ 2 │  9 │   6  │  71  │      │
└───┴─────────────────────┴───┴───┴────┴──────┴──────┴──────┘
```

**Tiebreaker order:** Points → Wins → Sets Won → Games Won

**🔄 Recalculate button** — recomputes standings on demand.

---

## 📋 Pending Matches

```
┌──────────────────────────────────────────────────┐
│  Match vs Ganesh M.   [6-3, 6-4]   Submitted     │
│  ─────────────────────────────────               │
│  Your action:  [✅ Accept]  [❌ Reject]           │
├──────────────────────────────────────────────────┤
│  Match vs Dickson R.  [6-7, 4-6]   Pending       │
│  ─────────────────────────────────               │
│  Waiting for opponent to confirm…                │
└──────────────────────────────────────────────────┘
```

> **Admin** can always Accept or Reject any match, even if they're a participant.

---

## 👑 Playoffs

```
        Semi-Finals          Final
   ┌──► [1] Kishore ──┐
   │                   ├──► [1] Kishore ──► 🏆 CHAMPION
   │    [4] Player D ──┘         │
   │                         [2] Ganesh
   │    [2] Ganesh ──┐            │
   └──► [3] Dickson ─┘ ◄──────────┘
```

Top N players (configured by admin) advance to bracket playoffs at season end.

---

## 🏆 Team League *(New)*

A multi-phase team format built on top of ranked individual players.

### Phase 1 — Team Formation *(Admin only)*

```
Ranked Players:          Auto-grouped (Snake Draft):
┌──────────────┐         ┌─────────────┐ ┌─────────────┐
│ 1. Kishore   │  Tier 1 │ Team Alpha  │ │ Team Beta   │
│ 2. Ganesh    │ ──────► │  Kishore    │ │  Ganesh     │
├──────────────┤         ├─────────────┤ ├─────────────┤
│ 3. Dickson   │  Tier 2 │  Vinodh     │ │  Dickson    │
│ 4. Vinodh    │ ──────► ├─────────────┤ ├─────────────┤
├──────────────┤         │  ...        │ │  ...        │
│ 5. Player E  │  Tier 3 └─────────────┘ └─────────────┘
│ 6. Player F  │ ──────►  (snake ensures balanced strength)
└──────────────┘
```

Admin can **drag players between teams** and **rename teams** before confirming.

Settings per fixture:
```
  Singles per fixture: [2]   Doubles per fixture: [1]
  → Each fixture has 2 singles + 1 doubles = 3 match points max
```

### Phase 2 — Team League (Round Robin)

```
Round 1:  Alpha vs Beta  │  Gamma vs Delta
Round 2:  Alpha vs Gamma │  Beta  vs Delta
Round 3:  Alpha vs Delta │  Beta  vs Gamma
```

**Points per fixture:**
| Result | Team Pts |
|--------|----------|
| Win    | 3        |
| Draw   | 1        |
| Loss   | 0        |

### Team Standings
```
┌───┬──────────┬───┬───┬───┬──────┬──────┐
│ # │ Team     │ W │ D │ L │  MP  │  Pts │
├───┼──────────┼───┼───┼───┼──────┼──────┤
│ 1 │ Alpha    │ 3 │ 0 │ 0 │  9-3 │  9   │
│ 2 │ Beta     │ 2 │ 0 │ 1 │  7-5 │  6   │
│ 3 │ Gamma    │ 1 │ 0 │ 2 │  5-7 │  3   │
└───┴──────────┴───┴───┴───┴──────┴──────┘
```
MP = Match Points For–Against

### Individual Leaderboard *(within team fixtures)*
```
┌───┬────────────┬──────────┬───┬───┬──────┐
│ # │ Player     │ Team     │ W │ L │  Pts │
├───┼────────────┼──────────┼───┼───┼──────┤
│ 1 │ Kishore P. │ Alpha    │ 6 │ 0 │  18  │
│ 2 │ Ganesh M.  │ Beta     │ 5 │ 1 │  15  │
└───┴────────────┴──────────┴───┴───┴──────┘
```

---

## ⚙️ Admin Actions

### League Management
| Action | Where |
|--------|-------|
| Create league | Dashboard → ➕ New League |
| Edit rules | League → Admin Tab → Rules |
| Start ranking phase | Admin → Start Ranking |
| Freeze rankings | Admin → Finalize Rankings |
| Start season | Admin → Start Season |
| Add/remove players | Admin → Players |

### Match Management
| Action | Where |
|--------|-------|
| Submit on behalf | Schedule Tab → Submit (pick any 2 players) |
| Bulk-accept a match | Pending Tab → ✅ Accept (regardless of participation) |
| Fix legacy match types | Doubles Standings → 🔧 Fix legacy |

### Team League (Admin)
| Action | Where |
|--------|-------|
| Auto-group teams | Team Formation tab → Set # teams → 🔀 Auto-group |
| Adjust teams | Drag players between team cards |
| Confirm & generate fixtures | ✅ Confirm button |
| Tag a match to a fixture | Fixtures tab → Enter Match ID → Tag |
| Recompute fixture result | Fixtures tab → 🔄 Recompute |

---

## 📖 Scoring Reference

```
Default tennis scoring:
  Win  = +3 pts
  Loss =  0 pts
  No game this week = −1 pt
  Upset bonus = +1 pt (beat higher-ranked player)
```

Scoring is fully configurable per league by admin.

---

## 🔑 Roles

| Role | Can do |
|------|--------|
| **Player** | Submit matches, accept/reject own matches, view all tabs |
| **Admin** | Everything above + manage league, accept any match, admin tab |
| **Super Admin** | All leagues, create sports, user management |

---

## 💡 Tips

- 🪙 **Coin Flip** — Use the coin flip tool on the standings page to decide who serves first
- 📈 **Standings Breakdown** — Shows head-to-head matrix (singles leagues)
- 🔄 **Recalculate** — After approving doubles matches, hit Recalculate to refresh standings
- 📱 **Mobile friendly** — Works on phone; tap any player name to see their profile
- 🔗 **Share** — Copy the URL of any league to share with players

---

*Last updated: May 2026 · ladder-league v1*
