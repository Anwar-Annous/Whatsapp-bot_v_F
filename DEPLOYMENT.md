# VPS Deployment Guide (Ubuntu)

## 1. Prepare the Ubuntu server

1. SSH into your VPS:

```bash
ssh youruser@your-vps-ip
```

2. Update packages:

```bash
sudo apt update && sudo apt upgrade -y
```

3. Install required system packages:

```bash
sudo apt install -y curl git build-essential
```

## 2. Install Node.js and npm

Recommended: Node.js 18 or newer.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v
npm -v
```

## 3. Copy the project to the VPS

Option 1: Git clone if repository is hosted:

```bash
git clone <your-repo-url> whatsapp-bot
cd whatsapp-bot
```

Option 2: Upload files using SCP or SFTP.

## 4. Install dependencies

From the project folder:

```bash
cd /path/to/whatsapp-bot
npm install
```

## 5. Create required folders

```bash
mkdir -p uploads sessions
chmod 755 uploads sessions
```

## 6. Configure environment variables

Create a `.env` file if you want, or set variables in your process manager.

Required:

- `PORT` (optional, default is 3000)
- `SESSION_SECRET`

Example `.env` content:

```env
PORT=3000
SESSION_SECRET=your-secret-key
```

> Note: This app currently uses local SQLite at `database.db` and stores WhatsApp sessions in `sessions/`.

## 7. Start the app manually

```bash
npm start
```

Then open `http://your-vps-ip:3000`.

## 8. Run the app as a service

### Option A: Using PM2

Install PM2:

```bash
sudo npm install -g pm2
```

Start the app:

```bash
cd /path/to/whatsapp-bot
pm2 start server.js --name whatsapp-bot
pm2 save
pm2 startup
```

### Option B: Using systemd

Create `/etc/systemd/system/whatsapp-bot.service` with:

```ini
[Unit]
Description=WhatsApp Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/whatsapp-bot
ExecStart=/usr/bin/node /path/to/whatsapp-bot/server.js
Restart=on-failure
Environment=PORT=3000
Environment=SESSION_SECRET=your-secret-key

[Install]
WantedBy=multi-user.target
```

Reload and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-bot
sudo systemctl start whatsapp-bot
sudo systemctl status whatsapp-bot
```

## 9. Optional: Set up a reverse proxy with Nginx

Install Nginx:

```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/whatsapp-bot`:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 10. Verify

Check the app with:

```bash
curl http://127.0.0.1:3000
```

And open your browser at `http://your-vps-ip:3000` or your domain.

## 11. Important notes

- Keep `sessions/` and `database.db` persisted.
- Ensure `whatsapp-web.js` can run Puppeteer in headless mode on your VPS.
- If you use a firewall, allow port 3000 or 80.
