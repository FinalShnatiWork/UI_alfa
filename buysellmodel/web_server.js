const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath);
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if(err.code == 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`\n==============================================`);
    console.log(`🌐 WEB SERVER RUNNING`);
    console.log(`➡️  Open your browser to: http://localhost:${port}/`);
    console.log(`==============================================\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const next = server.address()?.port + 1 || 3001;
    console.log(`⚠️  Port ${err.port || 3000} is busy — trying port ${next}...`);
    server.close();
    startServer(next);
  } else {
    throw err;
  }
});

startServer(3000);
