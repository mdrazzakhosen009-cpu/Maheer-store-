const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const env = n => String(process.env[n] || '').trim();

if (!env('TURSO_DATABASE_URL') || !env('TURSO_AUTH_TOKEN')) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.');
  process.exit(1);
}
const db = createClient({ url: env('TURSO_DATABASE_URL'), authToken: env('TURSO_AUTH_TOKEN') });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } });
const sessions = new Map();
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use('/api', (req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });
const now = () => new Date().toISOString();
const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
async function exec(sql,args=[]){return db.execute({sql,args});}
async function one(sql,args=[]){const r=await exec(sql,args);return r.rows[0]||null;}
async function many(sql,args=[]){const r=await exec(sql,args);return r.rows;}

async function initDatabase(){
  await exec(`CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price REAL NOT NULL DEFAULT 0,old_price REAL NOT NULL DEFAULT 0,category TEXT NOT NULL DEFAULT 'স্কিন কেয়ার',tags TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '',featured INTEGER NOT NULL DEFAULT 0,is_new INTEGER NOT NULL DEFAULT 1,stock INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',whatsapp TEXT NOT NULL DEFAULT '',messenger TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,items_json TEXT NOT NULL,subtotal REAL NOT NULL,delivery_fee REAL NOT NULL DEFAULT 0,total REAL NOT NULL,payment_method TEXT NOT NULL DEFAULT 'COD',transaction_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  await exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  if(!await one('SELECT id FROM admins WHERE id=1')){
    const p=env('ADMIN_PASSWORD'); if(!p) throw new Error('ADMIN_PASSWORD is required on first startup.');
    await exec('INSERT INTO admins(id,password_hash,created_at,updated_at) VALUES(1,?,?,?)',[sha256(p),now(),now()]);
  }
  const defaults={
    store_name:'MAHEER STORE', site_language:'bn',
    store_tagline:'প্রিমিয়াম স্কিন কেয়ার সংগ্রহ',
    about_store:'মাহীর স্টোরে আপনাদের স্বাগতম। আমাদের এখানে সব ধরনের স্কিন কেয়ার প্রোডাক্ট বিক্রি করা হয়। যে কোনো ধরনের তথ্যের জন্য এআই-এর সাথে নয়, এজেন্টের সাথে যোগাযোগ করুন।',
    store_info:'মাহীর স্টোরে মানসম্মত ও বাছাই করা স্কিন কেয়ার প্রোডাক্ট পাওয়া যায়।',
    delivery_time:'ঢাকার ভিতরে ১–২ দিন, ঢাকার বাইরে ২–৪ দিন।', delivery_fee:'80',
    bkash_number:'', nagad_number:'', rocket_number:'', cod_enabled:'true',
    whatsapp_link:'', instagram_link:'', tiktok_link:'', facebook_link:'',
    chatbot_delivery:'আমাদের ডেলিভারি সাধারণত ঢাকার ভিতরে ১–২ দিন এবং ঢাকার বাইরে ২–৪ দিন।',
    chatbot_store:'মাহীর স্টোরে বিভিন্ন ধরনের স্কিন কেয়ার প্রোডাক্ট বিক্রি করা হয়।',
    chatbot_agent:'যে কোনো তথ্যের জন্য এআই-এর পরিবর্তে আমাদের এজেন্টের সাথে যোগাযোগ করুন।', demo_seeded:'false'
  };
  for(const [k,v] of Object.entries(defaults)) if(!await one('SELECT key FROM settings WHERE key=?',[k])) await exec('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)',[k,String(v),now()]);
  const demo=[
    ['হাইড্রেটিং ফেস ময়েশ্চারাইজার',890,1190,'ময়েশ্চারাইজার','হাইড্রেশন, মুখ, স্কিন কেয়ার','ত্বককে কোমল ও ময়েশ্চারাইজড রাখতে দৈনন্দিন ব্যবহারের জন্য।',1,1,25,'p01.svg'],
    ['ভিটামিন সি ফেস সিরাম',1250,1590,'সিরাম','ভিটামিন সি, সিরাম, উজ্জ্বলতা','দৈনন্দিন স্কিন কেয়ার রুটিনের জন্য জনপ্রিয় সিরাম।',1,1,20,'p02.svg'],
    ['সানস্ক্রিন এসপিএফ ৫০',990,1290,'সানস্ক্রিন','সানস্ক্রিন, SPF 50, রোদ','রোদে বের হওয়ার সময় ত্বকের যত্নের জন্য।',1,0,30,'p05.svg'],
    ['জেন্টল ফেসওয়াশ',650,820,'ফেসওয়াশ','ফেসওয়াশ, ক্লিনজিং','ত্বক পরিষ্কার করার জন্য কোমল ফেসওয়াশ।',1,0,35,'p03.svg'],
    ['নিয়াসিনামাইড সিরাম',1100,1450,'সিরাম','নিয়াসিনামাইড, সিরাম','সহজ দৈনন্দিন স্কিন কেয়ার রুটিনের জন্য।',1,1,18,'p04.svg'],
    ['লিপ কেয়ার বাম',390,490,'লিপ কেয়ার','লিপ বাম, ঠোঁট','ঠোঁটকে নরম ও যত্নে রাখতে ব্যবহারযোগ্য।',0,1,40,'p10.svg'],
    ['অ্যালোভেরা জেল',520,690,'জেল','অ্যালোভেরা, জেল, ত্বক','ত্বককে সতেজ রাখতে হালকা জেল।',1,1,28,'p06.svg'],
    ['রেটিনল নাইট ক্রিম',1450,1790,'নাইট ক্রিম','নাইট ক্রিম, রেটিনল','রাতের স্কিন কেয়ার রুটিনের জন্য সমৃদ্ধ ক্রিম।',1,0,16,'p07.svg'],
    ['হায়ালুরোনিক অ্যাসিড সিরাম',1350,1690,'সিরাম','হায়ালুরোনিক, হাইড্রেশন','ত্বকের আর্দ্রতা ধরে রাখতে দৈনন্দিন ব্যবহারের সিরাম।',1,1,22,'p08.svg'],
    ['চারকোল ক্লিনজিং মাস্ক',780,990,'ফেস মাস্ক','চারকোল, ক্লিনজিং, মাস্ক','গভীরভাবে পরিষ্কার করার জন্য চারকোল ফেস মাস্ক।',0,0,19,'p09.svg'],
    ['আই ক্রিম',950,1250,'আই কেয়ার','আই ক্রিম, চোখের যত্ন','চোখের চারপাশের ত্বকের জন্য কোমল যত্ন।',0,1,15,'p11.svg'],
    ['গ্লো ফেস টোনার',850,1090,'টোনার','টোনার, গ্লো, স্কিন কেয়ার','স্কিন কেয়ার রুটিনের জন্য সতেজ টোনার।',0,1,24,'p12.svg']
  ];
  const assetDir=path.join(__dirname,'public','assets');
  for(const d of demo){
    let image='';
    try{image=`data:image/svg+xml;base64,${require('fs').readFileSync(path.join(assetDir,d[9])).toString('base64')}`}catch{}
    const existing=await one('SELECT id,image FROM products WHERE name=?',[d[0]]);
    if(existing){
      if(!existing.image && image) await exec('UPDATE products SET image=?,updated_at=? WHERE id=?',[image,now(),existing.id]);
    }else{
      await exec('INSERT INTO products(name,price,old_price,category,tags,description,image,featured,is_new,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[d[0],d[1],d[2],d[3],d[4],d[5],image,d[6],d[7],d[8],now(),now()]);
    }
  }
  if(!await one('SELECT id FROM agents LIMIT 1')) await exec('INSERT INTO agents(name,phone,whatsapp,messenger,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',['মাহীর কাস্টমার কেয়ার','01700000000','8801700000000','',1,now(),now()]);
  await exec('UPDATE settings SET value=?,updated_at=? WHERE key=?',['true',now(),'demo_seeded']);
}
async function settings(){const r=await many('SELECT key,value FROM settings');return Object.fromEntries(r.map(x=>[x.key,x.value]));}
function requireAdmin(req,res,next){const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();if(!t||!sessions.has(t))return res.status(401).json({error:'অ্যাডমিন সেশন শেষ হয়েছে। আবার লগইন করুন।'});next();}
function imageData(file){if(!file||!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))throw Error('JPG, PNG, WEBP বা GIF ছবি দিন।');return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;}

app.get('/api/health',async(req,res)=>{try{await one('SELECT 1');res.json({ok:true,database:'turso'});}catch{res.status(500).json({ok:false,error:'Turso connection failed'});}});
app.post('/api/admin/login',async(req,res)=>{try{const a=await one('SELECT password_hash FROM admins WHERE id=1');if(!a||sha256(req.body.password||'')!==a.password_hash)return res.status(401).json({error:'পাসওয়ার্ড সঠিক নয়।'});const t=token();sessions.set(t,Date.now());res.json({ok:true,token:t});}catch{res.status(500).json({error:'লগইন করা যায়নি।'});}});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{const t=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();sessions.delete(t);res.json({ok:true});});
app.post('/api/admin/password',requireAdmin,async(req,res)=>{try{const a=await one('SELECT password_hash FROM admins WHERE id=1');const old=String(req.body.old_password||''),n=String(req.body.new_password||'');if(sha256(old)!==a.password_hash)return res.status(401).json({error:'বর্তমান পাসওয়ার্ড সঠিক নয়।'});if(n.length<6)return res.status(400).json({error:'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'});await exec('UPDATE admins SET password_hash=?,updated_at=? WHERE id=1',[sha256(n),now()]);sessions.clear();res.json({ok:true,login_required:true});}catch{res.status(500).json({error:'পাসওয়ার্ড পরিবর্তন করা যায়নি।'});}});
app.get('/api/settings',async(req,res)=>{try{res.json(await settings());}catch{res.status(500).json({error:'সেটিংস লোড করা যায়নি।'});}});
app.get('/api/products',async(req,res)=>{try{let sql='SELECT * FROM products WHERE 1=1',args=[];const q=String(req.query.search||'').trim(),cat=String(req.query.category||'').trim();if(q){sql+=' AND (name LIKE ? OR category LIKE ? OR tags LIKE ? OR description LIKE ?)';const x=`%${q}%`;args.push(x,x,x,x);}if(cat){sql+=' AND category=?';args.push(cat);}res.json(await many(sql+' ORDER BY featured DESC,is_new DESC,id DESC',args));}catch{res.status(500).json({error:'পণ্য লোড করা যায়নি।'});}});
app.get('/api/agents',async(req,res)=>{try{res.json(await many('SELECT * FROM agents WHERE active=1 ORDER BY id DESC'));}catch{res.status(500).json({error:'এজেন্ট লোড করা যায়নি।'});}});

async function createOrder(body){
  const items=Array.isArray(body.items)?body.items:[];if(!body.customer_name||!body.phone||!body.address||!items.length)throw Error('নাম, মোবাইল, ঠিকানা এবং কমপক্ষে একটি পণ্য লাগবে।');
  const ids=[...new Set(items.map(x=>Number(x.id)).filter(Number.isInteger))];if(!ids.length)throw Error('সঠিক পণ্য নির্বাচন করুন।');
  const products=await many(`SELECT * FROM products WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);const map=new Map(products.map(p=>[Number(p.id),p]));
  const clean=items.map(x=>{const p=map.get(Number(x.id));if(!p)return null;const qty=Math.max(1,Math.min(99,Number(x.qty||1)));return{id:Number(p.id),name:p.name,price:Number(p.price),qty,image:p.image||''};}).filter(Boolean);if(!clean.length)throw Error('নির্বাচিত পণ্যটি আর পাওয়া যাচ্ছে না।');
  const cfg=await settings(),method=String(body.payment_method||'COD');if(!['COD','bKash','Nagad','Rocket'].includes(method))throw Error('সঠিক পেমেন্ট পদ্ধতি নির্বাচন করুন।');if(method==='COD'&&cfg.cod_enabled!=='true')throw Error('ক্যাশ অন ডেলিভারি বন্ধ আছে.');
  if(method!=='COD'&&!String(body.transaction_id||'').trim())throw Error('অনলাইন পেমেন্টের ট্রানজ্যাকশন আইডি দিন।');
  const subtotal=clean.reduce((s,x)=>s+x.price*x.qty,0);const delivery=Number(String(cfg.delivery_fee||'0').replace(/[^0-9.]/g,''))||0;const total=subtotal+delivery;const n=Number((await one('SELECT COALESCE(MAX(id),0)+1 n FROM orders')).n);const code=`MAH-${String(n).padStart(6,'0')}`;
  await exec('INSERT INTO orders(order_code,customer_name,phone,address,items_json,subtotal,delivery_fee,total,payment_method,transaction_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[code,String(body.customer_name).trim(),String(body.phone).trim(),String(body.address).trim(),JSON.stringify(clean),subtotal,delivery,total,method,String(body.transaction_id||'').trim(),'Pending',now(),now()]);
  return{order_id:code,total,delivery_fee:delivery};
}
app.post('/api/orders',async(req,res)=>{try{res.json({ok:true,...await createOrder(req.body||{})});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/orders/:code',async(req,res)=>{try{const o=await one('SELECT * FROM orders WHERE order_code=?',[String(req.params.code).toUpperCase()]);if(!o)return res.status(404).json({error:'অর্ডার পাওয়া যায়নি।'});o.items=JSON.parse(o.items_json);delete o.items_json;res.json(o);}catch{res.status(500).json({error:'অর্ডার লোড করা যায়নি।'});}});

app.get('/api/admin/dashboard',requireAdmin,async(req,res)=>{try{const [orders,products,agents,revenue,customers]=await Promise.all([one('SELECT COUNT(*) c FROM orders'),one('SELECT COUNT(*) c FROM products'),one('SELECT COUNT(*) c FROM agents'),one("SELECT COALESCE(SUM(total),0) revenue FROM orders WHERE status!='Cancelled'"),one('SELECT COUNT(DISTINCT phone) c FROM orders')]);res.json({orders:Number(orders.c),products:Number(products.c),agents:Number(agents.c),customers:Number(customers.c),revenue:Number(revenue.revenue)});}catch{res.status(500).json({error:'ড্যাশবোর্ড লোড করা যায়নি।'});}});
app.get('/api/admin/orders',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM orders ORDER BY id DESC'));}catch{res.status(500).json({error:'অর্ডার লোড করা যায়নি।'});}});
app.patch('/api/admin/orders/:id',requireAdmin,async(req,res)=>{try{const allowed=['Pending','Confirmed','Shipped','Delivered','Cancelled'];const s=allowed.includes(req.body.status)?req.body.status:'Pending';await exec('UPDATE orders SET status=?,updated_at=? WHERE id=?',[s,now(),Number(req.params.id)]);res.json({ok:true});}catch{res.status(500).json({error:'অর্ডার আপডেট করা যায়নি।'});}});
app.get('/api/admin/products',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM products ORDER BY id DESC'));}catch{res.status(500).json({error:'পণ্য লোড করা যায়নি।'});}});
app.post('/api/admin/products',requireAdmin,upload.single('image'),async(req,res)=>{try{const b=req.body;if(!String(b.name||'').trim())throw Error('পণ্যের নাম দিন।');const img=req.file?imageData(req.file):String(b.image||'');await exec('INSERT INTO products(name,price,old_price,category,tags,description,image,featured,is_new,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[String(b.name).trim(),Number(b.price)||0,Number(b.old_price)||0,String(b.category||'স্কিন কেয়ার'),String(b.tags||''),String(b.description||''),img,b.featured==='true'?1:0,b.is_new==='false'?0:1,Number(b.stock)||0,now(),now()]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/admin/products/:id',requireAdmin,upload.single('image'),async(req,res)=>{try{const old=await one('SELECT image FROM products WHERE id=?',[Number(req.params.id)]);if(!old)return res.status(404).json({error:'পণ্য পাওয়া যায়নি।'});const b=req.body,img=req.file?imageData(req.file):String(b.image||old.image||'');await exec('UPDATE products SET name=?,price=?,old_price=?,category=?,tags=?,description=?,image=?,featured=?,is_new=?,stock=?,updated_at=? WHERE id=?',[String(b.name||'').trim(),Number(b.price)||0,Number(b.old_price)||0,String(b.category||'স্কিন কেয়ার'),String(b.tags||''),String(b.description||''),img,b.featured==='true'?1:0,b.is_new==='false'?0:1,Number(b.stock)||0,now(),Number(req.params.id)]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/admin/products/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM products WHERE id=?',[Number(req.params.id)]);res.json({ok:true});}catch{res.status(500).json({error:'পণ্য মুছে ফেলা যায়নি।'});}});
app.get('/api/admin/agents',requireAdmin,async(req,res)=>{try{res.json(await many('SELECT * FROM agents ORDER BY id DESC'));}catch{res.status(500).json({error:'এজেন্ট লোড করা যায়নি।'});}});
app.post('/api/admin/agents',requireAdmin,async(req,res)=>{try{const b=req.body;if(!String(b.name||'').trim())throw Error('এজেন্টের নাম দিন।');await exec('INSERT INTO agents(name,phone,whatsapp,messenger,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[b.name,b.phone||'',b.whatsapp||'',b.messenger||'',b.active===false?0:1,now(),now()]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/admin/agents/:id',requireAdmin,async(req,res)=>{try{const b=req.body;await exec('UPDATE agents SET name=?,phone=?,whatsapp=?,messenger=?,active=?,updated_at=? WHERE id=?',[b.name,b.phone||'',b.whatsapp||'',b.messenger||'',b.active?1:0,now(),Number(req.params.id)]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/admin/agents/:id',requireAdmin,async(req,res)=>{try{await exec('DELETE FROM agents WHERE id=?',[Number(req.params.id)]);res.json({ok:true});}catch{res.status(500).json({error:'এজেন্ট মুছে ফেলা যায়নি।'});}});
app.put('/api/admin/settings',requireAdmin,async(req,res)=>{try{for(const[k,v]of Object.entries(req.body||{})){if(!/^[a-z_]+$/.test(k))continue;await exec('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[k,String(v),now()]);}res.json({ok:true});}catch{res.status(500).json({error:'সেটিংস সংরক্ষণ করা যায়নি।'});}});

async function groq(messages,vision=false){const key=env('GROQ_API_KEY');if(!key)throw Error('AI key missing');const model=vision?(env('GROQ_VISION_MODEL')||'qwen/qwen3.6-27b'):(env('GROQ_MODEL')||'openai/gpt-oss-120b');const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:.15,messages})});if(!r.ok)throw Error(await r.text());const j=await r.json();return j.choices?.[0]?.message?.content||'';}
app.post('/api/chat',async(req,res)=>{try{const cfg=await settings(),products=await many('SELECT id,name,price,category,tags,description,stock FROM products ORDER BY featured DESC,is_new DESC,id DESC');const catalog=products.map(p=>`ID=${p.id}|${p.name}|৳${p.price}|${p.category}|স্টক=${p.stock}|${p.tags}|${p.description}`).join('\n');const system=`তুমি MAHEER STORE-এর অফিসিয়াল শপিং সহকারী। গ্রাহকের ভাষায় উত্তর দাও। শুধু নিচের দোকানের তথ্য ও ক্যাটালগ ব্যবহার করবে, কোনো তথ্য বানাবে না। পণ্য, দাম, স্টক, ডেলিভারি, পেমেন্ট বা এজেন্ট সম্পর্কে ভুল তথ্য দেবে না। গ্রাহক অর্ডার করতে চাইলে পণ্য, পরিমাণ, নাম, ফোন, ঠিকানা, পেমেন্ট পদ্ধতি এবং অনলাইন পেমেন্ট হলে ট্রানজ্যাকশন আইডি একবারে একটি করে নাও। Store: ${cfg.store_info}. Delivery: ${cfg.delivery_time}. Payment: bKash=${cfg.bkash_number||'সেট করা নেই'}, Nagad=${cfg.nagad_number||'সেট করা নেই'}, Rocket=${cfg.rocket_number||'সেট করা নেই'}, COD=${cfg.cod_enabled}. Agent: ${cfg.chatbot_agent}. Catalog:\n${catalog}`;const raw=await groq([{role:'system',content:system},{role:'user',content:String(req.body.message||'')}]);res.json({reply:raw||'আপনাকে কীভাবে সাহায্য করতে পারি?'});}catch{const cfg=await settings();res.json({reply:`আমি এখন এআই উত্তর দিতে পারছি না। ${cfg.chatbot_agent||'দয়া করে এজেন্টের সাথে যোগাযোগ করুন।'}`});}});

app.use('/admin',express.static(path.join(__dirname,'admin')));
app.use(express.static(path.join(__dirname,'public')));
app.get('/admin/*',(req,res)=>res.sendFile(path.join(__dirname,'admin','index.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initDatabase().then(()=>app.listen(PORT,()=>console.log(`MAHEER STORE server listening on ${PORT}; Turso connected.`))).catch(e=>{console.error('Startup failed:',e);process.exit(1);});
