import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import dns from 'node:dns';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const DEBUG = process.env.DEBUG === '1' || false;

const log = (label, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${label}]`, ...args);
};

const logDebug = (label, ...args) => {
    if (DEBUG) log(label, ...args);
};

const extractEmbeddedApiKey = () => {
    try {
        const source = readFileSync(resolve(ROOT_DIR, 'screen-visualizer.php'), 'utf8');
        const match = source.match(/SCREEN_VISUALIZER_OPENROUTER_API_KEY',\s*'([^']+)'/);
        return match?.[1] || null;
    } catch {
        return null;
    }
};

const OPENROUTER_API_KEY = process.env.SCREEN_VISUALIZER_OPENROUTER_API_KEY
    || process.env.OPENROUTER_API_KEY
    || extractEmbeddedApiKey();

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
};

dns.setDefaultResultOrder('ipv4first');

const sendJson = (res, statusCode, body) => {
    res.writeHead(statusCode, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
    });
    const bodyStr = JSON.stringify(body);
    log('RESPONSE', `status=${statusCode}, body=${bodyStr.substring(0, 500)}${bodyStr.length > 500 ? '...' : ''}`);
    res.end(bodyStr);
};

const getContentType = (filePath) => MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';

const resolveSafePath = (pathname) => {
    const cleanedPath = decodeURIComponent(pathname).replace(/^\/+/, '');
    const candidatePath = resolve(ROOT_DIR, cleanedPath || 'test.html');

    if (candidatePath !== ROOT_DIR && !candidatePath.startsWith(`${ROOT_DIR}\\`) && !candidatePath.startsWith(`${ROOT_DIR}/`)) {
        throw new Error('Path escapes repository root.');
    }

    return candidatePath;
};

const readRequestBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
};

const MAX_RETRIES = 2;

const forwardToOpenRouter = async (payload, retries = MAX_RETRIES) => {
    if (!OPENROUTER_API_KEY) {
        log('ERROR', 'Missing OPENROUTER_API_KEY');
        return {
            error: 'Missing SCREEN_VISUALIZER_OPENROUTER_API_KEY or OPENROUTER_API_KEY environment variable.',
            status: 500,
        };
    }

    const bodyStr = JSON.stringify(payload);
    const bodySizeMB = (Buffer.byteLength(bodyStr, 'utf8') / (1024 * 1024)).toFixed(2);
    log('OPENROUTER', `model=${payload.model}, payload=${bodySizeMB}MB, retries=${retries}`);
    logDebug('PAYLOAD', bodyStr.substring(0, 2000));

    // Log the text prompt for debugging
    const textContent = payload.messages?.[0]?.content?.find(c => c.type === 'text');
    if (textContent?.text) {
        log('PROMPT_PREVIEW', textContent.text.substring(0, 300) + '...');
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        log('OPENROUTER', `Attempt ${attempt + 1}/${retries + 1}`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 180_000);

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': `http://${HOST}:${PORT}`,
                    'X-Title': 'Screen Visualizer Local Test',
                },
                body: bodyStr,
                signal: controller.signal,
            });

            clearTimeout(timeout);

            const responseText = await response.text();
            log('OPENROUTER', `status=${response.status}, bodyLength=${responseText.length} bytes`);
            logDebug('RESPONSE_BODY', responseText.substring(0, 3000));

            // Try to parse and log key info
            try {
                const parsed = JSON.parse(responseText);
                const choice = parsed.choices?.[0];
                if (choice?.message?.content) {
                    log('RESPONSE_CONTENT_PREVIEW', choice.message.content.substring(0, 300));
                }
                if (parsed.error) {
                    log('OPENROUTER_ERROR', JSON.stringify(parsed.error));
                }
            } catch {
                // Not JSON or no choices
            }

            return {
                status: response.status,
                body: responseText,
                contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
            };
        } catch (error) {
            log('OPENROUTER_FAIL', `attempt=${attempt + 1}, error=${error?.cause?.code || error?.name || error?.message}`);

            if (attempt < retries) {
                const delay = (attempt + 1) * 3000;
                log('RETRY', `Waiting ${delay}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }

            return {
                error: `OpenRouter fetch failed${error?.cause?.code ? ` (${error.cause.code})` : ''}: ${error?.cause?.message || error?.message || 'Unknown network error.'}`,
                status: 502,
            };
        }
    }
};

const handleStaticRequest = async (req, res, pathname) => {
    const normalizedPath = pathname === '/' ? '/test.html' : pathname;
    const filePath = resolveSafePath(normalizedPath);
    let fileStats;

    try {
        fileStats = await stat(filePath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            log('STATIC', `404 ${pathname}`);
            res.writeHead(404, {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
                'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end('Not found.');
            return;
        }
        throw error;
    }

    if (fileStats.isDirectory()) {
        const indexPath = resolveSafePath(`${normalizedPath.replace(/\/$/, '')}/index.html`);
        let indexStats;

        try {
            indexStats = await stat(indexPath);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                res.writeHead(404, {
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store',
                    'Content-Type': 'text/plain; charset=utf-8',
                });
                res.end('Not found.');
                return;
            }
            throw error;
        }

        if (!indexStats.isFile()) {
            throw new Error('Directory index not found.');
        }

        const indexContent = await readFile(indexPath);
        log('STATIC', `200 ${pathname} -> index.html`);
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
            'Content-Type': getContentType(indexPath),
        });
        res.end(indexContent);
        return;
    }

    const fileContent = await readFile(filePath);
    log('STATIC', `200 ${pathname}`);
    res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': getContentType(filePath),
    });
    res.end(fileContent);
};

const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const { pathname } = requestUrl;

    log('REQUEST', `${req.method} ${pathname}`);

    try {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Origin': '*',
            });
            res.end();
            return;
        }

        if (pathname === '/favicon.ico') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
            });
            res.end();
            return;
        }

        if (pathname === '/wp-json/screen-visualizer/v1/openrouter') {
            if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'Method not allowed.' });
                return;
            }

            const rawBody = await readRequestBody(req);
            log('PROXY', `Received ${Buffer.byteLength(rawBody, 'utf8')} bytes`);

            let payload;
            try {
                payload = JSON.parse(rawBody || '{}');
            } catch (error) {
                log('ERROR', `Invalid JSON: ${error.message}`);
                sendJson(res, 400, { error: 'Invalid JSON body.' });
                return;
            }

            log('PROXY', `Forwarding to model: ${payload.model}`);
            const proxyResponse = await forwardToOpenRouter(payload);

            if (proxyResponse.error) {
                log('PROXY_ERROR', proxyResponse.error);
                sendJson(res, proxyResponse.status || 500, { error: proxyResponse.error });
                return;
            }

            log('PROXY', `Returning ${proxyResponse.body.length} bytes to client`);
            res.writeHead(proxyResponse.status, {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
                'Content-Type': proxyResponse.contentType,
            });
            res.end(proxyResponse.body);
            return;
        }

        await handleStaticRequest(req, res, pathname);
    } catch (error) {
        log('SERVER_ERROR', error instanceof Error ? error.stack : String(error));
        sendJson(res, 500, {
            error: error instanceof Error ? error.message : 'Unexpected server error.',
        });
    }
});

server.listen(PORT, HOST, () => {
    console.log('='.repeat(60));
    console.log('Screen Visualizer Test Server');
    console.log('='.repeat(60));
    console.log(`URL:      http://${HOST}:${PORT}/test.html`);
    console.log(`API Key:  ${OPENROUTER_API_KEY ? 'Loaded (' + OPENROUTER_API_KEY.substring(0, 8) + '...)' : 'NOT FOUND - Set SCREEN_VISUALIZER_OPENROUTER_API_KEY'}`);
    console.log(`Debug:    ${DEBUG ? 'ENABLED (set DEBUG=1)' : 'Disabled'}`);
    console.log(`Proxy:    http://${HOST}:${PORT}/wp-json/screen-visualizer/v1/openrouter`);
    console.log('='.repeat(60));
});
