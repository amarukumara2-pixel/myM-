const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://duckduckgo.com/?q=rawbt+base64+image+intent');
  const html = await page.content();
  console.log(html);
  await browser.close();
})();
