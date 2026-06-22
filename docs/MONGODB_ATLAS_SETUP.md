# MongoDB Atlas Setup for Teams Auto Record

This document outlines the steps to set up the MongoDB Atlas backend for the licensing system.

## 1. Create a Cluster

1.  Log in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2.  Create a new project (e.g., `Teams Auto Record`).
3.  Deploy a new cluster. A free tier `M0` cluster is sufficient for typical usage.
4.  Choose a cloud provider and region closest to your backend hosting (e.g., Render).
5.  Name the cluster (e.g., `teams-licensing-cluster`).

## 2. Configure Database Access

Create a dedicated database user with least privilege.

1.  Navigate to **Database Access** under the Security section.
2.  Click **Add New Database User**.
3.  **Authentication Method**: Password.
4.  **Username**: Create a specific user (e.g., `api-user`).
5.  **Password**: Autogenerate a secure password and save it temporarily.
6.  **Database User Privileges**: Choose **Only read and write to any database**.
    *   *Security Note*: Do not use the `atlasAdmin` role for the application connection string.
7.  Click **Add User**.

## 3. Configure Network Access

Configure the IP access list to allow connections from your backend.

1.  Navigate to **Network Access** under the Security section.
2.  Click **Add IP Address**.
3.  **Development**: Click **Add Current IP Address** to allow connections from your local machine.
4.  **Production**: Add the IP addresses provided by your hosting provider (e.g., Render outbound IPs).
    *   *Alternatively (Less Secure)*: Allow access from anywhere (`0.0.0.0/0`) if your hosting provider uses dynamic IPs, but rely on strong credentials.
5.  Click **Confirm**.

## 4. Obtain the Connection String

1.  Navigate to **Database** under the Deployment section.
2.  Click **Connect** on your cluster.
3.  Choose **Drivers**.
4.  Select **Node.js** and the latest version.
5.  Copy the provided connection string. It will look like this:
    `mongodb+srv://<username>:<password>@<cluster-url>/?retryWrites=true&w=majority`
6.  Replace `<username>` and `<password>` with the credentials created in Step 2.

## 5. Configure Environment Variables

Set the following environment variables in your `.env` file (local) or hosting provider settings (production):

*   `MONGODB_URI`: The connection string from Step 4.
*   `MONGODB_DB_NAME`: The name of the specific database (e.g., `teams-licensing`).

*Do not commit these values to source control.*
