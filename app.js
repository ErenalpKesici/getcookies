const axios = require('axios');
const xml2js = require('xml2js');

const puppeteer = require('puppeteer');
const fs = require('fs');

const express = require('express');
const app = express();
app.use(express.json());

var baseurl; // Assuming the URL is sent in the request body

let allCookies = [];
let totalUrls = 0;
let proccessedPaths = [];

async function getCookiesForPage(page, url) {
    await page.goto(url);

    // Get cookies
    await page.waitForTimeout(5000);
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    const { cookies } = await client.send('Network.getAllCookies');

    return cookies;
}

async function getUrlsFromSitemap(sitemapUrl, page) {
    var response = [];
    try {
        response = await axios.get(sitemapUrl);
        const parsed = await xml2js.parseStringPromise(response.data);
        if (parsed.sitemapindex && parsed.sitemapindex.sitemap) 
        {
            // This is a sitemap index file
            return {'type': 'sitemaps', 'rows': parsed.sitemapindex.sitemap.map(s => s.loc[0])};
        } 
        else if (parsed.urlset && parsed.urlset.url)
        {
            // This is a regular sitemap file
            return {'type': 'pages', 'rows': parsed.urlset.url.map(u => u.loc[0])};
        }
    }
    catch(e)
    {
        await proccessSitemapUrls([baseurl], page);
        return true;
    }
}

async function proccessSitemapUrls(urls, page)
{
    totalUrls += urls.length;
    for (let url of urls) {
        const _url = new URL(url);
        const urlPath = _url.pathname.split('/')[1].split('-')[0];
        if(process.argv.indexOf('-f') == -1)
        {
            if (proccessedPaths.includes(urlPath))
                continue;
            proccessedPaths.push(urlPath)
        }
        const cookies = await getCookiesForPage(page, url);
        cookies.forEach(cookie => {
            // Only add the cookie if it's not already in the array
            if (!allCookies.find(c => c.name === cookie.name)) {
                allCookies.push(cookie);
            }
        });
        console.log('Proccessed: ' + _url)
    }
}

async function getCookiesForAllPages(siteurl) 
{
    const browser = await puppeteer.launch({ 'headless': 'new' });
    const page = await browser.newPage();
    // Get sitemaps 
    const items = await getUrlsFromSitemap(siteurl, page);
    if(items != true)
    {
        if(items.type == 'sitemaps')
        {
            for (let sitemap of items.rows)
            {
                const urls = await getUrlsFromSitemap(sitemap);
                await proccessSitemapUrls(urls.rows, page);
            }
        }
        else if(items.type == 'pages')
        {
            await proccessSitemapUrls(items.rows, page);
        }
    }

    // Write cookies to a file
    const indexUrl = new URL(baseurl);
    const outputPath = 'outputs/' + indexUrl.host +  '_cookies.json';
    fs.writeFile(outputPath, JSON.stringify(allCookies, null, 4), (err) => {
        if (err)
            console.error(err);
        else
            console.log("Cookies have been written to " + outputPath);
    });

    await browser.close();
}

// var baseurl = process.argv[2];
// if (!baseurl) {
//     console.error("Please provide the URL.");
//     process.exit(1);
// }
// if (!/^https?:\/\//i.test(baseurl)) {
//     baseurl = 'https://' + baseurl;
// }
// var siteurl = baseurl;
// var sitemapPath = process.argv[3];
// if((!siteurl.includes('sitemap')))
// {
//     if(typeof sitemapPath === 'undefined' || sitemapPath.startsWith('-'))
//         siteurl += '/uploads/f/xml/sitemap_index.xml';
//     else
//         siteurl += ('/' + sitemapPath);
// }

// getCookiesForAllPages(siteurl).catch(console.error);

app.post('/getCookies', async (req, res) => {
    baseurl = req.body.url;
    if (!baseurl) {
        return res.status(400).json({ error: "URL not provided" });
    }

    try {
        await getCookiesForAllPages(baseurl);
        const indexUrl = new URL(baseurl);
        const outputPath = 'outputs/' + indexUrl.host + '_cookies.json';
        const cookies = fs.readFileSync(outputPath, 'utf8');
        return res.json({ cookies });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Start the Express server
const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});