import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||3000);
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root)||!['/index.html','/src/app.js','/src/engine.js','/src/style.css'].includes(pathname==='/'?'/index.html':pathname)){res.writeHead(404);res.end('Not found');return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)],'X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'0.0.0.0',()=>console.log(`Filter Studio listening on port ${port}`));
