/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};

;// CONCATENATED MODULE: ./src/Dev.ts
const fetchToCanvas = async (url, canvas) => {
    return new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
            resolve();
        };
        image.src = url;
    });
};
const readRGBA = (ctx) => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data.buffer;
const readFrames = async (url, canvas, maxFrames, onFrame) => new Promise(resolve => {
    const video = document.createElement("video");
    video.addEventListener("ended", () => resolve());
    video.src = url;
    video.muted = true;
    let frames = 0;
    const render = () => {
        video.pause();
        const width = canvas.width = video.videoWidth;
        const height = canvas.height = video.videoHeight;
        const progress = maxFrames
            ? frames++ / maxFrames
            : video.currentTime / video.duration;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0);
        onFrame(readRGBA(ctx), width, height, progress);
        if (frames === maxFrames)
            return resolve();
        video.requestVideoFrameCallback(render);
        video.play();
    };
    video.requestVideoFrameCallback(render);
    video.play();
});
const compare = (a, b) => {
    if (a.byteLength !== b.byteLength)
        return false;
    const aa = new Uint8Array(a);
    const ba = new Uint8Array(b);
    for (let i = 0; i < a.byteLength; i++)
        if (aa[i] !== ba[i])
            return false;
    return true;
};
const sha256Bytes = async (source) => {
    const digest = await crypto.subtle.digest("SHA-256", source);
    const resultBytes = [...new Uint8Array(digest)];
    return resultBytes.map(x => x.toString(16).padStart(2, '0')).join("");
};
const log = (message, element) => {
    console.log(message);
    const isBottom = element.scrollTop === (element.scrollHeight - element.clientHeight);
    if (typeof message === "string") {
        const row = document.createElement("p");
        row.innerHTML = message;
        element.append(row);
    }
    else {
        element.append(message);
    }
    if (isBottom)
        element.scrollTop = element.scrollHeight;
};
async function saveFile(file) {
    try {
        const handle = await window.showSaveFilePicker({ suggestedName: file.name });
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
    }
    catch (error) { }
}

