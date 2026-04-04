const http = require('http');
const data = JSON.stringify({ phone: '+79990000000', password: '123456'});
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
};

const req = http.request(options, (res) => {
  console.log('status', res.statusCode);
  let body='';
  res.on('data',(chunk)=>body+=chunk);
  res.on('end', ()=>{
    console.log('body', body);
  });
});

req.on('error',(e)=> console.error('err', e));
req.write(data);
req.end();
