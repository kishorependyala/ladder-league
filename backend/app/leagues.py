"""
League and match storage helpers.

Data layout:
  data/sports/{sport}/leagues/{leagueId}.json
  data/sports/{sport}/leagues/{leagueId}/matches/{matchId}.json
  data/config/superadmins.json
"""
import json
import os
from datetime import datetime
from typing import Optional
from copy import deepcopy

SPORTS = ["tennis", "table-tennis", "pickleball", "badminton"]
SPORT_LABELS = {
    "tennis": "Tennis",
    "table-tennis": "Table Tennis",
    "pickleball": "Pickleball",
    "badminton": "Badminton",
}

# Scoring format per sport:
#   unit          - "set" (tennis) or "game" (others)
#   wins_needed   - units needed to win the match
#   max_units     - maximum units in a match (e.g. 3 for best-of-3)
#   points_to_win - target score per unit
#   win_by        - margin required
#   max_points    - hard ceiling (None = no ceiling)
SPORT_SCORING = {
    "tennis": {
        "unit": "set", "unit_plural": "sets",
        "wins_needed": 2, "max_units": 3,
        "points_to_win": 6, "win_by": 2, "max_points": 7,
    },
    "table-tennis": {
        "unit": "game", "unit_plural": "games",
        "wins_needed": 3, "max_units": 5,
        "points_to_win": 11, "win_by": 2, "max_points": None,
    },
    "pickleball": {
        "unit": "game", "unit_plural": "games",
        "wins_needed": 2, "max_units": 3,
        "points_to_win": 11, "win_by": 2, "max_points": None,
    },
    "badminton": {
        "unit": "game", "unit_plural": "games",
        "wins_needed": 2, "max_units": 3,
        "points_to_win": 21, "win_by": 2, "max_points": 30,
    },
}


def _resolve_scoring_cfg(sport: str, scoring_format: Optional[dict] = None) -> dict:
    """Merge sport defaults with any per-league scoringFormat overrides."""
    base = dict(SPORT_SCORING.get(sport, SPORT_SCORING["tennis"]))
    if scoring_format:
        base.update({k: v for k, v in scoring_format.items() if v is not None})
    return base


def unit_winner(me: int, opp: int, sport: str, scoring_format: Optional[dict] = None) -> Optional[str]:
    """Return 'me', 'opp', or None if the set/game is not yet decided."""
    cfg = _resolve_scoring_cfg(sport, scoring_format)
    hi, lo = max(me, opp), min(me, opp)
    side = "me" if me > opp else "opp"
    if cfg["unit"] == "set":  # tennis-style
        if hi == 6 and lo <= 4: return side
        if hi == 7 and lo in (5, 6): return side
        return None
    else:
        ptw, wb, mx = cfg["points_to_win"], cfg["win_by"], cfg["max_points"]
        if hi >= ptw and (hi - lo) >= wb: return side
        if mx and hi >= mx: return side
        return None


def compute_match_winner(sets: list, sport: str, scoring_format: Optional[dict] = None) -> Optional[str]:
    """Return 'submitter', 'opponent', or None from a list of {me, opp} dicts."""
    cfg = _resolve_scoring_cfg(sport, scoring_format)
    me_wins = opp_wins = 0
    for s in sets:
        w = unit_winner(s.get("me", 0), s.get("opp", 0), sport, scoring_format)
        if w == "me": me_wins += 1
        elif w == "opp": opp_wins += 1
    wn = cfg["wins_needed"]
    if me_wins >= wn: return "submitter"
    if opp_wins >= wn: return "opponent"
    return None


def _data_dir() -> str:
    from app.main import DATA_DIR
    return DATA_DIR


def _sports_dir() -> str:
    return os.path.join(_data_dir(), "sports")


def _league_dir(sport: str, league_id: str) -> str:
    return os.path.join(_sports_dir(), sport, "leagues", league_id)


def _league_path(sport: str, league_id: str) -> str:
    """League config lives at {leagueId}/league.json."""
    return os.path.join(_league_dir(sport, league_id), "league.json")


def _matches_path(sport: str, league_id: str) -> str:
    """All matches for a league in a single {leagueId}/matches.json array."""
    return os.path.join(_league_dir(sport, league_id), "matches.json")


def _availability_path(sport: str, league_id: str) -> str:
    """Player availability slots stored as {leagueId}/availability.json."""
    return os.path.join(_league_dir(sport, league_id), "availability.json")


def _rankings_path(sport: str, league_id: str) -> str:
    """Ranking snapshots stored as {leagueId}/rankings.json."""
    return os.path.join(_league_dir(sport, league_id), "rankings.json")


