CST2120 CW2 - Setup and Usage
=============================

Requirements
- Node.js 18+
- MongoDB running locally or accessible via MONGO_URL
- Chrome/Edge installed, or set PUPPETEER_EXECUTABLE_PATH to a Chromium/Chrome/Edge executable for the inspiration scraper.

Install
1) npm install axios cors express express-session mongodb multer puppeteer

Run
1) npm start
2) Open http://localhost:8080/M01036102/

Environment
- MONGO_URL: Mongo connection string (default: mongodb://localhost:27017)
- DB_NAME: Database name (default: art_share)
- SESSION_SECRET: Session secret string
- PUPPETEER_EXECUTABLE_PATH: Optional; path to Chrome/Chromium/Edge executable if auto-detect fails

Notes
- Inspiration endpoint scrapes lori art quotes live; if the browser is missing you will get 502 and a message.
- Uploads are served from public/uploads.
- SPA deep-links are served under /M01036102/ (feed, post, profile, search, map, inspiration).