;// CONCATENATED MODULE: ./src/QOI.ts
// https://qoiformat.org/
// https://github.com/phoboslab/qoi/blob/master/qoi.h
const QOI_MAGIC = 0x716f6966; // [...new TextEncoder().encode("qoif")].map(item => item.toString(16)).join("")
const QOI_HEADER_SIZE = 14;
const QOI_PADDING = new Uint8Array(8);
QOI_PADDING[7] = 1;
const QOI_COLOR_HASH = (r, g, b, a) => (r * 3 + g * 5 + b * 7 + a * 11) % 64;
const QOI_RGBA = (r, g, b, a) => (r << 24 | g << 16 | b << 8 | a) >>> 0;
// -128...127
const QOI_SIGNED8 = (value) => (value & 0b10000000 ? (value - 256) : (value + 256)) % 256;
const QOI_UNSIGNED8 = (value) => (value + 256) % 256;
function encode(source) {
    const { channels, colorspace, data, height, width } = source;
    const max_size = width * height * (channels + 1) + QOI_HEADER_SIZE + QOI_PADDING.byteLength;
    const index = new Uint32Array(64);
    const bytes = new Uint8Array(max_size);
    const pixels = new Uint8Array(data);
    const header = new DataView(bytes.buffer);
    header.setUint32(0, QOI_MAGIC);
    header.setUint32(4, width);
    header.setUint32(8, height);
    header.setUint8(12, channels);
    header.setUint8(13, colorspace);
    let p = QOI_HEADER_SIZE;
    let run = 0;
    let px_prev_r = 0;
    let px_prev_g = 0;
    let px_prev_b = 0;
    let px_prev_a = 255;
    let px_prev = px_prev_a;
    let px_a = px_prev_a;
    const px_len = width * height * channels;
    const px_end = px_len - channels;
    for (let px_pos = 0; px_pos < px_len; px_pos += channels) {
        const px_r = pixels[px_pos];
        const px_g = pixels[px_pos + 1];
        const px_b = pixels[px_pos + 2];
        if (channels === 4)
            px_a = pixels[px_pos + 3];
        const px = QOI_RGBA(px_r, px_g, px_b, px_a);
        if (px === px_prev) {
            run++;
            if (run === 62 || px_pos === px_end) {
                bytes[p++] = 0b11000000 | (run - 1);
                run = 0;
            }
        }
        else {
            if (run > 0) {
                bytes[p++] = 0b11000000 | (run - 1);
                run = 0;
            }
            const index_pos = QOI_COLOR_HASH(px_r, px_g, px_b, px_a);
            if (index[index_pos] === px) {
                bytes[p++] = index_pos; // QOI_OP_INDEX 0x00
            }
            else {
                index[index_pos] = px;
                if (px_a === px_prev_a) {
                    const vr = QOI_SIGNED8(px_r - px_prev_r);
                    const vg = QOI_SIGNED8(px_g - px_prev_g);
                    const vb = QOI_SIGNED8(px_b - px_prev_b);
                    const vg_r = vr - vg;
                    const vg_b = vb - vg;
                    if (vr > -3 && vr < 2 && vg > -3 && vg < 2 && vb > -3 && vb < 2) {
                        bytes[p++] = 0b01000000 | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2); // QOI_OP_DIFF
                    }
                    else if (vg_r > -9 && vg_r < 8 && vg > -33 && vg < 32 && vg_b > -9 && vg_b < 8) {
                        bytes[p++] = 0b10000000 | (vg + 32); // QOI_OP_LUMA
                        bytes[p++] = (vg_r + 8) << 4 | (vg_b + 8);
                    }
                    else {
                        bytes[p++] = 0b11111110; // QOI_OP_RGB
                        bytes[p++] = px_r;
                        bytes[p++] = px_g;
                        bytes[p++] = px_b;
                    }
                }
                else {
                    bytes[p++] = 0b11111111; // QOI_OP_RGBA
                    bytes[p++] = px_r;
                    bytes[p++] = px_g;
                    bytes[p++] = px_b;
                    bytes[p++] = px_a;
                }
            }
        }
        px_prev_r = px_r;
        px_prev_g = px_g;
        px_prev_b = px_b;
        px_prev_a = px_a;
        px_prev = px;
    }
    bytes.set(QOI_PADDING, p);
    p += QOI_PADDING.length;
    return bytes.slice(0, p).buffer;
}
function decode(source) {
    const bytes = new Uint8Array(source);
    const header = new DataView(bytes.buffer);
    //const header_magic = header.getUint32(0);
    const width = header.getUint32(4);
    const height = header.getUint32(8);
    const channels = header.getUint8(12) === 3 ? 3 : 4;
    const colorspace = header.getUint8(13) === 0 ? 0 : 1;
    const px_len = width * height * channels;
    const pixels = new Uint8Array(px_len);
    const index = new Uint32Array(64);
    let px_r = 0;
    let px_g = 0;
    let px_b = 0;
    let px_a = 255;
    let run = 0;
    let p = QOI_HEADER_SIZE;
    for (let px_pos = 0; px_pos < px_len; px_pos += channels) {
        if (run > 0) {
            run--;
        }
        else {
            const b1 = bytes[p++];
            if (b1 === 0b11111110) { // QOI_OP_RGB
                px_r = bytes[p++];
                px_g = bytes[p++];
                px_b = bytes[p++];
                index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
            }
            else if (b1 === 0b11111111) { // QOI_OP_RGBA
                px_r = bytes[p++];
                px_g = bytes[p++];
                px_b = bytes[p++];
                px_a = bytes[p++];
                index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
            }
            else {
                const op = b1 & 0b11000000;
                if (op === 0b00000000) { // QOI_OP_INDEX
                    const px = index[b1];
                    px_r = px >> 24;
                    px_g = px >> 16 & 0xff;
                    px_b = px >> 8 & 0xff;
                    px_a = px & 0xff;
                    index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = px;
                }
                else if (op === 0b01000000) { // // QOI_OP_DIFF
                    px_r = QOI_UNSIGNED8(px_r + ((b1 >> 4) & 0x03) - 2);
                    px_g = QOI_UNSIGNED8(px_g + ((b1 >> 2) & 0x03) - 2);
                    px_b = QOI_UNSIGNED8(px_b + (b1 & 0x03) - 2);
                    index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
                }
                else if (op === 0b10000000) { // QOI_OP_LUMA
                    const b2 = bytes[p++];
                    const vg = (b1 & 0x3f) - 32;
                    px_r = QOI_UNSIGNED8(px_r + vg - 8 + ((b2 >> 4) & 0x0f));
                    px_g = QOI_UNSIGNED8(px_g + vg);
                    px_b = QOI_UNSIGNED8(px_b + vg - 8 + (b2 & 0x0f));
                    index[QOI_COLOR_HASH(px_r, px_g, px_b, px_a)] = QOI_RGBA(px_r, px_g, px_b, px_a);
                }
                else if (op === 0b11000000) { // QOI_OP_RUN
                    run = b1 & 0x3f;
                }
            }
        }
        pixels[px_pos] = px_r;
        pixels[px_pos + 1] = px_g;
        pixels[px_pos + 2] = px_b;
        if (channels === 4)
            pixels[px_pos + 3] = px_a;
    }
    return { width, height, channels, colorspace, data: pixels.buffer };
}