def load_league_rankings(sport: str, league_id: str) -> dict:
    """Load saved ranking snapshots. Returns {initial: ..., rounds: [...]}."""
    path = _rankings_path(sport, league_id)
    if not os.path.exists(path):
        return {"initial": None, "rounds": []}
    with open(path, "r") as f:
        return json.load(f)


def save_league_rankings(sport: str, league_id: str, data: dict) -> None:
    """Persist ranking snapshots to rankings.json."""
    path = _rankings_path(sport, league_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def get_league_availability(sport: str, league_id: str) -> list:
    """Return all players' availability entries for a league."""
    path = _availability_path(sport, league_id)
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def save_player_availability(sport: str, league_id: str, player_id: str, slots: list, updated_at: str) -> dict:
    """Upsert a player's availability slots. Returns the saved entry."""
    all_avail = get_league_availability(sport, league_id)
    entry = {"playerId": player_id, "slots": slots, "updatedAt": updated_at}
    all_avail = [a for a in all_avail if a.get("playerId") != player_id]
    all_avail.append(entry)
    path = _availability_path(sport, league_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(all_avail, f, indent=2)
    return entry


def _config_dir() -> str:
    return os.path.join(_data_dir(), "config")


# ── ID generation ──────────────────────────────────────────────────

def _next_id(directory: str, prefix: str = "") -> str:
    """Generate yyyyMMdd + 10-digit sequence ID, scanning existing files."""
    os.makedirs(directory, exist_ok=True)
    today = datetime.now().strftime("%Y%m%d")
    tag = today if not prefix else f"{prefix}{today}"
    existing = [
        f[len(tag): len(tag) + 10]
        for f in os.listdir(directory)
        if f.startswith(tag) and f.endswith(".json") and len(f) == len(tag) + 15
    ]
    seq = max((int(s) for s in existing if s.isdigit()), default=0) + 1
    return f"{tag}{seq:010d}"


def next_league_id(sport: str) -> str:
    leagues_dir = os.path.join(_sports_dir(), sport, "leagues")
    os.makedirs(leagues_dir, exist_ok=True)
    today = datetime.now().strftime("%Y%m%d")
    tag = f"{sport}_{today}"
    # Scan both .json files (legacy) and directories (current folder layout)
    existing = []
    for entry in os.listdir(leagues_dir):
        if entry.startswith(tag):
            suffix = entry[len(tag):]
            # Strip .json extension for legacy flat files
            if suffix.endswith(".json"):
                suffix = suffix[:-5]
            if len(suffix) == 10 and suffix.isdigit():
                existing.append(int(suffix))
    seq = max(existing, default=0) + 1
    return f"{tag}{seq:010d}"


def next_match_id(sport: str, league_id: str) -> str:
    """IDs are still timestamp-based; we just use the league dir for uniqueness."""
    ldir = _league_dir(sport, league_id)
    os.makedirs(ldir, exist_ok=True)
    existing_matches = _load_matches_raw(sport, league_id)
    today = datetime.now().strftime("%Y%m%d")
    existing = [
        m["id"][len(today): len(today) + 10]
        for m in existing_matches
        if m.get("id", "").startswith(today) and len(m.get("id", "")) == len(today) + 10
    ]
    seq = max((int(s) for s in existing if s.isdigit()), default=0) + 1
    return f"{today}{seq:010d}"


# ── League CRUD ────────────────────────────────────────────────────

def save_league(league: dict):
    sport = league["sport"]
    lid = league["id"]
    path = _league_path(sport, lid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(league, f, indent=2)


def delete_league(league_id: str) -> bool:
    """Delete a league folder (league.json + matches.json) by ID."""
    for sport in SPORTS:
        ldir = _league_dir(sport, league_id)
        league_file = _league_path(sport, league_id)
        if os.path.exists(league_file):
            import shutil
            shutil.rmtree(ldir)
            return True
    return False


def get_league(sport: str, league_id: str) -> Optional[dict]:
    path = _league_path(sport, league_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def get_league_by_id(league_id: str) -> Optional[dict]:
    """Search all sports for a league by ID."""
    for sport in SPORTS:
        lg = get_league(sport, league_id)
        if lg:
            return lg
    return None


def list_leagues(sport: Optional[str] = None) -> list:
    sports = [sport] if sport else SPORTS
    leagues = []
    for s in sports:
        d = os.path.join(_sports_dir(), s, "leagues")
        if not os.path.exists(d):
            continue
        for entry in sorted(os.listdir(d)):
            league_file = os.path.join(d, entry, "league.json")
            if os.path.isdir(os.path.join(d, entry)) and os.path.exists(league_file):
                with open(league_file) as f:
                    leagues.append(json.load(f))
    return leagues


# ── Match CRUD ─────────────────────────────────────────────────────

def _load_matches_raw(sport: str, league_id: str) -> list:
    path = _matches_path(sport, league_id)
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def _save_matches_raw(sport: str, league_id: str, matches: list):
    path = _matches_path(sport, league_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(matches, f, indent=2)


def save_match(match: dict):
    """Upsert a match into the league's matches.json. Adds datePlayed if missing."""
    if "datePlayed" not in match or not match["datePlayed"]:
        match["datePlayed"] = (match.get("resolvedAt") or match.get("submittedAt") or
                               datetime.now().isoformat())[:10]
    sport = match["sport"]
    lid = match["leagueId"]
    matches = _load_matches_raw(sport, lid)
    idx = next((i for i, m in enumerate(matches) if m["id"] == match["id"]), None)
    if idx is not None:
        matches[idx] = match
    else:
        matches.append(match)
    _save_matches_raw(sport, lid, matches)


def get_match(sport: str, league_id: str, match_id: str) -> Optional[dict]:
    matches = _load_matches_raw(sport, league_id)
    return next((m for m in matches if m["id"] == match_id), None)


def list_matches(sport: str, league_id: str) -> list:
    return _load_matches_raw(sport, league_id)


def delete_match(sport: str, league_id: str, match_id: str) -> Optional[dict]:
    """Remove a match by ID. Returns the deleted match, or None if not found."""
    matches = _load_matches_raw(sport, league_id)
    target = next((m for m in matches if m["id"] == match_id), None)
    if target is None:
        return None
    _save_matches_raw(sport, league_id, [m for m in matches if m["id"] != match_id])
    return target


def get_pending_matches_for_user(user_id: str) -> list:
    """Return all pending matches relevant to this user (opponent, submitter, or doubles participant)."""
    pending = []
    seen_ids: set = set()

    def _add(m):
        if m["id"] not in seen_ids:
            seen_ids.add(m["id"])
            pending.append(m)

    for league in list_leagues():
        if league.get("status") not in ("active", "playoffs"):
            continue
        for m in list_matches(league["sport"], league["id"]):
            if m.get("status") != "pending":
                continue
            if m.get("matchType") == "doubles":
                all_four = m.get("team1PlayerIds", []) + m.get("team2PlayerIds", [])
                if user_id in all_four:
                    _add(m)
            else:
                requires_both = m.get("requiresBothAccept", False)
                accepted_sides = m.get("acceptedSides", [])
                is_submitter = m.get("submitterId") == user_id
                is_opponent = m.get("opponentId") == user_id
                if requires_both:
                    if (is_opponent and "opponent" not in accepted_sides) or \
                       (is_submitter and "submitter" not in accepted_sides):
                        _add(m)
                else:
                    # Show to both opponent (needs to confirm) and submitter (to track status)
                    if is_opponent or is_submitter:
                        _add(m)
    return pending


# ── Data migration ─────────────────────────────────────────────────

def migrate_to_folder_layout(data_dir: str):
    """
    One-time migration: convert old flat-file layout to folder layout.

    Old:  sports/{sport}/leagues/{leagueId}.json
          sports/{sport}/leagues/{leagueId}/matches/{matchId}.json

    New:  sports/{sport}/leagues/{leagueId}/league.json
          sports/{sport}/leagues/{leagueId}/matches.json
    """
    import shutil
    sports_root = os.path.join(data_dir, "sports")
    if not os.path.exists(sports_root):
        return

    for sport in SPORTS:
        leagues_dir = os.path.join(sports_root, sport, "leagues")
        if not os.path.exists(leagues_dir):
            continue

        for entry in os.listdir(leagues_dir):
            entry_path = os.path.join(leagues_dir, entry)

            # ── Migrate flat {leagueId}.json → {leagueId}/league.json ──
            if entry.endswith(".json") and os.path.isfile(entry_path):
                league_id = entry[:-5]
                new_dir = os.path.join(leagues_dir, league_id)
                new_league_path = os.path.join(new_dir, "league.json")
                os.makedirs(new_dir, exist_ok=True)
                if not os.path.exists(new_league_path):
                    shutil.move(entry_path, new_league_path)
                    print(f"[MIGRATE] {sport}/{entry} → {league_id}/league.json")
                else:
                    os.remove(entry_path)  # already migrated, remove old flat file

            # ── Migrate {leagueId}/matches/{matchId}.json → {leagueId}/matches.json ──
            if os.path.isdir(entry_path):
                league_id = entry
                old_matches_dir = os.path.join(entry_path, "matches")
                new_matches_path = os.path.join(entry_path, "matches.json")

                if os.path.isdir(old_matches_dir) and not os.path.exists(new_matches_path):
                    matches = []
                    for mfile in sorted(os.listdir(old_matches_dir)):
                        if mfile.endswith(".json"):
                            with open(os.path.join(old_matches_dir, mfile)) as f:
                                m = json.load(f)
                            # Add datePlayed if missing
                            if "datePlayed" not in m or not m["datePlayed"]:
                                m["datePlayed"] = (
                                    m.get("resolvedAt") or m.get("submittedAt") or ""
                                )[:10]
                            matches.append(m)
                    with open(new_matches_path, "w") as f:
                        json.dump(matches, f, indent=2)
                    shutil.rmtree(old_matches_dir)
                    print(f"[MIGRATE] {sport}/{league_id}/matches/ ({len(matches)} matches) → matches.json")


# ── Super admin ────────────────────────────────────────────────────

def load_superadmin_phones() -> list:
    path = os.path.join(_config_dir(), "superadmins.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f).get("superAdminPhones", [])


def is_super_admin(phone: str) -> bool:
    return phone in load_superadmin_phones()


def add_super_admin(phone: str):
    path = os.path.join(_config_dir(), "superadmins.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    phones = load_superadmin_phones()
    if phone not in phones:
        phones.append(phone)
        with open(path, "w") as f:
            json.dump({"superAdminPhones": phones}, f, indent=2)


def _playoff_group_name(index: int) -> str:
    name = ""
    value = index
    while True:
        name = chr(ord("A") + (value % 26)) + name
        value = value // 26 - 1
        if value < 0:
            return f"Group {name}"


def _split_playoff_player_ids(player_ids: list[str]) -> list[list[str]]:
    total = len(player_ids)
    if total <= 0:
        return []
    if total == 1:
        return [player_ids[:]]
    if total == 2:
        return [player_ids[:2]]

    base_size = 3 if total < 8 else 4
    full_groups = total // base_size
    remainder = total % base_size

    if remainder == 0:
        sizes = [base_size] * full_groups
    elif remainder == 1 and full_groups >= 1:
        sizes = [base_size] * (full_groups - 1) + [base_size - 1, 2]
    else:
        sizes = [base_size] * full_groups + [remainder]

    groups = []
    cursor = 0
    for size in sizes:
        groups.append(player_ids[cursor:cursor + size])
        cursor += size
    return [group for group in groups if group]


def generate_playoffs(league_doc: dict, standings: list[dict]) -> dict:
    ranked_player_ids = [
        row.get("player", {}).get("id")
        for row in sorted(standings, key=lambda row: row.get("rank", 999999))
        if row.get("player", {}).get("id")
    ]
    groups = []

    for index, group_player_ids in enumerate(_split_playoff_player_ids(ranked_player_ids)):
        matchup_map = {}
        if len(group_player_ids) >= 4:
            matchup_map = {
                "sf1": {"side1Seed": 0, "side2Seed": 3, "matchId": None, "winnerId": None},
                "sf2": {"side1Seed": 1, "side2Seed": 2, "matchId": None, "winnerId": None},
                "final": {"fromSfs": ["sf1", "sf2"], "matchId": None, "winnerId": None},
            }
        elif len(group_player_ids) == 3:
            matchup_map = {
                "sf1": {"side1Seed": 1, "side2Seed": 2, "matchId": None, "winnerId": None},
                "final": {"side1Seed": 0, "fromSfs": ["sf1"], "matchId": None, "winnerId": None},
            }
        elif len(group_player_ids) == 2:
            matchup_map = {
                "final": {"side1Seed": 0, "side2Seed": 1, "matchId": None, "winnerId": None},
            }

        groups.append({
            "name": _playoff_group_name(index),
            "playerIds": group_player_ids,
            "matchups": matchup_map,
        })

    updated_league = deepcopy(league_doc)
    updated_league["playoffs"] = {
        "groups": groups,
        "generatedAt": datetime.now().isoformat(),
    }
    return updated_league


# ── Ranking ────────────────────────────────────────────────────────

def compute_final_ranking(league: dict) -> list:
    """
    Average position: each player's submitted ranking contributes positional scores.
    Lower average position = higher final rank.
    Players not ranked by a voter are placed last.
    Only votes from players currently in the league are counted (stale votes ignored).
    """
    player_ids = [p["id"] for p in league.get("players", [])]
    player_id_set = set(player_ids)
    n = len(player_ids)
    submissions = league.get("stackRanks", {})  # { userId: [playerId, ...] }

    scores: dict = {pid: 0.0 for pid in player_ids}
    voters = 0

    for voter_id, ranked_list in submissions.items():
        if voter_id not in player_id_set:  # skip stale votes from removed players
            continue
        voters += 1
        # Assign position score (1 = best). Unranked players get n+1.
        positions = {pid: (ranked_list.index(pid) + 1) if pid in ranked_list else n + 1
                     for pid in player_ids}
        for pid, pos in positions.items():
            scores[pid] += pos

    if voters == 0:
        return player_ids  # no submissions — keep original order

    return sorted(player_ids, key=lambda pid: scores[pid])


# ── Legacy migration ───────────────────────────────────────────────

def migrate_legacy_leagues(data_dir: str):
    """One-time: convert old leagues.json {leagueName: [members]} into new format."""
    legacy = os.path.join(data_dir, "leagues.json")
    if not os.path.exists(legacy):
        return

    with open(legacy) as f:
        old = json.load(f)

    if not isinstance(old, dict):
        return

    # Detect if already migrated (values are lists of member dicts)
    # Skip if already migrated marker exists
    marker = legacy + ".migrated"
    if os.path.exists(marker):
        return

    from app.main import get_user_by_phone

    sport_map = {
        "tennis": "tennis",
        "badminton": "badminton",
        "pickleball": "pickleball",
        "table-tennis": "table-tennis",
        "table tennis": "table-tennis",
    }

    migrated = 0
    for league_name, members in old.items():
        # Guess sport from name
        sport = "tennis"
        lower = league_name.lower()
        for key, val in sport_map.items():
            if key in lower:
                sport = val
                break

        leagues_dir = os.path.join(data_dir, "sports", sport, "leagues")
        os.makedirs(leagues_dir, exist_ok=True)
        lid = _next_id(leagues_dir)

        # Resolve member user IDs
        player_list = []
        for m in members:
            u = get_user_by_phone(m.get("phone", ""))
            if u:
                player_list.append({"id": u["id"], "phone": u["phone"],
                                     "firstName": u["firstName"], "lastName": u["lastName"]})

        league_doc = {
            "id": lid,
            "name": league_name,
            "sport": sport,
            "status": "active",
            "adminIds": [],
            "players": player_list,
            "startDate": None,
            "endDate": None,
            "rules": default_rules(),
            "stackRanks": {},
            "finalRanking": [p["id"] for p in player_list],
            "createdAt": datetime.now().isoformat(),
        }
        path = os.path.join(leagues_dir, f"{lid}.json")
        with open(path, "w") as f:
            json.dump(league_doc, f, indent=2)
        migrated += 1

    if migrated:
        os.rename(legacy, marker)
        print(f"[MIGRATE] Converted {migrated} leagues from leagues.json → sports/")


def default_rules() -> dict:
    return {
        "blockDurationDays": 7,
        "playoffsWeeks": 1,
        "minGamesPerBlock": 1,
        "penaltyForNoGame": 1,
        "scoring": {
            "win": 3,
            "loss": 0,
            "noGame": -1,
        },
        "scoringFormat": None,
        "matchFormat": "adhoc",
        "minMatchesPerWeek": 1,
        "penaltyPerMissedWeek": 1,
        "upsetBonus": 1,
        # joinPolicy controls when players can self-join:
        #   'draft_only'         - only while league is in draft (default)
        #   'until_ranked'       - open during draft + ranking phases
        #   'until_complete'     - open at any time until league completes
        #   'admin_only'         - no self-join; admin must add manually
        "joinPolicy": "draft_only",
        # newPlayerRankPolicy: where a late-joining player lands in standings
        #   'bottom'       - placed last (safest, default)
        #   'middle'       - placed at midpoint of current standings
        #   'provisional'  - placed at midpoint, marked provisional for N matches
        #   'admin_set'    - left unranked until admin manually assigns a position
        "newPlayerRankPolicy": "bottom",
        # lateJoinCap: max number of players who can join after draft (null = unlimited)
        "lateJoinCap": None,
        # lastSetIsTiebreak: when True, the final set/game of a max-unit match is treated
        # as a match tiebreak — it counts as exactly 1 game (winner) / 0 (loser) and does
        # NOT contribute to sets_won / sets_lost.
        "lastSetIsTiebreak": False,
    }
