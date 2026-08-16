const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Try @netlify/api - has deploy functions
let api;
try {
  api = require('@netlify/api');
  console.log('@netlify/api keys:', Object.keys(api).slice(0, 30));
} catch(e) {
  console.log('@netlify/api error:', e.message);
}

// Try blobs for direct upload
try {
  const blobs = require('@netlify/blobs');
  console.log('@netlify/blobs keys:', Object.keys(blobs).slice(0, 20));
} catch(e) {
  console.log('@netlify/blobs error:', e.message);
}

// Try zip-it-and-ship-it for building a deploy package
try {
  const zipIt = require('@netlify/zip-it-and-ship-it');
  console.log('zip-it keys:', Object.keys(zipIt).slice(0, 20));
} catch(e) {
  console.log('zip-it error:', e.message);
}

// Try local build
try {
  const build = require('@netlify/build');
  console.log('@netlify/build keys:', Object.keys(build).slice(0, 10));
} catch(e) {
  console.log('@netlify/build error:', e.message);
}
