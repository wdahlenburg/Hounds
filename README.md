# Hounds
A Chromium based web crawler that identifies in-scope urls

## Description

Crawlers are a common way to interact with a website and determine what content exists. There are two basic types of crawlers: client-based and browser-based. A great example of a client-based crawler is [hakrawler](https://github.com/hakluke/hakrawler), which programatically requests web pages and determines new links to visit. A browser-based crawler is powered by Chromium, Firefox, or similar and will load all content that a browser would normally load when visiting a page. 

Many sites will block common programatic/command-line user-agents or perform javascript-based validations to assert that a client is legitimate. A browser-based crawler has the ability to overcome these limitations by actually using a valid browser. The major tradeoff is quality instead of speed. 

## Hounds 

Hounds was written to perform a breadth-first spider of a given site. A simpler crawler would use a depth-first attempt, which provides poor coverage for link-heavy sites in a given timeframe. Breadth-first ensures that the in-scope content is visited first before crawling all links.

This crawler was primarily intended for bug-bounty, which usually has a defined scope. Browser-based crawlers request all content that a website presents, so by default stylesheets, javascript, etc from various sources are loaded. This content isn't relevant most of the time and should be filtered out before performing intenstive testing. Hounds applies a simple scope check where the requested url is checked to see if it ends with the scope.

```
# Scope Example

Url is https://test.example.com
Scope can be defined as either test.example.com or example.com.

# test.example.com will catch
https://test.example.com/foo
https://test.example.com/bar

# example.com will catch
https://test.example.com/foo
https://www.example.com
https://test.example.com/bar
https://bar.example.com/jquery.js
```

By default, Hounds injects javascript into every page to evaluate the available forms. A hash of the DOM element is taken to determine if a particular form is different than a previously identified one. This is done to identify parameters and new paths by automatically clicking submit on new forms. The DOM element hash check prevents the crawler from repeatedly clicking on a search bar that is present across all web pages. Instead, the search bar will only be clicked on once per crawl given that it is unique and ignored on all other pages. There is room for a lot of enhancements here. This could be a good option to explictly enable. It could be nice to define a default set of content to submit for common fields like username and password so that parameters are populated. 

## Usage

```
$ node ./hounds.js                                                  
Options:
      --version  Show version number                                   [boolean]
  -u, --url      Site to crawl                               [string] [required]
  -s, --scope    Allowed scope (Ex: example.com)             [string] [required]
  -p, --proxy    Proxy (Ex: proto://IP:port => http://127.0.0.1:8080)   [string]
  -r, --robots   Flag to scan robots.txt                               [boolean]
      --help     Show help                                             [boolean]

Missing required arguments: url, scope
Include both the url and scope parameters
```

Example:

```
$ node ./hounds.js -u https://wya.pl -s wya.pl -p http://127.0.0.1:8080
https://wya.pl/
https://wya.pl/wp-includes/css/dist/block-library/style.min.css?ver=5.6.2
https://wya.pl/wp-content/plugins/google-analytics-for-wordpress/assets/css/frontend.min.css?ver=7.16.2
https://wya.pl/wp-content/themes/lighthouse/css/bootstrap.css?ver=5.6.2
https://wya.pl/wp-content/themes/lighthouse/style.css?ver=5.6.2
https://wya.pl/wp-content/themes/lighthouse/font-awesome/css/font-awesome.min.css?ver=5.6.2
https://wya.pl/wp-content/plugins/google-analytics-for-wordpress/assets/js/frontend-gtag.min.js?ver=7.16.2
https://wya.pl/wp-includes/js/jquery/jquery.min.js?ver=3.5.1
https://wya.pl/wp-includes/js/jquery/jquery-migrate.min.js?ver=3.3.2
https://wya.pl/wp-content/themes/lighthouse/js/bootstrap.js?ver=5.6.2
https://wya.pl/wp-content/themes/lighthouse/js/skip-link-focus-fix.js?ver=20130115
https://wya.pl/wp-content/themes/lighthouse/js/lighthouse.js?ver=5.6.2
https://wya.pl/wp-includes/js/wp-embed.min.js?ver=5.6.2
https://wya.pl/wp-includes/js/wp-emoji-release.min.js?ver=5.6.2
https://wya.pl/wp-content/themes/lighthouse/images/headers/snow-mountains.png
https://wya.pl/wp-content/themes/lighthouse/font-awesome/fonts/fontawesome-webfont.woff2?v=4.3.0
https://wya.pl/?s=
https://wya.pl/2021/01/05/year-end-review-automation-with-a-bug-bounty-pipeline
```

## General Notes

Be prepared for Chromium to use a good amount of system resources.

If you want to visualize what the browser is doing (non-headless mode), you can add ```headless: false,``` underneath the line containing ```puppeteer.launch```.

Combine this with mitmproxy or Burp Suite to log and filter requests. This engine will submit other HTTP verbs, but does not explitily log that information. If you are looking to capture request bodies, cookies, headers, etc, then you will want to make sure you are using a proxy. 
