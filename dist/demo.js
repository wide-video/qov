/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};

;// CONCATENATED MODULE: ./src/lib.ts
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
const readFrames = async (blob, canvas, maxFrames, onFrame) => new Promise(resolve => {
    const video = document.createElement("video");
    const requestFrame = video.requestVideoFrameCallback?.bind(video);
    const complete = () => {
        video.removeEventListener("timeupdate", render);
        video.pause();
        video.removeAttribute("src");
        video.load();
        resolve();
    };
    video.addEventListener("ended", () => complete());
    video.src = URL.createObjectURL(blob);
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
            return complete();
        requestFrame?.(render);
        video.play();
    };
    if (!requestFrame)
        video.addEventListener("timeupdate", render);
    requestFrame?.(render);
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

;// CONCATENATED MODULE: ./src/QOV.ts

const QOV_MAGIC = 0x716f7631; // [...new TextEncoder().encode("qov1")].map(item => item.toString(16)).join("")
const QOV_HEADER_POSITION_FRAME_OFFSET = 25;
const QOV_FRAME_HEADER_SIZE = 1;
const QOV_I_FRAME = 0; // intra-coded
const QOV_P_FRAME = 1; // predictive
const QOV_IS_I_FRAME = (frame) => new Uint8Array(frame)[0] === QOV_I_FRAME;
class QOVEncoder {
    config;
    frames = [];
    previous;
    index = new Uint32Array(64);
    constructor(config) {
        this.config = config;
    }
    writeFrame(data, iframe) {
        const { frames, index, previous } = this;
        let result;
        if (iframe || !previous) {
            index.fill(0);
            result = this.encode(data);
        }
        else {
            result = this.encode(data, new Uint8Array(previous));
        }
        frames.push(new Blob([result]));
        this.previous = data;
        return result;
    }
    flush() {
        const { frames, config: { channels, frameRate, height, width } } = this;
        const headerSize = QOV_HEADER_POSITION_FRAME_OFFSET + frames.length * 4;
        const header = new DataView(new ArrayBuffer(headerSize));
        header.setUint32(0, QOV_MAGIC);
        header.setUint32(4, headerSize);
        header.setUint32(8, width);
        header.setUint32(12, height);
        header.setFloat32(16, frameRate);
        header.setUint8(20, channels);
        header.setUint32(21, frames.length);
        let frameOffset = headerSize;
        for (let i = 0; i < frames.length; i++) {
            header.setUint32(QOV_HEADER_POSITION_FRAME_OFFSET + i * 4, frameOffset);
            frameOffset += frames[i].size;
        }
        return new Blob([header, ...frames]);
    }
    encode(source, previous) {
        const { config: { channels, height, width }, index } = this;
        const max_size = width * height * (channels + 1) + QOV_FRAME_HEADER_SIZE;
        const bytes = new Uint8Array(max_size);
        const pixels = new Uint8Array(source);
        bytes[0] = previous ? QOV_P_FRAME : QOV_I_FRAME;
        let p = QOV_FRAME_HEADER_SIZE;
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
            if (previous) {
                px_prev_r = previous[px_pos];
                px_prev_g = previous[px_pos + 1];
                px_prev_b = previous[px_pos + 2];
                px_prev_a = previous[px_pos + 3];
                px_prev = QOI_RGBA(px_prev_r, px_prev_g, px_prev_b, px_prev_a);
            }
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
            if (!previous) {
                px_prev_r = px_r;
                px_prev_g = px_g;
                px_prev_b = px_b;
                px_prev_a = px_a;
                px_prev = px;
            }
        }
        return bytes.slice(0, p).buffer;
    }
}
class QOVDecoder {
    source;
    header;
    index = new Uint32Array(64);
    nextFrame = 0;
    previous;
    constructor(source, header) {
        this.source = source;
        this.header = header;
    }
    static async init(source) {
        return new this(source, await this.parseHeader(source));
    }
    get framesRead() {
        return this.nextFrame;
    }
    get frameAvailable() {
        return this.nextFrame < this.header.frames;
    }
    static async parseHeader(source) {
        const init = await source.slice(0, 8).arrayBuffer();
        const size = new Uint32Array(init)[4];
        const view = new DataView(await source.slice(0, size).arrayBuffer());
        const width = view.getUint32(8);
        const height = view.getUint32(12);
        const frameRate = view.getFloat32(16);
        const channels = view.getUint8(20);
        const frames = view.getUint32(21);
        const framePositions = [];
        for (let i = 0; i < frames; i++)
            framePositions.push(view.getUint32(QOV_HEADER_POSITION_FRAME_OFFSET + i * 4));
        return { size, video: { width, height, channels, frameRate }, frames, framePositions };
    }
    restart() {
        this.index.fill(0);
        this.nextFrame = 0;
        delete this.previous;
    }
    async getNextFrame() {
        const { header: { framePositions }, nextFrame, source } = this;
        const start = framePositions[nextFrame];
        const end = framePositions[nextFrame + 1];
        return await source.slice(start, end).arrayBuffer();
    }
    readFrame(frame) {
        const { header, index, previous } = this;
        const bytes = new Uint8Array(frame);
        let result;
        if (QOV_IS_I_FRAME(frame)) {
            index.fill(0);
            result = this.decode(header, bytes);
        }
        else if (previous) {
            result = this.decode(header, bytes, new Uint8Array(previous));
        }
        else {
            throw "Unexpected frame";
        }
        this.nextFrame++;
        this.previous = result;
        return result;
    }
    decode(header, source, previous) {
        const { channels, height, width } = header.video;
        const bytes = new Uint8Array(source);
        const px_len = width * height * channels;
        const pixels = new Uint8Array(px_len);
        const index = this.index;
        let px_r = 0;
        let px_g = 0;
        let px_b = 0;
        let px_a = 255;
        let run = 0;
        let p = QOV_FRAME_HEADER_SIZE;
        for (let px_pos = 0; px_pos < px_len; px_pos += channels) {
            if (previous) {
                px_r = previous[px_pos];
                px_g = previous[px_pos + 1];
                px_b = previous[px_pos + 2];
                px_a = previous[px_pos + 3];
            }
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
        return pixels.buffer;
    }
}

;// CONCATENATED MODULE: ./src/QOVPlayer.ts

class QOVPlayer {
    element = document.createElement("div");
    canvas = document.createElement("canvas");
    context;
    loop = false;
    _src;
    _decoder;
    _playWhenReady = true;
    renderFrameId;
    lock;
    constructor() {
        const { canvas, element } = this;
        element.classList.add("QOVPlayer");
        element.append(canvas);
        element.onclick = () => this.restart();
        this.context = this.canvas.getContext("2d");
    }
    get src() {
        return this._src;
    }
    set src(value) {
        if (this.src === value)
            return;
        this._src = value;
        if (typeof value === "string")
            fetch(value)
                .then(response => response.blob()
                .then(blob => QOVDecoder.init(blob)
                .then(decoder => this.decoder = decoder)));
        else if (value)
            QOVDecoder.init(value).then(decoder => this.decoder = decoder);
        else
            this.decoder = undefined;
    }
    get playWhenReady() {
        return this._playWhenReady;
    }
    set playWhenReady(value) {
        this._playWhenReady = value;
        if (value)
            this.renderFrame();
    }
    get decoder() {
        return this._decoder;
    }
    set decoder(value) {
        this._decoder = value;
        if (value) {
            this.canvas.width = value.header.video.width;
            this.canvas.height = value.header.video.height;
        }
        this.renderFrame();
    }
    restart() {
        this.decoder?.restart();
        this.renderFrame();
    }
    async renderFrame() {
        const { canvas, context, decoder, loop, playWhenReady } = this;
        if (!decoder) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        const t0 = performance.now();
        const { video: { frameRate, height, width } } = decoder.header;
        if (decoder.frameAvailable) {
            const lock = this.lock = {};
            const frame = await decoder.getNextFrame();
            // click/restart() may cause race condition with await on previous line
            if (lock !== this.lock)
                return;
            const iframe = QOV_IS_I_FRAME(frame);
            const t1 = performance.now();
            const decoded = decoder.readFrame(frame);
            const t2 = performance.now();
            const data = new ImageData(new Uint8ClampedArray(decoded), width, height);
            context.clearRect(0, 0, width, height);
            context.putImageData(data, 0, 0);
            clearTimeout(this.renderFrameId);
            this.renderFrameId = undefined;
            if (playWhenReady) {
                const delay = Math.max(1000 / frameRate - performance.now() + t0, 0);
                this.renderFrameId = setTimeout(() => this.renderFrame(), delay);
            }
            return { decodingDuration: t2 - t1, iframe };
        }
        if (loop)
            this.restart();
        return;
    }
}

;// CONCATENATED MODULE: ./src/demo.ts



const demo_frameRate = 25;
const maxFrames = 125;
function demo_log(message) {
    log(`${(performance.now() | 0).toString().padStart(4, " ")}: ${message}`, logElement);
}
class Player extends QOVPlayer {
    decodingDuration = 0;
    get decoder() {
        return super.decoder;
    }
    set decoder(value) {
        super.decoder = value;
        if (value)
            demo_log(`QOV decoded ${value.header.frames} frames from header`);
    }
    async renderFrame() {
        const result = await super.renderFrame();
        const { decoder, element } = this;
        if (result) {
            const duration = result.decodingDuration;
            this.decodingDuration += duration;
            if (decoder)
                element.dataset["message"] = `${result.iframe ? "I" : "P"}-Frame #${decoder.framesRead} decoded in ${duration | 0}ms`;
        }
        else if (decoder) {
            delete element.dataset["message"];
            const frames = decoder.header.frames;
            const duration = this.decodingDuration;
            demo_log(`<b>QOV decoded ${frames} frames in ${duration | 0}ms. Decoding speed is ${frames / duration * 1000 | 0} fps</b>`);
            this.decodingDuration = 0;
        }
        return result;
    }
}
function play(source, encoder, duration) {
    const { config: { width, height }, frames } = encoder;
    demo_log(`<b>Encoded ${frames.length} frames from video ${width}x${height}@${demo_frameRate} in ${duration | 0}ms. Encoding speed is ${frames.length / duration * 1000 | 0} fps</b>`);
    const encoded = encoder.flush();
    const qovFilename = `${source.name}.qov`;
    const button = document.createElement("button");
    button.textContent = `Save ${qovFilename} ${encoded.size / 1024 | 0} KB`;
    button.onclick = () => saveFile(new File([encoded], qovFilename));
    log(button, logElement);
    demo_log(`<b>QOV encoded to ${encoded.size / 1024 | 0}kB in ${duration | 0}ms</b>`);
    player.src = encoded;
    player.playWhenReady = true;
    player.loop = true;
}
async function runGIF(source) {
    // @ts-ignore
    const gif = GIF();
    gif.onload = () => {
        console.log(gif);
        console.log(gif.frames);
        const { width, height } = gif;
        let duration = 0;
        const encoder = new QOVEncoder({ width, height, channels: 4, frameRate: demo_frameRate });
        for (let i = 0; i < gif.frames.length; i++) {
            const frame = readRGBA(gif.frames[i].image.ctx);
            const t0 = performance.now();
            const qovFrame = encoder.writeFrame(frame, !(i % 20));
            const t1 = performance.now();
            duration += t1 - t0;
            const iframe = QOV_IS_I_FRAME(qovFrame);
            demo_log(`${iframe ? "I" : "P"}-Frame #${i} encoded to ${qovFrame.byteLength / 1024 | 0}kB as in ${t1 - t0 | 0}ms`);
        }
        play(source, encoder, duration);
    };
    gif.load(await source.arrayBuffer());
}
async function runVideo(source) {
    let encoder;
    let duration = 0;
    await readFrames(source, canvas, maxFrames, (frame, width, height, progress) => {
        if (!encoder)
            encoder = new QOVEncoder({ width, height, channels: 4, frameRate: demo_frameRate });
        const position = encoder.frames.length;
        const t0 = performance.now();
        const qovFrame = encoder.writeFrame(frame, !(position % 20));
        const t1 = performance.now();
        duration += t1 - t0;
        const iframe = QOV_IS_I_FRAME(qovFrame);
        demo_log(`${iframe ? "I" : "P"}-Frame #${position} (${progress * 100 | 0}%) encoded to ${qovFrame.byteLength / 1024 | 0}kB as in ${t1 - t0 | 0}ms`);
    });
    if (!encoder)
        return;
    play(source, encoder, duration);
}
const onSourceDrop = (event) => {
    event.preventDefault();
    if (!event.dataTransfer?.files.length)
        return;
    const file = event.dataTransfer.files[0];
    if (file.name.endsWith(".gif")) {
        const image = new Image();
        image.src = URL.createObjectURL(file);
        source.append(image);
        runGIF(file);
    }
    else {
        source.append(canvas);
        runVideo(file);
    }
};
const canvas = document.createElement("canvas");
const source = document.createElement("div");
source.classList.add("source");
source.ondrop = onSourceDrop;
source.ondragover = event => event.preventDefault();
const player = new Player();
const logElement = document.createElement("pre");
logElement.classList.add("log");
document.body.append(source, player.element, logElement);

/******/ })()
;