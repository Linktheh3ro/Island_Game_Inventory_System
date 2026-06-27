# Deployment Guide - CharLock Neo Beta

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- `.env` file configured (see `.env.example`)

### Local Development
```bash
# Copy environment template
cp .env.example .env

# Update .env with your MongoDB credentials and URLs
# Then start everything:
docker-compose up --build
```

Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api
- MongoDB: localhost:27017

### Environment Variables

Copy `.env.example` to `.env` and update:

```env
# MongoDB - Use your own MongoDB instance or Atlas
MONGO_URL=mongodb+srv://user:password@cluster.mongodb.net/charlock
MONGO_USER=admin
MONGO_PASSWORD=your-secure-password
DB_NAME=charlock

# Frontend will communicate with backend via Docker network
REACT_APP_API_URL=http://backend:8000/api
```

## Production Deployment

### Option 1: Docker Hub (Simple)
```bash
# Build images
docker build -t yourusername/charlock-frontend ./frontend
docker build -t yourusername/charlock-backend ./backend

# Push to Docker Hub
docker push yourusername/charlock-frontend
docker push yourusername/charlock-backend
```

Then deploy on any platform that supports Docker (Heroku, Railway, Render, AWS ECS, etc.)

### Option 2: Cloud Platforms

#### Railway.app (Recommended for beginners)
1. Connect GitHub repo
2. Add services: Select `docker-compose.yml`
3. Set environment variables in dashboard
4. Deploy

#### Render.com
1. Create Web Service from Docker
2. Point to repository
3. Set build command: `docker-compose up`
4. Configure environment

#### Heroku (Legacy but works)
```bash
heroku login
heroku create charlock-beta
heroku addons:create mongolab:sandbox
# Set env vars in dashboard
git push heroku main
```

### Option 3: Self-Hosted (VPS)
```bash
# SSH into your server
ssh user@your-server.com

# Install Docker & Docker Compose
curl -sSL https://get.docker.com | sh

# Clone repo and deploy
git clone https://github.com/yourusername/charlock-neo.git
cd charlock-neo
cp .env.example .env
# Edit .env with production values
docker-compose up -d
```

## Managing the Application

### View logs
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

### Stop the application
```bash
docker-compose down
```

### Persist data
MongoDB data is automatically persisted in the `mongodb_data` volume.

### Update and redeploy
```bash
git pull
docker-compose down
docker-compose up --build -d
```

## Beta Release Checklist

- [ ] `.env` configured with production MongoDB URL
- [ ] `CORS_ORIGINS` updated with production domain
- [ ] `REACT_APP_API_URL` points to production backend
- [ ] All environment variables set in deployment platform
- [ ] MongoDB database backed up
- [ ] Error logging configured
- [ ] Health checks verified (`/api/` endpoint responds)
- [ ] Test full user flow before going live

## Troubleshooting

### Containers won't start
```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### MongoDB connection failed
- Verify `MONGO_URL` is correct
- Check MongoDB credentials
- Ensure MongoDB is accessible (whitelist IP if using Atlas)

### Frontend can't reach backend
- Frontend must use `http://backend:8000` internally (in Docker network)
- External requests use the actual domain/IP + port 8000

### Port conflicts
- Change ports in `docker-compose.yml` if 3000 or 8000 are in use
- Update `REACT_APP_API_URL` if backend port changes
