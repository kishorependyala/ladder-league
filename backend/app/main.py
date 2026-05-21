from fastapi import FastAPI, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv
import io
import json
import os
import re
import zipfile
from datetime import datetime, timedelta, date

# Load .env from the backend directory (ignored in prod; Azure uses App Service env vars)
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(_BACKEND_DIR, '.env'))

from app.utils.email_sender import send_email
from app.utils.pin_reset import generate_code, verify_code

def normalize_phone(phone: str) -> str:
    """Strip all non-digits and return the last 10 digits (ignores country code)."""
    if not phone:
        return ''
    digits = re.sub(r'\D', '', phone)
    return digits[-10:] if len(digits) >= 10 else digits


def generate_blocks(start_iso: str, block_duration_days: int, end_iso: Optional[str] = None, default_num: int = 8) -> list:
    """
    Generate a list of blocks from start_iso, each block_duration_days long.
    If end_iso is given, blocks span up to that date; otherwise generates default_num blocks.
    Each block: { index, startDate (ISO), endDate (ISO) }
    """
    try:
        start = date.fromisoformat(start_iso[:10])
    except Exception:
        start = date.today()
    end_date = None
    if end_iso:
        try:
            end_date = date.fromisoformat(end_iso[:10])
        except Exception:
            pass

    blocks = []
    current = start
    idx = 0
    while True:
        block_end = current + timedelta(days=block_duration_days)
        if end_date:
            if current >= end_date:
                break
            if block_end > end_date:
                block_end = end_date
        blocks.append({
            "index": idx,
            "startDate": current.isoformat(),
            "endDate": block_end.isoformat(),
        })
        idx += 1
        current = block_end
        if end_date and current >= end_date:
            break
        if not end_date and idx >= default_num:
            break
    return blocks

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class League(BaseModel):
    sport: str
    leagues: List[str]

class Member(BaseModel):
    name: str
    recent: list[str]  # List of last 5 results, e.g., ['Win', 'Loss', ...]
    points: int
    games_played: int

class User(BaseModel):
    phone: str
    firstName: str
    lastName: str
    email: Optional[str] = None
    pin: Optional[str] = None
    favoriteSport: Optional[str] = None

# Resolve DATA_DIR: env var (set by Azure App Service or .env) wins, then repo default.
# Relative paths in DATA_DIR are resolved relative to the backend directory.
_raw_data_dir = os.environ.get('DATA_DIR', '../data')
DATA_DIR = os.path.abspath(os.path.join(_BACKEND_DIR, _raw_data_dir))
SCORES_DIR = os.path.join(DATA_DIR, 'scores')
USERS_DIR = os.path.join(DATA_DIR, 'users')
LEAGUES_FILE = os.path.join(DATA_DIR, 'leagues.json')

# Ensure persistent directories exist on startup (critical for Azure /home mount)
for _d in [DATA_DIR, USERS_DIR, os.path.join(DATA_DIR, 'config'), os.path.join(DATA_DIR, 'sports')]:
    os.makedirs(_d, exist_ok=True)

# ── User storage helpers ────────────────────────────────────────────

def _next_user_id() -> str:
    """Generate a unique user ID: yyyyMMdd + 10-digit sequence (per day)."""
    today = datetime.now().strftime('%Y%m%d')
    os.makedirs(USERS_DIR, exist_ok=True)
    existing = [
        f[8:18] for f in os.listdir(USERS_DIR)
        if f.startswith(today) and f.endswith('.json') and len(f) == 23
    ]
    seq = max((int(s) for s in existing), default=0) + 1
    return f"{today}{seq:010d}"

def load_users() -> list:
    if not os.path.exists(USERS_DIR):
        return []
    users = []
    for fname in sorted(os.listdir(USERS_DIR)):
        if fname.endswith('.json'):
            with open(os.path.join(USERS_DIR, fname), 'r') as f:
                users.append(json.load(f))
    return users

def get_user_by_phone(phone: str) -> Optional[dict]:
    if not os.path.exists(USERS_DIR):
        return None
    normalized = normalize_phone(phone)
    if not normalized:
        return None
    for fname in os.listdir(USERS_DIR):
        if fname.endswith('.json'):
            with open(os.path.join(USERS_DIR, fname), 'r') as f:
                u = json.load(f)
            if normalize_phone(u.get('phone', '')) == normalized:
                return u
    return None