;// CONCATENATED MODULE: ./src/test.ts


const assetBase = "../static/qoi_test_images";
const logElement = document.createElement("pre");
const canvas = document.createElement("canvas");
document.body.append(logElement);
const testImages = [
    { name: "dice", channels: 4 },
    { name: "kodim10", channels: 3 },
    { name: "kodim23", channels: 3 },
    { name: "qoi_logo", channels: 4 },
    { name: "testcard", channels: 4 },
    { name: "testcard_rgba", channels: 4 },
    { name: "wikipedia_008", channels: 3 },
];
const test_log = (message) => log(`${(performance.now() | 0).toString().padStart(4, " ")}: ${message}`, logElement);
const assert = (label, expected, result) => {
    const message = expected === result ? "OK" : `FAIL ${expected} != ${result}`;
    test_log(`TEST ${label} ${message}`);
};
const perf = async (label, count, executor) => {
    const durations = [];
    for (let i = 0; i < count; i++) {
        const t0 = performance.now();
        executor();
        const t1 = performance.now();
        const duration = t1 - t0;
        durations.push(duration);
        test_log(`PERF ${label} #${(i + 1).toString().padStart(3, "0")} took ${duration | 0}ms`);
        await new Promise(requestAnimationFrame);
    }
    test_log(`<b>PERF ${label} took ${durations.reduce((a, b) => a + b, 0) / durations.length | 0}ms in average</b>`);
};
const runQOITestImages = async () => {
    for (const { name, channels } of testImages) {
        await fetchToCanvas(`${assetBase}/${name}.png`, canvas);
        const source = `${assetBase}/${name}.${channels === 4 ? "rgba" : "rgb"}`;
        const expected = await (await fetch(`${assetBase}/${name}.qoi`)).arrayBuffer();
        const rgba = await (await fetch(source)).arrayBuffer();
        const encoded = encode({ width: canvas.width, height: canvas.height, channels, colorspace: 0, data: rgba });
        assert(`QOI.encode ${source}`, await sha256Bytes(expected), await sha256Bytes(encoded));
        const decoded = decode(encoded);
        assert(`QOI.decode ${source}`, await sha256Bytes(rgba), await sha256Bytes(decoded.data));
    }
};
const runTestAssets = async () => {
    const source = `${assetBase}/wikipedia_008.png`;
    await fetchToCanvas(source, canvas);
    const rgba = readRGBA(canvas.getContext("2d"));
    log("<hr>", logElement);
    const encoded = encode({ width: canvas.width, height: canvas.height, channels: 4, colorspace: 0, data: rgba });
    assert(`QOI.encode ${source}`, "066636f93c49f5e2938848bad645971e771c7d5c55c3e13d594ced77667ce220", await sha256Bytes(encoded));
    const decoded = decode(encoded);
    assert(`QOI.decode ${source}`, await sha256Bytes(rgba), await sha256Bytes(decoded.data));
    log("<hr>", logElement);
    await perf(`QOI.encode ${source}`, 20, () => encode({ width: canvas.width, height: canvas.height, channels: 4, colorspace: 0, data: rgba }));
    log("<hr>", logElement);
    await perf(`QOI.decode ${source}`, 20, () => decode(encoded));
};
const run = async () => {
    await runQOITestImages();
    await runTestAssets();
};
run();

/******/ })()
;