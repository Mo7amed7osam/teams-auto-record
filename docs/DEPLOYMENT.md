# Teams Auto Record - Licensing Backend Deployment

This document explains how to deploy the Node.js/Express licensing backend to [Render](https://render.com), which is the recommended platform for a simple, long-running Node service.

## Prerequisites

1.  A GitHub repository containing the `server/` directory.
2.  A MongoDB Atlas cluster set up (see `MONGODB_ATLAS_SETUP.md`).
3.  A Render account.

## Render Deployment Steps

1.  Log in to the [Render Dashboard](https://dashboard.render.com/).
2.  Click **New +** and select **Web Service**.
3.  Connect your GitHub repository.
4.  Configure the service:
    *   **Name**: `teams-license-api` (or your preferred name)
    *   **Region**: Choose the region closest to your MongoDB Atlas cluster.
    *   **Branch**: `main` (or your deployment branch).
    *   **Root Directory**: `server` (Important: This tells Render to look in the `server` folder).
    *   **Environment**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node src/server.js` (or `npm start` if defined in `package.json`).
5.  Select a plan (the Free tier is usually sufficient for initial testing, but consider a paid tier to avoid spin-down delays).
6.  Click **Create Web Service**.

## Environment Variables

While the service is deploying (or before), configure the required environment variables in the Render dashboard:

1.  Go to the **Environment** tab of your new Web Service.
2.  Add the following variables:

    *   `NODE_ENV`: `production`
    *   `PORT`: `10000` (Render will override this, but it's good practice).
    *   `MONGODB_URI`: Your MongoDB Atlas connection string.
    *   `MONGODB_DB_NAME`: The name of your database.
    *   `LICENSE_HASH_SECRET`: A long, random string (e.g., generate with `openssl rand -hex 64`).
    *   `DEVICE_HASH_SECRET`: A long, random string (different from above).
    *   `JWT_SECRET`: A long, random string.
    *   `ADMIN_API_KEY`: A secure key for CLI admin operations.
    *   `ALLOWED_EXTENSION_ORIGINS`: `chrome-extension://YOUR_EXTENSION_ID` (See section below).
    *   `TOKEN_TTL_MINUTES`: `15` (or your preferred token lifetime).
    *   `OFFLINE_GRACE_HOURS`: `12` (or your preferred offline grace period).

3.  Click **Save Changes**. Render will automatically trigger a new deploy with the updated variables.

## Configuring Extension Origins (CORS)

The backend uses CORS to restrict access. You must provide the correct extension ID.

**How to find your Extension ID:**

1.  Open Chrome and go to `chrome://extensions`.
2.  Ensure **Developer mode** is enabled (top right).
3.  Find "Teams Auto Record" in the list.
4.  Copy the ID (e.g., `abcdefghijklmnop...`).

**Setting the Variable:**

If your ID is `abcdefghijklmnop...`, set `ALLOWED_EXTENSION_ORIGINS` to `chrome-extension://abcdefghijklmnop...`.

For development with an unpacked extension, the ID might change unless you use a stable `key` in your `manifest.json`.

## Post-Deployment Verification

1.  Once Render shows the service as "Live", copy the service URL (e.g., `https://teams-license-api.onrender.com`).
2.  Visit `https://teams-license-api.onrender.com/health` in your browser. You should see `{"ok":true}`.
3.  Update `LICENSING_API_BASE_URL` in `teams-auto-record-extension/shared/licensing-config.js` with your new URL.
4.  Rebuild the extension (`npm run build:protected`).
