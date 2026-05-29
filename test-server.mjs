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
    console.log(`Debug:    ${DEBUG ? 'ENABLED (set DEBUG=1)' : 'Disabled'}`);
    console.log('='.repeat(60));
});
