#!/usr/bin/env node

const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');
const puppeteer = require('puppeteer-extra');
const normalizeUrl = import("normalize-url");
var validUrl = require("valid-url");
var url = require("url");
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const badHandlers = ["javascript:", "tel:", "mailto:"];

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

        var cookies = await page.cookies();

        try {
            await page.setRequestInterception(true);
            let requrl = "";
            page.on("request", (request) => {
                requrl = request.url();
                if (url.parse(requrl).hostname.endsWith(scope)) {
                    if (fullMode){
                        const result = formatRequest(request, cookies);
                        const hash = hashRequest(request);
                        if (!visitedUrls.includes(hash)) {
                            console.log(result);
                            visitedUrls.push(hash);
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
                        const hash = hashRequest(request);
                        if (!visitedUrls.includes(hash)) {
                            console.log(result);
                            visitedUrls.push(hash);
                        }
                    } else {
                        if (!visitedUrls.includes(respurl)) {
                            console.log(respurl);
                            visitedUrls.push(respurl);
                        }
                    }

                    if (response.status() == 301 || response.status() == 302) {
                        if (response.headers().location) {
                            var location = response.headers().location;
                            parseElems([location], mainUrl);
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
            if (!badHandlers.some(h => elems[e].startsWith(h))){
                try {
                    let parsedUrl = url.parse(mainUrl);
                    let path = parsedUrl.pathname

                    // Location: /app/foo.html
                    if (elems[e].startsWith("/")) {
                        path = "";
                    } else {
                        if (!path.endsWith("/")) {
                            path += "/";
                        }
                    }
                    let u = parsedUrl.protocol + "//" + parsedUrl.host + path + elems[e];
                    let normal_u = normalizeUrl(u, {removeTrailingSlash: false});
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
}

function getRobots(robotText, mainUrl) {
    var entries = robotText.split("\n").filter((line) => line.startsWith("Disallow:") || line.startsWith("Allow:"));
    for (var i = 0; i < entries.length; i++){
        var e = entries[i].split(": ")[1];
        urlsToVisit.push(mainUrl + e);
    }
}

function formatRequest(request, cookies) {
    var result = {};
    var headers = request.headers();
    if (typeof(cookies) != 'undefined') {
        var cookieStr = "";
        for (var i = 0; i < cookies.length; i++){
            var key = cookies[i]["name"];
            var value = cookies[i]["value"];
            cookieStr += key + "=" + value + ";";
        }
        if (cookieStr.length != 0){
            headers['Cookie'] = cookieStr;
        }
    }
    if (typeof(request.postData()) === 'undefined') {
        result = {
            Method: request.method(),
            Url: request.url(),
            Headers: headers,
        };
    } else {
        headers['Content-Length'] = String(request.postData().length);
        result = {
            Method: request.method(),
            Url: request.url(),
            Headers: headers,
            Body: request.postData(),
        };
    }
    return JSON.stringify(result)
}

function hashRequest(request) {
    var result = {};
    if (typeof(request.postData()) === 'undefined') {
        result = {
            Method: request.method(),
            Url: request.url(),
        };
    } else {
        result = {
            Method: request.method(),
            Url: request.url(),
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
        executablePath: require('puppeteer').executablePath(),
        ignoreHTTPSErrors: true,
        args: args
    });

    if (robots) {
        urlsToVisit.push(mainUrl + '/robots.txt');
    }

    urlsToVisit.push(mainUrl);
    run();
}
