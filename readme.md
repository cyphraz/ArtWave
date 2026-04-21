ArtWave
=======
ArtWave is a social media platform built for artists. Users can share their artwork,
discover pieces from other creators, like and comment on posts, and follow artists
they admire — all in one place.

Overview
--------
ArtWave gives artists a dedicated space to showcase their work and grow an audience.
The platform is built on a Node.js/Express backend with a MongoDB database, handling
image uploads, user profiles, and social interactions.

Features
--------
* Upload and share artwork with the community
* Browse a feed of artwork from all artists
* Like and comment on posts
* Follow other artists
* User profiles displaying uploaded works
* Image upload support via Multer
* Persistent data storage with MongoDB

How to Use
----------
1. Register a new account or log in.
2. Upload your artwork from your profile.
3. Browse the feed to discover other artists.
4. Like and comment on artwork you enjoy.
5. Follow artists to stay updated with their work.

Tech Stack
----------
* Frontend  — HTML5, CSS3, JavaScript
* Backend   — Node.js, Express.js
* Database  — MongoDB, Mongoose
* Uploads   — Multer (image handling)

Project Structure
-----------------
  public/
    index.html         - main entry point
    uploads/artworks/  - uploaded artwork images

  server.js            - main server and API routes
  package.json         - project dependencies
  .gitignore           - ignored files (node_modules, .env)

Run Locally
-----------
1. Clone the repository:

     git clone https://github.com/cyphraz/ArtWave.git

2. Navigate into the project folder:

     cd ArtWave

3. Install dependencies:

     npm install

4. Start the server:

     node server.js

5. Open your browser and go to:

     http://localhost:3000

Notes
-----
* Make sure MongoDB is running locally before starting the server.
* Uploaded images are stored in public/uploads/artworks/.
* A .env file may be required for database connection string and secrets —
  create one in the root folder if needed.

Author
------
Zarif Saleem — github.com/cyphraz
