# WhatsApp Dashboard

## Installation

1. npm install
2. node database/init.js
3. pm2 start ecosystem.config.js

## Access

Open your browser and visit:

http://your-server-ip:3000

## Login

Use the default credentials:

- Username: admin
- Password: admin123

## How to use

### Dashboard
- View total accounts, connected accounts, contacts, and messages sent today.
- Recent messages are shown in the table for quick inspection.

### Accounts
- Add new WhatsApp accounts with name and phone number.
- Open the QR page to scan login codes for each account.
- Reconnect or disconnect accounts.
- Rename or delete accounts.

### Flows
- Build a message flow for each account.
- Add steps like text, image, video, audio, delay, waitReply, condition, and end.
- Upload media files for image, video, and audio steps.
- Save the flow to run automatically when contacts message the account.

### Conversations
- View a list of contacts and their last message.
- Open a contact chat to see the message history with incoming and outgoing bubbles.

### Settings
- Update the admin username and password.
- Save changes directly from the settings page.

## Notes
- Uploaded media files are stored in `uploads/`.
- WhatsApp client sessions are stored in `sessions/`.
- The app uses SQLite via `database.db`.
