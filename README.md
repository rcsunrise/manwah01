<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# MANWAH AI - 国内商品企划中心

This application is a premium interior design and image editing assistant tailored for industrial furniture design and planning.

## 🚀 Prerequisites

- **Node.js**: v22.x or higher recommended
- **Database**: Supabase (PostgreSQL)

## ⚙️ Environment Variables

Create a `.env.local` or `.env` file at the root of the project with the following keys:

```env
GEMINI_API_KEY=your_gemini_api_key
ROUTERHUB_API_KEY=your_routerhub_api_key
BAILIAN_API_KEY=your_bailian_api_key

SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
USER_USERNAME=your_user_username
USER_PASSWORD=your_user_password
```

## 🛠️ Initialization & Setup

### 1. Database Initialization
Ensure that your Supabase instance is running. You need to configure proper Row Level Security (RLS) policies for your tables (`profiles`, `usage_logs`, `department_configs`, etc.) according to your access needs.

### 2. Create Admin and Test Users
Run the provided scripts to seed initial users with environment variables provided above:
```bash
npx tsx scripts/create_admin.ts
npx tsx scripts/create_user.ts
```

## 💻 Development & Deployment

### Run Locally
Install dependencies:
```bash
npm install
```
Start the development server:
```bash
npm run dev
```

### Production Build
Build the client and server application:
```bash
npm run build
```
Start the production application:
```bash
npm run start
```

## 🧪 Testing

We use Vitest for automated testing.
```bash
npm run test
```
