#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath;

  // Route handling
  if (req.url === '/' || req.url === '/home' || req.url === '/home.html') {
    filePath = path.join(__dirname, 'home.html');
  } else if (req.url === '/landing' || req.url === '/landing.html' || req.url === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else if (req.url === '/dashboard' || req.url === '/dashboard.html') {
    filePath = path.join(__dirname, 'dashboard.html');
  } else if (req.url === '/admin' || req.url === '/admin.html') {
    filePath = path.join(__dirname, 'admin.html');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>404 - غير موجود</title>
      </head>
      <body style="font-family: Tajawal; text-align: center; padding: 40px; background: #F8FAFC;">
        <h1 style="color: #0F172A;">404 - الصفحة غير موجودة</h1>
        <p style="color: #64748B; font-size: 16px;">عذراً، الصفحة التي تبحث عنها غير موجودة</p>
        <div style="margin-top: 30px;">
          <a href="/" style="background: #16A34A; color: #fff; padding: 12px 24px; border-radius: 10px; text-decoration: none; margin: 0 10px; font-weight: 800; display: inline-block;">الصفحة الرئيسية</a>
          <a href="/landing" style="background: #1E2A52; color: #fff; padding: 12px 24px; border-radius: 10px; text-decoration: none; margin: 0 10px; font-weight: 800; display: inline-block;">الموقع التعريفي</a>
          <a href="/dashboard" style="background: #0E7C3A; color: #fff; padding: 12px 24px; border-radius: 10px; text-decoration: none; margin: 0 10px; font-weight: 800; display: inline-block;">لوحة الشركات</a>
          <a href="/admin" style="background: #DC2626; color: #fff; padding: 12px 24px; border-radius: 10px; text-decoration: none; margin: 0 10px; font-weight: 800; display: inline-block;">لوحة الإدارة</a>
        </div>
      </body>
      </html>
    `);
    res.end();
    return;
  }

  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.write('<h1>404 - Not Found</h1>');
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(content);
    res.end();
  });
});

const PORT = 3000;
server.listen(PORT, 'localhost', () => {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  🚀 مرصد Marsad - منصة تقييم موثوقية الأعمال       ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  console.log(`✅ الخادم يعمل على: http://localhost:${PORT}\n`);

  console.log(`📍 الأقسام الثلاثة الرئيسية:\n`);

  console.log(`   1️⃣  الموقع التعريفي (Landing Website)`);
  console.log(`       🔗 http://localhost:${PORT}/landing`);
  console.log(`       📄 الصفحات: الرئيسية، عن المنصة، الباقات، تواصل، أسئلة شائعة، تسجيل\n`);

  console.log(`   2️⃣  لوحة تحكم الشركات (Company Dashboard)`);
  console.log(`       🔗 http://localhost:${PORT}/dashboard`);
  console.log(`       📊 للشركات والمساهمين - 11 صفحة\n`);

  console.log(`   3️⃣  لوحة تحكم الإدارة (Admin Dashboard)`);
  console.log(`       🔗 http://localhost:${PORT}/admin`);
  console.log(`       🔐 للمسؤولين - 7 صفحات إدارية\n`);

  console.log(`╚═══════════════════════════════════════════════════════╝\n`);
});
