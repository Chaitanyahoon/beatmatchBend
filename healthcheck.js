const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 8080,
  timeout: 2000,
  path: '/health'
};

const request = http.request(options, (res) => {
  console.log(`Health check status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.error('Health check failed:', err);
  process.exit(1);
});

request.end(); 