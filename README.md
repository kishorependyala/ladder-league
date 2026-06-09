# Ladder League Web App

A modern web application for managing ladder leagues, built with React (frontend) and FastAPI (backend).

## Features
- User signup/login
- Persistent user storage (JSON, can be upgraded to PostgreSQL)
- League/tournament browsing and joining
- League membership management
- Leaderboards with real match results, points, matches played, won/lost, and recent results
- Add match scores (supports tennis, badminton, pickleball)
- Animated, visually appealing UI 

## Project Structure

```
ladder-league/
├── backend/         # FastAPI backend
│   ├── app/
│   │   └── main.py
│   └── requirements.txt
├── frontend/        # React frontend (TypeScript)
│   ├── src/
│   └── package.json
├── data/            # Persistent data (users, leagues, scores)
│   ├── users.json
│   ├── leagues.json
│   └── scores/
│       ├── arbors_tennis_league_scores.json
│       └── stratford_badminton_league_scores.json
└── README.md        # This file
```

## Local Development

1. **Backend:**
   ```sh
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

2. **Frontend:**
   ```sh
   cd frontend
   npm install
   npm start
   ```

3. **Access the app:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

## Deployment
- See the main README for best practices and deployment options (Render, Railway, Heroku, Docker, etc).
- For production, use PostgreSQL instead of JSON files for persistent storage.

## Notes
- Do NOT commit `venv/`, `.venv/`, or `node_modules/` folders. See `.gitignore`.
- All persistent data is stored in the `data/` folder at the project root.

---

## Sub-pages

### backend/README.md
```
# Backend (FastAPI)

- All API endpoints for user, league, and score management.
- Uses the root-level `data/` folder for persistent storage.
- To run:
  ```sh
  pip install -r requirements.txt
  uvicorn app.main:app --reload
  ```
```

### frontend/README.md
```
# Frontend (React)

- Modern React app (TypeScript) for ladder league management.
- Animated UI, leaderboard, score entry, and more.
- To run:
  ```sh
  npm install
  npm start
  ```
```

### data/README.md
```
# Data Directory

- All persistent data for the app (users, leagues, scores).
- Structure:
  - users.json
  - leagues.json
  - scores/
```