def get_user_by_id(user_id: str) -> Optional[dict]:
    if not os.path.exists(USERS_DIR):
        return None
    path = os.path.join(USERS_DIR, f'{user_id}.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    # Fallback: scan all files (handles id mismatches)
    for fname in os.listdir(USERS_DIR):
        if fname.endswith('.json'):
            with open(os.path.join(USERS_DIR, fname), 'r') as f:
                u = json.load(f)
            if u.get('id') == user_id:
                return u
    return None

def save_user(user: dict):
    os.makedirs(USERS_DIR, exist_ok=True)
    uid = user['id']
    with open(os.path.join(USERS_DIR, f'{uid}.json'), 'w') as f:
        json.dump(user, f, indent=2)

def find_league_player(league: dict, user: dict) -> Optional[dict]:
    """Find a player in a league by matching id first, then phone (handles id mismatches)."""
    for p in league.get("players", []):
        if p["id"] == user["id"] or p.get("phone") == user.get("phone"):
            return p
    return None

def _migrate_legacy_users():
    """One-time migration: move users.json entries into per-file storage."""
    legacy = os.path.join(DATA_DIR, 'users.json')
    if not os.path.exists(legacy):
        return
    with open(legacy, 'r') as f:
        old_users = json.load(f)
    if not old_users:
        return
    os.makedirs(USERS_DIR, exist_ok=True)
    migrated = 0
    for u in old_users:
        if not get_user_by_phone(u['phone']):
            uid = _next_user_id()
            u.setdefault('id', uid)
            u.setdefault('createdAt', datetime.now().isoformat())
            save_user(u)
            migrated += 1
    if migrated:
        os.rename(legacy, legacy + '.migrated')
        print(f"[MIGRATE] Moved {migrated} users from users.json → users/")

_migrate_legacy_users()

from app.leagues import (
    SPORTS, SPORT_LABELS, SPORT_SCORING,
    next_league_id, next_match_id,
    save_league, get_league, get_league_by_id, list_leagues, delete_league,
    save_match, get_match, list_matches, get_pending_matches_for_user,
    is_super_admin, add_super_admin, load_superadmin_phones,
    compute_final_ranking, migrate_legacy_leagues, migrate_to_folder_layout,
    default_rules, compute_match_winner, generate_playoffs,
)

migrate_legacy_leagues(DATA_DIR)
migrate_to_folder_layout(DATA_DIR)

def load_leagues():
    if not os.path.exists(LEAGUES_FILE):
        return {}
    with open(LEAGUES_FILE, 'r') as f:
        return json.load(f)

def save_leagues(leagues):
    with open(LEAGUES_FILE, 'w') as f:
        json.dump(leagues, f, indent=2)


@app.get("/api/auth/check-phone")
def check_phone(phone: str = Query(...)):
    return {"exists": get_user_by_phone(phone) is not None}

@app.post("/api/auth/login-with-pin")
def login_with_pin(data: dict = Body(...)):
    phone = data.get('phone')
    pin = data.get('pin')
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    if user.get('pin') != pin:
        return {"success": False, "message": "Incorrect PIN"}
    return {"success": True, "user": user}

@app.post("/api/auth/request-pin-reset")
def request_pin_reset(data: dict = Body(...)):
    phone = normalize_phone(data.get('phone', ''))
    user = get_user_by_phone(phone)
    if not user or not user.get('email'):
        return {"success": False, "message": "No email on file for this account"}
    code = generate_code(phone)
    sent = send_email(
        user['email'],
        "Ladder League – PIN Reset Code",
        f"Your PIN reset code is: {code}\n\nThis code expires in 15 minutes."
    )
    masked = user['email'][:2] + '***' + user['email'][user['email'].index('@'):]
    return {"success": True, "sent": sent, "maskedEmail": masked}

@app.post("/api/auth/verify-pin-reset")
def verify_pin_reset(data: dict = Body(...)):
    phone = normalize_phone(data.get('phone', ''))
    code = data.get('code')
    new_pin = data.get('newPin')
    if not verify_code(phone, code):
        return {"success": False, "message": "Invalid or expired code"}
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    user['pin'] = new_pin
    save_user(user)
    return {"success": True, "user": user}

@app.post("/api/signup")
def signup(user: User = Body(...)):
    normalized = normalize_phone(user.phone)
    if get_user_by_phone(normalized):
        return {"success": False, "message": "User already exists"}
    uid = _next_user_id()
    user_data = {**user.dict(), "phone": normalized, "id": uid, "createdAt": datetime.now().isoformat()}
    save_user(user_data)
    return {"success": True, "user": user_data}

@app.post("/api/login")
def login(data: dict = Body(...)):
    phone = data.get('phone')
    user = get_user_by_phone(phone)
    if user:
        return {"success": True, "user": user}
    return {"success": False, "message": "User not found"}

@app.get("/api/all-users")
def all_users():
    return load_users()


@app.put("/api/users/{user_id}")
def api_update_user(user_id: str, data: dict = Body(...)):
    user = get_user_by_id(user_id)
    if not user:
        return {"success": False, "message": "User not found"}
    changed_name = False
    for field in ("firstName", "lastName", "email", "favoriteSport"):
        if field in data:
            new_val = data[field].strip() if isinstance(data[field], str) else data[field]
            if field in ("firstName", "lastName") and user.get(field) != new_val:
                changed_name = True
            user[field] = new_val
    save_user(user)
    # Propagate name changes into every league where this player appears
    if changed_name:
        _sync_player_name_in_leagues(user)
    return {"success": True, "user": user}


def _sync_player_name_in_leagues(user: dict) -> int:
    """Update firstName/lastName for this user in all leagues. Returns count of leagues updated."""
    uid = user["id"]
    first = user.get("firstName", "")
    last = user.get("lastName", "")
    updated = 0
    for league in list_leagues():
        dirty = False
        for p in league.get("players", []):
            if p.get("id") == uid or normalize_phone(p.get("phone", "")) == normalize_phone(user.get("phone", "")):
                if p.get("firstName") != first or p.get("lastName") != last:
                    p["firstName"] = first
                    p["lastName"] = last
                    dirty = True
        if dirty:
            save_league(league)
            updated += 1
    return updated


@app.post("/api/admin/sync-player-names")
def api_sync_player_names(data: dict = Body(...)):
    """Super-admin: propagate all user names into every league that has stale copies."""
    phone = data.get("phone")
    if not is_super_admin(phone):
        return {"success": False, "message": "Super admin only"}
    users = load_users()
    total_leagues = 0
    for user in users:
        total_leagues += _sync_player_name_in_leagues(user)
    return {"success": True, "leaguesUpdated": total_leagues, "usersProcessed": len(users)}


@app.post("/api/join-league")
def join_league(data: dict = Body(...)):
    league = data.get('league')
    user = data.get('user')  # expects dict with at least 'phone', 'firstName', 'lastName'
    if not league or not user:
        return {"success": False, "message": "Missing league or user info"}
    leagues = load_leagues()
    if league not in leagues:
        leagues[league] = []
    # Check if user already in league by phone
    if any(u['phone'] == user['phone'] for u in leagues[league]):
        # Update user info if needed
        for u in leagues[league]:
            if u['phone'] == user['phone']:
                u.update(user)
        save_leagues(leagues)
        return {"success": True, "message": "User already in league, info updated"}
    leagues[league].append(user)
    save_leagues(leagues)
    return {"success": True, "message": "User added to league"}

@app.get("/api/user-leagues")
def get_user_leagues(phone: str = Query(...)):
    leagues = load_leagues()
    joined = []
    for league, members in leagues.items():
        if any(u.get('phone') == phone for u in members):
            joined.append(league)
    return joined

@app.post("/api/add-score")
def add_score(data: dict = Body(...)):
    league = data.get('league')
    if not league:
        return {"success": False, "message": "Missing league name"}
    os.makedirs(SCORES_DIR, exist_ok=True)
    score_file = os.path.join(SCORES_DIR, f"{league.replace(' ', '_').lower()}_scores.json")
    # Load existing scores
    if os.path.exists(score_file):
        with open(score_file, 'r') as f:
            try:
                scores = json.load(f)
            except Exception:
                scores = []
    else:
        scores = []
    # Add timestamp
    data['timestamp'] = datetime.now().isoformat()
    scores.append(data)
    with open(score_file, 'w') as f:
        json.dump(scores, f, indent=2)
    return {"success": True, "message": "Score saved"}

@app.get("/api/league-scores")
def get_league_scores(league: str = Query(...)):
    score_file = os.path.join(SCORES_DIR, f"{league.replace(' ', '_').lower()}_scores.json")
    if os.path.exists(score_file):
        with open(score_file, 'r') as f:
            try:
                return json.load(f)
            except Exception:
                return []
    return []


# ═══════════════════════════════════════════════════════════════════
#  SPORTS & LEAGUES
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/sports")
def get_sports():
    return [{"id": s, "label": SPORT_LABELS[s]} for s in SPORTS]


@app.get("/api/sports/scoring")
def get_sports_scoring():
    return SPORT_SCORING


@app.get("/api/leagues")
def api_list_leagues(sport: Optional[str] = Query(None)):
    return list_leagues(sport)


@app.get("/api/leagues/{league_id}")
def api_get_league(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    return lg


@app.post("/api/leagues/create")
def api_create_league(data: dict = Body(...)):
    phone = data.get("phone")
    if not phone:
        return {"success": False, "message": "phone required"}
    creator = get_user_by_phone(phone)
    if not creator:
        return {"success": False, "message": "User not found"}
    if not is_super_admin(phone) and not data.get("adminOverride"):
        return {"success": False, "message": "Only super admins can create leagues"}

    sport = data.get("sport", "").lower().replace(" ", "-")
    if sport not in SPORTS:
        return {"success": False, "message": f"sport must be one of {SPORTS}"}

    lid = next_league_id(sport)
    rules = {**default_rules(), **data.get("rules", {})}
    league = {
        "id": lid,
        "name": data.get("name", "").strip(),
        "sport": sport,
        "status": "draft",          # draft → ranking → active → playoffs → completed
        "adminIds": [creator["id"]],
        "players": [],
        "startDate": data.get("startDate"),
        "endDate": data.get("endDate"),
        "rules": rules,
        "stackRanks": {},
        "finalRanking": [],
        "createdAt": datetime.now().isoformat(),
    }
    save_league(league)
    return {"success": True, "league": league}


@app.post("/api/leagues/{league_id}/add-admin")
def api_add_admin(league_id: str, data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(requester_phone)
    if not requester:
        return {"success": False, "message": "Requester not found"}
    if not is_super_admin(requester_phone) and requester["id"] not in lg["adminIds"]:
        return {"success": False, "message": "Not authorized"}
    target = get_user_by_phone(target_phone)
    if not target:
        return {"success": False, "message": "Target user not found"}
    if target["id"] not in lg["adminIds"]:
        lg["adminIds"].append(target["id"])
        save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/add-player")
def api_add_player(league_id: str, data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(requester_phone)
    if not requester:
        return {"success": False, "message": "Requester not found"}
    if not is_super_admin(requester_phone) and requester["id"] not in lg["adminIds"]:
        return {"success": False, "message": "Not authorized"}
    target = get_user_by_phone(target_phone)
    if not target:
        return {"success": False, "message": "Target user not found"}
    if any(p["id"] == target["id"] for p in lg["players"]):
        return {"success": False, "message": "Player already in league"}
    lg["players"].append({"id": target["id"], "phone": target["phone"],
                           "firstName": target["firstName"], "lastName": target["lastName"]})
    save_league(lg)
    return {"success": True, "league": lg}


@app.delete("/api/leagues/{league_id}/remove-player")
def api_remove_player(league_id: str, phone: str = Query(...), target_id: str = Query(...)):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if not is_super_admin(phone) and phone not in [get_user_by_id(a).get("phone", "") if get_user_by_id(a) else "" for a in lg["adminIds"]]:
        return {"success": False, "message": "Not authorized"}
    before = len(lg["players"])
    lg["players"] = [p for p in lg["players"] if p["id"] != target_id]
    if len(lg["players"]) == before:
        return {"success": False, "message": "Player not found in league"}
    # also remove from adminIds if present
    lg["adminIds"] = [a for a in lg["adminIds"] if a != target_id]
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/join")
def api_join_league(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}

    # Check player isn't already in the league
    if any(p["id"] == user["id"] for p in lg["players"]):
        return {"success": False, "message": "You are already a member of this league"}

    rules = lg.get("rules", default_rules())
    status = lg["status"]

    # Backward-compat: old data may have allowLateJoin bool instead of joinPolicy
    if "joinPolicy" not in rules:
        rules["joinPolicy"] = "until_ranked" if rules.get("allowLateJoin", False) else "draft_only"

    join_policy = rules.get("joinPolicy", "draft_only")

    # Map policy to allowed statuses (completed is never allowed)
    allowed = {
        "admin_only":     set(),
        "draft_only":     {"draft"},
        "until_ranked":   {"draft", "ranking"},
        "until_complete": {"draft", "ranking", "ranked", "active", "playoffs"},
    }.get(join_policy, {"draft"})

    if status == "completed":
        return {"success": False, "message": "This league has already concluded"}
    if status not in allowed:
        policy_labels = {
            "admin_only":     "Admin-only — contact the league admin to be added",
            "draft_only":     "Registration is closed — the league has already started",
            "until_ranked":   "Registration closed — player rankings have been finalized",
            "until_complete": "This league is not accepting new members at this stage",
        }
        return {"success": False, "message": policy_labels.get(join_policy, "This league is not open for new members")}

    # Enforce lateJoinCap (only relevant for non-draft joins)
    late_join_cap = rules.get("lateJoinCap", None)
    if status != "draft" and late_join_cap is not None:
        original_count = len(lg.get("originalPlayers", lg["players"]))
        current_count = len(lg["players"])
        late_joiners = current_count - original_count
        if late_joiners >= late_join_cap:
            return {"success": False, "message": f"This league has reached its late-join cap ({late_join_cap} player{'s' if late_join_cap != 1 else ''})"}

    new_player = {
        "id": user["id"],
        "phone": user["phone"],
        "firstName": user["firstName"],
        "lastName": user["lastName"],
    }

    # Apply newPlayerRankPolicy when joining a live league
    rank_policy = rules.get("newPlayerRankPolicy", "bottom")
    if status != "draft" and "finalRanking" in lg and lg["finalRanking"]:
        ranking = lg["finalRanking"]
        n = len(ranking)
        if rank_policy == "bottom":
            ranking.append(user["id"])
        elif rank_policy in ("middle", "provisional"):
            mid = max(0, n // 2)
            ranking.insert(mid, user["id"])
        # admin_set: don't add to finalRanking; admin will place manually
        if rank_policy == "provisional":
            new_player["provisional"] = True
            new_player["provisionalUntil"] = n  # becomes official after N matches
        lg["finalRanking"] = ranking

    lg["players"].append(new_player)
    save_league(lg)
    return {"success": True, "league": lg}


# ═══════════════════════════════════════════════════════════════════
#  RANKING PHASE
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/leagues/{league_id}/start-ranking")
def api_start_ranking(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg["status"] != "draft":
        return {"success": False, "message": "League must be in draft status"}
    lg["status"] = "ranking"
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/submit-ranking")
def api_submit_ranking(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    ranked_ids = data.get("rankedIds", [])  # ordered list of player IDs
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if lg["status"] not in ("draft", "ranking", "ranked"):
        return {"success": False, "message": "League is not in a ranking phase"}
    league_player = find_league_player(lg, user)
    if not league_player:
        return {"success": False, "message": "You are not in this league"}
    player_id = league_player["id"]

    lg.setdefault("stackRanks", {})[player_id] = ranked_ids

    # Always recompute finalRanking from current votes so it stays in sync with averages
    all_submitted = all(p["id"] in lg["stackRanks"] for p in lg["players"])
    lg["finalRanking"] = compute_final_ranking(lg)
    if all_submitted and lg["status"] == "ranking":
        lg["status"] = "ranked"

    save_league(lg)
    # Count only current players who have submitted (exclude stale votes from removed players)
    submitted_count = sum(1 for p in lg["players"] if p["id"] in lg["stackRanks"])
    total = len(lg["players"])
    return {"success": True, "league": lg,
            "submitted": submitted_count, "total": total, "allDone": all_submitted}


@app.post("/api/leagues/{league_id}/finalize-ranking")
def api_finalize_ranking(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    manual_order = data.get("rankedIds")  # optional manual override
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg["status"] not in ("ranking", "ranked"):
        return {"success": False, "message": "League must be in ranking/ranked phase"}

    lg["finalRanking"] = manual_order if manual_order else compute_final_ranking(lg)
    lg["status"] = "ranked"
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/recalculate-ranking")
def api_recalculate_ranking(league_id: str, data: dict = Body(...)):
    """Recalculate finalRanking from current votes using average position (admin action)."""
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}

    lg["finalRanking"] = compute_final_ranking(lg)
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/start")
def api_start_league(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg["status"] not in ("ranked", "draft"):
        return {"success": False, "message": "Finalize rankings before starting"}
    if not lg.get("finalRanking"):
        lg["finalRanking"] = [p["id"] for p in lg["players"]]
    lg["status"] = "active"
    started_at = datetime.now().isoformat()
    lg["startedAt"] = started_at
    # Auto-generate blocks if not already set
    if not lg.get("blocks"):
        block_days = (lg.get("rules") or {}).get("blockDurationDays") or 7
        start_iso = (lg.get("startDate") or started_at)[:10]
        end_iso = lg.get("endDate")
        lg["blocks"] = generate_blocks(start_iso, block_days, end_iso)
    save_league(lg)
    return {"success": True, "league": lg}


@app.put("/api/leagues/{league_id}/blocks")
def api_update_blocks(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg.get("adminIds", []) and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    blocks = data.get("blocks")
    if not isinstance(blocks, list):
        return {"success": False, "message": "blocks must be a list"}
    # Re-index and validate
    clean = []
    for i, b in enumerate(blocks):
        if not b.get("startDate") or not b.get("endDate"):
            return {"success": False, "message": f"Block {i} missing startDate or endDate"}
        clean.append({"index": i, "startDate": b["startDate"][:10], "endDate": b["endDate"][:10]})
    lg["blocks"] = clean
    save_league(lg)
    return {"success": True, "league": lg}



@app.post("/api/leagues/{league_id}/start-playoffs")
def api_start_playoffs(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg.get("adminIds", []) and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg.get("status") != "active":
        return {"success": False, "message": "League must be active to start playoffs"}
    if len(lg.get("players", [])) < 2:
        return {"success": False, "message": "At least two players are required"}

    standings = _compute_league_standings(lg)
    lg = generate_playoffs(lg, standings)
    lg["status"] = "playoffs"
    save_league(lg)
    return {"success": True, "league": lg}


# ═══════════════════════════════════════════════════════════════════
#  MATCHES
# ═══════════════════════════════════════════════════════════════════

def _normalize_playoff_group(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if raw.lower().startswith("group "):
        raw = raw[6:]
    return raw.upper()


def _match_winner_player_id(match: dict) -> Optional[str]:
    winner = match.get("winner")
    if winner == "submitter":
        return match.get("submitterId")
    if winner == "opponent":
        return match.get("opponentId")
    return winner


def _resolve_playoff_participants(group: dict, matchup_id: str) -> list[str]:
    matchup = group.get("matchups", {}).get(matchup_id, {})
    player_ids = group.get("playerIds", [])
    participants: list[str] = []

    def resolve_seed(seed_index: Optional[int]) -> Optional[str]:
        if seed_index is None:
            return None
        if 0 <= seed_index < len(player_ids):
            return player_ids[seed_index]
        return None

    def resolve_sf_winner(ref_index: int) -> Optional[str]:
        refs = matchup.get("fromSfs", [])
        if ref_index >= len(refs):
            return None
        return group.get("matchups", {}).get(refs[ref_index], {}).get("winnerId")

    refs = matchup.get("fromSfs", [])
    side1 = resolve_seed(matchup.get("side1Seed")) or resolve_sf_winner(0)
    side2 = resolve_seed(matchup.get("side2Seed"))
    if side2 is None:
        ref_index = 0 if matchup.get("side1Seed") is not None or len(refs) == 1 else 1
        side2 = resolve_sf_winner(ref_index)

    if side1:
        participants.append(side1)
    if side2:
        participants.append(side2)
    return participants


def _sync_playoff_match_result(league: dict, match: dict):
    if not match.get("isPlayoff"):
        return

    winner_id = _match_winner_player_id(match)
    if not winner_id:
        return

    group_code = _normalize_playoff_group(match.get("playoffGroup"))
    matchup_id = match.get("playoffMatchupId")
    updated = False

    for group in league.get("playoffs", {}).get("groups", []):
        if _normalize_playoff_group(group.get("name")) != group_code:
            continue
        matchup = group.get("matchups", {}).get(matchup_id)
        if not matchup:
            continue
        matchup["winnerId"] = winner_id
        matchup["matchId"] = match.get("id")
        updated = True
        break

    if updated:
        save_league(league)


@app.post("/api/matches/submit")
def api_submit_match(data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    opponent_id = data.get("opponentId")
    score_data = data.get("score", {})
    submitter_player_id = data.get("submitterPlayerId")
    is_playoff = bool(data.get("isPlayoff"))
    playoff_group = _normalize_playoff_group(data.get("playoffGroup")) if is_playoff else None
    playoff_matchup_id = data.get("playoffMatchupId") if is_playoff else None

    caller = get_user_by_phone(phone)
    if not caller:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg or lg.get("status") not in ("active", "playoffs"):
        return {"success": False, "message": "League not found or not accepting matches"}
    if not any(p["id"] == opponent_id for p in lg["players"]):
        return {"success": False, "message": "Opponent not in league"}

    is_admin = caller["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    if submitter_player_id:
        if not is_admin:
            return {"success": False, "message": "Only admins can enter matches on behalf of players"}
        submitter_id = submitter_player_id
        require_both = False if is_playoff else True
        admin_submitted_by = caller["id"]
        accepted_sides = []
    else:
        submitter_id = caller["id"]
        require_both = False
        admin_submitted_by = None
        accepted_sides = []

    if not any(p["id"] == submitter_id for p in lg["players"]):
        return {"success": False, "message": "Submitter player not in league"}
    if submitter_id == opponent_id:
        return {"success": False, "message": "Players must be different"}

    if is_playoff:
        if lg.get("status") != "playoffs":
            return {"success": False, "message": "Playoff matches can only be submitted during playoffs"}
        if not playoff_group or not playoff_matchup_id:
            return {"success": False, "message": "Playoff group and matchup are required"}

        playoff_group_doc = next(
            (group for group in lg.get("playoffs", {}).get("groups", []) if _normalize_playoff_group(group.get("name")) == playoff_group),
            None,
        )
        if not playoff_group_doc:
            return {"success": False, "message": "Playoff group not found"}
        playoff_matchup = playoff_group_doc.get("matchups", {}).get(playoff_matchup_id)
        if not playoff_matchup:
            return {"success": False, "message": "Playoff matchup not found"}
        if playoff_matchup.get("winnerId"):
            return {"success": False, "message": "Playoff matchup already completed"}

        expected_participants = sorted(_resolve_playoff_participants(playoff_group_doc, playoff_matchup_id))
        submitted_participants = sorted([submitter_id, opponent_id])
        if len(expected_participants) != 2:
            return {"success": False, "message": "Playoff matchup participants are not ready yet"}
        if submitted_participants != expected_participants:
            return {"success": False, "message": "Submitted players do not match the playoff bracket"}

    mid = next_match_id(lg["sport"], league_id)
    match = {
        "id": mid,
        "leagueId": league_id,
        "sport": lg["sport"],
        "submitterId": submitter_id,
        "opponentId": opponent_id,
        "adminSubmittedBy": admin_submitted_by,
        "requiresBothAccept": require_both,
        "acceptedSides": accepted_sides,
        "score": score_data,
        "status": "pending",
        "submittedAt": datetime.now().isoformat(),
        "resolvedAt": None,
        "isPlayoff": is_playoff,
        "playoffGroup": playoff_group,
        "playoffMatchupId": playoff_matchup_id,
    }
    save_match(match)
    return {"success": True, "match": match}


@app.post("/api/matches/{match_id}/accept")
def api_accept_match(match_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    match = get_match(lg["sport"], league_id, match_id)
    if not match:
        return {"success": False, "message": "Match not found"}
    if match["status"] != "pending":
        return {"success": False, "message": "Match already resolved"}

    is_admin = user["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    def finalize_match(m):
        m["status"] = "accepted"
        m["resolvedAt"] = datetime.now().isoformat()
        score = m.get("score", {})
        sets = score.get("sets", [])
        scoring_fmt = lg.get("rules", {}).get("scoringFormat")
        if sets:
            m["winner"] = compute_match_winner(sets, lg["sport"], scoring_fmt)
        else:
            sub_score = score.get("submitter", 0)
            opp_score = score.get("opponent", 0)
            m["winner"] = m["submitterId"] if sub_score >= opp_score else m["opponentId"]

    def save_and_sync(m):
        save_match(m)
        if m.get("status") == "accepted":
            _sync_playoff_match_result(lg, m)
        return {"success": True, "match": m}

    # ── Doubles: all four players (or admin) must accept ──────────────
    if match.get("matchType") == "doubles":
        all_four = match.get("team1PlayerIds", []) + match.get("team2PlayerIds", [])

        def finalize_doubles(m):
            m["status"] = "accepted"
            m["resolvedAt"] = datetime.now().isoformat()
            score = m.get("score", {})
            sets = score.get("sets", [])
            scoring_fmt = lg.get("rules", {}).get("scoringFormat")
            if sets:
                raw = compute_match_winner(sets, lg["sport"], scoring_fmt)
                m["winnerTeam"] = "team1" if raw == "submitter" else "team2" if raw == "opponent" else None
            else:
                sub_score = score.get("submitter", 0)
                opp_score = score.get("opponent", 0)
                m["winnerTeam"] = "team1" if sub_score >= opp_score else "team2"

        if is_admin and user["id"] not in all_four:
            match["acceptedPlayerIds"] = list(all_four)
            finalize_doubles(match)
            return save_and_sync(match)

        if user["id"] not in all_four:
            return {"success": False, "message": "Not authorized to accept this match"}

        accepted = match.get("acceptedPlayerIds", [])
        if user["id"] not in accepted:
            accepted.append(user["id"])
        match["acceptedPlayerIds"] = accepted

        if all(pid in accepted for pid in all_four):
            finalize_doubles(match)
        return save_and_sync(match)

    if match.get("requiresBothAccept"):
        if is_admin and user["id"] not in [match["submitterId"], match["opponentId"]]:
            match["acceptedSides"] = ["submitter", "opponent"]
            finalize_match(match)
            return save_and_sync(match)
        if user["id"] == match["submitterId"]:
            side = "submitter"
        elif user["id"] == match["opponentId"]:
            side = "opponent"
        else:
            return {"success": False, "message": "Not authorized to accept this match"}
        sides = match.get("acceptedSides", [])
        if side not in sides:
            sides.append(side)
        match["acceptedSides"] = sides
        if "submitter" in sides and "opponent" in sides:
            finalize_match(match)
        return save_and_sync(match)
    else:
        if match["opponentId"] != user["id"] and not is_admin:
            return {"success": False, "message": "Only the opponent can accept"}
        finalize_match(match)
        return save_and_sync(match)


@app.post("/api/matches/{match_id}/reject")
def api_reject_match(match_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    match = get_match(lg["sport"], league_id, match_id)
    if not match:
        return {"success": False, "message": "Match not found"}
    if match["status"] != "pending":
        return {"success": False, "message": "Match already resolved"}

    is_admin = user["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    # ── Doubles: any of the four players (or admin) can reject ────────
    if match.get("matchType") == "doubles":
        all_four = match.get("team1PlayerIds", []) + match.get("team2PlayerIds", [])
        if user["id"] not in all_four and not is_admin:
            return {"success": False, "message": "Not authorized to reject this match"}
        match["status"] = "rejected"
        match["resolvedAt"] = datetime.now().isoformat()
        match["rejectionNote"] = data.get("note", "")
        save_match(match)
        return {"success": True, "match": match}

    if not is_admin and match["opponentId"] != user["id"] and match["submitterId"] != user["id"]:
        return {"success": False, "message": "Not authorized to reject this match"}

    match["status"] = "rejected"
    match["resolvedAt"] = datetime.now().isoformat()
    match["rejectionNote"] = data.get("note", "")
    save_match(match)
    return {"success": True, "match": match}


def _build_pair_name(lg: dict, player1_id: str, player2_id: str) -> str:
    """Generate a default 'Last/Last' display name for a doubles pair."""
    players = {p["id"]: p for p in lg.get("players", [])}
    p1 = players.get(player1_id, {})
    p2 = players.get(player2_id, {})
    p1_name = p1.get("lastName") or p1.get("firstName") or "?"
    p2_name = p2.get("lastName") or p2.get("firstName") or "?"
    return f"{p1_name}/{p2_name}"


def _check_doubles_weekly_frequency(lg: dict, team1_ids: list, team2_ids: list) -> Optional[str]:
    """Return an error string if the same 4-player matchup has already played twice this week."""
    from datetime import date, timedelta
    today = date.today()
    week_start_iso = (today - timedelta(days=today.weekday())).isoformat()
    new_combo = frozenset([frozenset(team1_ids), frozenset(team2_ids)])
    count = 0
    for m in list_matches(lg["sport"], lg["id"]):
        if m.get("matchType") != "doubles":
            continue
        if m.get("status") == "rejected":
            continue
        date_played = (m.get("datePlayed") or (m.get("submittedAt") or "")[:10])
        if date_played < week_start_iso:
            continue
        m_combo = frozenset([frozenset(m.get("team1PlayerIds", [])), frozenset(m.get("team2PlayerIds", []))])
        if m_combo == new_combo:
            count += 1
    if count >= 2:
        return "This combination of players has already played twice this week"
    return None


@app.post("/api/matches/submit-doubles")
def api_submit_doubles_match(data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    team1_ids = data.get("team1PlayerIds", [])
    team2_ids = data.get("team2PlayerIds", [])
    score_data = data.get("score", {})
    submitter_player_id = data.get("submitterPlayerId")

    caller = get_user_by_phone(phone)
    if not caller:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg or lg.get("status") not in ("active", "playoffs"):
        return {"success": False, "message": "League not found or not accepting matches"}

    doubles_mode = lg.get("rules", {}).get("doublesMode", "none")
    if doubles_mode == "none":
        return {"success": False, "message": "Doubles not enabled for this league"}

    is_admin = caller["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    if len(team1_ids) != 2 or len(team2_ids) != 2:
        return {"success": False, "message": "Each team must have exactly 2 players"}

    all_four = team1_ids + team2_ids
    if len(set(all_four)) != 4:
        return {"success": False, "message": "All four players must be different"}

    league_player_ids = {p["id"] for p in lg["players"]}
    for pid in all_four:
        if pid not in league_player_ids:
            return {"success": False, "message": "All players must be members of this league"}

    if submitter_player_id:
        if not is_admin:
            return {"success": False, "message": "Only admins can enter matches on behalf of players"}
        if submitter_player_id not in all_four:
            return {"success": False, "message": "Submitter player must be one of the four players"}
    else:
        if caller["id"] not in all_four:
            return {"success": False, "message": "You must be one of the four players to submit"}

    freq_error = _check_doubles_weekly_frequency(lg, team1_ids, team2_ids)
    if freq_error:
        return {"success": False, "message": freq_error}

    pair1_id = None
    pair2_id = None
    if doubles_mode == "fixed_pairs":
        pair1_id = data.get("pair1Id")
        pair2_id = data.get("pair2Id")
        if not pair1_id or not pair2_id:
            return {"success": False, "message": "Pair IDs required for fixed pairs mode"}
        pairs = lg.get("doublesPairs", [])
        pair1 = next((p for p in pairs if p["id"] == pair1_id), None)
        pair2 = next((p for p in pairs if p["id"] == pair2_id), None)
        if not pair1 or not pair2:
            return {"success": False, "message": "One or both pairs not found"}
        p1_ids = sorted([pair1["player1Id"], pair1["player2Id"]])
        p2_ids = sorted([pair2["player1Id"], pair2["player2Id"]])
        if sorted(team1_ids) != p1_ids or sorted(team2_ids) != p2_ids:
            return {"success": False, "message": "Team composition doesn't match the selected pairs"}

    mid = next_match_id(lg["sport"], league_id)
    effective_submitter = submitter_player_id or caller["id"]
    admin_submitted_by = caller["id"] if submitter_player_id else None

    # Auto-accept for the submitter (unless admin submitting on behalf)
    accepted_player_ids: list = []
    if not submitter_player_id and caller["id"] in all_four:
        accepted_player_ids = [caller["id"]]

    match = {
        "id": mid,
        "leagueId": league_id,
        "sport": lg["sport"],
        "matchType": "doubles",
        "doublesMode": doubles_mode,
        "team1PlayerIds": team1_ids,
        "team2PlayerIds": team2_ids,
        "submitterId": effective_submitter,
        "opponentId": None,
        "adminSubmittedBy": admin_submitted_by,
        "requiresAllAccept": True,
        "acceptedPlayerIds": accepted_player_ids,
        "pair1Id": pair1_id,
        "pair2Id": pair2_id,
        "score": score_data,
        "status": "pending",
        "submittedAt": datetime.now().isoformat(),
        "resolvedAt": None,
        "isPlayoff": False,
    }
    save_match(match)
    return {"success": True, "match": match}


# ── Doubles pairs management ───────────────────────────────────────

@app.get("/api/leagues/{league_id}/doubles/pairs")
def api_list_doubles_pairs(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    return {"success": True, "pairs": lg.get("doublesPairs", [])}


@app.post("/api/leagues/{league_id}/doubles/pairs")
def api_create_doubles_pair(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    player1_id = data.get("player1Id")
    player2_id = data.get("player2Id")
    name = (data.get("name") or "").strip()

    caller = get_user_by_phone(phone)
    if not caller:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if not is_super_admin(phone) and caller["id"] not in lg.get("adminIds", []):
        return {"success": False, "message": "Admin access required"}

    if not player1_id or not player2_id:
        return {"success": False, "message": "Both player IDs required"}
    if player1_id == player2_id:
        return {"success": False, "message": "Players must be different"}

    league_player_ids = {p["id"] for p in lg["players"]}
    if player1_id not in league_player_ids or player2_id not in league_player_ids:
        return {"success": False, "message": "Both players must be in the league"}

    pairs = lg.get("doublesPairs", [])
    new_combo = frozenset([player1_id, player2_id])
    for existing in pairs:
        if frozenset([existing["player1Id"], existing["player2Id"]]) == new_combo:
            return {"success": False, "message": "This pair already exists"}

    pair_id = f"pair_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    pair = {
        "id": pair_id,
        "player1Id": player1_id,
        "player2Id": player2_id,
        "name": name or _build_pair_name(lg, player1_id, player2_id),
        "createdAt": datetime.now().isoformat(),
    }
    pairs.append(pair)
    lg["doublesPairs"] = pairs
    save_league(lg)
    return {"success": True, "pair": pair, "league": lg}


@app.delete("/api/leagues/{league_id}/doubles/pairs/{pair_id}")
def api_delete_doubles_pair(league_id: str, pair_id: str, phone: str = Query(...)):
    caller = get_user_by_phone(phone)
    if not caller:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if not is_super_admin(phone) and caller["id"] not in lg.get("adminIds", []):
        return {"success": False, "message": "Admin access required"}

    pairs = lg.get("doublesPairs", [])
    before = len(pairs)
    lg["doublesPairs"] = [p for p in pairs if p["id"] != pair_id]
    if len(lg["doublesPairs"]) == before:
        return {"success": False, "message": "Pair not found"}
    save_league(lg)
    return {"success": True, "league": lg}


# ── Doubles standings (fixed-pairs mode) ──────────────────────────

def _compute_doubles_standings(lg: dict) -> dict:
    """Compute pair standings for a fixed-pairs league."""
    matches = list_matches(lg["sport"], lg["id"])
    rules = {**default_rules(), **lg.get("rules", {})}
    scoring = rules.get("scoring", {"win": 3, "loss": 0, "noGame": -1})
    pairs = lg.get("doublesPairs", [])

    stats: dict = {}
    for pair in pairs:
        stats[pair["id"]] = {
            "pair": pair,
            "wins": 0,
            "losses": 0,
            "points": 0,
            "rank": 0,
            "matchLog": [],
        }

    for m in matches:
        if m.get("status") != "accepted" or m.get("matchType") != "doubles":
            continue
        p1_id = m.get("pair1Id")
        p2_id = m.get("pair2Id")
        if not p1_id or not p2_id:
            continue
        if p1_id not in stats or p2_id not in stats:
            continue

        winner_team = m.get("winnerTeam")
        if not winner_team:
            score = m.get("score", {})
            sets = score.get("sets", [])
            scoring_fmt = rules.get("scoringFormat")
            if sets:
                raw = compute_match_winner(sets, lg["sport"], scoring_fmt)
                winner_team = "team1" if raw == "submitter" else "team2" if raw == "opponent" else None
            else:
                sub_score = score.get("submitter", 0)
                opp_score = score.get("opponent", 0)
                winner_team = "team1" if sub_score >= opp_score else "team2"
        if not winner_team:
            continue

        winner_pair_id = p1_id if winner_team == "team1" else p2_id
        loser_pair_id = p2_id if winner_team == "team1" else p1_id
        win_pts = scoring.get("win", 3)
        loss_pts = scoring.get("loss", 0)
        submitted_at = m.get("submittedAt") or m.get("createdAt")

        stats[winner_pair_id]["wins"] += 1
        stats[winner_pair_id]["points"] += win_pts
        stats[winner_pair_id]["matchLog"].append({
            "matchId": m["id"], "opponentPairId": loser_pair_id,
            "result": "win", "basePoints": win_pts, "score": m.get("score"), "submittedAt": submitted_at,
        })
        stats[loser_pair_id]["losses"] += 1
        stats[loser_pair_id]["points"] += loss_pts
        stats[loser_pair_id]["matchLog"].append({
            "matchId": m["id"], "opponentPairId": winner_pair_id,
            "result": "loss", "basePoints": loss_pts, "score": m.get("score"), "submittedAt": submitted_at,
        })

    sorted_stats = sorted(stats.values(), key=lambda x: -x["points"])
    for i, s in enumerate(sorted_stats):
        s["rank"] = i + 1
    return {"leagueId": lg["id"], "standings": sorted_stats}


@app.get("/api/leagues/{league_id}/doubles/standings")
def api_doubles_standings(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    doubles_mode = lg.get("rules", {}).get("doublesMode", "none")
    if doubles_mode != "fixed_pairs":
        return {"success": False, "message": "Doubles standings are only available in fixed-pairs mode"}
    return _compute_doubles_standings(lg)


@app.get("/api/matches/pending")
def api_pending_matches(userId: str = Query(...)):
    return get_pending_matches_for_user(userId)


@app.get("/api/leagues/{league_id}/matches")
def api_league_matches(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return []
    return list_matches(lg["sport"], league_id)


@app.get("/api/leagues/{league_id}/playoffs")
def api_league_playoffs(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"groups": []}
    return lg.get("playoffs") or {"groups": []}


def _compute_league_standings(lg: dict) -> list[dict]:
    matches = list_matches(lg["sport"], lg["id"])
    rules = {**default_rules(), **lg.get("rules", {})}
    scoring = rules.get("scoring", {"win": 3, "loss": 0, "noGame": -1})
    final_ranking = lg.get("finalRanking", [])
    ranking_positions = {player_id: index for index, player_id in enumerate(final_ranking)}

    stats: dict = {}
    for p in lg["players"]:
        stats[p["id"]] = {"player": p, "wins": 0, "losses": 0, "points": 0, "rank": 0, "matchLog": []}

    for m in matches:
        if m.get("status") != "accepted" or m.get("isPlayoff"):
            continue

        # ── Doubles match: distribute points to all four players ──────
        if m.get("matchType") == "doubles":
            team1_ids = m.get("team1PlayerIds", [])
            team2_ids = m.get("team2PlayerIds", [])
            winner_team = m.get("winnerTeam")
            if not winner_team:
                score = m.get("score", {})
                sets = score.get("sets", [])
                scoring_fmt = rules.get("scoringFormat")
                if sets:
                    raw = compute_match_winner(sets, lg["sport"], scoring_fmt)
                    winner_team = "team1" if raw == "submitter" else "team2" if raw == "opponent" else None
                else:
                    sub_score = score.get("submitter", 0)
                    opp_score = score.get("opponent", 0)
                    winner_team = "team1" if sub_score >= opp_score else "team2"
            if not winner_team:
                continue
            winning_ids = team1_ids if winner_team == "team1" else team2_ids
            losing_ids = team2_ids if winner_team == "team1" else team1_ids
            win_pts = scoring.get("win", 3)
            loss_pts = scoring.get("loss", 0)
            submitted_at = m.get("submittedAt") or m.get("createdAt")
            for pid in winning_ids:
                if pid in stats:
                    stats[pid]["wins"] += 1
                    stats[pid]["points"] += win_pts
                    stats[pid]["matchLog"].append({
                        "matchId": m["id"],
                        "opponentId": losing_ids[0] if losing_ids else None,
                        "result": "win", "basePoints": win_pts, "upsetBonus": 0,
                        "score": m.get("score"), "submittedAt": submitted_at, "matchType": "doubles",
                    })
            for pid in losing_ids:
                if pid in stats:
                    stats[pid]["losses"] += 1
                    stats[pid]["points"] += loss_pts
                    stats[pid]["matchLog"].append({
                        "matchId": m["id"],
                        "opponentId": winning_ids[0] if winning_ids else None,
                        "result": "loss", "basePoints": loss_pts, "upsetBonus": 0,
                        "score": m.get("score"), "submittedAt": submitted_at, "matchType": "doubles",
                    })
            continue

        sid = m["submitterId"]
        oid = m["opponentId"]
        winner = _match_winner_player_id(m)
        if not winner:
            score = m.get("score", {})
            sets = score.get("sets", [])
            if sets:
                scoring_fmt = rules.get("scoringFormat")
                computed_winner = compute_match_winner(sets, lg["sport"], scoring_fmt)
                winner = sid if computed_winner == "submitter" else oid
            else:
                sub_score = score.get("submitter", 0)
                opp_score = score.get("opponent", 0)
                winner = sid if sub_score >= opp_score else oid
        loser = oid if winner == sid else sid

        win_pts = scoring.get("win", 3)
        loss_pts = scoring.get("loss", 0)
        upset_bonus = 0
        winner_seed = ranking_positions.get(winner)
        loser_seed = ranking_positions.get(loser)
        if winner_seed is not None and loser_seed is not None and winner_seed > loser_seed:
            upset_bonus = rules.get("upsetBonus", 0)

        submitted_at = m.get("submittedAt") or m.get("createdAt")
        if winner in stats:
            stats[winner]["wins"] += 1
            stats[winner]["points"] += win_pts + upset_bonus
            stats[winner]["matchLog"].append({
                "matchId": m["id"],
                "opponentId": loser,
                "result": "win",
                "basePoints": win_pts,
                "upsetBonus": upset_bonus,
                "score": m.get("score"),
                "submittedAt": submitted_at,
            })
        if loser in stats:
            stats[loser]["losses"] += 1
            stats[loser]["points"] += loss_pts
            stats[loser]["matchLog"].append({
                "matchId": m["id"],
                "opponentId": winner,
                "result": "loss",
                "basePoints": loss_pts,
                "upsetBonus": 0,
                "score": m.get("score"),
                "submittedAt": submitted_at,
            })

    tiebreak_ranking = final_ranking or [p["id"] for p in lg["players"]]
    sorted_stats = sorted(
        stats.values(),
        key=lambda x: (-(x["points"]), tiebreak_ranking.index(x["player"]["id"]) if x["player"]["id"] in tiebreak_ranking else 999)
    )
    for i, s in enumerate(sorted_stats):
        s["rank"] = i + 1
    return sorted_stats


@app.get("/api/leagues/{league_id}/standings")
def api_standings(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    return {"leagueId": league_id, "standings": _compute_league_standings(lg)}


def _compute_standing_breakdown(lg: dict) -> dict:
    """
    Compute per-player rank history across rounds.

    Rounds are sourced from lg['blocks'] if defined; otherwise auto-derived
    from 7-day buckets using match datePlayed values.

    Returns:
      {
        "rounds": [{"label": "Round 1", "startDate": "...", "endDate": "..."}],
        "breakdown": [
          {
            "playerId": "...",
            "playerName": "First Last",
            "currentRank": 1,
            "roundRanks": [{"roundIndex": 0, "label": "Round 1", "rank": 2}, ...]
          }
        ]
      }
    """
    from datetime import date, timedelta

    matches = list_matches(lg["sport"], lg["id"])
    accepted = [m for m in matches if m.get("status") == "accepted" and not m.get("isPlayoff")]
    today_iso = date.today().isoformat()

    # ── Build round definitions ──────────────────────────────────────
    blocks = lg.get("blocks") or []
    if blocks:
        rounds = [
            {"label": f"Round {i + 1}", "startDate": b["startDate"], "endDate": b["endDate"]}
            for i, b in enumerate(blocks)
        ]
    else:
        # Auto-derive weekly buckets from actual match dates
        dates = sorted({m["datePlayed"] for m in accepted if m.get("datePlayed")})
        if not dates:
            rounds = []
        else:
            start = date.fromisoformat(dates[0])
            # Align to Monday of that week
            start = start - timedelta(days=start.weekday())
            end_limit = date.fromisoformat(dates[-1])
            rounds = []
            week_start = start
            week_num = 1
            while week_start <= end_limit:
                week_end = week_start + timedelta(days=6)
                rounds.append({
                    "label": f"Week {week_num}",
                    "startDate": week_start.isoformat(),
                    "endDate": week_end.isoformat(),
                })
                week_start += timedelta(days=7)
                week_num += 1

    rules = {**default_rules(), **lg.get("rules", {})}
    scoring = rules.get("scoring", {"win": 3, "loss": 0, "noGame": -1})
    final_ranking = lg.get("finalRanking", [])

    def _rank_players_from_matches(match_subset: list) -> dict:
        """Return {playerId: rank} for the given match subset."""
        stats: dict = {}
        for p in lg["players"]:
            stats[p["id"]] = {"points": 0}

        for m in match_subset:
            # ── Doubles match ────────────────────────────────────────
            if m.get("matchType") == "doubles":
                team1_ids = m.get("team1PlayerIds", [])
                team2_ids = m.get("team2PlayerIds", [])
                winner_team = m.get("winnerTeam")
                if not winner_team:
                    score = m.get("score", {})
                    sets = score.get("sets", [])
                    scoring_fmt = rules.get("scoringFormat")
                    if sets:
                        raw = compute_match_winner(sets, lg["sport"], scoring_fmt)
                        winner_team = "team1" if raw == "submitter" else "team2" if raw == "opponent" else None
                    else:
                        sub_score = score.get("submitter", 0)
                        opp_score = score.get("opponent", 0)
                        winner_team = "team1" if sub_score >= opp_score else "team2"
                if not winner_team:
                    continue
                winning_ids = team1_ids if winner_team == "team1" else team2_ids
                losing_ids = team2_ids if winner_team == "team1" else team1_ids
                win_pts = scoring.get("win", 3)
                loss_pts = scoring.get("loss", 0)
                for pid in winning_ids:
                    if pid in stats:
                        stats[pid]["points"] += win_pts
                for pid in losing_ids:
                    if pid in stats:
                        stats[pid]["points"] += loss_pts
                continue

            sid = m["submitterId"]
            oid = m["opponentId"]
            winner = _match_winner_player_id(m)
            if not winner:
                score = m.get("score", {})
                sets = score.get("sets", [])
                if sets:
                    scoring_fmt = rules.get("scoringFormat")
                    computed = compute_match_winner(sets, lg["sport"], scoring_fmt)
                    winner = sid if computed == "submitter" else oid
                else:
                    sub_score = score.get("submitter", 0)
                    opp_score = score.get("opponent", 0)
                    winner = sid if sub_score >= opp_score else oid
            loser = oid if winner == sid else sid

            win_pts = scoring.get("win", 3)
            loss_pts = scoring.get("loss", 0)
            upset_bonus = 0
            ranking_positions = {pid: idx for idx, pid in enumerate(final_ranking)}
            ws = ranking_positions.get(winner)
            ls = ranking_positions.get(loser)
            if ws is not None and ls is not None and ws > ls:
                upset_bonus = rules.get("upsetBonus", 0)

            if winner in stats:
                stats[winner]["points"] += win_pts + upset_bonus
            if loser in stats:
                stats[loser]["points"] += loss_pts

        tiebreak = final_ranking or [p["id"] for p in lg["players"]]
        sorted_players = sorted(
            ((pid, s["points"]) for pid, s in stats.items()),
            key=lambda x: (-x[1], tiebreak.index(x[0]) if x[0] in tiebreak else 999)
        )
        return {pid: idx + 1 for idx, (pid, _) in enumerate(sorted_players)}

    # ── Current standings ────────────────────────────────────────────
    current_ranks = _rank_players_from_matches(accepted)

    # ── Per-round standings ──────────────────────────────────────────
    round_rank_maps = []
    for rnd in rounds:
        end_date = rnd["endDate"]
        # For the current ongoing round, use today as the cutoff
        cutoff = min(end_date, today_iso)
        subset = [m for m in accepted if (m.get("datePlayed") or "") <= cutoff]
        round_rank_maps.append(_rank_players_from_matches(subset))

    # ── Assemble breakdown per player ────────────────────────────────
    breakdown = []
    for p in lg["players"]:
        pid = p["id"]
        name = f"{p.get('firstName', '')} {p.get('lastName', '')}".strip()
        round_ranks = [
            {"roundIndex": i, "label": rnd["label"], "rank": round_rank_maps[i].get(pid, len(lg["players"]))}
            for i, rnd in enumerate(rounds)
        ]
        breakdown.append({
            "playerId": pid,
            "playerName": name,
            "currentRank": current_ranks.get(pid, len(lg["players"])),
            "roundRanks": round_ranks,
        })

    # Sort by current rank
    breakdown.sort(key=lambda x: x["currentRank"])

    return {
        "rounds": rounds,
        "breakdown": breakdown,
    }


@app.get("/api/leagues/{league_id}/standing-breakdown")
def api_standing_breakdown(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    return {"leagueId": league_id, **_compute_standing_breakdown(lg)}


# ═══════════════════════════════════════════════════════════════════
#  ADMIN & SUPER ADMIN
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/me/roles")
def api_my_roles(phone: str = Query(...)):
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    leagues_admin = [lg for lg in list_leagues() if user["id"] in lg.get("adminIds", [])]
    return {
        "userId": user["id"],
        "isSuperAdmin": is_super_admin(phone),
        "adminLeagueIds": [lg["id"] for lg in leagues_admin],
    }


@app.post("/api/admin/superadmin/add")
def api_add_superadmin(data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    if not is_super_admin(requester_phone):
        return {"success": False, "message": "Not authorized"}
    add_super_admin(target_phone)
    return {"success": True, "superAdmins": load_superadmin_phones()}


@app.post("/api/admin/login-as")
def api_login_as(data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    if not is_super_admin(requester_phone):
        return {"success": False, "message": "Not authorized"}
    target = get_user_by_phone(target_phone)
    if not target:
        return {"success": False, "message": "Target user not found"}
    return {"success": True, "user": target, "impersonating": True}


@app.delete("/api/admin/users/{user_id}")
def api_delete_user(user_id: str, phone: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    path = os.path.join(USERS_DIR, f"{user_id}.json")
    if not os.path.exists(path):
        return {"success": False, "message": "User not found"}
    os.remove(path)
    return {"success": True, "message": f"User {user_id} deleted"}


@app.patch("/api/leagues/{league_id}/name")
def api_rename_league(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    new_name = (data.get("name") or "").strip()
    if not phone:
        return {"success": False, "message": "phone required"}
    if not new_name:
        return {"success": False, "message": "name required"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    user = get_user_by_phone(phone)
    is_admin = user and user["id"] in lg.get("adminIds", [])
    if not is_super_admin(phone) and not is_admin:
        return {"success": False, "message": "Not authorized"}
    lg["name"] = new_name
    save_league(lg)
    return {"success": True, "league": lg}


@app.put("/api/leagues/{league_id}/rules")
def api_update_league_rules(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    if not phone:
        return {"success": False, "message": "phone required"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if not is_super_admin(phone) and phone not in [p.get("phone") for p in lg.get("players", [])] and \
       get_user_by_phone(phone) and get_user_by_phone(phone)["id"] not in lg.get("adminIds", []):
        return {"success": False, "message": "Not authorized"}
    rules = lg.get("rules", default_rules())
    incoming = data.get("rules", {})
    # Deep merge: top-level keys merged, scoring sub-dict merged
    for key, val in incoming.items():
        if key == "scoring" and isinstance(val, dict):
            rules["scoring"] = {**rules.get("scoring", {}), **val}
        else:
            rules[key] = val
    lg["rules"] = rules
    save_league(lg)
    return {"success": True, "league": lg}


@app.delete("/api/admin/leagues/{league_id}")
def api_delete_league(league_id: str, phone: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    if not delete_league(league_id):
        return {"success": False, "message": "League not found"}
    return {"success": True, "message": f"League {league_id} deleted"}



# ═══════════════════════════════════════════════════════════════════
#  DATA BROWSER & APP CONFIG  (super-admin only)
# ═══════════════════════════════════════════════════════════════════

def _safe_rel(path: str) -> str:
    """Normalise a user-supplied relative path so it can't escape DATA_DIR."""
    # Strip leading slashes / dots to prevent directory traversal
    clean = os.path.normpath(path.lstrip("/").lstrip(".")) if path else "."
    if clean == ".":
        return ""
    return clean


@app.get("/api/admin/data/browse")
def api_data_browse(phone: str = Query(...), path: str = Query(default="")):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    rel = _safe_rel(path)
    abs_path = os.path.join(DATA_DIR, rel) if rel else DATA_DIR
    abs_path = os.path.abspath(abs_path)
    # Guard: must still be inside DATA_DIR
    if not abs_path.startswith(os.path.abspath(DATA_DIR)):
        return {"success": False, "message": "Access denied"}
    if not os.path.exists(abs_path):
        return {"success": False, "message": "Path not found"}
    if os.path.isfile(abs_path):
        return {"success": False, "message": "Path is a file; use /api/admin/data/file"}
    entries = []
    try:
        for name in sorted(os.listdir(abs_path)):
            full = os.path.join(abs_path, name)
            entry_rel = os.path.relpath(full, DATA_DIR)
            stat = os.stat(full)
            entries.append({
                "name": name,
                "type": "dir" if os.path.isdir(full) else "file",
                "size": stat.st_size if os.path.isfile(full) else None,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "path": entry_rel,
            })
    except PermissionError:
        return {"success": False, "message": "Permission denied"}
    return {
        "success": True,
        "dataDir": DATA_DIR,
        "currentPath": os.path.relpath(abs_path, DATA_DIR) if abs_path != DATA_DIR else "",
        "entries": entries,
    }


@app.get("/api/admin/data/file")
def api_data_file(phone: str = Query(...), path: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    rel = _safe_rel(path)
    abs_path = os.path.abspath(os.path.join(DATA_DIR, rel))
    if not abs_path.startswith(os.path.abspath(DATA_DIR)):
        return {"success": False, "message": "Access denied"}
    if not os.path.isfile(abs_path):
        return {"success": False, "message": "File not found"}
    size = os.path.getsize(abs_path)
    if size > 500_000:  # 500 KB cap
        return {"success": False, "message": f"File too large to display ({size} bytes)"}
    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            raw = f.read()
        try:
            content = json.loads(raw)
            is_json = True
        except Exception:
            content = raw
            is_json = False
        return {"success": True, "path": rel, "size": size, "isJson": is_json, "content": content}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.get("/api/admin/data/download")
def api_data_download(phone: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(DATA_DIR):
            for fname in files:
                full = os.path.join(root, fname)
                arcname = os.path.relpath(full, os.path.dirname(DATA_DIR))
                zf.write(full, arcname)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=ladder-league-data.zip"},
    )


@app.get("/api/admin/maintenance/audit")
def api_maintenance_audit(phone: str = Query(...)):
    """Scan all data for known issues and return a report."""
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    from app.leagues import SPORTS, list_leagues, _sports_dir

    issues = []

    # ── 1. Leagues with legacy (non-sport-prefixed) IDs ─────────────
    for sport in SPORTS:
        leagues_dir = os.path.join(_sports_dir(), sport, "leagues")
        if not os.path.isdir(leagues_dir):
            continue
        for fname in os.listdir(leagues_dir):
            if not fname.endswith(".json"):
                continue
            lid = fname[:-5]
            if not lid.startswith(f"{sport}_"):
                issues.append({
                    "type": "legacy_league_id",
                    "severity": "warning",
                    "sport": sport,
                    "leagueId": lid,
                    "description": f"League '{lid}' ({sport}) uses a legacy ID — should be '{sport}_{lid}'",
                    "fix": "migrate_league_ids",
                })

    # ── 2. Players whose ID in the league doesn't match the users dir ─
    all_users = load_users()
    phone_to_user = {u["phone"]: u for u in all_users}
    for lg in list_leagues():
        for p in lg.get("players", []):
            matching_user = phone_to_user.get(p.get("phone", ""))
            if matching_user and matching_user["id"] != p["id"]:
                issues.append({
                    "type": "player_id_mismatch",
                    "severity": "warning",
                    "leagueId": lg["id"],
                    "leagueName": lg.get("name", lg["id"]),
                    "playerId": p["id"],
                    "userRecordId": matching_user["id"],
                    "phone": p.get("phone"),
                    "name": f"{p.get('firstName','')} {p.get('lastName','')}".strip(),
                    "description": f"Player '{p.get('firstName','')} {p.get('lastName','')}' in '{lg.get('name',lg['id'])}' has id={p['id']} but user record has id={matching_user['id']}",
                    "fix": "fix_player_ids",
                })

    # ── 3. adminIds that don't resolve to a known user ───────────────
    for lg in list_leagues():
        for admin_id in lg.get("adminIds", []):
            user = get_user_by_id(admin_id)
            if not user:
                issues.append({
                    "type": "unresolvable_admin",
                    "severity": "error",
                    "leagueId": lg["id"],
                    "leagueName": lg.get("name", lg["id"]),
                    "adminId": admin_id,
                    "description": f"League '{lg.get('name',lg['id'])}' has adminId={admin_id} which has no matching user record",
                    "fix": None,
                })

    # ── 4. Stale stackRanks / finalRanking from removed players ──────
    for lg in list_leagues():
        player_ids = {p["id"] for p in lg.get("players", [])}
        stale_votes = [k for k in lg.get("stackRanks", {}) if k not in player_ids]
        stale_ranking = [k for k in lg.get("finalRanking", []) if k not in player_ids]
        if stale_votes or stale_ranking:
            parts = []
            if stale_votes:
                parts.append(f"{len(stale_votes)} stale vote(s)")
            if stale_ranking:
                parts.append(f"{len(stale_ranking)} stale finalRanking entry(ies)")
            issues.append({
                "type": "stale_player_data",
                "severity": "warning",
                "leagueId": lg["id"],
                "leagueName": lg.get("name", lg["id"]),
                "staleVoterIds": stale_votes,
                "staleFinalRankingIds": stale_ranking,
                "description": f"League '{lg.get('name', lg['id'])}' has {' and '.join(parts)} from players no longer in the league",
                "fix": "purge_stale_votes",
            })

    return {"success": True, "issues": issues, "total": len(issues)}


@app.post("/api/admin/maintenance/migrate-league-ids")
def api_migrate_league_ids(data: dict = Body(...)):
    """Rename legacy league IDs to sport-prefixed format."""
    phone = data.get("phone")
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    from app.leagues import SPORTS, _sports_dir
    import shutil

    migrated = []
    skipped = []

    for sport in SPORTS:
        leagues_dir = os.path.join(_sports_dir(), sport, "leagues")
        if not os.path.isdir(leagues_dir):
            continue
        for fname in list(os.listdir(leagues_dir)):
            if not fname.endswith(".json"):
                continue
            old_id = fname[:-5]
            if old_id.startswith(f"{sport}_"):
                skipped.append(old_id)
                continue
            new_id = f"{sport}_{old_id}"
            old_path = os.path.join(leagues_dir, fname)
            new_path = os.path.join(leagues_dir, f"{new_id}.json")
            if os.path.exists(new_path):
                skipped.append(old_id)
                continue

            with open(old_path) as f:
                lg = json.load(f)
            lg["id"] = new_id
            with open(new_path, "w") as f:
                json.dump(lg, f, indent=2)
            os.remove(old_path)

            # Rename matches subfolder and update leagueId inside each match
            old_matches = os.path.join(leagues_dir, old_id)
            new_matches = os.path.join(leagues_dir, new_id)
            if os.path.isdir(old_matches) and not os.path.exists(new_matches):
                shutil.move(old_matches, new_matches)
                matches_subdir = os.path.join(new_matches, "matches")
                scan_dir = matches_subdir if os.path.isdir(matches_subdir) else new_matches
                for mfname in os.listdir(scan_dir):
                    if not mfname.endswith(".json"):
                        continue
                    mpath = os.path.join(scan_dir, mfname)
                    with open(mpath) as mf:
                        match = json.load(mf)
                    if match.get("leagueId") == old_id:
                        match["leagueId"] = new_id
                        with open(mpath, "w") as mf:
                            json.dump(match, mf, indent=2)

            migrated.append({"old": old_id, "new": new_id, "sport": sport})

    return {"success": True, "migrated": migrated, "skipped": skipped}


@app.post("/api/admin/maintenance/fix-player-ids")
def api_fix_player_ids(data: dict = Body(...)):
    """Fix player ID mismatches — align player IDs in leagues with user records."""
    phone = data.get("phone")
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    from app.leagues import list_leagues, save_league

    all_users = load_users()
    phone_to_user = {u["phone"]: u for u in all_users}
    fixed = []

    for lg in list_leagues():
        changed = False
        for p in lg.get("players", []):
            matching_user = phone_to_user.get(p.get("phone", ""))
            if matching_user and matching_user["id"] != p["id"]:
                old_id, new_id = p["id"], matching_user["id"]
                p["id"] = new_id
                if "stackRanks" in lg and old_id in lg["stackRanks"]:
                    lg["stackRanks"][new_id] = lg["stackRanks"].pop(old_id)
                lg["finalRanking"] = [new_id if x == old_id else x for x in lg.get("finalRanking", [])]
                lg["adminIds"] = [new_id if x == old_id else x for x in lg.get("adminIds", [])]
                fixed.append({"leagueId": lg["id"], "leagueName": lg.get("name"), "oldId": old_id, "newId": new_id})
                changed = True
        if changed:
            save_league(lg)

    return {"success": True, "fixed": fixed}


@app.post("/api/admin/maintenance/purge-stale-votes")
def api_purge_stale_votes(data: dict = Body(...)):
    """Remove stackRanks and finalRanking entries for players no longer in the league."""
    phone = data.get("phone")
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    from app.leagues import list_leagues, save_league

    purged = []

    for lg in list_leagues():
        player_ids = {p["id"] for p in lg.get("players", [])}
        stale_votes = [k for k in lg.get("stackRanks", {}) if k not in player_ids]
        stale_ranking = [k for k in lg.get("finalRanking", []) if k not in player_ids]

        if not stale_votes and not stale_ranking:
            continue

        for k in stale_votes:
            del lg["stackRanks"][k]
        if stale_ranking:
            lg["finalRanking"] = [k for k in lg["finalRanking"] if k in player_ids]

        save_league(lg)
        purged.append({
            "leagueId": lg["id"],
            "leagueName": lg.get("name"),
            "staleVoterIds": stale_votes,
            "staleFinalRankingIds": stale_ranking,
        })

    return {"success": True, "purged": purged}


@app.get("/api/admin/config")
def api_admin_config(phone: str = Query(...)):

    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    from app.leagues import SPORTS, SPORT_LABELS, SPORT_SCORING, default_rules
    superadmins = load_superadmin_phones()
    # Count data files
    total_files = sum(len(files) for _, _, files in os.walk(DATA_DIR))
    user_count = len([f for f in os.listdir(USERS_DIR) if f.endswith(".json")]) if os.path.isdir(USERS_DIR) else 0
    leagues_by_sport = {}
    for sp in SPORTS:
        ld = os.path.join(DATA_DIR, "sports", sp, "leagues")
        if os.path.isdir(ld):
            leagues_by_sport[sp] = len([f for f in os.listdir(ld) if f.endswith(".json")])
        else:
            leagues_by_sport[sp] = 0
    return {
        "success": True,
        "config": {
            "dataDir": DATA_DIR,
            "environment": os.environ.get("WEBSITE_SITE_NAME", "local"),
            "pythonVersion": __import__("sys").version,
            "sports": [{"id": s, "label": SPORT_LABELS[s]} for s in SPORTS],
            "superAdminCount": len(superadmins),
            "superAdmins": superadmins,
            "userCount": user_count,
            "leagueCountBySport": leagues_by_sport,
            "totalDataFiles": total_files,
            "defaultRules": default_rules(),
            "sportScoring": SPORT_SCORING,
            "corsOrigins": ["*"],
            "startedAt": datetime.now().isoformat(),
        }
    }
