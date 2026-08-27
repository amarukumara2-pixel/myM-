import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://html.duckduckgo.com/html/?q=ru.a402d.rawbtprinter+base64+image');
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.substring(0, 2000));
  await browser.close();
})();
