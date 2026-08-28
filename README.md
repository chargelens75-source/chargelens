# ChargeLens

ChargeLens is a FastAPI app that serves the static frontend from `frontend/`
and API routes from `backend/app/main.py`.

## PythonAnywhere Deployment

1. Pull the latest code on PythonAnywhere.
2. Install dependencies:

   ```bash
   pip install -r backend/requirements.txt
   ```

3. Make sure the production `.env` exists in the project root and includes at
   least:

   ```bash
   DATABASE_URL=sqlite:///./chargelens.db
   JWT_SECRET=replace-with-a-long-random-secret
   OWNER_EMAIL=owner@chargelens.local
   OWNER_PASSWORD=replace-with-owner-password
   CORS_ORIGINS=https://mithun1512.pythonanywhere.com
   ```

4. In the PythonAnywhere Web tab, set the WSGI file to use
   `pythonanywhere_wsgi.py` from this repository. The exported WSGI callable is
   named `application`.

5. Reload the web app, then check:

   ```text
   https://mithun1512.pythonanywhere.com/api/health
   ```

   It should return `{"status":"ok","service":"ChargeLens API","version":"0.1.0"}`.
