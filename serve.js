const h=require('http'),fs=require('fs'),p=require('path');
const d=p.join(__dirname,'report');
h.createServer((q,r)=>{
  let f=q.url==='/'?'/report.html':q.url;
  f=p.join(d,f);
  fs.readFile(f,(e,b)=>{
    if(e){r.writeHead(404);r.end('Not Found')}
    else{
      const m={'text/html':1,'text/css':1,'application/javascript':1,'image/png':1,'image/svg+xml':1};
      const t=f.endsWith('.css')?'text/css':f.endsWith('.js')?'application/javascript':f.endsWith('.png')?'image/png':f.endsWith('.svg')?'image/svg+xml':'text/html';
      r.writeHead(200,{'Content-Type':t});r.end(b)
    }
  })
}).listen(3000,()=>console.log('http://localhost:3000'));