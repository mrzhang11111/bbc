#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

console.log('Building API package...');
execSync('yarn workspace @animeflix/api build', { 
  stdio: 'inherit', 
  cwd: __dirname 
});

console.log('Building frontend package...');
execSync('yarn workspace @animeflix/frontend build', { 
  stdio: 'inherit', 
  cwd: __dirname 
});

console.log('Build completed successfully!');

// Copy frontend build to root for Vercel
if (fs.existsSync('./frontend/.next')) {
  console.log('Copying build output...');
  execSync('cp -r ./frontend/.next ./', { 
    stdio: 'inherit', 
    cwd: __dirname 
  });
}
