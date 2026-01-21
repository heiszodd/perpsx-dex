# PerpsX DEX - Deployment Guide

## Setup Complete! ✅

Your local repository is ready. Follow these steps to deploy to Vercel:

### Step 1: Push to GitHub

1. **Create a new repository on GitHub**
   - Go to https://github.com/new
   - Repository name: `perpsx-dex`
   - Description: "Crypto perpetuals DEX demo with React, Vite, and Tailwind CSS"
   - Click "Create repository"

2. **Add GitHub remote and push**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/perpsx-dex.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy to Vercel

1. **Connect GitHub to Vercel**
   - Go to https://vercel.com
   - Click "Sign up" or "Log in"
   - Click "Continue with GitHub"

2. **Import the project**
   - Click "Import Project"
   - Select "Import Git Repository"
   - Enter: `https://github.com/YOUR_USERNAME/perpsx-dex`
   - Click "Import"

3. **Configure Build Settings**
   - Framework Preset: Select "Vite"
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Click "Deploy"

4. **Wait for deployment**
   - Vercel will build and deploy automatically
   - You'll get a live URL like: `https://perpsx-dex.vercel.app`

### Features Deployed

✨ **Dark-themed crypto perpetuals trading interface**
- Market selector (BTC/ETH/SOL)
- Direction selector (LONG/SHORT)
- Position size selection
- Risk mode (SAFE/BALANCED/DEGENERATE)
- Advanced options with Take Profit & Stop Loss
- Live price updates every 2 seconds
- Real-time P&L calculations
- Smooth animations and transitions
- Mobile-first responsive design

### Next Steps

1. Share your live URL
2. Monitor deployments in Vercel dashboard
3. Updates push automatically when you commit to main branch
4. Set up custom domain in Vercel settings (optional)

### Local Development

```bash
npm install
npm run dev
```

Visit http://localhost:5179/

### Build for Production

```bash
npm run build
npm run preview
```

---

**Repository Status**: Ready for GitHub
**Build Status**: Ready for Vercel
**Live Status**: Pending deployment
