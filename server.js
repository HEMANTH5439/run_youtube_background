const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8085;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.json': 'application/json'
};

// Cache extracted info
const infoCache = new Map();
const CACHE_TTL = 4 * 60 * 1000; // 4 minutes

// Piped instances return proxied URLs (not IP-locked!) via their own proxy
const PIPED_INSTANCES = [
    'https://pipedapi.r4fo.com',
    'https://api.piped.private.coffee',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.darkness.services'
];

async function fetchJSON(fetchUrl) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(fetchUrl);
        https.get(parsed, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function extractAudio(videoId) {
    const cached = infoCache.get(videoId);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        console.log(`[cache hit] ${videoId}`);
        return cached;
    }

    // Try each Piped instance
    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`[trying] ${instance} for ${videoId}...`);
            const data = await fetchJSON(`${instance}/streams/${videoId}`);

            if (data.audioStreams && data.audioStreams.length > 0) {
                // Sort by bitrate descending, pick best
                data.audioStreams.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
                const best = data.audioStreams[0];
                const result = {
                    streamUrl: best.url,
                    title: data.title || 'YouTube Audio',
                    author: data.uploader || 'YouTube Stream',
                    mimeType: best.mimeType || 'audio/webm',
                    time: Date.now()
                };
                infoCache.set(videoId, result);
                console.log(`[extracted] "${result.title}" via ${instance}`);
                return result;
            }
        } catch (err) {
            console.log(`[failed] ${instance}: ${err.message}`);
        }
    }

    // Fallback: try @distube/ytdl-core
    try {
        console.log(`[fallback] trying ytdl-core for ${videoId}...`);
        const ytdl = require('@distube/ytdl-core');
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
        if (format && format.url) {
            const result = {
                streamUrl: format.url,
                title: info.videoDetails.title || 'YouTube Audio',
                author: info.videoDetails.author?.name || 'YouTube Stream',
                mimeType: format.mimeType || 'audio/webm',
                time: Date.now()
            };
            infoCache.set(videoId, result);
            console.log(`[extracted] "${result.title}" via ytdl-core`);
            return result;
        }
    } catch (err) {
        console.log(`[fallback failed] ytdl-core: ${err.message}`);
    }

    throw new Error('All extraction methods failed');
}

// Pipe remote audio through our server (avoids IP-lock and CORS issues)
function proxyStream(streamUrl, mimeType, res) {
    const parsed = new URL(streamUrl);
    const requester = parsed.protocol === 'https:' ? https : http;

    requester.get(parsed, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (upstream) => {
        if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
            // Follow redirect
            console.log(`[proxy] following redirect...`);
            proxyStream(upstream.headers.location, mimeType, res);
            upstream.resume();
            return;
        }
        if (upstream.statusCode !== 200) {
            console.error(`[proxy] upstream returned ${upstream.statusCode}`);
            if (!res.headersSent) {
                res.writeHead(502);
                res.end(`Upstream error: ${upstream.statusCode}`);
            }
            upstream.resume();
            return;
        }

        const headers = {
            'Content-Type': upstream.headers['content-type'] || mimeType || 'audio/webm',
            'Accept-Ranges': 'none',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        };
        if (upstream.headers['content-length']) {
            headers['Content-Length'] = upstream.headers['content-length'];
        }

        res.writeHead(200, headers);
        upstream.pipe(res);
        upstream.on('error', (err) => {
            console.error('[proxy pipe error]', err.message);
            if (!res.headersSent) res.writeHead(500);
            res.end();
        });
    }).on('error', (err) => {
        console.error('[proxy request error]', err.message);
        if (!res.headersSent) {
            res.writeHead(500);
            res.end(err.message);
        }
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // STREAMING PROXY: Extracts audio URL, then pipes bytes through our server.
    // This avoids IP-lock (googlevideo URLs are tied to the extractor's IP)
    // and CORS issues. Client just does: audio.src = "/api/stream_audio?v=ID"
    if (parsedUrl.pathname === '/api/stream_audio') {
        const videoId = parsedUrl.query.v;
        if (!videoId) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing video ID');
            return;
        }
        try {
            const data = await extractAudio(videoId);
            console.log(`[proxy] streaming ${videoId}...`);
            proxyStream(data.streamUrl, data.mimeType, res);
        } catch (err) {
            console.error('[stream error]', err.message);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(err.message);
        }
        return;
    }

    // Pre-fetch endpoint: triggers extraction and caches result
    if (parsedUrl.pathname === '/api/get_audio') {
        const videoId = parsedUrl.query.v;
        if (!videoId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing video ID' }));
            return;
        }
        try {
            const data = await extractAudio(videoId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ready: true,
                title: data.title,
                author: data.author
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Static File Server
    let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
    const ext = path.extname(filePath);
    let contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
