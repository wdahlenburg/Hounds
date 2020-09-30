const puppeteer = require("puppeteer");
const normalizeUrl = require('normalize-url');
var validUrl = require('valid-url');
var url = require('url');

var myArgs = process.argv.slice(2);

let scope = myArgs[1];
let visitedUrls = [];
let urlsToVisit = [];
let browser;

async function run() {
  while (urlsToVisit.length != 0){
    // console.log("urlsToVisit is " + urlsToVisit);
    var mainUrl = urlsToVisit.shift();
    var old_pages;
    var page;
    try{
      old_pages = await browser.pages().catch(function(){});
      if (old_pages.length != 0){
        page = old_pages[0];
      } else {
        page = await browser.newPage();
      }
    } catch(err) {
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
    } catch(err) {
      await run();
  	  return;
    }
    if (!validUrl.isUri(mainUrl)) {
  	  //console.log("Mainurl is bad " + mainUrl);
      await run();
    	  return;
    }
    // counter += 1;
    try{
    //const page = await browser.newPage();
    //let mainUrlStatus;
    await page.setRequestInterception(true);
    let requrl = "";
    page.on("request", request => {
      requrl = request.url();
      if (url.parse(requrl).hostname.endsWith(scope)) {
         if (!visitedUrls.includes(requrl)) {
         	console.log(requrl);
          visitedUrls.push(requrl);
         }
      }
      request.continue().catch(function(){});
    });
    //page.on("requestfailed", request => {
    //  requrl = request.url();
    //  console.log("request failed url:", url);
    //});
    page.on("response", response => {
      const request = response.request();
      const respurl = request.url();
      const status = response.status();
  	  if (respurl != requrl && url.parse(respurl).hostname.endsWith(scope)) {
            if (!visitedUrls.includes(respurl)){	
      		console.log("response url:", respurl, "status:", status);
      		visitedUrls.push(respurl);
  	  }
      }
    });
    await page.goto(mainUrl);
    visitedUrls.push(mainUrl);
    //console.log("status for main url:", mainUrlStatus);
    const elems = await page.evaluate(() => 
  	Array.from(
  		document.querySelectorAll("a[href]"),
                  a => a.getAttribute('href')
  	)
  	/*for (var e in elements) {
  		await run(e.getAttribue('href'));
  	}*/
     );
  	//console.log("Found elements: ", elems);
     for (var e in elems) {
  	if (elems[e].startsWith("http")) {
  		let normal_u = normalizeUrl(elems[e])
  		//console.log("Normal url is: " + normal_u);
  		if (validUrl.isUri(normal_u) ){
          if (url.parse(normal_u).hostname.endsWith(scope) && !visitedUrls.includes(normal_u) && !urlsToVisit.includes(normal_u)){
         urlsToVisit.push(normal_u);
        }
  			// await run(normal_u);
  		} else {
  		//	console.log("BAD url: " + normal_u);
  		}
  	} else {
  		try {
  		let parsedUrl = url.parse(mainUrl);
  		let u = parsedUrl.protocol + "//" + parsedUrl.host + "/" + elems[e];
  		let normal_u = normalizeUrl(u);
  		//console.log("Parsed u: " + normal_u)
  		if (validUrl.isUri(normal_u)) {
        if (url.parse(normal_u).hostname.endsWith(scope) && !visitedUrls.includes(normal_u) && !urlsToVisit.includes(normal_u)){
         urlsToVisit.push(normal_u);
        }
  			// await run(normal_u);
  		} else { 
  			//console.log("BAD url: " + normal_u);
  		}
  		} catch (err) {
  			let parsedUrl = url.parse(mainUrl);
                  let u = parsedUrl.protocol + "//" + parsedUrl.host + "/" + elems[e];
  		//	console.log("Extra bad url is " + elems[e]  + " " + u);
  		}
  	}
     }
    } catch (err) {
  	  console.error(err.message);
    }
    
    if ( urlsToVisit.length == 0 ){
    	  await browser.close()
        return
    }
  }
}

start(myArgs[0]);

async function start(mainUrl) {
    browser = await puppeteer.launch({'ignoreHTTPSErrors':true});
    urlsToVisit.push(mainUrl);
    run();
};

