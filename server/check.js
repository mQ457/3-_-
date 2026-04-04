const http = require('http');
const paths = ['/', '/landing.html'];
paths.forEach((p) => {
  http.get({hostname: 'localhost', port: 3000, path: p}, (res) => {
    console.log(p, 'status', res.statusCode, 'headers', res.headers);
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      console.log(`${p} body len ${body.length}`);
      console.log(`${p} body:`, JSON.stringify(body.slice(0, 300)));
    });
  }).on('error', (err) => {
    console.error(`${p} error ${err.message}`);
  });
});
