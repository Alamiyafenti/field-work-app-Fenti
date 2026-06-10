# Deployment Guide

This guide covers deploying the Field Work Reporting System to production.

## Pre-Production Checklist

- [ ] Environment variables configured
- [ ] Database backed up
- [ ] HTTPS certificates obtained
- [ ] API keys secured
- [ ] Rate limiting configured
- [ ] Security headers enabled
- [ ] CORS properly configured

## Environment Configuration

Update `.env` for production:

```env
# Database
DB_PATH=./field_work.db

# Server
PORT=5000
NODE_ENV=production

# Manager Access (use strong values!)
MANAGER_USERNAME=manager_user
MANAGER_PASSWORD=strong_password_here

# CORS
FRONTEND_URL=https://your-domain.com
```

## Backend Deployment (Heroku Example)

```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create app
heroku create field-work-api

# Set config variables
heroku config:set DB_PATH=./field_work.db
heroku config:set MANAGER_USERNAME=your_manager_user
heroku config:set MANAGER_PASSWORD=your_strong_password
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# Check logs
heroku logs --tail --app field-work-api
```

## Frontend Deployment (Vercel Example)

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to frontend
cd frontend

# Deploy
vercel --prod

# Set environment variable
vercel env add REACT_APP_API_URL https://your-api-domain.com
```

## Backend Deployment (AWS EC2)

1. **Create EC2 Instance**
   - Ubuntu 20.04 LTS
   - t3.micro or larger
   - Security group: Allow ports 80, 443, 22

2. **Install Dependencies**
   ```bash
   sudo apt update
   sudo apt install nodejs npm nginx
   ```

3. **Deploy Application**
   ```bash
   git clone your-repo
   cd backend
   npm install
   npm run build
   ```

4. **Setup PM2 (Process Manager)**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "field-work-api"
   pm2 startup
   pm2 save
   ```

5. **Setup Nginx Reverse Proxy**
   ```nginx
   server {
     listen 80;
     server_name your-domain.com;

     location / {
       proxy_pass http://localhost:5000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

6. **Setup SSL (Let's Encrypt)**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Frontend Deployment (Traditional Server)

1. **Build Application**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy Build Files**
   ```bash
   # Upload build/ folder to server
   scp -r build/* user@server:/var/www/html/
   ```

3. **Configure Web Server**
   ```nginx
   server {
     listen 80;
     server_name your-domain.com;

     root /var/www/html;
     index index.html;

     location / {
       try_files $uri $uri/ /index.html;
     }
   }
   ```

## Docker Deployment

### Dockerfile (Backend)

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3'
services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
         DB_PATH: /app/data/field_work.db
      volumes:
         - ./backend-data:/app/data

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:5000
```

## Security Hardening

1. **API Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100
   });
   app.use('/api/', limiter);
   ```

2. **Security Headers**
   ```javascript
   const helmet = require('helmet');
   app.use(helmet());
   ```

3. **Input Validation**
   - Use express-validator (already configured)
   - Implement SQL injection prevention
   - Sanitize all user inputs

4. **Authentication**
   - Consider upgrading from PIN to JWT tokens
   - Implement OAuth2 for enterprise users
   - Add session management

5. **HTTPS/SSL**
   - Redirect HTTP to HTTPS
   - Use strong SSL certificates
   - Set HSTS headers

## Monitoring & Logging

Setup monitoring:

```bash
# Install monitoring tools
npm install morgan winston

# Setup structured logging
const logger = require('winston');
```

Use monitoring services:
- New Relic
- DataDog
- CloudWatch
- Sentry (error tracking)

## Backup Strategy

1. **Database Backups**
   ```bash
   # Daily backup
   pg_dump field_work_db > backup_$(date +%Y%m%d).sql
   ```

2. **Automated Backups**
   - Use AWS S3 for backup storage
   - Setup daily backup jobs
   - Test restore procedures

## Performance Optimization

1. **Database**
   - Add indexes (already configured)
   - Use connection pooling
   - Archive old reports

2. **Frontend**
   - Enable gzip compression
   - Minify CSS/JS
   - Use CDN for static files
   - Lazy load components

3. **Backend**
   - Cache frequently accessed data
   - Implement pagination
   - Use database query optimization

## Rollback Procedure

In case of issues:

```bash
# Stop application
pm2 stop field-work-api

# Revert to previous version
git revert commit-hash
npm install
npm build

# Restart
pm2 start field-work-api

# Check status
pm2 logs field-work-api
```

## Post-Deployment

- [ ] Test all functionality in production
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Verify backups are working
- [ ] Setup alerts for downtime
- [ ] Document deployment process
- [ ] Create incident response plan

## Support & Help

For deployment issues:
1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Check firewall rules
5. Review security group settings
