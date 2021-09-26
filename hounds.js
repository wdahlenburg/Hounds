#!/usr/bin/env node

const yargs = require('yargs/yargs')
const {
    hideBin
} = require('yargs/helpers')
const puppeteer = require('puppeteer-extra');
const normalizeUrl = require("normalize-url");
var validUrl = require("valid-url");
var url = require("url");
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const argv = yargs(hideBin(process.argv))
    .option('url', {
        alias: 'u',
        type: 'string',
        description: 'Site to crawl'
    })
    .option('scope', {
        alias: 's',
        type: 'string',
        description: 'Allowed scope (Ex: example.com)'
    })
    .option('proxy', {
        alias: 'p',
        type: 'string',
        description: 'Proxy (Ex: proto://IP:port => http://127.0.0.1:8080)'
    })
    .option('full', {
        alias: 'f',
        type: 'boolean',
        description: 'Full HTTP requests in JSON format (default: false)'
    })
    .option('robots', {
        alias: 'r',
        type: 'boolean',
        description: 'Flag to scan robots.txt'
    })
    .demandOption(['url', 'scope'], 'Include both the url and scope parameters')
    .help()
    .argv

let scope = argv.scope;
let proxy = argv.proxy;
let fullMode = argv.full;
let robots = argv.robots;
let visitedUrls = [];
let urlsToVisit = [];
let hashCodes = [];
let browser;

async function run() {
    while (urlsToVisit.length != 0) {
        var mainUrl = urlsToVisit.shift();
        var old_pages;
        var page;
        try {
            old_pages = await browser.pages().catch(function() {});
            if (old_pages.length != 0) {
                page = old_pages[0];
            } else {
                page = await browser.newPage();
                await page.setViewport({
                    width: 1920,
                    height: 1040
                });
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
            await run();
            return;
        }

        try {
            await page.setRequestInterception(true);
            let requrl = "";
            page.on("request", (request) => {
                requrl = request.url();
                if (url.parse(requrl).hostname.endsWith(scope)) {
                    if (fullMode){
                        const result = formatRequest(request);
                        if (!visitedUrls.includes(result)) {
                            console.log(result);
                            visitedUrls.push(result);
                        }
                    } else {
                        if (!visitedUrls.includes(requrl)) {
                            console.log(requrl);
                            visitedUrls.push(requrl);
                        }
                    }
                }
                request.continue().catch(function() {});
            });

            page.on("response", (response) => {
                const request = response.request();
                const respurl = request.url();
                if (respurl != requrl && url.parse(respurl).hostname.endsWith(scope)) {
                    if (fullMode){
                        const result = formatRequest(request);
                        if (!visitedUrls.includes(result)) {
                            console.log(result);
                            visitedUrls.push(result);
                        }
                    } else {
                        if (!visitedUrls.includes(requrl)) {
                            console.log(requrl);
                            visitedUrls.push(requrl);
                        }
                    }
                }
            });
            await page.goto(mainUrl, {
                waitUntil: "networkidle2",
            });
            visitedUrls.push(mainUrl);

            var elems = await page.evaluate(() =>
                Array.from(document.querySelectorAll("a[href]"), (a) =>
                    a.getAttribute("href")
                )
            );

            if (robots && elems.length == 0 && mainUrl.includes('/robots.txt')){
                const element = await page.waitForSelector('pre');
                const value = await element.evaluate(el => el.textContent);
                getRobots(value, argv.url)
            }

            parseElems(elems, mainUrl);

            // Try to click submit on any form. Only do this once per form to prevent getting stuck in spammy loops
            var prev_hash_count = hashCodes.length;

            hashCodes = await page.evaluate((hashCodes) => {
                var get_string = (el) => el.outerHTML;
                String.prototype.hashCode = function() {
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

                function listAllEventListeners() {
                  const allElements = Array.prototype.slice.call(document.querySelectorAll('*'));
                  allElements.push(document);
                  allElements.push(window);

                  const types = [];

                  for (let ev in window) {
                    if (/^on/.test(ev)) types[types.length] = ev;
                  }

                  let elements = [];
                  for (let i = 0; i < allElements.length; i++) {
                    const currentElement = allElements[i];
                    for (let j = 0; j < types.length; j++) {
                      if (typeof currentElement[types[j]] === 'function') {
                        elements.push({
                          "node": currentElement,
                          "type": types[j],
                          "func": currentElement[types[j]],
                        });
                      }
                    }
                  }

                  return elements.sort(function(a,b) {
                    return a.type.localeCompare(b.type);
                  });
                }

                var forms = document.getElementsByTagName("FORM");
                for (var i = 0; i < forms.length; i++) {
                    var hash = get_string(forms[i]).hashCode();
                    if (!hashCodes.includes(hash)) {
                        hashCodes.push(hash);
                        forms[i].submit();
                    }
                }

                // Take a look at all javascript event listeners
                listeners = listAllEventListeners();
                for (var i = 0; i < listeners.length; i++) {
                    var hash = listeners[i].func.toString().hashCode();
                    if (!hashCodes.includes(hash)) {
                        hashCodes.push(hash);
                        listeners[i].func();
                    }
                }

                return hashCodes;
            }, hashCodes);

            var curr_hash_count = hashCodes.length;

            // If we clicked on a new form, then we should analyze the current DOM to see if we were redirected or if new links were added.
            if (curr_hash_count > prev_hash_count) {
                elems = await page.evaluate(() =>
                    Array.from(document.querySelectorAll("a[href]"), (a) =>
                        a.getAttribute("href")
                    )
                );

                parseElems(elems, mainUrl);
            }
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
            if (validUrl.isUri(normal_u)) {
                if (
                    url.parse(normal_u).hostname.endsWith(scope) &&
                    !visitedUrls.includes(normal_u) &&
                    !urlsToVisit.includes(normal_u)
                ) {
                    urlsToVisit.push(normal_u);
                }
            }
        } else {
            try {
                let parsedUrl = url.parse(mainUrl);
                let u = parsedUrl.protocol + "//" + parsedUrl.host + "/" + elems[e];
                let normal_u = normalizeUrl(u);
                if (validUrl.isUri(normal_u)) {
                    if (
                        url.parse(normal_u).hostname.endsWith(scope) &&
                        !visitedUrls.includes(normal_u) &&
                        !urlsToVisit.includes(normal_u)
                    ) {
                        urlsToVisit.push(normal_u);
                    }
                }
            } catch (err) {
                // console.error(err);
            }
        }
    }
}

function getRobots(robotText, mainUrl) {
    var entries = robotText.split("\n").filter((line) => line.startsWith("Disallow:") || line.startsWith("Allow:"));
    for (var i = 0; i < entries.length; i++){
        var e = entries[i].split(": ")[1];
        urlsToVisit.push(mainUrl + e);
    }
}

function formatRequest(request) {
    var result = {};
    if (typeof(request.postData()) === 'undefined') {
        result = {
            Method: request.method(),
            Url: request.url(),
            Headers: request.headers(),
        };
    } else {
        result = {
            Method: request.method(),
            Url: request.url(),
            Headers: request.headers(),
            Body: request.postData(),
        };
    }
    return JSON.stringify(result)
}

start(argv.url, proxy);

async function start(mainUrl) {
    let args = [
        "--window-size=1920,1040",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36"
    ]
    if (proxy) {
        args.push("--proxy-server=" + proxy)
    }

    browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: args
    });

    if (robots) {
        urlsToVisit.push(mainUrl + '/robots.txt');
    }

    urlsToVisit.push(mainUrl);
    run();
}