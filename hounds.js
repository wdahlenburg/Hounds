const puppeteer = require('puppeteer-extra');
const normalizeUrl = require("normalize-url");
var validUrl = require("valid-url");
var url = require("url");
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

var myArgs = process.argv.slice(2);
let scope = myArgs[1];
let proxy;
if (myArgs.length > 2) {
  proxy = myArgs[2];
} else {
  proxy = "";
}
let visitedUrls = [];
let urlsToVisit = [];
let hashCodes = [];
let browser;

async function run() {
  while (urlsToVisit.length != 0) {
    // console.log("urlsToVisit is " + urlsToVisit);
    var mainUrl = urlsToVisit.shift();
    var old_pages;
    var page;
    try {
      old_pages = await browser.pages().catch(function () {});
      if (old_pages.length != 0) {
        page = old_pages[0];
      } else {
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1040 });
      }
    } catch (err) {
      console.error(err.message);
    }
    if (visitedUrls.includes(mainUrl)) {
      run();
      return;
    }
    try {
      if (!url.parse(mainUrl).hostname.endsWith(scope)) {
        return;
      }
    } catch (err) {
      await run();
      return;
    }
    if (!validUrl.isUri(mainUrl)) {
      //console.log("Mainurl is bad " + mainUrl);
      await run();
      return;
    }
    // counter += 1;
    try {
      //const page = await browser.newPage();
      //let mainUrlStatus;
      await page.setRequestInterception(true);
      let requrl = "";
      page.on("request", (request) => {
        requrl = request.url();
        if (url.parse(requrl).hostname.endsWith(scope)) {
          if (!visitedUrls.includes(requrl)) {
            console.log(requrl);
            visitedUrls.push(requrl);
          }
        }
        request.continue().catch(function () {});
      });
      //page.on("requestfailed", request => {
      //  requrl = request.url();
      //  console.log("request failed url:", url);
      //});
      page.on("response", (response) => {
        const request = response.request();
        const respurl = request.url();
        const status = response.status();
        if (respurl != requrl && url.parse(respurl).hostname.endsWith(scope)) {
          if (!visitedUrls.includes(respurl)) {
            console.log("response url:", respurl, "status:", status);
            visitedUrls.push(respurl);
          }
        }
      });
      await page.goto(mainUrl, {
        waitUntil: "networkidle2",
      });
      visitedUrls.push(mainUrl);
      //console.log("status for main url:", mainUrlStatus);
      var elems = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"), (a) =>
          a.getAttribute("href")
        )
      );

      parseElems(elems, mainUrl);

      /*
        Try to click submit on any form. Only do this once per form to prevent getting stuck in spammy loops
      */

      var prev_hash_count = hashCodes.length;

      hashCodes = await page.evaluate((hashCodes) => {
        // console.log("Hashcodes is " + hashCodes);
        get_string = (el) => el.outerHTML;
        String.prototype.hashCode = function () {
          var hash = 0;
          if (this.length == 0) {
            return hash;
          }
          for (var i = 0; i < this.length; i++) {
            var char = this.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
          }
          return hash;
        };
        var forms = document.getElementsByTagName("FORM");
        for (var i = 0; i < forms.length; i++) {
          var hash = get_string(forms[i]).hashCode();
          if (!hashCodes.includes(hash)) {
            hashCodes.push(hash);
            forms[i].submit();
          }
        }
        return hashCodes;
      }, hashCodes);
      // console.log("Hashcodes are now " + hashCodes);

      var curr_hash_count = hashCodes.length;

      /*
        If we clicked on a new form, then we should analyze the current DOM to see if we were redirected or if new links were added.
      */
      if (curr_hash_count > prev_hash_count) {
        elems = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a[href]"), (a) =>
            a.getAttribute("href")
          )
        );

        parseElems(elems, mainUrl);
      }
      //console.log("Found elements: ", elems);
    } catch (err) {
      // console.error(err.message);
    }

    if (urlsToVisit.length == 0) {
      await browser.close();
      return;
    }
  }
}

function parseElems(elems, mainUrl) {
  for (var e in elems) {
    if (elems[e].startsWith("http")) {
      let normal_u = normalizeUrl(elems[e]);
      //console.log("Normal url is: " + normal_u);
      if (validUrl.isUri(normal_u)) {
        if (
          url.parse(normal_u).hostname.endsWith(scope) &&
          !visitedUrls.includes(normal_u) &&
          !urlsToVisit.includes(normal_u)
        ) {
          urlsToVisit.push(normal_u);
        }
        // await run(normal_u);
      } else {
        //  console.log("BAD url: " + normal_u);
      }
    } else {
      try {
        let parsedUrl = url.parse(mainUrl);
        let u = parsedUrl.protocol + "//" + parsedUrl.host + "/" + elems[e];
        let normal_u = normalizeUrl(u);
        //console.log("Parsed u: " + normal_u)
        if (validUrl.isUri(normal_u)) {
          if (
            url.parse(normal_u).hostname.endsWith(scope) &&
            !visitedUrls.includes(normal_u) &&
            !urlsToVisit.includes(normal_u)
          ) {
            urlsToVisit.push(normal_u);
          }
          // await run(normal_u);
        } else {
          //console.log("BAD url: " + normal_u);
        }
      } catch (err) {
        //  console.log("Extra bad url is " + elems[e]  + " " + u);
      }
    }
  }
}

start(myArgs[0], proxy);

async function start(mainUrl) {
  if (proxy != ''){
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      args: ["--window-size=1920,1040",
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.0 Safari/537.36",
      "--proxy-server=http://" + proxy 
      ],
    });
  } else {
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      args: ["--window-size=1920,1040", 
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.0 Safari/537.36"
      ],
    });
  }
  urlsToVisit.push(mainUrl);
  run();
}
