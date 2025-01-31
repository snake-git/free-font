import fs from 'fs-extra';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fontDatas = createRequire(import.meta.url)("./data.json");

function containsNoChineseCharacters(str) {
  // 正则表达式匹配中文汉字范围
  const chineseCharacterPattern = /[\u4e00-\u9fa5]/;
  // 测试字符串中是否包含中文汉字
  return !chineseCharacterPattern.test(str);
}
// 动态生成 HTML 内容
const generateHTMLContent = (fontPath, fileName) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @font-face {
      font-family: 'CustomFont';
      src: url('${fontPath}') format('truetype');
      /*src: url('../docs/fonts/美績点陣體/美績点陣體.ttf') format('truetype');*/
    }
    html { height: 100%; }
    body {
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      background-color: #141414;
      font-family: 'CustomFont', sans-serif;
    }
    .poster > div:first-child { line-height: 1; padding: 0 12px; }
    .poster > div:last-child { font-size: 28px; padding-top: 6px; }
    .poster { text-align: center; font-size: 42px; color: #ffffff; }
  </style>
  <title>Font Preview</title>
</head>
<body>
  <div class="poster">
    <div>${fileName}</div>
    <div>Hello World! 123</div>
  </div>
</body>
</html>
`;

async function createPosterImage(page, filePath, fontName = "") {
  const fontPath = path.relative(__dirname, path.resolve(filePath)).split(path.sep).join("/");
  const htmlFilePath = path.join(__dirname, 'poster.html');
  const fontText = containsNoChineseCharacters(fontName) ? `${fontName}字体` : fontName;
  const htmlContent = generateHTMLContent(fontPath, fontText.replace(/-/g, " "));
  fs.writeFileSync(htmlFilePath, htmlContent);
  const fileHTMLPath = `file:${htmlFilePath}`;
  await page.goto(fileHTMLPath, { waitUntil: 'networkidle2' });
  const width = 420;
  const height = 180;
  const deviceScaleFactor = 1;
  await page.setViewport({ width: width, height: height, deviceScaleFactor });
  const buffer = await page.screenshot({ type: 'jpeg' });
  const fileName = `docs/images/${fontName}-poster.jpg`;
  fs.writeFileSync(fileName, buffer);
  console.log(`Image created and saved as \x1b[32;1m${fileName}\x1b[0m! ${filePath}`);
}

async function getFontFiles(dirPath) {
  let fontFiles = [];
  const fontExtensions = ['.ttf', '.otf'];
  async function traverseDirectory(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (let entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await traverseDirectory(fullPath);
      } else if (fontExtensions.includes(path.extname(entry.name).toLowerCase())) {
        fontFiles.push(fullPath);
      }
    }
  }
  await traverseDirectory(dirPath);
  return fontFiles;
}

function removeRootPathSegment(filePath) {
  const segments = filePath.split(path.sep);
  if (segments.length > 1) {
      segments.shift(); // 移除第一个路径段
  }
  return segments.join(path.sep);
}

;(async () => {
  let argv = process.argv;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  if (argv.includes("-a")) {
    let fontPath = argv[argv.length - 1]
    if (!!fontPath && fontPath !== "-a") {
      let fontName = path.basename(fontPath, path.extname(fontPath)).trim();
      if (fontName) {
        const resultData = [...fontDatas];
        let dataIndex = resultData.findIndex((item) => item.name === fontName)
        if (dataIndex === -1) {
          resultData.push({
            name: fontName,
            path: removeRootPathSegment(fontPath)
          })
        } else {
          resultData[dataIndex].name = fontName;
          resultData[dataIndex].path = removeRootPathSegment(fontPath);
        }
        await createPosterImage(page, fontPath, fontName);
        fs.writeFileSync("./scripts/data.json", JSON.stringify(resultData, null, 2));
      }
    } else {
      console.log("Please enter a font file path");
    }
  } else {
    // create all images
    await fs.emptyDir('docs/images');
    const files = await getFontFiles("./docs/fonts");
    const resultData = []
    for (const filename of files) {
      let fontName = path.basename(filename, path.extname(filename)).trim();
      if (!fontName.startsWith("__")) {
        let data = fontDatas.find((item) => item.name === fontName) || {};
        data.name = fontName;
        data.path = removeRootPathSegment(filename);
        resultData.push(data);
        await createPosterImage(page, filename, fontName);
      } else {
        console.log(`Skip 2 font file: \x1b[35;1m ${filename} \x1b[0m"`);
      }
    }
    fs.writeFileSync("./scripts/data.json", JSON.stringify(resultData, null, 2));
  }
  await browser.close();
})();